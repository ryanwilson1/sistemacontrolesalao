import { agendamentosRepo } from '../../repositorios/agenda'
import { listaEsperaRepo, solicitacoesRepo } from '../../repositorios/portal'
import { servicosRepo } from '../../repositorios/servicos'
import { profissionaisRepo } from '../../repositorios/equipe'
import { estaAtivo } from '../../agenda/regras'
import { ROTAS, DIAS_SEMANA } from '@/constants'
import { addDays, dataRelativa, faixaDoDia, hora, isoData } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { ROTULO_SOLICITACAO } from '@/types'
import { semDados } from './comuns'
import type { Interpretacao, Resposta } from '../tipos'

/**
 * Respostas sobre a agenda e o portal.
 *
 * "Quais horários livres amanhã" passa pelo mesmo motor que desenha a
 * grade do portal — não por uma contagem paralela. É o que garante que
 * a resposta aqui e o que a cliente vê no link sejam a mesma coisa.
 */

export async function horariosLivres(parametros: Interpretacao['parametros']): Promise<Resposta> {
  const alvo = parametros.dia === 'amanha' ? addDays(new Date(), 1) : new Date()
  const rotulo = parametros.dia === 'amanha' ? 'Amanhã' : 'Hoje'

  const [servicos, atendentes] = await Promise.all([
    servicosRepo.ativos(),
    profissionaisRepo.atendentes(),
  ])

  const servico = servicos[0]
  if (!servico || atendentes.length === 0) {
    return semDados('Preciso de ao menos um serviço e uma profissional cadastrados.', 'horarios_livres')
  }

  const porPessoa = await Promise.all(
    atendentes.map(async (pessoa) => ({
      nome: pessoa.nome,
      livres: await agendamentosRepo.horariosDisponiveis(alvo, servico.id, pessoa.id),
    })),
  )

  const total = porPessoa.reduce((soma, p) => soma + p.livres.length, 0)

  if (total === 0) {
    return semDados(`${rotulo} não há horários livres — a agenda está fechada ou lotada.`, 'horarios_livres')
  }

  const primeira = porPessoa.find((p) => p.livres.length > 0)!

  return {
    intencao: 'horarios_livres',
    texto:
      `${rotulo} há ${total} horário(s) livre(s) considerando ${servico.nome}. ` +
      `O próximo com ${primeira.nome} é às ${hora(primeira.livres[0]!)}.`,
    destaques: porPessoa
      .filter((p) => p.livres.length > 0)
      .map((p) => ({
        rotulo: p.nome,
        valor: `${p.livres.length} vagas`,
        detalhe: `A partir de ${hora(p.livres[0]!)}`,
      })),
    destino: ROTAS.agenda,
    rotuloDestino: 'Abrir a agenda',
  }
}

export async function agendaDoDia(): Promise<Resposta> {
  const { de, ate } = faixaDoDia(new Date())
  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const ativos = agendamentos.filter(estaAtivo)

  if (ativos.length === 0) {
    return semDados('Hoje a agenda está livre.', 'agenda_do_dia')
  }

  const proximos = ativos.filter((a) => new Date(a.inicio) > new Date())

  return {
    intencao: 'agenda_do_dia',
    texto:
      `Hoje são ${ativos.length} atendimento(s), ${ativos.filter((a) => a.situacao === 'concluido').length} já concluídos. ` +
      (proximos.length > 0
        ? `O próximo é ${proximos[0]!.cliente?.nome ?? proximos[0]!.nomeAvulso} às ${hora(proximos[0]!.inicio)}.`
        : 'Não há mais ninguém marcado para hoje.'),
    destaques: ativos.slice(0, 6).map((a) => ({
      rotulo: a.cliente?.nome ?? a.nomeAvulso ?? 'Sem nome',
      valor: hora(a.inicio),
      detalhe: a.servico?.nome,
    })),
    destino: ROTAS.agenda,
    rotuloDestino: 'Abrir a agenda',
  }
}

/**
 * Agenda de um dia da semana — "mostrar agenda de sexta-feira".
 *
 * Quem pergunta está se organizando, então a leitura é sempre para a
 * frente: a próxima sexta, não a que passou. Hoje conta como próxima
 * quando o dia bate, que é o que a pergunta quer dizer numa sexta.
 */
