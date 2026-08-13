import type { Colecao } from '../storage'

/**
 * A PORTA do tempo real.
 *
 * Mesmo padrão do armazenamento e do envio de mensagens: o sistema
 * conversa com esta interface e com mais nada. Trocar o meio é escrever
 * uma classe e mudar uma linha em `index.ts`.
 *
 * O que trafega aqui é um aviso, não o dado. "A coleção de agendamentos
 * mudou" — quem recebe vai buscar a versão nova pelo caminho normal, o
 * repositório. Mandar o registro junto pareceria mais rápido e criaria
 * um segundo caminho de leitura, que é justamente o que faz duas telas
 * discordarem.
 */

export interface EventoTempoReal {
  colecao: Colecao
  /** Instante da mudança, em ISO. */
  em: string
  /**
   * Quem publicou. Cada aba tem o seu.
   * Serve para distinguir "eu mesmo gravei" de "outra pessoa gravou" —
   * só o segundo caso exige descartar o espelho do armazenamento.
   */
  origem: string
}

export type OuvinteTempoReal = (evento: EventoTempoReal) => void

export interface CanalTempoReal {
  /** Nome legível, exibido no diagnóstico. */
  readonly nome: string

  /** Alcança outros aparelhos, ou só outras abas deste? */
  readonly remoto: boolean

  /** Prepara o canal. Chamado uma vez, na abertura do sistema. */
  iniciar(): void

  /** Avisa que uma coleção mudou. */
  publicar(colecao: Colecao): void

  /** Escuta as mudanças. Devolve a função que cancela a inscrição. */
  inscrever(ouvinte: OuvinteTempoReal): () => void

  encerrar(): void

  /**
   * Retrato para o diagnóstico: quantos canais e quantos ouvintes.
   * Opcional porque nenhum canal precisa dele para funcionar.
   */
  medir?(): unknown
}
