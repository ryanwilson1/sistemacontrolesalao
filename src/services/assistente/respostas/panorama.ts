import { faturamentoHoje } from './dinheiro'
import { agendaDoDia } from './agenda'
import { produtoAcabando } from './estoque'
import { ROTAS } from '@/constants'
import type { Resposta } from '../tipos'

/**
 * O retrato do dia inteiro numa resposta só.
 *
 * Reaproveita as três respostas que já existem em vez de refazer as
 * contas. Recalcular aqui criaria uma quarta versão dos mesmos números,
 * e é exatamente assim que um resumo passa a discordar do detalhe que
 * ele resume.
 */
export async function resumoGeral(): Promise<Resposta> {
  const [dinheiro, agenda, estoque] = await Promise.all([
    faturamentoHoje(),
    agendaDoDia(),
    produtoAcabando(),
  ])

  const destaques = [
    ...dinheiro.destaques.slice(0, 2),
    ...agenda.destaques.slice(0, 2),
    ...estoque.destaques.slice(0, 1),
  ]

  return {
    intencao: 'resumo_geral',
    texto: `${agenda.texto} ${dinheiro.texto}`,
    destaques,
    destino: ROTAS.painel,
    rotuloDestino: 'Abrir o painel',
  }
}
