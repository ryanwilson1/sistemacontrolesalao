import { solicitacoesRepo } from '../repositorios/portal'
import { agendamentosRepo } from '../repositorios/agenda'
import { lembretesRepo } from '../repositorios/comunicacao'
import { portalRemoto, solicitarRemoto } from './remoto'
import { AGUARDA_DECISAO } from '@/constants'
import { ErroDeRegra } from '@/utils/erros'
import type {
  Agendamento, SituacaoAgendamento, SolicitacaoDaCliente, SolicitacaoDetalhada, TipoSolicitacao,
} from '@/types'

/**
 * Pedidos de alteração e cancelamento.
 *
 * A cliente nunca move nem apaga um horário. Ela pede, e quem decide é
 * a proprietária.
 *
 * Parece burocracia e não é: a agenda de um studio não é uma lista de
 * compromissos independentes. Um horário que abre às 15h pode ser o que
 * permitiu recusar outra cliente às 14h; uma progressiva desmarcada na
 * véspera é a tarde inteira perdida. Quem tem esse quadro na cabeça é
 * quem toca o studio — então é ela quem decide, sempre.
 *
 * O pedido também não some depois de resolvido. "Eu avisei que ia
 * desmarcar" vira palavra contra palavra sem registro.
 */

const SITUACAO_DO_PEDIDO: Record<TipoSolicitacao, SituacaoAgendamento> = {
  alteracao: 'solicitou_alteracao',
  cancelamento: 'solicitou_cancelamento',
}

export interface NovoPedido {
  agendamentoId: string
  tipo: TipoSolicitacao
  mensagem?: string | null
  /** Horário que a cliente preferiria, quando pede alteração. */
  preferenciaInicio?: string | null
  /**
   * Protocolo e telefone, quando o pedido vem do portal.
   *
   * Com banco, o pedido é aberto por eles e não pelo id: o id vem da
   * própria tela e poderia ser trocado no console, o que deixaria
   * qualquer pessoa cancelar o horário alheio. Protocolo e telefone,
   * conferidos no servidor, provam que é quem marcou.
   */
  protocolo?: string
  telefone?: string
}

/**
 * Abre um pedido e marca o agendamento como aguardando decisão.
 *
 * O horário continua ocupado. Liberar agora seria entregá-lo a outra
 * cliente enquanto a proprietária ainda nem viu o pedido.
 */
export async function abrirSolicitacao(pedido: NovoPedido): Promise<SolicitacaoDaCliente> {
  if (portalRemoto() && pedido.protocolo && pedido.telefone) {
    await solicitarRemoto(
      pedido.protocolo, pedido.telefone, pedido.tipo, pedido.mensagem ?? '',
    )
    // O registro gravado fica no banco; a tela só precisa saber que o
    // pedido saiu, e é o que ela faz com o retorno.
    return {
      id: '', criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
      agendamentoId: pedido.agendamentoId, tipo: pedido.tipo, situacao: 'aberta',
      mensagem: pedido.mensagem ?? null, preferenciaInicio: null,
      respondidaEm: null, respondidaPor: null, resposta: null,
    }
  }

  const agendamento = await agendamentosRepo.buscar(pedido.agendamentoId)
  if (!agendamento) throw new ErroDeRegra('Agendamento não encontrado.')

  if (['cancelado', 'concluido', 'faltou'].includes(agendamento.situacao)) {
    throw new ErroDeRegra('Este horário já foi encerrado. Fale com o studio pelo WhatsApp.')
  }

  const jaPediu = await solicitacoesRepo.abertaDoAgendamento(pedido.agendamentoId)
  if (jaPediu) {
    throw new ErroDeRegra('Já existe um pedido em análise para este horário. Aguarde o retorno.')
  }

  // Guardar a situação de antes é o que permite recusar sem estragar
  // nada: o agendamento volta exatamente onde estava.
  await agendamentosRepo.atualizar(agendamento.id, {
    situacao: SITUACAO_DO_PEDIDO[pedido.tipo],
    situacaoAnterior: agendamento.situacao,
  })

  return solicitacoesRepo.criar({
    agendamentoId: pedido.agendamentoId,
    tipo: pedido.tipo,
    situacao: 'aberta',
    mensagem: pedido.mensagem?.trim() || null,
    preferenciaInicio: pedido.preferenciaInicio ?? null,
    respondidaEm: null,
    respondidaPor: null,
    resposta: null,
  })
}

/**
 * Recusa o pedido e devolve o agendamento ao estado anterior.
 *
 * Nada se perde: o pedido fica registrado como recusado, com a resposta.
 */
