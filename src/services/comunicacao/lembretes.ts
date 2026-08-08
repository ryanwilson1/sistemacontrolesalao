import { agendamentosRepo } from '../repositorios/agenda'
import { clientesRepo } from '../repositorios/clientes'
import { lembretesRepo } from '../repositorios/comunicacao'
import { profissionaisRepo, studioRepo } from '../repositorios/equipe'
import { servicosRepo } from '../repositorios/servicos'
import { modelosRepo, preencher, type ContextoMensagem } from './modelos'
import { canal, type CanalDeEnvio, type ResultadoEnvio } from './canal'
import { digitos } from '@/utils/formato'
import type { Agendamento, Lembrete, TipoLembrete } from '@/types'

/**
 * Programação e envio de lembretes.
 *
 * Nada sai sozinho: a fila é montada quando o agendamento é criado e
 * processada quando alguém abre o sistema. Sem servidor não existe
 * disparo automático — chamar de automático seria enganar.
 */

/** Antecedência de cada lembrete, em horas antes do atendimento. */
const ANTECEDENCIA: Partial<Record<TipoLembrete, number>> = {
  lembrete_24h: 24,
  lembrete_12h: 12,
  lembrete_3h: 3,
  lembrete_2h: 2,
  lembrete_30min: 0.5,
}

export const ROTULO_LEMBRETE: Record<TipoLembrete, string> = {
  confirmacao: 'Confirmação',
  lembrete_24h: 'Lembrete de 24 horas',
  lembrete_12h: 'Lembrete de 12 horas',
  lembrete_3h: 'Lembrete de 3 horas',
  lembrete_2h: 'Lembrete de 2 horas',
  lembrete_30min: 'Lembrete de 30 minutos',
  aniversario: 'Aniversário',
  retorno: 'Convite de retorno',
  pos_atendimento: 'Depois do atendimento',
  alteracao_aprovada: 'Alteração aprovada',
  cancelamento_aprovado: 'Cancelamento aprovado',
  vaga_disponivel: 'Vaga na lista de espera',
  checkin: 'Cliente chegou',
}

/**
 * O que é programado quando um agendamento nasce.
 *
 * Vinte e quatro horas antes para dar tempo de reorganizar o dia, duas
 * horas antes para lembrar de sair de casa. Os outros tipos existem e
 * ficam disponíveis, mas entram só quando alguém pede — três mensagens
 * para o mesmo horário viram spam, e cliente que silencia o studio no
 * WhatsApp não recebe nem o lembrete que importa.
 */
export const LEMBRETES_AUTOMATICOS: TipoLembrete[] = [
  'confirmacao', 'lembrete_24h', 'lembrete_2h', 'lembrete_30min',
]

/** Monta o contexto com tudo que os modelos podem precisar. */
async function montarContexto(agendamento: Agendamento): Promise<ContextoMensagem> {
  const [cliente, servico, profissional, studio] = await Promise.all([
    agendamento.clienteId ? clientesRepo.buscar(agendamento.clienteId) : Promise.resolve(null),
    servicosRepo.buscar(agendamento.servicoId),
    profissionaisRepo.buscar(agendamento.profissionalId),
    studioRepo.ler(),
  ])

  return {
    cliente: cliente?.nome ?? agendamento.nomeAvulso,
    clienteCompleto: cliente?.nome ?? agendamento.nomeAvulso,
    servico: servico?.nome,
    profissional: profissional?.nome,
    inicio: agendamento.inicio,
    valor: agendamento.preco - agendamento.desconto,
    studio: studio?.nome,
    endereco: studio?.endereco,
    telefone: studio?.telefone,
  }
}

