import { armazenamento } from '../storage'
import { COLECOES, type Colecao } from '../storage/tipos'
import { backupsRepo, registrosBackupRepo } from '../repositorios/backup'
import { montarArquivo } from './exportar'
import { validarArquivo } from './validador'
import { chamarPortal, temSupabase } from '../supabase/cliente'
import { cache } from '@/hooks/dados/cache'
import { ErroDeRegra } from '@/utils/erros'
import type { ArquivoBackup, ValidacaoBackup } from '@/types'

/**
 * Restauração.
 *
 * Sobrescrever os dados do studio é a operação mais perigosa do sistema.
 * Por isso: sempre uma cópia de segurança antes, e a gravação só começa
 * depois de todas as coleções serem preparadas — assim uma falha no meio
 * não deixa o studio com metade dos dados novos e metade dos antigos.
 */

export interface ResultadoRestauracao {
  restaurados: number
  /**
   * Coleções que o SISTEMA conhece e o ARQUIVO não trouxe.
   *
   * Elas ficam como estavam — restaurar não as apaga — mas isso é uma
   * decisão que a proprietária precisa VER, não um detalhe engolido. Um
   * backup antigo sem "caixas" restaurado hoje deixa o caixa atual de
   * pé ao lado de agendamentos de meses atrás: estado híbrido. Correto
   * às vezes, surpresa nunca.
   */
  ausentes: Colecao[]
  /** Coleções que o arquivo trouxe e este sistema não reconhece. */
  desconhecidas: string[]
  colecoes: number
  backupDeSeguranca: string | null
}

/** Confere um arquivo antes de qualquer coisa. Não altera nada. */
export async function analisar(bruto: string): Promise<{
  validacao: ValidacaoBackup
  arquivo: ArquivoBackup | null
}> {
  return validarArquivo(bruto)
}

