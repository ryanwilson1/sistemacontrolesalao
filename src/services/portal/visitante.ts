import { novoId } from '@/utils/id'

/**
 * Identidade do navegador da cliente.
 *
 * Não é conta, não é login, não identifica pessoa nenhuma: é um número
 * sorteado para o sistema conseguir responder duas perguntas práticas —
 * "esta reserva é da mesma pessoa que está na tela?" e "quais horários
 * ela já pegou?".
 *
 * Fica em `sessionStorage`, não em `localStorage`, e a diferença é
 * deliberada: a reserva dura minutos, então o rastro deve durar a aba.
 * Fechou o navegador, o horário volta para a agenda e a identidade
 * antiga não serve mais para nada.
 */

const CHAVE = 'studio:visitante'

let emMemoria: string | null = null

export function idDoVisitante(): string {
  if (emMemoria) return emMemoria

  if (typeof window === 'undefined') {
    emMemoria = novoId()
    return emMemoria
  }

  try {
    const guardado = window.sessionStorage.getItem(CHAVE)
    if (guardado) {
      emMemoria = guardado
      return guardado
    }

    const novo = novoId()
    window.sessionStorage.setItem(CHAVE, novo)
    emMemoria = novo
    return novo
  } catch {
    // Navegação anônima em alguns celulares recusa sessionStorage.
    // Guardar só em memória basta: dura o que a aba durar, que é
    // exatamente o tempo de vida esperado.
    emMemoria ??= novoId()
    return emMemoria
  }
}

/** Esquece a identidade atual. Usado depois de confirmar um agendamento. */
export function renovarVisitante(): string {
  emMemoria = null
  try {
    window.sessionStorage.removeItem(CHAVE)
  } catch {
    // Sem sessionStorage já estava só em memória.
  }
  return idDoVisitante()
}
