import { useCallback, useEffect, useRef, useState } from 'react'
import {
  abertasDetalhadas, abrirSolicitacao, agendamentosRepo, aprovarAlteracao,
  aprovarCancelamento, avisadasDetalhadas, avisarInteressadas, avisarDecisao,
  carregarPortal, confirmarAgendamentoPublico, consultarHorario, entrarNaFila,
  filaDetalhada, historicoDetalhado, horariosDoDia, interessadasEm, liberarDaVisitante,
  listaEsperaRepo, marcarAtendida, recusarSolicitacao, reservar, sairDaFila,
  registrarChegada, solicitacoesRepo, varrerReservas, notificacoesRepo
} from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { AFETADOS_POR_AGENDAMENTO, CHAVES } from './cache'
import type {
  AgendamentoDetalhado, DadosDoPortal, EntradaListaEspera, EsperaDetalhada,
  OpcaoDeHorario, SolicitacaoDetalhada,
} from '@/types'

/* ------------------------------------------------------------------ */
/* Portal da cliente                                                   */
/* ------------------------------------------------------------------ */

export function usePortal(identificador?: string) {
  return useConsulta<DadosDoPortal | null>(`portal:${identificador ?? 'atual'}`, () =>
    carregarPortal(identificador),
  )
}

/**
 * A grade de um dia.
 *
 * A chave inclui a data, o serviço e a profissional porque trocar
 * qualquer um dos três muda a resposta inteira — e porque é ela que o
 * tempo real invalida quando alguém marca do outro lado.
 */
export function useGradeDoDia(data: string, servicoId: string, profissionalId: string | null) {
  const ativa = !!data && !!servicoId

  return useConsulta<OpcaoDeHorario[]>(
    `${CHAVES.horarios}:grade:${data}:${servicoId}:${profissionalId ?? 'qualquer'}`,
    () => horariosDoDia(data, servicoId, profissionalId),
    { ativa },
  )
}

export function useReservar() {
  return useAcao(
    (dados: { servicoId: string; profissionalId: string; inicio: string }) => reservar(dados),
    [CHAVES.reservas, CHAVES.horarios],
  )
}

export function useLiberarReserva() {
  return useAcao(() => liberarDaVisitante(), [CHAVES.reservas, CHAVES.horarios])
}

export function useConfirmarPeloPortal() {
  return useAcao(
    (dados: Parameters<typeof confirmarAgendamentoPublico>[0]) =>
      confirmarAgendamentoPublico(dados),
    [...AFETADOS_POR_AGENDAMENTO, CHAVES.reservas],
  )
}

export function useVarrerReservas() {
  return useAcao(() => varrerReservas(), [CHAVES.reservas, CHAVES.horarios])
}

/** Consulta do horário pela cliente: protocolo mais telefone. */
export function useConsultarHorario() {
  return useAcao(
    ({ protocolo, telefone }: { protocolo: string; telefone: string }) =>
      consultarHorario(protocolo, telefone),
  )
}

/** A cliente avisa que chegou. */
export function useRegistrarChegada() {
  return useAcao(
    (dados: Parameters<typeof registrarChegada>[0]) => registrarChegada(dados),
    [CHAVES.agenda, CHAVES.painel, CHAVES.notificacoes],
  )
}

export function useAbrirSolicitacao() {
  return useAcao(
    (pedido: Parameters<typeof abrirSolicitacao>[0]) => abrirSolicitacao(pedido),
    [CHAVES.solicitacoes, CHAVES.agenda, CHAVES.notificacoes],
  )
}

/* ------------------------------------------------------------------ */
/* Pedidos — lado da proprietária                                      */
/* ------------------------------------------------------------------ */

export function useSolicitacoesAbertas() {
  return useConsulta<SolicitacaoDetalhada[]>(`${CHAVES.solicitacoes}:abertas`, abertasDetalhadas)
}

export function useHistoricoDeSolicitacoes() {
  return useConsulta<SolicitacaoDetalhada[]>(`${CHAVES.solicitacoes}:historico`, () =>
    historicoDetalhado(),
  )
}

/**
 * Quantos pedidos esperam decisão. Alimenta o número do menu.
 *
 * `ativa` existe para a recepção e as profissionais não consultarem à
 * toa: elas não veem o Portal, então a conta não teria para onde ir.
 */