/** Telefone de contato de um agendamento, venha da ficha ou do avulso. */
async function telefoneDoAgendamento(agendamento: Agendamento): Promise<{ numero: string; nome: string }> {
  if (agendamento.clienteId) {
    const cliente = await clientesRepo.buscar(agendamento.clienteId)
    return {
      numero: digitos(cliente?.whatsapp ?? cliente?.telefone ?? ''),
      nome: cliente?.nome ?? '',
    }
  }
  return {
    numero: digitos(agendamento.telefoneAvulso ?? ''),
    nome: agendamento.nomeAvulso ?? '',
  }
}

/**
 * Programa os lembretes de um agendamento.
 *
 * Lembrete cujo horário já passou não entra na fila — sairia atrasado e
 * a cliente receberia "seu horário é amanhã" depois do atendimento.
 */
export async function programarParaAgendamento(
  agendamentoId: string,
  tipos: TipoLembrete[] = LEMBRETES_AUTOMATICOS,
): Promise<number> {
  const agendamento = await agendamentosRepo.buscar(agendamentoId)
  if (!agendamento) return 0

  const contato = await telefoneDoAgendamento(agendamento)
  if (!contato.numero) return 0

  const contexto = await montarContexto(agendamento)
  const inicio = new Date(agendamento.inicio).getTime()
  const agora = Date.now()

  let programados = 0

  for (const tipo of tipos) {
    if (await lembretesRepo.jaExiste(agendamentoId, tipo)) continue

    const horas = ANTECEDENCIA[tipo]
    const quando = horas === undefined ? agora : inicio - horas * 3_600_000

    // Confirmação sai na hora; os demais só se ainda houver tempo.
    if (horas !== undefined && quando <= agora) continue

    const modelo = await modelosRepo.porChave(tipo)
    if (!modelo) continue

    await lembretesRepo.criar({
      tipo,
      canal: modelo.canal,
      situacao: 'agendado',
      agendamentoId,
      clienteId: agendamento.clienteId,
      destinatario: contato.numero,
      nomeDestinatario: contato.nome,
      agendadoPara: new Date(quando).toISOString(),
      enviadoEm: null,
      tentativas: 0,
      ultimoErro: null,
      mensagem: preencher(modelo.corpo, contexto),
    })

    programados += 1
  }

  return programados
}

/** Lembrete avulso, montado a partir de um modelo, para envio imediato. */
export async function programarAvulso(dados: {
  tipo: TipoLembrete
  clienteId: string
  telefone: string
  nome: string
  contexto?: ContextoMensagem
}): Promise<Lembrete | null> {
  const modelo = await modelosRepo.porChave(dados.tipo)
  if (!modelo) return null

  const studio = await studioRepo.ler()

  return lembretesRepo.criar({
    tipo: dados.tipo,
    canal: modelo.canal,
    situacao: 'agendado',
    agendamentoId: null,
    clienteId: dados.clienteId,
    destinatario: digitos(dados.telefone),
    nomeDestinatario: dados.nome,
    agendadoPara: new Date().toISOString(),
    enviadoEm: null,
    tentativas: 0,
    ultimoErro: null,
    mensagem: preencher(modelo.corpo, {
      cliente: dados.nome,
      studio: studio?.nome,
      endereco: studio?.endereco,
      telefone: studio?.telefone,
      ...dados.contexto,
    }),
  })
}

/**
 * Avisa a cliente de uma decisão da proprietária.
 *
 * Existe porque aprovar um pedido sem avisar é metade do trabalho: a
 * cliente pediu para remarcar e continua sem saber se conseguiu.
 * Reprograma os lembretes junto — o horário mudou, e mandar "seu
 * horário é amanhã às 14h" depois de mover para 16h seria pior do que
 * não mandar nada.
 */
