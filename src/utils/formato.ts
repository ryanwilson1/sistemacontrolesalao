const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUMERO = new Intl.NumberFormat('pt-BR')

export const dinheiro = (v: number | null | undefined) => MOEDA.format(Number(v ?? 0))
export const numero = (v: number | null | undefined) => NUMERO.format(Number(v ?? 0))

export const porcento = (v: number, casas = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: casas }).format(v)

/** (11) 98765-4321 */
export function telefone(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return v ?? ''
}

export const digitos = (v: string) => v.replace(/\D/g, '')

/** Máscara progressiva enquanto digita. */
export function mascaraTelefone(v: string): string {
  const d = digitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

export const duracao = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Link de WhatsApp com texto pronto. */
export const linkWhatsApp = (fone: string, texto?: string) => {
  const d = digitos(fone)
  const numeroInternacional = d.length <= 11 ? `55${d}` : d
  return `https://wa.me/${numeroInternacional}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

/**
 * CNPJ mascarado para leitura: 00.000.000/0000-00
 *
 * A máscara é da tela; o banco guarda só dígitos. Guardar formatado
 * pareceria mais simples e criaria o problema clássico: dois cadastros
 * do mesmo CNPJ, um com pontos e outro sem, que nenhuma busca junta.
 */
export function mascaraCnpj(v: string): string {
  const d = digitos(v).slice(0, 14)

  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
