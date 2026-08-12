import type { AdaptadorDeArmazenamento, Colecao } from './tipos'
import { ROTULO_COLECAO } from './tipos'
import { supabase, temSupabase } from '../supabase/cliente'
import { ErroDeConflito, ErroDePermissao, ErroDeRegra, ErroDeSessao } from '@/utils/erros'
import { comAcompanhamento } from '../conexao'
import { comPrazo, ErroDeRede, MENSAGEM_GRAVACAO_INCERTA, PRAZO_GRAVACAO_MS, PRAZO_PADRAO_MS } from '../rede'
import { normalizarInstante } from './instantes'

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
const VERSIONADAS = new Set<Colecao>([
  'clientes', 'agendamentos', 'servicos', 'profissionais',
  'produtos', 'studio', 'lancamentos', 'cupons',
])

export class SupabaseAdapter implements AdaptadorDeArmazenamento {
  readonly nome = 'Supabase'
  readonly persistente = true

  private espelho = new Map<Colecao, unknown[]>()
  private locais = new Map<Colecao, unknown[]>()

  /** Leituras em andamento. Ver o comentário longo em `listar`. */
  private emVoo = new Map<Colecao, Promise<unknown[]>>()

  /**
   * Quantas vezes cada coleção já foi invalidada.
   *
   * ---------------------------------------------------------------
   * O buraco que isto fecha
   * ---------------------------------------------------------------
   * `invalidar()` removia a promessa do mapa `emVoo` — e só. A busca
   * em si continuava no ar, e o `.then` dela ainda gravava o espelho
   * ao chegar. A sequência ruim:
   *
   *   busca A parte (estado antigo)
   *   ↓ invalidação — A sai do mapa, mas segue voando
   *   busca B parte e chega: espelho = estado NOVO
   *   ↓
   *   A chega atrasada: espelho = estado ANTIGO, por cima
   *
   * O comentário de `invalidar` afirmava impedir exatamente isto; a
   * remoção do mapa impedia só metade (novos pedidos não se penduram
   * na antiga). A escrita atrasada continuava possível.
   *
   * Com o carimbo, cada busca lembra em que geração nasceu e só
   * escreve se nenhuma invalidação aconteceu no meio. A atrasada
   * termina em silêncio — o resultado dela já foi superado.
   */
  private geracao = new Map<Colecao, number>()

  /**
   * Uma escrita desta aba acabou de ser confirmada nesta coleção.
   *
   * ---------------------------------------------------------------
   * A corrida que isto fecha — encontrada na SEGUNDA auditoria
   * ---------------------------------------------------------------
   * A supressão de eco (`ecos.ts`) preserva o espelho quando o evento
   * da própria gravação volta do Postgres. Correto — desde que o
   * espelho realmente contenha a gravação. Havia um caminho em que não
   * continha:
   *
   *   a tela abre → `listar()` parte (estado PRÉ-gravação)
   *   a pessoa salva rápido → escrita confirma, espelho atualizado
   *   o `listar()` antigo aterrissa → espelho = estado PRÉ-gravação
   *   o evento chega → eco consumido → espelho NÃO cai
   *   → o registro recém-salvo SOME da lista até o próximo evento
   *
   * Antes da supressão de eco essa corrida existia igual, mas o evento
   * derrubava o espelho e a releitura curava. A supressão removeu a
   * cura sem fechar a corrida.
   *
   * O fecho: toda escrita confirmada avança a geração. A leitura que
   * nasceu antes dela perde o direito de gravar o espelho — aterrissa
   * e é descartada em silêncio. A promessa em voo também sai do mapa,
   * para o próximo `listar()` ir ao banco em vez de se pendurar num
   * resultado que já nasceu velho.
   *
   * A ordem importa: o bump vem ANTES do `espelho.set` de quem chamou,
   * para nenhuma janela existir entre confirmar a escrita e proteger o
   * espelho dela.
   */
  private escreveu(colecao: Colecao): void {
    this.geracao.set(colecao, (this.geracao.get(colecao) ?? 0) + 1)
    this.emVoo.delete(colecao)
  }

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

    /*
      Uma requisição por coleção, mesmo com dez pedidos ao mesmo tempo.

      O espelho só era preenchido **depois** do `await`, e a tela do
      painel dispara dez consultas em paralelo — três delas leem
      serviços, clientes e profissionais cada uma. Todas encontravam o
      espelho vazio no mesmo instante e todas iam à rede: nove viagens
      para trazer três tabelas.

      Guardar a promessa em vez do resultado resolve na raiz. Quem
      chegar enquanto a primeira ainda está no ar espera a mesma
      resposta, e o espelho passa a ser preenchido uma vez só.
    */
    const emVoo = this.emVoo.get(colecao)
    if (emVoo) return [...((await emVoo) as T[])]

