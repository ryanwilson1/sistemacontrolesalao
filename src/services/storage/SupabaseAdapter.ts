import type { AdaptadorDeArmazenamento, Colecao } from './tipos'
import { ROTULO_COLECAO } from './tipos'
import { supabase, temSupabase } from '../supabase/cliente'
import { ErroDeConflito, ErroDeRegra } from '@/utils/erros'
import { comAcompanhamento } from '../conexao'

/**
 * Armazenamento no Supabase.
 *
 * Usa o cliente oficial porque ele carrega o token de quem fez login em
 * cada requisição. Sem isso, toda leitura chegaria ao banco como `anon`
 * — e `anon` não enxerga tabela nenhuma, de propósito.
 *
 * Duas escolhas que valem explicação:
 *
 * 1. **`gravar` substitui a coleção inteira.** É o contrato da porta,
 *    herdado do localStorage, e é honesto mantê-lo: mudar a assinatura
 *    obrigaria a reescrever todos os repositórios. Aqui isso vira um
 *    `upsert` do que existe mais um `delete` do que sumiu — duas
 *    requisições, dentro de uma transação lógica.
 *
 * 2. **Há um espelho em memória.** As telas leem muitas vezes a mesma
 *    coleção no mesmo segundo; sem o espelho, cada uma viraria uma
 *    viagem à rede. O canal de tempo real derruba o espelho quando o
 *    banco avisa que algo mudou — é por isso que `invalidar` existe na
 *    interface.
 */

/** Nome da tabela de cada coleção. Postgres prefere minúsculas. */
const TABELA: Record<Colecao, string> = {
  studio: 'studio',
  profissionais: 'profissionais',
  jornada: 'jornada',
  clientes: 'clientes',
  categorias: 'categorias',
  servicos: 'servicos',
  agendamentos: 'agendamentos',
  bloqueios: 'bloqueios',
  procedimentos: 'procedimentos',
  fotos: 'fotos',
  reservas: 'reservas',
  solicitacoes: 'solicitacoes',
  listaEspera: 'lista_espera',
  fornecedores: 'fornecedores',
  produtos: 'produtos',
  movimentos: 'movimentos',
  lancamentos: 'lancamentos',
  metas: 'metas',
  caixas: 'caixas',
  movimentosCaixa: 'movimentos_caixa',
  cupons: 'cupons',
  usosCupom: 'usos_cupom',
  fidelidade: 'fidelidade',
  pontos: 'pontos',
  lembretes: 'lembretes',
  notificacoes: 'notificacoes',
  modelosMensagem: 'modelos_mensagem',
  backups: 'backups',
  registrosBackup: 'registros_backup',
  configuracaoBackup: 'configuracao_backup',
  sessao: 'sessao',
}

/**
 * Coleções que moram no aparelho, não no banco.
 *
 * A sessão é deste navegador: subir para o servidor faria a
 * proprietária "entrar" no celular e o computador mudar de perfil
 * junto.
 *
 * **Backup saiu desta lista.** Ele estava aqui e o efeito era o
 * oposto do que o nome do recurso promete: `backups`,
 * `registrosBackup` e `configuracaoBackup` viviam num `Map` de
 * memória. A tela dizia "backup criado", listava o arquivo, e um F5
 * apagava tudo. O histórico de cópias de segurança era a coisa menos
 * segura do sistema.
 *
 * Agora eles persistem — no `localStorage` deste navegador, não no
 * Postgres. A escolha é deliberada: um backup guardado dentro do mesmo
 * banco que ele existe para socorrer não é backup. O arquivo fica no
 * aparelho de quem o gerou, e a exportação continua sendo o caminho
 * para tirá-lo dali.
 */
const SO_LOCAIS: Colecao[] = ['sessao', 'backups', 'registrosBackup', 'configuracaoBackup']

/**
 * Dessas, quais precisam sobreviver a um recarregamento.
 *
 * `sessao` fica de fora: com banco, quem manda é o token do Supabase, e
 * guardar uma cópia local só criaria uma segunda verdade sobre quem
 * está logado.
 */
