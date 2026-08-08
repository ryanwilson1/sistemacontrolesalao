/**
 * Gera identificadores únicos sem depender de servidor.
 *
 * Usa crypto.randomUUID quando disponível (todos os navegadores atuais).
 * O caminho alternativo existe para contextos sem HTTPS, onde a API
 * de criptografia fica indisponível.
 */
export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Protocolo curto para a cliente guardar. Legível em voz alta. */
export function protocoloCurto(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1
  let saida = ''
  for (let i = 0; i < 6; i++) {
    saida += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return saida
}
