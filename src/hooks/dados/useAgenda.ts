import {
  agendamentosRepo, bloqueiosRepo, concluirAtendimento,
  lembretesRepo, programarParaAgendamento,
} from '@/services'
import { isoData } from '@/utils/datas'
import { useAcao, useConsulta } from './useConsulta'
import { AFETADOS_POR_AGENDAMENTO, CHAVES } from './cache'
import type { Agendamento, AgendamentoDetalhado, Bloqueio, SituacaoAgendamento } from '@/types'

export function useAgendamentos(de: string, ate: string) {
  return useConsulta<AgendamentoDetalhado[]>(`${CHAVES.agenda}:${de}:${ate}`, () =>
    agendamentosRepo.detalhadosNoPeriodo(de, ate),
  )
}

export function useBloqueios(de: string, ate: string) {
  return useConsulta<Bloqueio[]>(`${CHAVES.bloqueios}:${de}:${ate}`, () =>
    bloqueiosRepo.noPeriodo(de, ate),
  )
}

/** Horários realmente livres, calculados pelo motor da agenda. */
export function useHorariosLivres(data: string, servicoId: string, profissionalId: string) {
  const ativa = !!data && !!servicoId && !!profissionalId

  return useConsulta<Date[]>(
    `${CHAVES.horarios}:${data}:${servicoId}:${profissionalId}`,
    () => agendamentosRepo.horariosDisponiveis(new Date(`${data}T12:00:00`), servicoId, profissionalId),
    { ativa },
  )
}

type DadosAgendamento = Parameters<typeof agendamentosRepo.agendar>[0]

export function useAgendar() {
  return useAcao(async (dados: DadosAgendamento) => {
    const agendamento = await agendamentosRepo.agendar(dados)

    /*
      Falhar aqui não desfaz o agendamento — ele é o que importa. Mas
      também não pode sumir: sem lembrete programado, a cliente não é
      avisada na véspera e ninguém descobre até ela faltar.

      O aviso sobe junto com o agendamento. Quem chamou decide o que
      mostrar; o que não pode é o sistema saber e não contar.
    */
    let avisoDeLembrete: string | null = null
    try {
      await programarParaAgendamento(agendamento.id)
    } catch {
      avisoDeLembrete =
        'O agendamento foi salvo, mas não foi possível programar os lembretes. ' +
        'Confira em Lembretes.'
    }

    return Object.assign(agendamento, { avisoDeLembrete })
  }, AFETADOS_POR_AGENDAMENTO)
}

export function useRemarcar() {
  return useAcao(
    ({ id, mudancas }: { id: string; mudancas: Partial<Agendamento> }) =>
      agendamentosRepo.remarcar(id, mudancas),
    AFETADOS_POR_AGENDAMENTO,
  )
}

export function useMudarSituacao() {
  return useAcao(async ({ id, situacao }: { id: string; situacao: SituacaoAgendamento }) => {
    // Concluir dispara receita, pontos, procedimento e caixa.
    const resultado = situacao === 'concluido'
      ? await concluirAtendimento(id)
      : await agendamentosRepo.mudarSituacao(id, situacao)

    // Cancelar ou concluir torna os lembretes futuros inúteis.
    if (['cancelado', 'concluido', 'faltou'].includes(situacao)) {
      try {
        await lembretesRepo.cancelarDoAgendamento(id)
      } catch {
        // Não impede a mudança de situação.
      }
    }

    return resultado
  }, AFETADOS_POR_AGENDAMENTO)
}

export function useSalvarBloqueio() {
  return useAcao(
    (dados: Omit<Bloqueio, 'id' | 'criadoEm' | 'atualizadoEm'>) => bloqueiosRepo.criar(dados),
    [CHAVES.bloqueios, CHAVES.horarios, CHAVES.agenda],
  )
}

export function useRemoverBloqueio() {
  return useAcao(
    (id: string) => bloqueiosRepo.remover(id),
    [CHAVES.bloqueios, CHAVES.horarios, CHAVES.agenda],
  )
}

/** Chave do dia, usada para invalidar consultas pontuais. */
export const chaveDoDia = (data: Date) => isoData(data)

/**
 * Exclusão definitiva de um agendamento.
 *
 * Separado de `useMudarSituacao('cancelado')` de propósito: as duas
 * ações parecem próximas na tela e são opostas no efeito. Cancelar
 * guarda o registro; excluir apaga o engano. Uma função só, com um
 * parâmetro decidindo qual, acabaria chamada errada.
 *
 * Invalida a mesma lista de um agendamento qualquer — sumir da agenda
 * precisa refletir no painel, no histórico da cliente e nos horários
 * livres na mesma volta.
 */
export function useExcluirAgendamento() {
  return useAcao((id: string) => agendamentosRepo.excluir(id), AFETADOS_POR_AGENDAMENTO)
}
