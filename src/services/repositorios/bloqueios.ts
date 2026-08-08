import { RepositorioBase } from './base'
import type { Bloqueio } from '@/types'

/**
 * Bloqueios de agenda.
 *
 * Folga, férias, feriado, almoço extra e horário indisponível são a
 * mesma coisa por dentro: uma faixa de tempo em que não se atende.
 * O que muda é o rótulo — e o rótulo importa para a tela, não para o
 * motor de horários, que só pergunta "esta faixa está impedida?".
 *
 * Bloqueio sem profissional vale para o studio inteiro. É o que faz um
 * feriado fechar a casa sem precisar repetir a marcação pessoa a pessoa.
 */
class RepositorioBloqueios extends RepositorioBase<Bloqueio> {
  constructor() {
    super('bloqueios')
  }

  async noPeriodo(de: string, ate: string): Promise<Bloqueio[]> {
    const todos = await this.listar()
    return todos.filter((b) => b.inicio < ate && b.fim > de)
  }
}

export const bloqueiosRepo = new RepositorioBloqueios()