const LOCAIS_PERSISTENTES: Colecao[] = ['backups', 'registrosBackup', 'configuracaoBackup']

const CHAVE_LOCAL = (colecao: Colecao) => `studio:local:${colecao}`

/**
 * Qual coluna é a chave de cada tabela.
 *
 * Quase todas usam `id`. `jornada` não: ela é uma linha por dia da
 * semana, e a chave é o próprio `dia_semana` — não faria sentido um
 * identificador aleatório para "terça-feira".
 *
 * Assumir `id` em todas custou um erro em produção. `gravar()` fazia
 * `select('id')` antes de escrever, e na jornada isso virava:
 *
 *   GET /rest/v1/jornada?select=id → 400 Bad Request
 *
 * Os horários de funcionamento não salvavam, e a mensagem no console
 * não dizia por quê.
 */
const CHAVE_PRIMARIA: Partial<Record<Colecao, string>> = {
  jornada: 'dia_semana',
}

const chaveDe = (colecao: Colecao): string => CHAVE_PRIMARIA[colecao] ?? 'id'

/**
 * Coleções com controle de versão no banco.
 *
 * São as que duas pessoas realmente abrem ao mesmo tempo: a ficha da
 * cliente enquanto a recepção atende o telefone, o agendamento que a
 * proprietária remarca do celular. Espelha a lista de
 * `supabase/09-concorrencia.sql` — as duas precisam concordar, e é por
 * isso que a lista está escrita e não deduzida.
 */
/*
  Desligado.

  A função `atualizar_com_versao` existe no banco, com a assinatura
  correta e permissão de execução para `authenticated` — as três coisas
  foram conferidas. Ainda assim, toda chamada pela API voltava 400, e a
  proprietária não conseguia salvar serviço, produto nem cliente.

  Diante de um sistema que ela precisa usar hoje, a escolha é simples:
  gravação direta na tabela, que é o caminho que sempre funcionou.

  O que se perde é a proteção contra duas pessoas editando o MESMO
  campo do MESMO registro ao mesmo tempo. O que continua de pé:

    · só as colunas alteradas são enviadas, então edições em campos
      diferentes convivem sem se sobrescrever;
    · o RLS continua barrando quem não é da equipe;
    · a trilha de auditoria continua registrando quem mudou o quê.

  Para religar quando a causa do 400 for encontrada, basta devolver as
  coleções a esta lista. O resto do código continua no lugar.
*/
const VERSIONADAS = new Set<Colecao>([])

export class SupabaseAdapter implements AdaptadorDeArmazenamento {
  readonly nome = 'Supabase'
  readonly persistente = true

  private espelho = new Map<Colecao, unknown[]>()
  private locais = new Map<Colecao, unknown[]>()

  /** Lê do disco na primeira vez; depois responde da memória. */
  private lerLocal<T>(colecao: Colecao): T[] {
    const emMemoria = this.locais.get(colecao)
    if (emMemoria) return [...(emMemoria as T[])]

    if (!LOCAIS_PERSISTENTES.includes(colecao) || typeof window === 'undefined') return []

    try {
      const bruto = window.localStorage.getItem(CHAVE_LOCAL(colecao))
      const registros = bruto ? (JSON.parse(bruto) as T[]) : []
      this.locais.set(colecao, registros)
      return [...registros]
    } catch {
      // Conteúdo ilegível não pode derrubar o sistema.
      return []
    }
  }

