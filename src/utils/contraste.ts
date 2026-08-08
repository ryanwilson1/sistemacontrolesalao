/**
 * Contraste.
 *
 * Existe por causa de uma promessa do escopo que é fácil de quebrar sem
 * perceber: *"uma cor escolhida pela usuária nunca pode deixar texto
 * ilegível"*.
 *
 * O jeito ingênuo de cumprir isso é escrever texto branco sobre a cor da
 * marca e torcer. Funciona com bordô, quebra com amarelo — e quem
 * escolheu amarelo não vai concluir "a cor está ruim", vai concluir "o
 * sistema está quebrado".
 *
 * Aqui a cor do texto é **calculada**, nunca escolhida. A proprietária
 * decide a cor da marca; o sistema decide o que fica por cima.
 *
 * A conta é a da WCAG 2.1: luminância relativa e razão de contraste.
 * Não é a mais moderna que existe (APCA é melhor), mas é a que os
 * avaliadores de acessibilidade usam, e ser aprovado por eles é parte
 * do trabalho.
 */

const BRANCO = '#FFFFFF'
const GRAFITE = '#2A2224'

/** "#B08A3E" ou "#b8a" → [176, 138, 62]. Devolve nulo se não for cor. */
export function paraRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null

  const limpo = hex.trim().replace('#', '')
  const completo =
    limpo.length === 3 ? limpo.split('').map((c) => c + c).join('') : limpo

  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null

  const numero = Number.parseInt(completo, 16)
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255]
}

/** Formato exigido pelas variáveis CSS do Tailwind: "176 138 62". */
export function paraCanaisCss(hex: string | null | undefined, alternativa: string): string {
  const rgb = paraRgb(hex) ?? paraRgb(alternativa) ?? [176, 138, 62]
  return rgb.join(' ')
}

/**
 * Luminância relativa (WCAG).
 *
 * A correção de gama não é enfeite: o olho não enxerga o dobro de
 * brilho quando o valor do canal dobra. Sem ela, azul e amarelo dariam
 * resultados parecidos, e eles não se parecem em nada.
 */
function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const n = v / 255
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Razão de contraste entre duas cores. 1 = idênticas, 21 = preto/branco. */
export function razaoDeContraste(corA: string, corB: string): number {
  const a = paraRgb(corA)
  const b = paraRgb(corB)
  if (!a || !b) return 1

  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Que cor de texto usar sobre este fundo.
 *
 * Testa as duas candidatas e devolve a que enxerga melhor. Não há
 * "chute claro/escuro" com limiar mágico: a conta já responde isso.
 */
export function textoSobre(fundo: string | null | undefined): string {
  if (!fundo || !paraRgb(fundo)) return BRANCO
  return razaoDeContraste(fundo, BRANCO) >= razaoDeContraste(fundo, GRAFITE)
    ? BRANCO
    : GRAFITE
}

export type NivelDeContraste = 'bom' | 'aceitavel' | 'ruim'

export interface Veredito {
  nivel: NivelDeContraste
  razao: number
  corDoTexto: string
  /** Frase para a tela. Fala de legibilidade, não de norma técnica. */
  recado: string
}

/**
 * Avalia uma cor de marca e explica o resultado em português.
 *
 * O recado é escrito para a proprietária, não para um auditor. Ela não
 * precisa saber o que é "WCAG AA" — precisa saber se a cliente vai
 * conseguir ler o botão.
 */
export function avaliarCorDaMarca(cor: string): Veredito {
  const corDoTexto = textoSobre(cor)
  const razao = razaoDeContraste(cor, corDoTexto)

  if (razao >= 4.5) {
    return {
      nivel: 'bom',
      razao,
      corDoTexto,
      recado: 'Boa legibilidade. O texto sobre esta cor lê bem em qualquer tela.',
    }
  }

  if (razao >= 3) {
    return {
      nivel: 'aceitavel',
      razao,
      corDoTexto,
      recado:
        'Legível, mas justo. Em celular no sol, textos pequenos sobre esta cor podem custar a ler.',
    }
  }

  return {
    nivel: 'ruim',
    razao,
    corDoTexto,
    recado:
      'Contraste baixo. Escureça ou clareie um pouco — do jeito que está, o texto some sobre o fundo.',
  }
}

/**
 * Versão mais escura de uma cor, para estados de foco e hover.
 *
 * Escurecer sempre, em vez de aplicar `brightness()`, mantém o
 * comportamento igual em cores muito claras — onde o filtro do CSS quase
 * não muda nada e o botão parece não responder ao toque.
 */
export function escurecer(hex: string, fator = 0.12): string {
  const rgb = paraRgb(hex)
  if (!rgb) return hex

  const ajustado = rgb.map((canal) => Math.max(0, Math.round(canal * (1 - fator))))
  return `#${ajustado.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Versão mais clara. Usada para fundos suaves derivados da marca. */
export function clarear(hex: string, fator = 0.85): string {
  const rgb = paraRgb(hex)
  if (!rgb) return hex

  const ajustado = rgb.map((canal) => Math.round(canal + (255 - canal) * fator))
  return `#${ajustado.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