export async function recusarSolicitacao(
  solicitacaoId: string, resposta: string | null, quem: string | null = null,
): Promise<void> {
  const solicitacao = await solicitacoesRepo.buscar(solicitacaoId)
  if (!solicitacao) throw new ErroDeRegra('Pedido não encontrado.')
  if (solicitacao.situacao !== 'aberta') throw new ErroDeRegra('Este pedido já foi respondido.')

  const agendamento = await agendamentosRepo.buscar(solicitacao.agendamentoId)

  if (agendamento && AGUARDA_DECISAO.includes(agendamento.situacao)) {
    await agendamentosRepo.atualizar(agendamento.id, {
      situacao: agendamento.situacaoAnterior ?? 'confirmado',
      situacaoAnterior: null,
    })
  }

  await responder(solicitacaoId, 'recusada', resposta, quem)
}

/**
 * Aceita o cancelamento pedido pela cliente.
 *
 * Devolve o horário para a agenda e cancela os lembretes que ainda não
 * saíram — mandar "seu horário é amanhã" para quem desmarcou seria pior
 * do que não mandar nada.
 */
export async function aprovarCancelamento(
  solicitacaoId: string, resposta: string | null, quem: string | null = null,
): Promise<Agendamento | null> {
  const solicitacao = await exigirAberta(solicitacaoId)

  const agendamento = await agendamentosRepo.mudarSituacao(solicitacao.agendamentoId, 'cancelado')
  await agendamentosRepo.atualizar(solicitacao.agendamentoId, { situacaoAnterior: null })

  try {
    await lembretesRepo.cancelarDoAgendamento(solicitacao.agendamentoId)
  } catch {
    // Um lembrete órfão não pode impedir o cancelamento de valer.
  }

  await responder(solicitacaoId, 'aprovada', resposta, quem)
  return agendamento
}

/**
 * Aceita a alteração e move o horário.
 *
 * Passa pelo mesmo `remarcar` da agenda interna — com as mesmas regras
 * de conflito, bloqueio e capacidade. Um caminho paralelo aqui seria a
 * porta de entrada para o agendamento sobreposto que o sistema inteiro
 * existe para evitar.
 */
export async function aprovarAlteracao(
  solicitacaoId: string,
  mudancas: { inicio: string; profissionalId?: string; servicoId?: string },
  resposta: string | null = null,
  quem: string | null = null,
): Promise<Agendamento> {
  const solicitacao = await exigirAberta(solicitacaoId)

  const agendamento = await agendamentosRepo.remarcar(
    solicitacao.agendamentoId,
    mudancas,
    'Alteração pedida pela cliente',
  )

  await agendamentosRepo.atualizar(solicitacao.agendamentoId, {
    situacao: agendamento.situacaoAnterior ?? 'confirmado',
    situacaoAnterior: null,
  })

  await responder(solicitacaoId, 'aprovada', resposta, quem)
  return agendamento
}

/** Junta cada pedido ao agendamento que ele quer mudar. */
export async function detalhar(
  solicitacoes: SolicitacaoDaCliente[],
): Promise<SolicitacaoDetalhada[]> {
  if (solicitacoes.length === 0) return []

  const agendamentos = await Promise.all(
    solicitacoes.map((s) => agendamentosRepo.buscar(s.agendamentoId)),
  )
  const encontrados = agendamentos.filter((a): a is Agendamento => a !== null)
  const detalhados = await agendamentosRepo.detalhar(encontrados)
  const porId = new Map(detalhados.map((a) => [a.id, a]))

  return solicitacoes.map((s) => ({ ...s, agendamento: porId.get(s.agendamentoId) ?? null }))
}

export async function abertasDetalhadas(): Promise<SolicitacaoDetalhada[]> {
  return detalhar(await solicitacoesRepo.abertas())
}

export async function historicoDetalhado(limite = 40): Promise<SolicitacaoDetalhada[]> {
  return detalhar(await solicitacoesRepo.historico(limite))
}

/* ------------------------------------------------------------------ */

async function exigirAberta(id: string): Promise<SolicitacaoDaCliente> {
  const solicitacao = await solicitacoesRepo.buscar(id)
  if (!solicitacao) throw new ErroDeRegra('Pedido não encontrado.')
  if (solicitacao.situacao !== 'aberta') throw new ErroDeRegra('Este pedido já foi respondido.')
  return solicitacao
}

async function responder(
  id: string,
  situacao: 'aprovada' | 'recusada',
  resposta: string | null,
  quem: string | null,
): Promise<void> {
  await solicitacoesRepo.atualizar(id, {
    situacao,
    resposta: resposta?.trim() || null,
    respondidaEm: new Date().toISOString(),
    respondidaPor: quem,
  })
}
