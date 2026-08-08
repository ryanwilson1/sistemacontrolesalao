import { agendamentosRepo } from '../../repositorios/agenda'
import { clientesRepo } from '../../repositorios/clientes'
import { resumoDoCliente } from '../../atendimento'
import { ROTAS } from '@/constants'
import { addDays, faixaDeDias, tempoRelativo, hora } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { semDados } from './comuns'
import type { Interpretacao, Resposta } from '../tipos'

/** Respostas sobre as clientes: retorno, aniversário, faltas. */

export async function clientesSumidas(): Promise<Resposta> {
  const clientes = await clientesRepo.listar()
  const ativas = clientes.filter((c) => c.ativo)

  const comResumo = await Promise.all(
    ativas.map(async (cliente) => ({
      cliente,
      resumo: await resumoDoCliente(cliente.id),
    })),
  )

  const sumidas = comResumo
    .filter((item) => item.resumo.visitas > 0 && item.resumo.ultimaVisita)
    .sort((a, b) => (a.resumo.ultimaVisita ?? '').localeCompare(b.resumo.ultimaVisita ?? ''))
    .slice(0, 5)

  if (sumidas.length === 0) {
    return semDados('Ainda não há histórico suficiente para identificar quem sumiu.', 'clientes_sumidas')
  }

  const primeira = sumidas[0]!

  return {
    intencao: 'clientes_sumidas',
    texto:
      `${primeira.cliente.nome} é quem está há mais tempo sem vir — última visita ` +
      `${tempoRelativo(primeira.resumo.ultimaVisita!)}. Vale um convite de retorno.`,
    destaques: sumidas.map((item) => ({
      rotulo: item.cliente.nome,
      valor: tempoRelativo(item.resumo.ultimaVisita!),
      detalhe: `${item.resumo.visitas} visitas`,
    })),
    destino: ROTAS.clientes,
    rotuloDestino: 'Ver clientes',
  }
}

export async function aniversariantes(parametros: Interpretacao['parametros']): Promise<Resposta> {
  const daSemana = parametros.periodo === 'semana'
  const hoje = new Date()

  const dias = daSemana
    ? Array.from({ length: 7 }, (_, i) => addDays(hoje, i))
    : [hoje]

  const encontrados = await Promise.all(dias.map((dia) => clientesRepo.aniversariantes(dia)))
  const lista = encontrados.flat()

  if (lista.length === 0) {
    return semDados(
      daSemana ? 'Ninguém faz aniversário nesta semana.' : 'Ninguém faz aniversário hoje.',
      'aniversariantes',
    )
  }

  return {
    intencao: 'aniversariantes',
    texto:
      `${lista.length} cliente(s) fazem aniversário ${daSemana ? 'nos próximos 7 dias' : 'hoje'}. ` +
      'Uma mensagem faz diferença.',
    destaques: lista.slice(0, 6).map((c) => ({
      rotulo: c.nome,
      valor: c.nascimento ? new Date(`${c.nascimento}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—',
    })),
    destino: ROTAS.clientes,
    rotuloDestino: 'Ver clientes',
  }
}

export async function clientesFaltosas(): Promise<Resposta> {
  const clientes = await clientesRepo.listar()

  const comResumo = await Promise.all(
    clientes.filter((c) => c.ativo).map(async (cliente) => ({
      cliente,
      resumo: await resumoDoCliente(cliente.id),
    })),
  )

  const faltosas = comResumo
    .filter((item) => item.resumo.faltas > 0)
    .sort((a, b) => b.resumo.faltas - a.resumo.faltas)
    .slice(0, 5)

  if (faltosas.length === 0) {
    return semDados('Nenhuma cliente tem histórico de faltas. Muito bom.', 'clientes_faltosas')
  }

  return {
    intencao: 'clientes_faltosas',
    texto:
      `${faltosas.length} cliente(s) já faltaram. ${faltosas[0]!.cliente.nome} lidera com ` +
      `${faltosas[0]!.resumo.faltas} falta(s) — vale confirmar por mensagem na véspera.`,
    destaques: faltosas.map((item) => ({
      rotulo: item.cliente.nome,
      valor: `${item.resumo.faltas} falta(s)`,
      detalhe: `${item.resumo.visitas} visitas`,
    })),
    destino: ROTAS.clientes,
    rotuloDestino: 'Ver clientes',
  }
}

/**
 * Quem faltou no período — "quem faltou esta semana?".
 *
 * Falta é diferente de cancelamento: cancelar avisa e devolve o horário
 * para a agenda; faltar consome o horário sem ninguém no lugar. Só a
 * segunda entra nesta conta.
 */
export async function faltasPeriodo(parametros: Interpretacao['parametros']): Promise<Resposta> {
  const hoje = new Date()
  const dias = parametros.periodo === 'mes' ? 30 : 7
  const { de, ate } = faixaDeDias(addDays(hoje, -(dias - 1)), hoje)

  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const faltas = agendamentos
    .filter((a) => a.situacao === 'faltou')
    .sort((a, b) => b.inicio.localeCompare(a.inicio))

  const rotulo = dias === 7 ? 'nos últimos 7 dias' : 'nos últimos 30 dias'

  if (faltas.length === 0) {
    return semDados(`Ninguém faltou ${rotulo}. 💛`, 'faltas_periodo')
  }

  const perdido = faltas.reduce((soma, a) => soma + a.preco - a.desconto, 0)

  return {
    intencao: 'faltas_periodo',
    texto:
      `${faltas.length} falta(s) ${rotulo}, somando ${dinheiro(perdido)} em horários ` +
      'que ficaram vazios. Vale um contato com quem não veio.',
    destaques: faltas.slice(0, 6).map((a) => ({
      rotulo: a.cliente?.nome ?? a.nomeAvulso ?? 'Sem nome',
      valor: `${tempoRelativo(a.inicio)}`,
      detalhe: `${a.servico?.nome ?? ''} · ${hora(a.inicio)}`,
    })),
    destino: ROTAS.agenda,
    rotuloDestino: 'Abrir a agenda',
  }
}