  /**
   * Grava no disco e só então atualiza a memória.
   *
   * Mesma ordem do `LocalStorageAdapter`, pelo mesmo motivo: com a
   * cota estourada, atualizar a memória antes deixaria a tela
   * mostrando um backup que o disco não tem.
   */
  private gravarLocal<T>(colecao: Colecao, registros: T[]): void {
    if (LOCAIS_PERSISTENTES.includes(colecao) && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CHAVE_LOCAL(colecao), JSON.stringify(registros))
      } catch {
        throw new ErroDeRegra(
          'O armazenamento do navegador está cheio. Exporte um backup e apague os antigos.',
        )
      }
    }
    this.locais.set(colecao, [...registros])
  }

  async iniciar(): Promise<void> {
    if (!temSupabase()) {
      throw new Error(
        'Supabase sem credenciais. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
      )
    }
  }

  async listar<T>(colecao: Colecao): Promise<T[]> {
    if (SO_LOCAIS.includes(colecao)) return this.lerLocal<T>(colecao)

    const emMemoria = this.espelho.get(colecao)
    if (emMemoria) return [...(emMemoria as T[])]

    const { data, error } = await supabase().from(TABELA[colecao]).select('*')
    if (error) throw this.traduzirFalha(error, colecao)

    const registros = (data ?? []).map((linha) => paraCamelo(linha)) as T[]
    this.espelho.set(colecao, registros)
    return [...registros]
  }

  /**
   * Substitui a coleção inteira.
   *
   * Continua existindo porque a restauração de backup precisa
   * exatamente disto: o arquivo passa a ser a verdade, e o que não
   * está nele sai. Fora daí, o sistema usa a escrita granular abaixo.
   *
   * A lista do que existe hoje vem do banco, não do espelho. A versão
   * anterior comparava com o espelho desta aba — e um espelho vazio
   * (coleção nunca lida nesta sessão) fazia a restauração *mesclar* em
   * vez de substituir, sem avisar. Duas restaurações do mesmo arquivo
   * davam resultados diferentes conforme as telas visitadas antes.
   */
  async gravar<T>(colecao: Colecao, registros: T[]): Promise<void> {
    if (SO_LOCAIS.includes(colecao)) {
      this.gravarLocal(colecao, registros)
      return
    }

    const tabela = TABELA[colecao]
    const banco = supabase()
    const chave = chaveDe(colecao)

    const { data: existentes, error: falhaLeitura } = await banco.from(tabela).select(chave)
    if (falhaLeitura) throw this.traduzirFalha(falhaLeitura, colecao)

    if (registros.length > 0) {
      const linhas = registros.map((r) => paraSublinhado(r as Record<string, unknown>))
      const { error } = await banco.from(tabela).upsert(linhas, { onConflict: chave })
      if (error) throw this.traduzirFalha(error, colecao)
    }

    // Apaga o que saiu da lista. Fazer isto depois do upsert é
    // deliberado: se a rede cair no meio, sobra registro a mais — que a
    // próxima gravação corrige — em vez de faltar registro, que é
    // perda de dado.
    const chaveCamelo = chave.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase())
    const agora = new Set(
      (registros as Record<string, unknown>[]).map((r) => r[chaveCamelo]).filter((v) => v != null),
    )
    const removidos = ((existentes ?? []) as unknown as Record<string, unknown>[])
      .map((r) => r[chave])
      .filter((valor) => valor != null && !agora.has(valor))

    if (removidos.length > 0) {
      // Em lotes: uma lista de dez mil ids não cabe numa URL.
      for (let i = 0; i < removidos.length; i += 200) {
        const { error } = await banco.from(tabela).delete().in(chave, removidos.slice(i, i + 200))
        if (error) throw this.traduzirFalha(error, colecao)
      }
    }

    this.espelho.set(colecao, [...registros])
  }

  /* ---------------------------------------------------------------- */
  /* Escrita granular                                                  */
  /* ---------------------------------------------------------------- */
  /*
    Uma linha por vez. É o que impede a agenda de uma tela sobrescrever
    a da outra — ver a explicação longa em `storage/tipos.ts`.

    O espelho é atualizado junto para a leitura seguinte não precisar
    voltar à rede. Se a gravação falhar, o espelho não é tocado: melhor
    a tela mostrar o estado antigo do que um estado que o banco recusou.
  */

  async inserir<T>(colecao: Colecao, registro: T): Promise<void> {
    if (SO_LOCAIS.includes(colecao)) {
      this.gravarLocal(colecao, [...this.lerLocal(colecao), registro])
      return
    }

    const linha = paraSublinhado(registro as Record<string, unknown>)
    await comAcompanhamento(async () => {
      const { error } = await supabase().from(TABELA[colecao]).insert(linha)
      if (error) throw this.traduzirFalha(error, colecao)
    })

    const atual = this.espelho.get(colecao)
    if (atual) this.espelho.set(colecao, [...atual, registro])
  }

  async atualizarUm<T>(
    colecao: Colecao,
    id: string,
    registro: T,
    mudancas?: Partial<T>,
  ): Promise<T> {
    if (SO_LOCAIS.includes(colecao)) {
      const atual = this.lerLocal<{ id?: string }>(colecao)
      this.gravarLocal(colecao, atual.map((r) => (r.id === id ? registro : r)) as unknown[])
      return registro
    }

    /*
      Só as colunas que mudaram vão para o banco.

      Mandar a linha inteira desfaz, em silêncio, o que outra aba
      gravou entre a leitura e a escrita desta — ver a explicação longa
      em `storage/tipos.ts`. `atualizadoEm` entra junto porque toda
      alteração precisa carimbar a hora.

      Sem `mudancas` — chamada antiga — cai no comportamento anterior.
      É a única forma de não quebrar quem ainda não passa o delta.
    */
    const alvo = mudancas
      ? { ...mudancas, atualizadoEm: (registro as Record<string, unknown>).atualizadoEm }
      : (registro as Record<string, unknown>)

    const linha = paraSublinhado(alvo as Record<string, unknown>)
    let gravado: unknown = null

    await comAcompanhamento(async () => {
      /*
        Registro versionado vai pela RPC, que recusa gravação em cima
        de versão velha.

        O `update` direto abaixo continua para tabelas sem `versao` —
        agenda de trabalho, categorias, notificações — onde duas
        pessoas na mesma linha ou não acontece, ou não custa nada.

        `versaoEsperada` vem do registro que a tela leu. Se for
        indefinida (registro recém-criado, modo antigo), a RPC não
        confere e o comportamento é o de antes: sem proteção, mas sem
        quebrar nada.
      */
      const versaoEsperada = (registro as { versao?: number }).versao

      if (VERSIONADAS.has(colecao)) {
        const { data, error } = await supabase().rpc('atualizar_com_versao', {
          p_tabela: TABELA[colecao],
          p_id: id,
          p_mudancas: linha,
          p_versao: versaoEsperada ?? null,
        })
        if (error) throw this.traduzirFalha(error, colecao)

        /*
          A linha devolvida pelo banco vira a verdade do espelho.

          Sem isto, o espelho guardaria a versão que a tela tinha antes
          de salvar — e a SEGUNDA edição da mesma aba chegaria ao banco
          declarando uma versão já superada. A proprietária salvaria uma
          vez, e a próxima tentativa acusaria conflito consigo mesma.
        */
        gravado = data ? (paraCamelo(data as Record<string, unknown>) as unknown) : null
        return
      }

      const { error } = await supabase().from(TABELA[colecao]).update(linha).eq('id', id)
      if (error) throw this.traduzirFalha(error, colecao)
    })

    const versaoNova = gravado ?? registro

    const atual = this.espelho.get(colecao) as { id?: string }[] | undefined
    if (atual) {
      this.espelho.set(colecao, atual.map((r) => (r.id === id ? versaoNova : r)) as unknown[])
    }

    return versaoNova as T
  }

  /**
   * Lê tudo direto do banco, numa consulta só.
   *
   * Não toca no espelho — nem para ler, nem para atualizar. É a
   * diferença entre "o que esta aba acha que existe" e "o que existe".
   */
  async instantaneo(): Promise<Record<string, unknown[]>> {
    const { data, error } = await supabase().rpc('instantaneo_do_studio')
    if (error) throw this.traduzirFalha(error, 'studio')

    const bruto = (data ?? {}) as Record<string, Record<string, unknown>[]>
    const saida: Record<string, unknown[]> = {}

    for (const [tabela, linhas] of Object.entries(bruto)) {
      saida[tabela] = (linhas ?? []).map((linha) => paraCamelo(linha))
    }
    return saida
  }

  async removerUm(colecao: Colecao, id: string): Promise<void> {
    if (SO_LOCAIS.includes(colecao)) {
      const atual = this.lerLocal<{ id?: string }>(colecao)
      this.gravarLocal(colecao, atual.filter((r) => r.id !== id))
      return
    }

    await comAcompanhamento(async () => {
      const { error } = await supabase().from(TABELA[colecao]).delete().eq('id', id)
      if (error) throw this.traduzirFalha(error, colecao)
    })

    const atual = this.espelho.get(colecao) as { id?: string }[] | undefined
    if (atual) this.espelho.set(colecao, atual.filter((r) => r.id !== id))
  }

  async limpar(): Promise<void> {
    this.espelho.clear()
    this.locais.clear()
    // Apagar o banco inteiro daqui seria fácil e perigoso demais.
    // Recomeçar do zero é operação do painel do Supabase, com backup na
    // mão — não um botão dentro do produto.
    throw new Error('Para recomeçar do zero, use o painel do Supabase.')
  }

  invalidar(colecao?: Colecao): void {
    if (colecao) this.espelho.delete(colecao)
    else this.espelho.clear()
  }

  /* ---------------------------------------------------------------- */

  private traduzirFalha(
    erro: { code?: string; message: string; details?: string },
    colecao: Colecao,
  ): Error {
    /*
      O Postgres separa "você não tem permissão" de "esta tabela não
      existe", e as duas pedem conselhos opostos. Traduzir aqui evita
      que a tela mostre um código e a pessoa procure no lugar errado.

      O tipo do erro importa: `ErroDeRegra` chega inteiro à tela, e
      `Error` comum vira uma frase genérica em produção. A divisão é
      proposital — a proprietária precisa ler "este horário já está
      ocupado", e não precisa ler o nome de uma constraint.
    */
    const rotulo = ROTULO_COLECAO[colecao] ?? colecao

    if (erro.code === '42501' || erro.code === 'PGRST301') {
      return new ErroDeRegra(
        'Sua sessão expirou ou esta conta não tem acesso. Entre novamente.',
      )
    }
    if (erro.code === '42P01' || erro.code === 'PGRST205') {
      return new Error(
        `A tabela "${TABELA[colecao]}" não existe. Rode os arquivos de supabase/ no seu projeto.`,
      )
    }
    if (erro.code === '23P01') {
      return new ErroDeRegra('Este horário já está ocupado. Escolha outro, por favor.')
    }
    if (erro.code === '23505') {
      // Índice único. O mais comum de longe é o telefone da cliente.
      return new ErroDeRegra(
        /telefone/i.test(`${erro.message} ${erro.details ?? ''}`)
          ? 'Já existe uma ficha com este telefone.'
          : `Este registro já existe em ${rotulo}.`,
      )
    }
    if (erro.code === '23503') {
      return new ErroDeRegra(
        'Este cadastro está em uso por outros registros e não pode ser removido. Desative-o em vez disso.',
      )
    }
    if (erro.code === '23514') {
      return new ErroDeRegra('Algum valor informado está fora do permitido. Revise os campos.')
    }
    if (erro.code === '40001' || /alterado em outro dispositivo/i.test(erro.message)) {
      return new ErroDeConflito(erro.message)
    }
    if (erro.code === 'P0001') {
      // `raise exception` das nossas próprias funções: a mensagem já
      // foi escrita para ser lida pela proprietária.
      return new ErroDeRegra(erro.message)
    }
    if (/fetch|network|failed to fetch/i.test(erro.message)) {
      return new ErroDeRegra(
        'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.',
      )
    }
    return new Error(`Falha ao acessar ${rotulo}. ${erro.message}`)
  }
}

/* ------------------------------------------------------------------ */
/* Tradução de nomes                                                   */
/* ------------------------------------------------------------------ */
/*
  O Postgres prefere snake_case; o sistema fala camelCase. A tradução
  mora aqui e em nenhum outro lugar — se vazasse para os repositórios,
  cada consulta precisaria saber em que banco está rodando, e a porta
  de armazenamento perderia a razão de existir.
*/

const paraCamelo = (linha: Record<string, unknown>): Record<string, unknown> => {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    saida[chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase())] = valor
  }
  return saida
}

const paraSublinhado = (registro: Record<string, unknown>): Record<string, unknown> => {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(registro)) {
    saida[chave.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`)] = valor
  }
  return saida
}