export async function restaurarDeArquivo(
  arquivo: ArquivoBackup,
  opcoes: { responsavelId?: string | null; criarSeguranca?: boolean } = {},
): Promise<ResultadoRestauracao> {
  const criarSeguranca = opcoes.criarSeguranca ?? true

  // Rede de proteção: se a restauração trouxer o arquivo errado, ainda
  // existe o caminho de volta.
  let backupDeSeguranca: string | null = null

  if (criarSeguranca) {
    /*
      Sem cópia de segurança, não se restaura. Ponto.

      A versão anterior seguia em frente quando a cópia falhava — e
      anotava no log. Só que a cópia existe justamente para o caso em
      que a restauração dá errado; seguir sem ela é remover o
      paraquedas antes de pular porque a mochila não fechou.

      E não basta o `criar()` não lançar: é preciso **reler do
      armazenamento** e conferir que a cópia está lá com conteúdo. Uma
      gravação que falha em silêncio deixaria um id na mão e nada no
      disco.
    */
    try {
      const seguranca = await montarArquivo({
        nome: 'Antes da restauração',
        origem: 'antes_da_restauracao',
        observacoes: `Cópia automática criada antes de restaurar "${arquivo.metadados.nome}".`,
        // Direto do banco: uma cópia de segurança montada a partir do
        // espelho desta aba pode estar velha, e velha não socorre.
        semCache: true,
      })

      const guardado = await backupsRepo.criar({
        ...seguranca.metadados,
        temConteudo: true,
        conteudo: seguranca.conteudo,
      } as never)

      const conferido = await backupsRepo.buscar(guardado.id)
      if (!conferido || !(conferido as { conteudo?: string }).conteudo) {
        throw new Error('A cópia não foi encontrada depois de gravada.')
      }

      backupDeSeguranca = guardado.id
    } catch (falha) {
      await registrosBackupRepo.anotar({
        operacao: 'restauracao',
        descricao: 'Restauração abortada: a cópia de segurança falhou',
        sucesso: false,
        detalhe: falha instanceof Error ? falha.message : 'Falha desconhecida.',
      })

      throw new ErroDeRegra(
        'Não foi possível criar a cópia de segurança, e restaurar sem ela seria arriscado ' +
        'demais. Libere espaço no navegador e tente de novo. Nada foi alterado.',
      )
    }
  }

  // Prepara tudo antes de gravar qualquer coisa.
  const preparadas: [Colecao, unknown[]][] = []
  const ausentes: Colecao[] = []
  const desconhecidas = Object.keys(arquivo.conteudo.colecoes).filter(
    (nome) => !(COLECOES as readonly string[]).includes(nome),
  )

  for (const colecao of COLECOES) {
    const registros = arquivo.conteudo.colecoes[colecao]
    if (!registros) {
      ausentes.push(colecao)
      continue
    }
    if (!Array.isArray(registros)) {
      throw new ErroDeRegra(`A coleção "${colecao}" veio em formato inesperado.`)
    }
    preparadas.push([colecao, registros])
  }

  if (preparadas.length === 0) throw new ErroDeRegra('O arquivo não tem coleções para restaurar.')

  /*
    Com banco, a restauração inteira é uma transação do Postgres.

    O caminho abaixo — instantâneo, escrever, desfazer se quebrar — é a
    melhor aproximação possível **sem** servidor, e continua valendo no
    modo local. Mas ele tem um limite que nenhum código de aplicação
    supera: o rollback é escrito em TypeScript, e TypeScript não roda
    quando o navegador fecha, o celular dorme ou a aba morre. É
    exatamente aí que o studio fica com metade dos dados de um arquivo
    e metade de outro.

    `restaurar_backup` não tem esse limite. Ou o studio inteiro vira o
    do arquivo, ou continua como estava — inclusive se a energia acabar
    no meio.
  */
  if (temSupabase()) {
    const linhas = await chamarPortal<{ colecao: string; registros: number }[]>(
      'restaurar_backup',
      { p_conteudo: paraSublinhadoProfundo(arquivo.conteudo.colecoes) },
    )

    const total = (linhas ?? []).reduce((soma, l) => soma + (l.registros ?? 0), 0)

    armazenamento.invalidar?.()
    cache.limpar()

    await registrosBackupRepo.anotar({
      operacao: 'restauracao',
      descricao: `Restaurado "${arquivo.metadados.nome}"`,
      sucesso: true,
      detalhe:
        `${total} registro(s) em ${linhas?.length ?? 0} coleção(ões).` +
        (ausentes.length ? ` Mantidas como estavam (não vieram no arquivo): ${ausentes.join(', ')}.` : '') +
        (desconhecidas.length ? ` Ignoradas (desconhecidas): ${desconhecidas.join(', ')}.` : ''),
    })

    return { restaurados: total, colecoes: linhas?.length ?? 0, backupDeSeguranca, ausentes, desconhecidas }
  }

  /*
    Instantâneo antes de escrever, para desfazer se algo falhar no meio.

    A versão anterior gravava coleção por coleção. Se a sétima falhasse,
    as seis anteriores já estavam trocadas — o studio ficava com metade
    dos dados do arquivo e metade dos antigos, que é pior do que
    qualquer uma das duas versões inteiras. E não havia caminho de
    volta: o estado misturado não existia em backup nenhum.

    Isto não é uma transação de banco — o armazenamento não oferece uma.
    É a aproximação honesta possível: guardar o que está lá, escrever,
    e repor tudo se algo quebrar.
  */
  const instantaneo = new Map<Colecao, unknown[]>()
  for (const [colecao] of preparadas) {
    instantaneo.set(colecao, await armazenamento.listar(colecao))
  }

  let restaurados = 0
  const jaEscritas: Colecao[] = []

  try {
    for (const [colecao, registros] of preparadas) {
      await armazenamento.gravar(colecao, registros)
      jaEscritas.push(colecao)
      restaurados += registros.length
    }
  } catch (falha) {
    // Desfaz na ordem inversa, só o que chegou a ser escrito.
    const problemas: string[] = []
    for (const colecao of [...jaEscritas].reverse()) {
      try {
        await armazenamento.gravar(colecao, instantaneo.get(colecao) ?? [])
      } catch {
        problemas.push(colecao)
      }
    }

    await registrosBackupRepo.anotar({
      operacao: 'restauracao',
      descricao: `Restauração de "${arquivo.metadados.nome}" falhou e foi desfeita`,
      sucesso: false,
      detalhe: problemas.length
        ? `Não foi possível desfazer: ${problemas.join(', ')}. Use a cópia de segurança.`
        : 'Todos os dados voltaram ao estado anterior.',
    })

    if (problemas.length > 0) {
      throw new ErroDeRegra(
        'A restauração falhou e não foi possível desfazer tudo. ' +
        'Restaure a cópia de segurança criada agora há pouco, em Backup → Histórico.',
      )
    }

    throw new ErroDeRegra(
      'A restauração falhou no meio e foi desfeita. Seus dados continuam como estavam.',
    )
  }

  /*
    Os caches deste navegador falam de dados que não existem mais.

    Sem isto, a tela continuaria mostrando o studio anterior até alguém
    recarregar — e usar `location.reload()` para resolver seria trocar
    consistência por sorte: a recarga acontece antes ou depois da
    gravação terminar, dependendo do dia.
  */
  armazenamento.invalidar?.()
  cache.limpar()

  await registrosBackupRepo.anotar({
    operacao: 'restauracao',
    descricao: `Restaurado "${arquivo.metadados.nome}"`,
    sucesso: true,
    detalhe: `${preparadas.length} coleções, geradas em ${new Date(arquivo.conteudo.geradoEm).toLocaleString('pt-BR')}`,
    registrosAfetados: restaurados,
    responsavelId: opcoes.responsavelId ?? null,
  })

  return { restaurados, colecoes: preparadas.length, backupDeSeguranca, ausentes, desconhecidas }
}