    const nascidaEm = this.geracao.get(colecao) ?? 0

    const busca = this.buscarTudo(colecao)
      .then((registros) => {
        // Só grava quem ainda é a geração vigente. Ver `geracao`.
        if ((this.geracao.get(colecao) ?? 0) === nascidaEm) {
          this.espelho.set(colecao, registros)
        }
        return registros
      })
      .finally(() => {
        if (this.emVoo.get(colecao) === busca) this.emVoo.delete(colecao)
      })

    this.emVoo.set(colecao, busca)
    return [...((await busca) as T[])]
  }

  /**
   * Lê a tabela inteira, em páginas.
   *
   * O `select('*')` sozinho parecia trazer tudo e não trazia: o
   * PostgREST corta a resposta no limite do projeto — mil linhas, por
   * padrão — e devolve o recorte **sem erro nenhum**. Numa agenda com
   * dois anos de histórico isso não aparece como falha; aparece como
   * atendimento antigo que sumiu do relatório e cliente que perdeu
   * metade da ficha, sem nada no console para explicar.
   *
   * Pedir por faixas até a página vir incompleta é o que garante que
   * "listar" signifique listar.
   */
  private async buscarTudo(colecao: Colecao): Promise<unknown[]> {
    const TAMANHO = 1000
    const tudo: unknown[] = []

    for (let pagina = 0; ; pagina++) {
      const inicio = pagina * TAMANHO

      /*
        Cada página tem prazo próprio.

        Sem isto, uma leitura pendurada — celular que trocou de antena,
        aba que voltou do segundo plano com o socket morto — deixava a
        promessa em `emVoo` para sempre. E como `listar` devolve essa
        mesma promessa a todo mundo que pedir a coleção, a tela inteira
        ficava em "carregando" sem nada que a tirasse dali. Era a
        origem do congelamento que só recarregar a página resolvia.

        O prazo é por página e não pela busca inteira de propósito: uma
        tabela grande legitimamente leva mais tempo, e o que precisa
        ter limite é cada viagem, não o total.
      */
      const { data, error } = await comPrazo(
        async () =>
          supabase()
            .from(TABELA[colecao])
            .select('*')
            .range(inicio, inicio + TAMANHO - 1),
        PRAZO_PADRAO_MS,
        `A leitura de ${ROTULO_COLECAO[colecao] ?? colecao}`,
      )

      if (error) throw this.traduzirFalha(error, colecao)

      const lote = data ?? []
      for (const linha of lote) tudo.push(paraCamelo(linha))

      if (lote.length < TAMANHO) break
    }

    return tudo
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

    this.escreveu(colecao)
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

  async inserir<T>(colecao: Colecao, registro: T): Promise<T> {
    if (SO_LOCAIS.includes(colecao)) {
      this.gravarLocal(colecao, [...this.lerLocal(colecao), registro])
      return registro
    }

    const linha = paraSublinhado(registro as Record<string, unknown>)

    const confirmado = await comAcompanhamento(async () => {
      /*
        `.select().single()` devolve A LINHA QUE O BANCO GRAVOU — com
        `versao` do gatilho, `criado_em` do default e qualquer coluna
        que um trigger tenha completado.

        Antes, o método devolvia o objeto que o JavaScript montou. Para
        as tabelas versionadas isso significava um registro SEM
        `versao` na mão da tela: a primeira edição depois de criar
        declarava versão indefinida, e a trava otimista ficava desarmada
        exatamente na janela em que dois aparelhos mais provavelmente
        mexem no mesmo registro — logo depois de ele nascer.
      */
      const { data, error } = await comPrazo(
        async () => supabase().from(TABELA[colecao]).insert(linha).select().single(),
        PRAZO_GRAVACAO_MS,
        MENSAGEM_GRAVACAO_INCERTA,
      )

      if (error) {
        /*
          Chave primária duplicada = ESTA MESMA GRAVAÇÃO já chegou.

          É a peça central da idempotência: o id nasce no formulário e
          se repete na nova tentativa. Se a primeira tentativa gravou
          mas a resposta se perdeu (timeout, rede que caiu na volta), a
          segunda bate na chave primária — e isso não é um erro, é a
          confirmação atrasada que faltava. Buscamos a linha e a
          devolvemos como sucesso.

          A checagem exige `_pkey` no nome da constraint: um 23505 de
          OUTRO índice único (telefone, protocolo, caixa aberto) é uma
          recusa de verdade e continua subindo como erro.
        */
        const texto = `${error.message} ${error.details ?? ''}`
        if (error.code === '23505' && /_pkey/i.test(texto)) {
          const id = (linha as { id?: string }).id
          const { data: existente } = await supabase()
            .from(TABELA[colecao])
            .select('*')
            .eq('id', id ?? '')
            .maybeSingle()
          if (existente) return paraCamelo(existente) as T
        }
        throw this.traduzirFalha(error, colecao)
      }

      return paraCamelo(data as Record<string, unknown>) as T
    })

    this.escreveu(colecao)
    const atual = this.espelho.get(colecao)
    if (atual) this.espelho.set(colecao, [...atual, confirmado])
    return confirmado
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
        const { data, error } = await comPrazo(
          async () =>
            supabase().rpc('atualizar_com_versao', {
              p_tabela: TABELA[colecao],
              p_id: id,
              p_mudancas: linha,
              p_versao: versaoEsperada ?? null,
            }),
          PRAZO_GRAVACAO_MS,
          MENSAGEM_GRAVACAO_INCERTA,
        )
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

      /*
        `.select()` transforma o UPDATE em pergunta com resposta.

        Sem ele, `update().eq('id', X)` sobre um id que NÃO EXISTE — ou
        que o RLS esconde — retorna sucesso com zero linhas tocadas. A
        tela dizia "Salvo com sucesso" sobre um registro que outro
        aparelho excluiu segundos antes; a pessoa seguia o dia inteiro
        confiando numa edição que nunca aconteceu.

        Zero linhas de volta aqui não tem interpretação inocente: ou o
        registro se foi, ou a permissão o esconde. As duas exigem que a
        pessoa PARE — por isso o erro, e não um aviso.
      */
      const { data: linhasAfetadas, error } = await comPrazo(
        async () =>
          supabase().from(TABELA[colecao]).update(linha).eq('id', id).select('id'),
        PRAZO_GRAVACAO_MS,
        MENSAGEM_GRAVACAO_INCERTA,
      )
      if (error) throw this.traduzirFalha(error, colecao)

      if (!linhasAfetadas || linhasAfetadas.length === 0) {
        throw new ErroDeConflito(
          `Este registro não existe mais em ${ROTULO_COLECAO[colecao] ?? colecao} — pode ter sido removido em outro aparelho. Recarregue a tela.`,
        )
      }
    })

    const versaoNova = gravado ?? registro

    this.escreveu(colecao)
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

  async buscarPorCampo<T>(colecao: Colecao, campo: string, valor: string): Promise<T[]> {
    if (SO_LOCAIS.includes(colecao)) {
      const chave = campo as keyof T
      return this.lerLocal<T>(colecao).filter((r) => (r as T)[chave] === (valor as T[keyof T]))
    }

    /*
      Um WHERE no banco em vez de um download da tabela.

      Sem espelho e sem cache de propósito: quem chama isto (fotos)
      quer exatamente o recorte, e guardar recortes por chave no
      espelho criaria uma segunda fonte de verdade para invalidar. O
      tempo real continua invalidando pelo cache de consultas, que é
      onde as telas leem.
    */
    const coluna = campo.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)
    const { data, error } = await comPrazo(
      async () =>
        supabase().from(TABELA[colecao]).select('*').eq(coluna, valor),
      PRAZO_PADRAO_MS,
      `A leitura de ${ROTULO_COLECAO[colecao] ?? colecao}`,
    )
    if (error) throw this.traduzirFalha(error, colecao)
    return (data ?? []).map((linha) => paraCamelo(linha) as T)
  }

  async removerUm(colecao: Colecao, id: string): Promise<void> {
    if (SO_LOCAIS.includes(colecao)) {
      const atual = this.lerLocal<{ id?: string }>(colecao)
      this.gravarLocal(colecao, atual.filter((r) => r.id !== id))
      return
    }

    await comAcompanhamento(async () => {
      const { data: linhasRemovidas, error } = await comPrazo(
        async () => supabase().from(TABELA[colecao]).delete().eq('id', id).select('id'),
        PRAZO_GRAVACAO_MS,
        MENSAGEM_GRAVACAO_INCERTA,
      )
      if (error) throw this.traduzirFalha(error, colecao)

      /*
        Excluir o que já não existe NÃO é erro — o estado desejado
        ("este registro não está mais lá") já é verdade, e é o mesmo
        desfecho de um retry após timeout. A assimetria com o UPDATE é
        deliberada: lá, zero linhas significa que a intenção da pessoa
        NÃO aconteceu; aqui, significa que aconteceu antes.

        Mas silêncio total esconderia um caso que importa: o RLS
        barrando a exclusão também devolve zero linhas. Fica o registro
        no console — invisível para a cliente, visível para quem
        diagnostica uma exclusão que "não pega".
      */
      if (!linhasRemovidas || linhasRemovidas.length === 0) {
        console.warn(
          `[storage] exclusão em ${TABELA[colecao]} não afetou nenhuma linha (id ${id}): ` +
            'registro já removido ou barrado por permissão.',
        )
      }
    })

    this.escreveu(colecao)
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
    /*
      A leitura em andamento também é descartada.

      Uma busca disparada antes da gravação traz o estado anterior, e
      ela ainda vai gravar o espelho quando chegar. Sem soltar a
      promessa aqui, o dado velho aterrissaria por cima do novo — e a
      tela mostraria o agendamento que acabou de ser cancelado.
    */
    if (colecao) {
      this.espelho.delete(colecao)
      this.emVoo.delete(colecao)
      this.geracao.set(colecao, (this.geracao.get(colecao) ?? 0) + 1)
    } else {
      /*
        As coleções COM BUSCA NO AR entram antes das que já têm chave.

        Sem esta linha, uma coleção nunca invalidada não estaria no
        mapa de gerações — e a busca dela, nascida na geração 0,
        encontraria a mesma geração 0 ao chegar e escreveria o estado
        antigo. É exatamente o caso do logout: tudo é limpo de uma
        vez, e as leituras da tela anterior ainda estão voando.
      */
      for (const chave of this.emVoo.keys()) {
        this.geracao.set(chave, (this.geracao.get(chave) ?? 0) + 1)
      }
      this.espelho.clear()
      this.emVoo.clear()
      for (const chave of this.geracao.keys()) {
        this.geracao.set(chave, (this.geracao.get(chave) ?? 0) + 1)
      }
    }
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

    /*
      Sessão e permissão são coisas diferentes, e a saída de cada uma
      também.

      `PGRST301` é token ausente/expirado — a pessoa precisa entrar de
      novo. `42501` é o RLS recusando: a sessão está boa, a linha é que
      não é dela. Mandar "entre novamente" no segundo caso faz a
      proprietária sair e voltar para encontrar exatamente o mesmo
      erro, agora convencida de que o sistema está quebrado.
    */
    if (erro.code === 'PGRST301') {
      return new ErroDeSessao()
    }
    if (erro.code === '42501') {
      return new ErroDePermissao(
        `Você não possui permissão para esta ação em ${rotulo}.`,
      )
    }
    if (erro.code === '42P01' || erro.code === 'PGRST205') {
      return new Error(
        `A tabela "${TABELA[colecao]}" não existe. Rode os arquivos de supabase/ no seu projeto.`,
      )
    }

    /*
      Coluna que o frontend envia e o banco não tem.

      ---------------------------------------------------------------
      Este era o erro do Caixa, e ele não tinha tradução nenhuma
      ---------------------------------------------------------------
      `caixas` foi criada com `valor_fechamento`, `responsavel` e
      `observacao`; o sistema envia `valor_informado`, `aberto_por_id`
      e `observacoes`. O PostgREST recusa a linha inteira com PGRST204
      e diz exatamente qual campo não encontrou.

      Sem este bloco, o erro caía no `return new Error(...)` genérico
      lá embaixo — que em produção vira "Algo não saiu como esperado.
      Tente novamente." A proprietária tentava de novo, indefinidamente,
      um erro que nenhuma tentativa resolve: falta rodar
      `supabase/12-correcao-esquema.sql`.

      Vira `ErroDeRegra` de propósito. `ErroDeRegra` chega inteiro à
      tela, e aqui isso é o certo — a mensagem diz o que fazer, e quem
      lê é quem publicou o sistema, não a cliente. Um "tente novamente"
      esconderia a única informação útil que existe.
    */
    if (erro.code === 'PGRST204' || erro.code === '42703') {
      const campo = `${erro.message} ${erro.details ?? ''}`.match(/'([a-z0-9_]+)'/i)?.[1]
      return new ErroDeRegra(
        campo
          ? `A coluna "${campo}" não existe em ${rotulo}. Rode supabase/12-correcao-esquema.sql no SQL Editor do Supabase.`
          : `O banco está desatualizado para ${rotulo}. Rode supabase/12-correcao-esquema.sql no SQL Editor do Supabase.`,
      )
    }

    /*
      Coluna obrigatória sem valor. Costuma andar junto com a anterior:
      quando o nome divergiu, a coluna real ficou vazia.
    */
    if (erro.code === '23502') {
      return new ErroDeRegra(
        `Faltou preencher um campo obrigatório em ${rotulo}. Se o problema persistir, confira se supabase/12-correcao-esquema.sql já foi executado.`,
      )
    }
    if (erro.code === '23P01') {
      return new ErroDeRegra('Este horário já está ocupado. Escolha outro, por favor.')
    }
    if (erro.code === '23505') {
      const texto = `${erro.message} ${erro.details ?? ''}`

      /*
        Cada índice único conta uma história diferente — e a mensagem
        precisa contar a mesma. "Este registro já existe" para um caixa
        aberto em outro aparelho mandaria a proprietária conferir um
        cadastro que não existe.

        O código e a constraint seguem anexados no erro: é por eles que
        `agendar` reconhece a colisão de protocolo e tenta de novo com
        outro código, em vez de devolver a recusa para a pessoa.
      */
      const mensagem = /telefone/i.test(texto)
        ? 'Já existe uma ficha com este telefone.'
        : /caixas_um_aberto|caixas_por_data/i.test(texto)
          ? 'O caixa já está aberto — talvez em outro aparelho. Recarregue a tela para vê-lo.'
          : /metas_por_mes/i.test(texto)
            ? 'Já existe uma meta para este mês. Edite a existente.'
            : /protocolo/i.test(texto)
              ? 'O código do agendamento colidiu com um existente. Tente novamente.'
              : `Este registro já existe em ${rotulo}.`

      const falha = new ErroDeRegra(mensagem)
      Object.assign(falha, { code: '23505', constraint: texto.match(/"([a-z0-9_]+)"/i)?.[1] })
      return falha
    }
    if (erro.code === '23503') {
      return new ErroDeRegra(
        'Este cadastro está em uso por outros registros e não pode ser removido. Desative-o em vez disso.',
      )
    }
    /*
      42804: "column X is of type Y but expression is of type text" —
      a assinatura exata da RPC `atualizar_com_versao` ANTIGA, que
      montava o UPDATE com `->>`  e quebrava em toda coluna não-texto.
      A correção mora em 12-correcao-esquema.sql; se este código
      aparece, o arquivo não foi executado neste projeto. Dizer isso é
      a única mensagem útil — "tente novamente" seria pedir para bater
      na mesma parede.
    */
    if (erro.code === '42804') {
      return new ErroDeRegra(
        'O banco está com uma função desatualizada. Rode supabase/12-correcao-esquema.sql no SQL Editor do Supabase.',
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
    /*
      Rede inacessível vira `ErroDeRede`, não `ErroDeRegra`.

      A diferença não é cosmética: `ehFalhaDeRede` reconhece o tipo, e
      é ele que decide se o indicador de conexão acende. Como
      `ErroDeRegra`, esta falha era classificada como "problema de
      negócio" e a faixa vermelha **não** aparecia justamente no único
      caso em que ela deveria aparecer.
    */
    if (/fetch|network|failed to fetch|load failed/i.test(erro.message)) {
      return new ErroDeRede(
        'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.',
      )
    }

    /*
      O erro desconhecido carrega o código adiante.

      `mensagemDeErro` esconde o texto técnico da cliente em produção —
      e está certo. Mas o código precisa sobreviver até o log, senão a
      investigação do próximo problema começa do zero.
    */
    const falha = new Error(`Falha ao acessar ${rotulo}. ${erro.message}`)
    if (erro.code) Object.assign(falha, { code: erro.code })
    return falha
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
    /*
      O valor passa por `normalizarInstante` na mesma volta.

      É a fronteira do sistema: daqui para dentro, toda data é
      `2026-08-11T14:00:00.000Z` e as comparações de texto espalhadas
      pelos repositórios voltam a valer. Ver `instantes.ts` para o que
      acontecia antes.
    */
    saida[chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase())] =
      normalizarInstante(valor)
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
