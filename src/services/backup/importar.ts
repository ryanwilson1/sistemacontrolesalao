import { armazenamento } from '../storage'
import { COLECOES_SISTEMA, ROTULO_COLECAO, type Colecao } from '../storage/tipos'
import { registrosBackupRepo } from '../repositorios/backup'
import { validarArquivo } from './validador'
import { ErroDeRegra } from '@/utils/erros'
import type { ArquivoBackup, ContagemPorColecao, ValidacaoBackup } from '@/types'

/**
 * Importação.
 *
 * Diferente da restauração: em vez de substituir tudo, acrescenta
 * registros ao que já existe. Serve para trazer dados de outro aparelho
 * sem apagar o que está aqui.
 */

export type EstrategiaImportacao = 'acrescentar' | 'substituir' | 'ignorar_existentes'

export interface PreviaImportacao {
  validacao: ValidacaoBackup
  arquivo: ArquivoBackup | null
  contagens: ContagemPorColecao[]
  /** Quantos registros já existem com o mesmo id. */
  duplicados: number
  novos: number
}

/**
 * A coleção é uma lista de entidades ou uma configuração?
 *
 * Jornada de trabalho e programa de fidelidade não têm id: são
 * configuração, não lista. Tratá-las como lista faria cada importação
 * acrescentar uma cópia — sete linhas de horário viram catorze.
 */
const ehConfiguracao = (registros: { id?: string }[]): boolean =>
  registros.length > 0 && registros.some((r) => typeof r.id !== 'string')

/** Analisa o arquivo e mostra o que vai acontecer, sem gravar nada. */
export async function analisarImportacao(bruto: string): Promise<PreviaImportacao> {
  const { validacao, arquivo } = await validarArquivo(bruto)

  if (!arquivo) {
    return { validacao, arquivo: null, contagens: [], duplicados: 0, novos: 0 }
  }

  let duplicados = 0
  let novos = 0

  for (const contagem of validacao.contagens) {
    const existentes = await armazenamento.listar<{ id?: string }>(contagem.colecao)
    const idsExistentes = new Set(existentes.map((r) => r.id).filter(Boolean))

    const chegando = (arquivo.conteudo.colecoes[contagem.colecao] ?? []) as { id?: string }[]

    // Configuração é sempre substituição, nunca acréscimo.
    if (ehConfiguracao(chegando)) {
      if (existentes.length > 0) duplicados += chegando.length
      else novos += chegando.length
      continue
    }

    for (const registro of chegando) {
      if (registro.id && idsExistentes.has(registro.id)) duplicados += 1
      else novos += 1
    }
  }

  return { validacao, arquivo, contagens: validacao.contagens, duplicados, novos }
}

export interface ResultadoImportacao {
  inseridos: number
  atualizados: number
  ignorados: number
  colecoes: number
}

export async function importar(
  arquivo: ArquivoBackup,
  opcoes: {
    estrategia?: EstrategiaImportacao
    colecoes?: Colecao[]
    responsavelId?: string | null
  } = {},
): Promise<ResultadoImportacao> {
  const estrategia = opcoes.estrategia ?? 'ignorar_existentes'

  const alvo = (opcoes.colecoes?.length
    ? opcoes.colecoes
    : (Object.keys(arquivo.conteudo.colecoes) as Colecao[])
  ).filter((colecao) => !COLECOES_SISTEMA.includes(colecao))

  if (alvo.length === 0) throw new ErroDeRegra('Escolha ao menos uma coleção para importar.')

  let inseridos = 0
  let atualizados = 0
  let ignorados = 0

  for (const colecao of alvo) {
    const chegando = (arquivo.conteudo.colecoes[colecao] ?? []) as { id?: string }[]
    if (chegando.length === 0) continue

    // Substituir por escolha, ou porque a coleção é configuração e não
    // admite mesclagem por id.
    if (estrategia === 'substituir' || ehConfiguracao(chegando)) {
      await armazenamento.gravar(colecao, chegando)
      inseridos += chegando.length
      continue
    }

    const existentes = await armazenamento.listar<{ id?: string }>(colecao)
    const porId = new Map(existentes.filter((r) => r.id).map((r) => [r.id!, r]))

    for (const registro of chegando) {
      const jaExiste = registro.id ? porId.has(registro.id) : false

      if (!jaExiste) {
        porId.set(registro.id ?? String(Math.random()), registro)
        inseridos += 1
      } else if (estrategia === 'acrescentar') {
        porId.set(registro.id!, registro)
        atualizados += 1
      } else {
        ignorados += 1
      }
    }

    await armazenamento.gravar(colecao, [...porId.values()])
  }

  await registrosBackupRepo.anotar({
    operacao: 'importacao',
    descricao: `Importado de "${arquivo.metadados.nome}"`,
    sucesso: true,
    detalhe: `${alvo.length} coleções · ${ROTULO_COLECAO[alvo[0]!] ?? ''}${alvo.length > 1 ? ' e outras' : ''}`,
    registrosAfetados: inseridos + atualizados,
    responsavelId: opcoes.responsavelId ?? null,
  })

  return { inseridos, atualizados, ignorados, colecoes: alvo.length }
}

export const ESTRATEGIAS: { valor: EstrategiaImportacao; rotulo: string; detalhe: string }[] = [
  {
    valor: 'ignorar_existentes',
    rotulo: 'Só o que é novo',
    detalhe: 'Registros que já existem aqui ficam como estão. É o mais seguro.',
  },
  {
    valor: 'acrescentar',
    rotulo: 'Novo e atualizado',
    detalhe: 'Acrescenta o que falta e sobrescreve o que já existe com a versão do arquivo.',
  },
  {
    valor: 'substituir',
    rotulo: 'Substituir a coleção',
    detalhe: 'Apaga o conteúdo atual das coleções escolhidas e põe o do arquivo no lugar.',
  },
]
