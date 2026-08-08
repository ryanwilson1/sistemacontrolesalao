/**
 * Higiene de entrada.
 *
 * O React já escapa tudo que renderiza, e o projeto nunca usa
 * dangerouslySetInnerHTML. O papel destas funções é outro: impedir que
 * lixo entre no armazenamento e normalizar o que a usuária digitou.
 */
const PERIGOSOS = /[<>{}\\]|javascript:|data:text\/html|on\w+\s*=/gi

export const limparTexto = (v: string | null | undefined, max = 2000): string =>
  (v ?? '').replace(PERIGOSOS, '').trim().slice(0, max)

export const limparNome = (v: string) =>
  limparTexto(v, 120).replace(/\s{2,}/g, ' ')

/** Aceita apenas @usuario do Instagram. */
export const limparInstagram = (v: string) =>
  v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[^A-Za-z0-9._@]/g, '').slice(0, 31)

/** Permite abrir apenas http(s). Bloqueia javascript: e afins. */
export function urlSegura(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const u = new URL(v)
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null
  } catch {
    return null
  }
}

/** Converte um nome em endereço de link: "Studio Emely" -> "studio-emely". */
export const limparIdentificador = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
