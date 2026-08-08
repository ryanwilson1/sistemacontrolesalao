import {
  cancelarLembrete, confirmarEnvio, lembretesRepo, modelosRepo, notificacoesRepo,
  processarFila, programarAvulso, programarParaAgendamento, sincronizar,
  canal, canalSimulado,
} from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type { Lembrete, ModeloMensagem, Notificacao, SituacaoLembrete, TipoLembrete } from '@/types'

/* ---------------- Lembretes ---------------- */

export function useFilaDeLembretes() {
  return useConsulta<Lembrete[]>(`${CHAVES.lembretes}:fila`, () =>
    lembretesRepo.porSituacao('agendado'),
  )
}

export function useLembretesPorSituacao(situacao: SituacaoLembrete) {
  return useConsulta<Lembrete[]>(`${CHAVES.lembretes}:${situacao}`, () =>
    lembretesRepo.porSituacao(situacao),
  )
}

export function useHistoricoDeLembretes() {
  return useConsulta<Lembrete[]>(`${CHAVES.lembretes}:historico`, () => lembretesRepo.historico())
}

export function useVencidos() {
  return useConsulta<Lembrete[]>(`${CHAVES.lembretes}:vencidos`, () => lembretesRepo.vencidos())
}

export function useProcessarFila() {
  return useAcao(
    ({ simulado }: { simulado?: boolean } = {}) =>
      processarFila(simulado ? canalSimulado : canal),
    [CHAVES.lembretes],
  )
}

export function useConfirmarEnvio() {
  return useAcao((id: string) => confirmarEnvio(id), [CHAVES.lembretes])
}

export function useCancelarLembrete() {
  return useAcao((id: string) => cancelarLembrete(id), [CHAVES.lembretes])
}

export function useProgramarLembretes() {
  return useAcao(
    ({ agendamentoId, tipos }: { agendamentoId: string; tipos?: TipoLembrete[] }) =>
      programarParaAgendamento(agendamentoId, tipos),
    [CHAVES.lembretes],
  )
}

export function useProgramarAvulso() {
  return useAcao(
    (dados: { tipo: TipoLembrete; clienteId: string; telefone: string; nome: string }) =>
      programarAvulso(dados),
    [CHAVES.lembretes],
  )
}

/* ---------------- Modelos ---------------- */

export function useModelos() {
  return useConsulta<ModeloMensagem[]>(`${CHAVES.modelos}:lista`, () => modelosRepo.listar())
}

export function useSalvarModelo() {
  return useAcao(
    ({ id, dados }: { id: string; dados: Partial<ModeloMensagem> }) =>
      modelosRepo.atualizar(id, dados),
    [CHAVES.modelos, CHAVES.lembretes],
  )
}

/* ---------------- Notificações ---------------- */

export function useNotificacoes() {
  return useConsulta<Notificacao[]>(`${CHAVES.notificacoes}:lista`, () =>
    notificacoesRepo.recentes(),
  )
}

export function useNaoLidas() {
  return useConsulta<number>(`${CHAVES.notificacoes}:naoLidas`, () => notificacoesRepo.naoLidas())
}

export function useSincronizarNotificacoes() {
  return useAcao(() => sincronizar(), [CHAVES.notificacoes])
}

export function useMarcarLida() {
  return useAcao((id: string) => notificacoesRepo.marcarLida(id), [CHAVES.notificacoes])
}

export function useMarcarTodasLidas() {
  return useAcao(() => notificacoesRepo.marcarTodasLidas(), [CHAVES.notificacoes])
}