export function useQuantosPedidos(opcoes: { ativa?: boolean } = {}) {
  return useConsulta<number>(
    `${CHAVES.solicitacoes}:contador`,
    () => solicitacoesRepo.quantasAbertas(),
    opcoes,
  )
}

const AFETADOS_POR_DECISAO = [
  ...AFETADOS_POR_AGENDAMENTO, CHAVES.solicitacoes, CHAVES.espera,
]

export function useRecusarSolicitacao() {
  return useAcao(
    ({ id, resposta, quem }: { id: string; resposta: string | null; quem?: string | null }) =>
      recusarSolicitacao(id, resposta, quem ?? null),
    AFETADOS_POR_DECISAO,
  )
}

export function useAprovarCancelamento() {
  return useAcao(
    async ({ id, resposta, quem }: { id: string; resposta: string | null; quem?: string | null }) => {
      const agendamento = await aprovarCancelamento(id, resposta, quem ?? null)

      // Avisar é parte de aprovar. Sem isso a cliente pede para desmarcar
      // e continua sem saber se conseguiu.
      if (agendamento) {
        try {
          await avisarDecisao(agendamento.id, 'cancelamento_aprovado')
        } catch {
          // O cancelamento vale mesmo se o aviso falhar — mas a cliente
          // fica sem resposta, e quem precisa saber disso é quem
          // aprovou. Sem o registro, o pedido some da tela como se
          // tivesse sido respondido.
          await registrarFalhaDeAviso(agendamento.id, 'cancelamento')
        }
      }
      return agendamento
    },
    AFETADOS_POR_DECISAO,
  )
}

export function useAprovarAlteracao() {
  return useAcao(
    async ({
      id, mudancas, resposta, quem,
    }: {
      id: string
      mudancas: { inicio: string; profissionalId?: string; servicoId?: string }
      resposta?: string | null
      quem?: string | null
    }) => {
      const agendamento = await aprovarAlteracao(id, mudancas, resposta ?? null, quem ?? null)

      try {
        await avisarDecisao(agendamento.id, 'alteracao_aprovada')
      } catch {
        // Ver o comentário do cancelamento, logo acima: o aviso que não
        // sai precisa deixar rastro.
        await registrarFalhaDeAviso(agendamento.id, 'alteracao')
      }
      return agendamento
    },
    AFETADOS_POR_DECISAO,
  )
}

