import { agendamentosRepo } from '../../repositorios/agenda'
import { lancamentosRepo } from '../../repositorios/financeiro'
import { estaAtivo } from '../../agenda/regras'
import { ROTAS, QUITADO } from '@/constants'
import { addDays, faixaDeDias, faixaDoDia, isoData, primeiroDiaDoMes } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { semDados } from './comuns'
import type { Interpretacao, Resposta } from '../tipos'

/**
 * Respostas sobre dinheiro.
 *
 * Os números saem dos mesmos repositórios que alimentam o financeiro e
 * o caixa. Se o assistente calculasse por conta própria, um dia diria
 * um valor e a tela diria outro — e a partir daí ninguém confiaria em
 * nenhum dos dois.
 */

export async function faturamentoHoje(): Promise<Resposta> {
  const hoje = new Date()
  const { de, ate } = faixaDoDia(hoje)

  const [agendamentos, lancamentos] = await Promise.all([
    agendamentosRepo.detalhadosNoPeriodo(de, ate),
    lancamentosRepo.noPeriodo(isoData(hoje), isoData(hoje)),
  ])

  const concluidos = agendamentos.filter((a) => a.situacao === 'concluido')
  const recebido = lancamentos
    .filter((l) => l.tipo === 'receita' && QUITADO.includes(l.situacao))
    .reduce((soma, l) => soma + l.valor, 0)

  const previsto = agendamentos
    .filter(estaAtivo)
    .reduce((soma, a) => soma + a.preco - a.desconto, 0)

  if (previsto === 0) {
    return semDados('Hoje ainda não há atendimentos marcados.', 'faturamento_hoje')
  }

  return {
    intencao: 'faturamento_hoje',
    texto:
      `Hoje você já recebeu ${dinheiro(recebido)} de ${concluidos.length} atendimento(s) concluído(s). ` +
      `Contando o que ainda está na agenda, o dia fecha em ${dinheiro(previsto)}.`,
    destaques: [
      { rotulo: 'Recebido', valor: dinheiro(recebido), detalhe: `${concluidos.length} concluídos` },
      { rotulo: 'Previsto', valor: dinheiro(previsto), detalhe: `${agendamentos.filter(estaAtivo).length} na agenda` },
    ],
    destino: ROTAS.caixa,
    rotuloDestino: 'Abrir o caixa',
  }
}

export async function faturamentoPeriodo(parametros: Interpretacao['parametros']): Promise<Resposta> {
  const hoje = new Date()
  const semanal = parametros.periodo === 'semana'

  const inicio = semanal ? addDays(hoje, -6) : primeiroDiaDoMes(hoje)
  const lancamentos = await lancamentosRepo.noPeriodo(isoData(inicio), isoData(hoje))

  const resumo = lancamentosRepo.resumir(lancamentos)
  const rotulo = semanal ? 'nos últimos 7 dias' : 'neste mês'

  if (resumo.recebido === 0 && resumo.pago === 0) {
    return semDados(`Não encontrei movimentação ${rotulo}.`, 'faturamento_periodo')
  }

  return {
    intencao: 'faturamento_periodo',
    texto:
      `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)} entraram ${dinheiro(resumo.recebido)} ` +
      `e saíram ${dinheiro(resumo.pago)}. O resultado está em ${dinheiro(resumo.lucro)}.`,
    destaques: [
      { rotulo: 'Entradas', valor: dinheiro(resumo.recebido) },
      { rotulo: 'Saídas', valor: dinheiro(resumo.pago) },
      { rotulo: 'Resultado', valor: dinheiro(resumo.lucro) },
    ],
    destino: ROTAS.financeiro,
    rotuloDestino: 'Ver o financeiro',
  }
}

export async function ticketMedio(): Promise<Resposta> {
  const hoje = new Date()
  const { de, ate } = faixaDeDias(primeiroDiaDoMes(hoje), hoje)

  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const concluidos = agendamentos.filter((a) => a.situacao === 'concluido')

  if (concluidos.length === 0) {
    return semDados('Ainda não há atendimentos concluídos neste mês.', 'ticket_medio')
  }

  const total = concluidos.reduce((soma, a) => soma + a.preco - a.desconto, 0)
  const media = total / concluidos.length

  return {
    intencao: 'ticket_medio',
    texto:
      `O ticket médio do mês está em ${dinheiro(media)}, sobre ${concluidos.length} ` +
      `atendimento(s) concluído(s) que somaram ${dinheiro(total)}.`,
    destaques: [
      { rotulo: 'Ticket médio', valor: dinheiro(media) },
      { rotulo: 'Atendimentos', valor: String(concluidos.length) },
      { rotulo: 'Total', valor: dinheiro(total) },
    ],
    destino: ROTAS.relatorios,
    rotuloDestino: 'Ver relatórios',
  }
}
