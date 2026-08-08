/**
 * Impressão digital do conteúdo.
 *
 * Serve para detectar alteração ou corrupção entre exportar e restaurar —
 * não é assinatura criptográfica: quem editar o arquivo pode recalcular o
 * hash. A garantia é contra acidente, não contra má-fé.
 */

/** SHA-256 quando disponível. Exige contexto seguro (https ou localhost). */
async function sha256(texto: string): Promise<string | null> {
  const cripto = globalThis.crypto
  if (!cripto?.subtle) return null

  try {
    const dados = new TextEncoder().encode(texto)
    const resumo = await cripto.subtle.digest('SHA-256', dados)

    return Array.from(new Uint8Array(resumo))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/**
 * FNV-1a de 64 bits, em duas metades de 32.
 *
 * Caminho alternativo para quando o SHA-256 não existe (site aberto por
 * http simples, por exemplo). Detecta corrupção igualmente bem.
 */
function fnv1a(texto: string): string {
  let alto = 0x811c9dc5
  let baixo = 0x811c9dc5

  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i)

    alto ^= codigo
    alto = Math.imul(alto, 0x01000193) >>> 0

    baixo ^= codigo + i
    baixo = Math.imul(baixo, 0x01000193) >>> 0
  }

  return `${alto.toString(16).padStart(8, '0')}${baixo.toString(16).padStart(8, '0')}`
}

export async function calcularHash(conteudo: unknown): Promise<string> {
  const texto = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo)
  const forte = await sha256(texto)
  return forte ?? `fnv:${fnv1a(texto)}`
}

/**
 * Checksum leve, calculado só sobre a contagem de registros.
 *
 * Confere rápido se o arquivo tem o volume que diz ter, sem precisar
 * percorrer o conteúdo inteiro.
 */
export function calcularChecksum(contagens: { registros: number }[]): string {
  const total = contagens.reduce((soma, c) => soma + c.registros, 0)
  return `${total.toString(36)}-${contagens.length.toString(36)}`
}

export const hashConfere = (esperado: string, calculado: string) => esperado === calculado
