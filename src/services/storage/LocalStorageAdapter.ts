import type { AdaptadorDeArmazenamento, Colecao } from './tipos'

/**
 * Armazenamento no navegador.
 *
 * Primeira implementação persistente da porta. Os dados sobrevivem a
 * recarregamentos e ao fechar o navegador, ficando no aparelho — nada
 * trafega para servidor nenhum.
 *
 * Trocar por IndexedDB, SQLite ou Supabase continua sendo uma linha em
 * `index.ts`: esta classe não é conhecida por ninguém além dele.
 */

const PREFIXO = 'studio'
const CHAVE_VERSAO = `${PREFIXO}:versao`

/**
 * Versão do formato guardado.
 *
 * ATENÇÃO ao subir este número. Até aqui, uma versão nova **apagava
 * tudo em silêncio**: a proprietária atualizava o sistema e encontrava
 * a agenda vazia, sem aviso, sem pergunta e sem caminho de volta.
 *
 * Era o oposto exato da regra do projeto — nada relevante sai sem a
 * proprietária saber e aprovar. Agora os dados antigos são preservados
 * sob outra chave e a decisão fica com ela (ver `dadosDeVersaoAntiga`).
 */
const VERSAO = 5

/** Onde os dados de um formato anterior ficam esperando decisão. */
const PREFIXO_ARQUIVADO = `${PREFIXO}:v-anterior`

export class LocalStorageAdapter implements AdaptadorDeArmazenamento {
  readonly nome = 'Navegador (localStorage)'
  readonly persistente = true

  /** Espelho em memória: evita ler e parsear JSON a cada consulta. */
  private espelho = new Map<Colecao, unknown[]>()
  private disponivel = false

  async iniciar(): Promise<void> {
    this.disponivel = this.testarDisponibilidade()
    if (!this.disponivel) return

    const versaoGuardada = Number(window.localStorage.getItem(CHAVE_VERSAO) ?? 0)

    if (versaoGuardada !== VERSAO) {
      /*
        Formato antigo encontrado.

        Não apagamos. Movemos para uma chave paralela e seguimos com o
        armazenamento vazio — o sistema abre funcionando, e o que havia
        antes continua recuperável. A tela de diagnóstico oferece
        exportar ou descartar, e o descarte é um clique consciente
        dela, não um efeito colateral de ter atualizado o sistema.

        ---------------------------------------------------------------
        A versão só avança quando a mudança TERMINOU
        ---------------------------------------------------------------
        A implementação anterior marcava a versão nova incondicionalmente
        — inclusive quando o arquivamento falhava NO MEIO (localStorage
        cheio, por exemplo). O resultado era o pior estado possível:
        parte dos dados arquivada, parte no lugar antigo, e o sistema
        convencido de que estava tudo no formato novo. As chaves
        remanescentes do formato velho passavam a ser lidas como se
        fossem do novo — mistura de formatos sem erro e sem aviso.

        Agora a regra é a de qualquer migração decente: ou termina, ou
        não aconteceu. Falhou uma chave? A versão fica onde estava, o
        que falhou fica anotado, e a PRÓXIMA abertura tenta de novo — o
        arquivamento é idempotente (copiar por cima do mesmo conteúdo e
        pular o que já saiu do lugar são operações inofensivas).
      */
      const pendentes = versaoGuardada > 0 ? this.arquivarFormatoAntigo(versaoGuardada) : []

      if (pendentes.length === 0) {
        window.localStorage.setItem(CHAVE_VERSAO, String(VERSAO))
        this.chavesPresas.clear()
      } else {
        for (const chave of pendentes) this.chavesPresas.add(chave)
        console.error(
          `[storage] migração do formato v${versaoGuardada} incompleta: ` +
            `${pendentes.length} chave(s) sem espaço para arquivar. ` +
            'Os dados antigos foram preservados; a próxima abertura tentará de novo.',
        )
      }
    }
  }

  /**
   * Chaves do formato antigo que AINDA não foram arquivadas.
   *
   * Enquanto uma chave está aqui, ela não pode ser lida como formato
   * novo (seria mistura de formatos) nem sobrescrita por uma gravação
   * (destruiria o único exemplar do dado antigo). A leitura devolve
   * vazio e a gravação tenta arquivar primeiro — ver `gravar`.
   */
  private chavesPresas = new Set<string>()

