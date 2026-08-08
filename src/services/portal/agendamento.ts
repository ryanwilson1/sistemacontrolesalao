import { agendamentosRepo } from '../repositorios/agenda'
import { servicosRepo } from '../repositorios/servicos'
import { profissionaisRepo, studioRepo } from '../repositorios/equipe'
import { clientesRepo } from '../repositorios/clientes'
import { programarParaAgendamento } from '../comunicacao/lembretes'
import { concluirReserva, liberarDaVisitante } from './reservas'
import { idDoVisitante, renovarVisitante } from './visitante'
import {
  agendarRemoto, carregarPortalRemoto, chegueiRemoto, consultarRemoto, gradeRemota,
  portalRemoto,
} from './remoto'
import { ErroDeRegra } from '@/utils/erros'
import { digitos } from '@/utils/formato'
import { limparNome } from '@/utils/sanitizar'
import type {
  Agendamento, AgendamentoDetalhado, DadosDoPortal, OpcaoDeHorario, ReservaTemporaria,
} from '@/types'

/**
 * Fachada do Portal de Agendamento.
 *
 * As telas públicas conversam só com este arquivo. É o que mantém a
 * página fina: nenhuma delas conhece repositório, regra de conflito ou
 * fila de lembretes.
 *
 * Repare no que NÃO existe aqui: nenhuma função que grave horário por um
 * caminho próprio. `confirmar` chama o mesmo `agendar` do painel, com as
 * mesmas regras. A agenda é uma só.
 *
 * Com banco, cada função abaixo desvia para `remoto.ts`. O desvio existe
 * por causa do RLS: a visitante do link não está autenticada, e `anon`
 * não enxerga tabela alguma — de propósito, porque ler `agendamentos`
 * entregaria nome, serviço e preço de todas as clientes. Ela fala por
 * funções estreitas, que devolvem só o recorte necessário.
 *
 * O motor de horários não muda nos dois caminhos. Muda de onde vêm os
 * dados que ele recebe.
 */

/** Tudo que o portal precisa para abrir. Uma consulta, não quatro. */
export async function carregarPortal(identificador?: string): Promise<DadosDoPortal | null> {
  if (portalRemoto()) return carregarPortalRemoto(identificador)

  const studio = await studioRepo.ler()
  if (!studio) return null

  // O identificador na URL é conferido, mas não é segredo: ele existe
  // para o link ficar bonito e memorável, não para proteger nada.
  if (identificador && studio.identificador !== identificador) return null

  const [servicos, profissionais] = await Promise.all([
    servicosRepo.publicos(),
    profissionaisRepo.atendentes(),
  ])

  return { studio, servicos, profissionais }
}

/** A grade de um dia, já considerando reservas em andamento. */
export async function horariosDoDia(
  data: string, servicoId: string, profissionalId: string | null,
  contexto?: DadosDoPortal | null,
): Promise<OpcaoDeHorario[]> {
  const quando = new Date(`${data}T12:00:00`)

  if (portalRemoto()) {
    // O contexto já veio na abertura da tela; refazer aquelas três
    // consultas a cada troca de dia seria pagar rede à toa.
    const dados = contexto ?? (await carregarPortalRemoto())
    const servico = dados?.servicos.find((s) => s.id === servicoId)
    if (!dados || !servico) return []

    return gradeRemota(
      quando, servico, dados.profissionais, profissionalId,
      dados.studio, idDoVisitante(),
    )
  }

  return agendamentosRepo.gradeDoDia(quando, servicoId, profissionalId, idDoVisitante())
}

/* ------------------------------------------------------------------ */
/* Confirmação                                                         */
/* ------------------------------------------------------------------ */

export interface DadosDaConfirmacao {
  reserva: ReservaTemporaria
  nome: string
  telefone: string
  observacao?: string | null
  /** Campo invisível. Preenchido só por robô. */
  armadilha?: string
}

export interface AgendamentoConfirmado {
  agendamento: Agendamento
  /** Nasceu aguardando o aval da proprietária? */
  aguardandoConfirmacao: boolean
}

/**
 * Transforma a reserva em agendamento de verdade.
 *
 * A validação de conflito acontece de novo aqui, dentro de `agendar`.
 * Parece redundante com a reserva e não é: a reserva impede o encontro
 * comum, e esta checagem impede o encontro raro — duas confirmações no
 * mesmo instante, ou a proprietária marcando pelo painel enquanto a
 * cliente preenchia.
 */