/** Horários possíveis para atender um pedido de alteração. */
export function useHorariosParaRemarcar(
  data: string, servicoId: string, profissionalId: string, agendamentoId: string,
) {
  const ativa = !!data && !!servicoId && !!profissionalId

  return useConsulta<Date[]>(
    `${CHAVES.horarios}:remarcar:${agendamentoId}:${data}:${profissionalId}`,
    () =>
      agendamentosRepo.horariosDisponiveis(
        new Date(`${data}T12:00:00`), servicoId, profissionalId, agendamentoId,
      ),
    { ativa },
  )
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

export function useListaDeEspera() {
  return useConsulta<EsperaDetalhada[]>(`${CHAVES.espera}:fila`, filaDetalhada)
}

export function useEsperaAvisadas() {
  return useConsulta<EsperaDetalhada[]>(`${CHAVES.espera}:avisadas`, avisadasDetalhadas)
}

export function useQuantosEsperando(opcoes: { ativa?: boolean } = {}) {
  return useConsulta<number>(
    `${CHAVES.espera}:contador`,
    () => listaEsperaRepo.quantasAguardando(),
    opcoes,
  )
}

export function useEntrarNaFila() {
  return useAcao(
    (dados: Parameters<typeof entrarNaFila>[0]) => entrarNaFila(dados),
    [CHAVES.espera, CHAVES.notificacoes],
  )
}

/**
 * Quem espera pelo horário que acabou de vagar.
 *
 * Consultado logo antes de cancelar: é o que permite perguntar "existem
 * clientes aguardando este horário, deseja avisar?" em vez de deixar a
 * vaga evaporar em silêncio.
 */
export function useInteressadasNaVaga(agendamentoId: string | null) {
  return useConsulta<EntradaListaEspera[]>(
    `${CHAVES.espera}:vaga:${agendamentoId ?? 'nenhuma'}`,
    () => (agendamentoId ? interessadasEm(agendamentoId) : Promise.resolve([])),
    { ativa: !!agendamentoId },
  )
}

export function useAvisarInteressadas() {
  return useAcao(
    ({ vaga, entradas }: { vaga: Parameters<typeof avisarInteressadas>[0]; entradas?: EntradaListaEspera[] }) =>
      avisarInteressadas(vaga, entradas),
    [CHAVES.espera, CHAVES.lembretes, CHAVES.notificacoes],
  )
}

export function useMarcarAtendida() {
  return useAcao((id: string) => marcarAtendida(id), [CHAVES.espera])
}

export function useSairDaFila() {
  return useAcao((id: string) => sairDaFila(id), [CHAVES.espera, CHAVES.notificacoes])
}

/** Consulta de um horário para a tela pública, sem ação de escrita. */
export function useHorarioDaCliente(protocolo: string, telefone: string) {
  const ativa = protocolo.length >= 6 && telefone.length >= 10

  return useConsulta<AgendamentoDetalhado | null>(
    `portal:horario:${protocolo}`,
    () => consultarHorario(protocolo, telefone),
    { ativa },
  )
}

/* ---------------- Chegadas ao vivo ---------------- */

/**
 * Guarda os agendamentos anunciados na tela e os retira sozinho.
 *
 * O estado vive aqui, e não no componente, porque quem decide *quando*
 * um aviso sai é uma regra de tempo — não de desenho. O cartão só
 * precisa saber o que mostrar.
 */
export function useChegadasDoPortal(duracaoMs: number) {
  const [chegadas, setChegadas] = useState<AgendamentoDetalhado[]>([])
  const relogios = useRef(new Map<string, number>())

  const dispensar = useCallback((id: string) => {
    setChegadas((atuais) => atuais.filter((a) => a.id !== id))

    const relogio = relogios.current.get(id)
    if (relogio !== undefined) {
      window.clearTimeout(relogio)
      relogios.current.delete(id)
    }
  }, [])

  const anunciar = useCallback(
    (novos: AgendamentoDetalhado[]) => {
      setChegadas((atuais) => {
        const conhecidos = new Set(atuais.map((a) => a.id))
        const novidades = novos.filter((a) => !conhecidos.has(a.id))
        if (novidades.length === 0) return atuais

        // Três cartões empilhados já ocupam meia tela de celular.
        return [...atuais, ...novidades].slice(-3)
      })

      for (const agendamento of novos) {
        if (relogios.current.has(agendamento.id)) continue
        relogios.current.set(
          agendamento.id,
          window.setTimeout(() => dispensar(agendamento.id), duracaoMs),
        )
      }
    },
    [dispensar, duracaoMs],
  )

  useEffect(() => {
    const guardados = relogios.current
    return () => {
      for (const relogio of guardados.values()) window.clearTimeout(relogio)
      guardados.clear()
    }
  }, [])

  return { chegadas, anunciar, dispensar }
}

/**
 * Anota que a cliente não foi avisada de uma decisão.
 *
 * A decisão vale — o horário foi cancelado ou remarcado de verdade. O
 * que falhou foi o recado, e sem registro isso desaparece: o pedido
 * sai da lista como respondido e a cliente continua sem saber.
 *
 * A notificação aparece no sino, onde a proprietária já olha.
 */
async function registrarFalhaDeAviso(
  agendamentoId: string,
  tipo: 'cancelamento' | 'alteracao',
): Promise<void> {
  try {
    await notificacoesRepo.criar({
      tipo: 'alerta',
      titulo: 'A cliente não foi avisada',
      detalhe:
        tipo === 'cancelamento'
          ? 'O cancelamento foi aprovado, mas o aviso não saiu. Fale com ela pelo WhatsApp.'
          : 'A remarcação foi aprovada, mas o aviso não saiu. Fale com ela pelo WhatsApp.',
      lida: false,
      destino: `/agenda?agendamento=${agendamentoId}`,
    })
  } catch {
    // Nem a notificação entrou. Não há mais nada a fazer daqui sem
    // transformar um aviso perdido em erro que trava a aprovação.
  }
}