  /**
   * Move o conteúdo do formato anterior para fora do caminho.
   *
   * Se não houver espaço para a cópia, o antigo é mantido onde está e
   * o sistema segue: perder o dado para abrir mais rápido nunca é a
   * troca certa.
   */
  private arquivarFormatoAntigo(versao: number): string[] {
    const chaves = Object.keys(window.localStorage).filter(
      (c) => c.startsWith(`${PREFIXO}:`) && !c.startsWith(PREFIXO_ARQUIVADO) && c !== CHAVE_VERSAO,
    )

    /*
      O try/catch mora DENTRO do laço, por chave — e isso é o conserto.

      A versão anterior envolvia o laço inteiro: a primeira chave sem
      espaço abortava as seguintes em silêncio, e quem chamou nunca
      soube. Agora cada chave tem seu próprio desfecho: copiada e
      removida (sucesso), ou anotada na lista de pendências (falha). A
      cópia vem ANTES da remoção de propósito — se a cópia falha, o
      original está intacto; se a remoção falha (não acontece na
      prática, mas o contrato não depende disso), existe uma cópia.
    */
    const pendentes: string[] = []

    for (const chave of chaves) {
      const conteudo = window.localStorage.getItem(chave)
      if (conteudo === null) continue

      try {
        window.localStorage.setItem(`${PREFIXO_ARQUIVADO}:${versao}:${chave}`, conteudo)
        window.localStorage.removeItem(chave)
      } catch {
        pendentes.push(chave)
      }
    }

    return pendentes
  }

  /**
   * Há dados de um formato anterior guardados?
   *
   * Usado pela tela de diagnóstico para avisar a proprietária em vez
   * de deixar o assunto invisível.
   */
  dadosDeVersaoAntiga(): { versao: number; colecoes: number } | null {
    if (!this.disponivel) return null

    const chaves = Object.keys(window.localStorage).filter((c) =>
      c.startsWith(PREFIXO_ARQUIVADO),
    )
    if (chaves.length === 0) return null

    const versao = Number(chaves[0].split(':')[2] ?? 0)
    return { versao, colecoes: chaves.length }
  }

  /** Descarta os dados antigos. Só a partir de um clique consciente. */
  descartarVersaoAntiga(): void {
    for (const chave of Object.keys(window.localStorage)) {
      if (chave.startsWith(PREFIXO_ARQUIVADO)) window.localStorage.removeItem(chave)
    }
  }

  async listar<T>(colecao: Colecao): Promise<T[]> {
    const emMemoria = this.espelho.get(colecao)
    if (emMemoria) return [...(emMemoria as T[])]

    if (!this.disponivel) return []

    /*
      Chave presa = conteúdo do FORMATO ANTIGO ainda no lugar (a
      migração não conseguiu arquivá-lo — sem espaço). Ler isso como se
      fosse formato novo é mistura de formatos: parseia, entra no
      espelho e contamina a tela. A coleção se apresenta vazia até a
      pendência se resolver; o dado antigo continua intacto no disco.
    */
    if (this.chavesPresas.has(this.chave(colecao))) return []

    const bruto = window.localStorage.getItem(this.chave(colecao))
    if (!bruto) return []

    try {
      const registros = JSON.parse(bruto) as T[]
      this.espelho.set(colecao, registros)
      return [...registros]
    } catch {
      // Conteúdo corrompido não pode derrubar o sistema: descarta e segue.
      window.localStorage.removeItem(this.chave(colecao))
      return []
    }
  }