export async function confirmar(dados: DadosDaConfirmacao): Promise<AgendamentoConfirmado> {
  const nome = limparNome(dados.nome)
  const telefone = digitos(dados.telefone)

  if (nome.length < 2) throw new ErroDeRegra('Informe seu nome completo.')
  if (telefone.length < 10) throw new ErroDeRegra('Informe um telefone com DDD.')

  const visitanteId = idDoVisitante()

  /*
    Com banco, a confirmação inteira acontece dentro de uma função do
    Postgres — e não por comodidade. Reserva, ficha da cliente e
    agendamento precisam entrar ou não entrar juntos; feitos em três
    requisições daqui, uma queda de rede no meio deixaria a cliente
    cadastrada sem horário, ou o horário sem dono.

    Lá também mora a última defesa contra o encontro raro: a restrição
    de exclusão da tabela recusa a segunda de duas confirmações
    simultâneas. É a única checagem que nenhum código de aplicação
    consegue fazer sozinho.
  */
  if (portalRemoto()) {
    const agendamento = await agendarRemoto({
      reservaId: dados.reserva.id, visitanteId,
      nome, telefone, observacao: dados.observacao?.trim() ?? '',
    })

    renovarVisitante()
    return { agendamento, aguardandoConfirmacao: agendamento.situacao === 'pendente' }
  }

  const studio = await studioRepo.ler()
  if (!studio?.agendamentoAtivo) {
    throw new ErroDeRegra('O agendamento online está pausado no momento.')
  }

  // Cliente já conhecida entra pela ficha dela: é o que faz o histórico
  // não se partir em duas metades quando a mesma pessoa marca ora pelo
  // portal, ora pelo WhatsApp.
  const existente = await clientesRepo.porTelefone(telefone)

  const agendamento = await agendamentosRepo.agendar({
    clienteId: existente?.id ?? null,
    servicoId: dados.reserva.servicoId,
    profissionalId: dados.reserva.profissionalId,
    inicio: dados.reserva.inicio,
    origem: 'link',
    observacao: dados.observacao?.trim() || null,
    nomeAvulso: existente ? null : nome,
    telefoneAvulso: existente ? null : telefone,
    situacao: studio.confirmacaoManual ? 'pendente' : 'confirmado',
    visitanteId,
  })

  await concluirReserva(dados.reserva.id, agendamento.id)

  // Confirmação e lembretes entram na fila sozinhos. Falhar aqui não
  // pode desfazer o agendamento — que é o que realmente importa.
  try {
    await programarParaAgendamento(agendamento.id)
  } catch {
    // Segue sem lembretes.
  }

  // Identidade nova: a próxima marcação desta cliente começa limpa e
  // não herda a reserva já consumida.
  renovarVisitante()

  return { agendamento, aguardandoConfirmacao: studio.confirmacaoManual }
}

/** Desiste antes de confirmar: o horário volta na hora para a grade. */
export async function desistir(): Promise<void> {
  await liberarDaVisitante()
}

/* ------------------------------------------------------------------ */
/* Consulta pela cliente                                               */
/* ------------------------------------------------------------------ */

/**
 * Busca o horário pelo protocolo e telefone.
 *
 * Os dois juntos, nunca só um: protocolo sozinho é adivinhável em
 * poucas tentativas de sorte, e telefone sozinho abriria a agenda de
 * qualquer pessoa para quem souber o número dela.
 */
export async function consultarHorario(
  protocolo: string, telefone: string,
): Promise<AgendamentoDetalhado | null> {
  if (portalRemoto()) return consultarRemoto(protocolo, telefone)

  const encontrado = await agendamentosRepo.porProtocolo(protocolo, telefone)
  if (!encontrado) return null

  const [detalhado] = await agendamentosRepo.detalhar([encontrado])
  return detalhado ?? null
}

/**
 * "Cheguei".
 *
 * Só vale no dia e perto da hora. Fora dessa janela o botão não existe:
 * um check-in feito na véspera avisaria a proprietária de alguém que
 * não está na sala, e um aviso que mente uma vez deixa de ser lido.
 */
export async function registrarChegada(dados: {
  agendamentoId: string
  protocolo: string
  telefone: string
}): Promise<string> {
  /*
    Com banco, o caminho é a RPC — e não por preferência.

    A visitante do portal não está autenticada. `agendamentosRepo` lê a
    tabela `agendamentos`, que `anon` não enxerga: a linha abaixo
    levantaria erro de permissão em produção.

    `portal_cheguei` faz a mesma coisa do lado seguro: confere
    protocolo E telefone, valida a janela de horário e grava. A tela
    manda os dois porque o `agendamentoId` vem do navegador e poderia
    ser trocado no console — o servidor não confia nele.
  */
  if (portalRemoto()) {
    // O instante vem do banco, não do relógio deste aparelho.
    const confirmado = await chegueiRemoto(dados.protocolo, dados.telefone)
    return confirmado ?? new Date().toISOString()
  }

  const agendamento = await agendamentosRepo.buscar(dados.agendamentoId)
  if (!agendamento) throw new ErroDeRegra('Agendamento não encontrado.')

  if (!podeFazerCheckin(agendamento)) {
    throw new ErroDeRegra('O check-in abre uma hora antes do seu horário.')
  }

  const atualizado = await agendamentosRepo.registrarChegada(dados.agendamentoId)
  return atualizado.chegouEm ?? new Date().toISOString()
}

/** Uma hora antes até o fim do atendimento. */
export function podeFazerCheckin(agendamento: {
  inicio: string
  fim: string
  situacao: string
  chegouEm: string | null
}): boolean {
  if (agendamento.chegouEm) return false
  if (!['pendente', 'confirmado'].includes(agendamento.situacao)) return false

  const agora = Date.now()
  const abre = new Date(agendamento.inicio).getTime() - 3_600_000

  return agora >= abre && agora <= new Date(agendamento.fim).getTime()
}

/** Nome que aparece para a cliente, venha da ficha ou do avulso. */
export function nomeDaCliente(agendamento: AgendamentoDetalhado): string {
  return agendamento.cliente?.nome ?? agendamento.nomeAvulso ?? 'Cliente'
}