/** Restaura a partir de uma cópia guardada no próprio sistema. */
export async function restaurarDeBackup(
  backupId: string,
  opcoes: { responsavelId?: string | null } = {},
): Promise<ResultadoRestauracao> {
  const backup = await backupsRepo.buscar(backupId)
  if (!backup) throw new ErroDeRegra('Backup não encontrado.')

  if (!backup.conteudo) {
    throw new ErroDeRegra(
      'Este backup guardou apenas o registro, não os dados. Restaure pelo arquivo que você baixou.',
    )
  }

  return restaurarDeArquivo(
    { metadados: backup, conteudo: backup.conteudo },
    opcoes,
  )
}

/* ------------------------------------------------------------------ */

/**
 * Nomes de coleção e de campo para o formato do Postgres.
 *
 * O arquivo de backup fala camelCase — é o formato das telas. A RPC
 * grava direto nas tabelas, que falam snake_case. A tradução acontece
 * aqui e em nenhum outro lugar: deixá-la na função do banco obrigaria
 * o SQL a conhecer o vocabulário do JavaScript.
 */
function paraSublinhadoProfundo(
  colecoes: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const nomeTabela: Record<string, string> = {
    listaEspera: 'lista_espera',
    movimentosCaixa: 'movimentos_caixa',
    usosCupom: 'usos_cupom',
    modelosMensagem: 'modelos_mensagem',
  }

  const saida: Record<string, unknown[]> = {}

  for (const [colecao, registros] of Object.entries(colecoes)) {
    if (!Array.isArray(registros)) continue

    saida[nomeTabela[colecao] ?? colecao] = registros.map((registro) => {
      const linha: Record<string, unknown> = {}
      for (const [chave, valor] of Object.entries(registro as Record<string, unknown>)) {
        linha[chave.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`)] = valor
      }
      return linha
    })
  }
  return saida
}