  async gravar<T>(colecao: Colecao, registros: T[]): Promise<void> {
    /*
      Persiste primeiro, atualiza o espelho depois.

      A ordem inversa criava um estado fantasma. Com a cota do
      navegador estourada, o `setItem` falhava — mas o espelho já
      tinha sido trocado. A partir dali, memória e disco discordavam:
      a tela mostrava o agendamento novo, o `localStorage` guardava a
      lista antiga, e um F5 fazia o registro desaparecer sem
      explicação.

      Com o espelho atualizado só depois da confirmação, uma falha de
      gravação deixa memória e disco na mesma versão — a anterior. O
      erro sobe para quem chamou, a tela avisa, e nada some depois.
    */

    /*
      Gravar por cima de uma chave presa destruiria o ÚNICO exemplar do
      dado antigo — a exata coisa que a migração existe para impedir.
      Última tentativa de arquivar agora (algum espaço pode ter vagado);
      não deu, o erro sobe com a causa real e a instrução prática, em
      vez de um sucesso que apaga história.
    */
    if (this.chavesPresas.has(this.chave(colecao))) {
      const pendentes = this.arquivarFormatoAntigo(
        Number(window.localStorage.getItem(CHAVE_VERSAO) ?? 0),
      )
      this.chavesPresas.clear()
      for (const chave of pendentes) this.chavesPresas.add(chave)

      if (this.chavesPresas.has(this.chave(colecao))) {
        throw new Error(
          'O armazenamento do navegador está cheio e ainda guarda dados de uma versão anterior. ' +
            'Exporte ou descarte os dados antigos na tela de Backup antes de gravar.',
        )
      }
    }
    if (!this.disponivel) {
      // Sem localStorage (navegação anônima em alguns celulares), o
      // espelho é tudo que existe. Aqui ele é a persistência possível.
      this.espelho.set(colecao, [...registros])
      return
    }

    let serializado: string
    try {
      serializado = JSON.stringify(registros)
    } catch {
      // Referência circular ou valor não serializável. O espelho não é
      // tocado: guardar em memória algo que nunca vai para o disco é
      // exatamente o estado fantasma que este método evita.
      throw new Error('Não foi possível preparar os dados para gravação.')
    }

    try {
      window.localStorage.setItem(this.chave(colecao), serializado)
    } catch (falha) {
      if (this.ehErroDeCota(falha)) {
        throw new Error(
          'O armazenamento do navegador está cheio. Faça um backup e limpe dados antigos.',
        )
      }
      throw falha
    }

    // Só agora. O disco confirmou.
    this.espelho.set(colecao, [...registros])
  }

  async limpar(): Promise<void> {
    this.espelho.clear()
    this.apagarTudo()
  }

  /**
   * Descarta o espelho em memória.
   *
   * Quando outra aba grava, o localStorage já está atualizado mas o
   * espelho desta aba não. Descartar força a próxima leitura a ir ao
   * disco — é o que faz o tempo real entre abas mostrar o dado certo.
   */
  invalidar(colecao?: Colecao): void {
    if (colecao) this.espelho.delete(colecao)
    else this.espelho.clear()
  }

  /** Espaço ocupado, em bytes. Exibido no diagnóstico e na Central de Backup. */
  espacoUsado(): number {
    if (!this.disponivel) return 0

    let total = 0
    for (let i = 0; i < window.localStorage.length; i++) {
      const chave = window.localStorage.key(i)
      if (!chave?.startsWith(`${PREFIXO}:`)) continue
      total += chave.length + (window.localStorage.getItem(chave)?.length ?? 0)
    }
    return total * 2 // UTF-16: dois bytes por caractere
  }

  /* ---------------------------------------------------------------- */

  private chave = (colecao: Colecao) => `${PREFIXO}:${colecao}`

  private apagarTudo(): void {
    if (!this.disponivel) return

    const remover = Object.keys(window.localStorage).filter((c) =>
      c.startsWith(`${PREFIXO}:`),
    )
    for (const chave of remover) window.localStorage.removeItem(chave)
  }

  /**
   * Navegação anônima e alguns navegadores móveis expõem localStorage mas
   * lançam ao gravar. Descobrir isso aqui evita erro no meio de um fluxo.
   */
  private testarDisponibilidade(): boolean {
    try {
      const teste = `${PREFIXO}:teste`
      window.localStorage.setItem(teste, '1')
      window.localStorage.removeItem(teste)
      return true
    } catch {
      return false
    }
  }

  private ehErroDeCota(falha: unknown): boolean {
    return (
      falha instanceof DOMException &&
      (falha.name === 'QuotaExceededError' || falha.code === 22)
    )
  }
}