export async function avisarDecisao(
  agendamentoId: string,
  tipo: Extract<TipoLembrete, 'alteracao_aprovada' | 'cancelamento_aprovado'>,
): Promise<Lembrete | null> {
  const agendamento = await agendamentosRepo.buscar(agendamentoId)
  if (!agendamento) return null

  const [contato, contexto, modelo] = await Promise.all([
    telefoneDoAgendamento(agendamento),
    montarContexto(agendamento),
    modelosRepo.porChave(tipo),
  ])

  if (!modelo || !contato.numero) return null

  // O horário mudou: o que estava na fila não vale mais.
  await lembretesRepo.cancelarDoAgendamento(agendamentoId)

  const aviso = await lembretesRepo.criar({
    tipo,
    canal: modelo.canal,
    situacao: 'agendado',
    agendamentoId,
    clienteId: agendamento.clienteId,
    destinatario: contato.numero,
    nomeDestinatario: contato.nome,
    agendadoPara: new Date().toISOString(),
    enviadoEm: null,
    tentativas: 0,
    ultimoErro: null,
    mensagem: preencher(modelo.corpo, { ...contexto, protocolo: agendamento.protocolo }),
  })

  // Alteração aprovada: o horário novo merece os lembretes de sempre.
  if (tipo === 'alteracao_aprovada') {
    await programarParaAgendamento(agendamentoId, ['lembrete_24h', 'lembrete_2h', 'lembrete_30min'])
  }

  return aviso
}

/* ------------------------------------------------------------------ */
/* Fila                                                                */
/* ------------------------------------------------------------------ */

const MAXIMO_TENTATIVAS = 3

export interface ResultadoFila {
  processados: number
  enviados: number
  aguardandoAcao: number
  falharam: number
  links: { lembrete: Lembrete; link: string }[]
}

/**
 * Processa o que já venceu na fila.
 *
 * Um lembrete que falha três vezes para de ser tentado — insistir só
 * enche o histórico de erro repetido.
 */
export async function processarFila(
  meio: CanalDeEnvio = canal,
): Promise<ResultadoFila> {
  const vencidos = await lembretesRepo.vencidos()

  const resultado: ResultadoFila = {
    processados: 0, enviados: 0, aguardandoAcao: 0, falharam: 0, links: [],
  }

  for (const lembrete of vencidos) {
    resultado.processados += 1

    let envio: ResultadoEnvio
    try {
      envio = await meio.enviar({
        destinatario: lembrete.destinatario,
        nomeDestinatario: lembrete.nomeDestinatario,
        corpo: lembrete.mensagem,
        canal: lembrete.canal,
      })
    } catch (falha) {
      envio = {
        enviado: false, precisaDeAcao: false, link: null,
        erro: falha instanceof Error ? falha.message : 'Falha no envio',
      }
    }

    const tentativas = lembrete.tentativas + 1

    if (envio.enviado) {
      await lembretesRepo.atualizar(lembrete.id, {
        situacao: 'enviado',
        enviadoEm: new Date().toISOString(),
        tentativas,
        ultimoErro: null,
      })
      resultado.enviados += 1
      continue
    }

    if (envio.precisaDeAcao && envio.link) {
      // Fica pendente: só sai quando alguém abrir o link.
      await lembretesRepo.atualizar(lembrete.id, { situacao: 'enviando', tentativas })
      resultado.aguardandoAcao += 1
      resultado.links.push({ lembrete, link: envio.link })
      continue
    }

    const desistir = tentativas >= MAXIMO_TENTATIVAS
    await lembretesRepo.atualizar(lembrete.id, {
      situacao: desistir ? 'falhou' : 'agendado',
      tentativas,
      ultimoErro: envio.erro,
    })
    resultado.falharam += 1
  }

  return resultado
}

/** Marca como enviado depois que a pessoa abriu o WhatsApp. */
export async function confirmarEnvio(lembreteId: string): Promise<void> {
  await lembretesRepo.atualizar(lembreteId, {
    situacao: 'enviado',
    enviadoEm: new Date().toISOString(),
    ultimoErro: null,
  })
}

export async function cancelarLembrete(lembreteId: string): Promise<void> {
  await lembretesRepo.atualizar(lembreteId, { situacao: 'cancelado' })
}