export async function agendaDiaSemana(parametros: Interpretacao['parametros']): Promise<Resposta> {
  const alvo = Number(parametros.diaSemana)

  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) {
    return semDados('Não entendi de qual dia da semana você quer a agenda.', 'agenda_dia_semana')
  }

  const hoje = new Date()
  const distancia = (alvo - hoje.getDay() + 7) % 7
  const data = addDays(hoje, distancia)

  const { de, ate } = faixaDoDia(data)
  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const ativos = agendamentos.filter(estaAtivo).sort((a, b) => a.inicio.localeCompare(b.inicio))

  const quando = distancia === 0 ? `${DIAS_SEMANA[alvo]} (hoje)` : `${DIAS_SEMANA[alvo]}, ${isoData(data).split('-').reverse().slice(0, 2).join('/')}`

  if (ativos.length === 0) {
    return semDados(`${quando} está sem atendimentos marcados.`, 'agenda_dia_semana')
  }

  const total = ativos.reduce((soma, a) => soma + a.preco - a.desconto, 0)

  return {
    intencao: 'agenda_dia_semana',
    texto:
      `${quando}: ${ativos.length} atendimento(s), das ${hora(ativos[0]!.inicio)} ` +
      `às ${hora(ativos[ativos.length - 1]!.fim)}, somando ${dinheiro(total)}.`,
    destaques: ativos.slice(0, 8).map((a) => ({
      rotulo: a.cliente?.nome ?? a.nomeAvulso ?? 'Sem nome',
      valor: hora(a.inicio),
      detalhe: `${a.servico?.nome ?? ''}${a.profissional ? ` · ${a.profissional.nome}` : ''}`,
    })),
    destino: ROTAS.agenda,
    rotuloDestino: 'Abrir a agenda',
  }
}

export async function cancelamentos(): Promise<Resposta> {
  const { de, ate } = faixaDoDia(new Date())
  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)

  const cancelados = agendamentos.filter((a) => a.situacao === 'cancelado')
  const faltas = agendamentos.filter((a) => a.situacao === 'faltou')

  if (cancelados.length === 0 && faltas.length === 0) {
    return semDados('Nenhum cancelamento ou falta hoje. Ótimo sinal.', 'cancelamentos')
  }

  return {
    intencao: 'cancelamentos',
    texto:
      `Hoje houve ${cancelados.length} cancelamento(s) e ${faltas.length} falta(s), ` +
      `deixando ${dinheiro([...cancelados, ...faltas].reduce((s, a) => s + a.preco - a.desconto, 0))} na mesa.`,
    destaques: [...cancelados, ...faltas].slice(0, 5).map((a) => ({
      rotulo: a.cliente?.nome ?? a.nomeAvulso ?? 'Sem nome',
      valor: a.situacao === 'cancelado' ? 'Cancelou' : 'Não veio',
      detalhe: a.servico?.nome,
    })),
    destino: ROTAS.agenda,
    rotuloDestino: 'Abrir a agenda',
  }
}

/** O que chegou pelo portal e ainda espera uma decisão sua. */
export async function pedidosDoPortal(): Promise<Resposta> {
  const [abertas, fila] = await Promise.all([
    solicitacoesRepo.abertas(),
    listaEsperaRepo.aguardando(),
  ])

  if (abertas.length === 0 && fila.length === 0) {
    return semDados('Nenhum pedido pendente no portal, e a lista de espera está vazia.', 'pedidos_do_portal')
  }

  const detalhadas = await agendamentosRepo.detalhar(
    (await Promise.all(abertas.map((s) => agendamentosRepo.buscar(s.agendamentoId))))
      .filter((a): a is NonNullable<typeof a> => a !== null),
  )
  const porId = new Map(detalhadas.map((a) => [a.id, a]))

  const partes: string[] = []
  if (abertas.length > 0) partes.push(`${abertas.length} pedido(s) esperando resposta`)
  if (fila.length > 0) partes.push(`${fila.length} cliente(s) na lista de espera`)

  return {
    intencao: 'pedidos_do_portal',
    texto: `${partes.join(' e ')}.`,
    destaques: abertas.slice(0, 6).map((s) => {
      const agendamento = porId.get(s.agendamentoId)
      return {
        rotulo: agendamento?.cliente?.nome ?? agendamento?.nomeAvulso ?? 'Cliente',
        valor: ROTULO_SOLICITACAO[s.tipo],
        detalhe: agendamento ? `${dataRelativa(agendamento.inicio)} às ${hora(agendamento.inicio)}` : undefined,
      }
    }),
    destino: ROTAS.portal,
    rotuloDestino: 'Abrir o portal',
  }
}
