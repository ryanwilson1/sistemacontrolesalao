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
      */
      if (versaoGuardada > 0) this.arquivarFormatoAntigo(versaoGuardada)
      window.localStorage.setItem(CHAVE_VERSAO, String(VERSAO))
    }
  }

  /**
   * Move o conteúdo do formato anterior para fora do caminho.
   *
   * Se não houver espaço para a cópia, o antigo é mantido onde está e
   * o sistema segue: perder o dado para abrir mais rápido nunca é a
   * troca certa.
   */
  private arquivarFormatoAntigo(versao: number): void {
    const chaves = Object.keys(window.localStorage).filter(
      (c) => c.startsWith(`${PREFIXO}:`) && !c.startsWith(PREFIXO_ARQUIVADO) && c !== CHAVE_VERSAO,
    )
    if (chaves.length === 0) return

    try {
      for (const chave of chaves) {
        const conteudo = window.localStorage.getItem(chave)
        if (conteudo === null) continue
        window.localStorage.setItem(`${PREFIXO_ARQUIVADO}:${versao}:${chave}`, conteudo)
        window.localStorage.removeItem(chave)
      }
    } catch {
      // Sem espaço para a cópia. O original fica onde está — a próxima
      // leitura o descarta por não bater com o formato, e nada é
      // destruído por nossa conta.
    }
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
