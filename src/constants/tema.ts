/**
 * Identidade visual. Extraída da fachada do studio: quartzo rosa polido
 * com lettering em ouro escovado.
 */

export interface Tema {
  chave: string
  nome: string
  acento: string
  acentoSuave: string
  acentoContraste: string
}

export const TEMAS: Record<string, Tema> = {
  'quartzo-ouro': {
    chave: 'quartzo-ouro',
    nome: 'Quartzo & Ouro',
    acento: '#B08A3E',
    acentoSuave: '#EADDBB',
    acentoContraste: '#FFFFFF',
  },
  'quartzo-rose': {
    chave: 'quartzo-rose',
    nome: 'Quartzo Rosé',
    acento: '#B0737E',
    acentoSuave: '#F0E3E4',
    acentoContraste: '#FFFFFF',
  },
  onix: {
    chave: 'onix',
    nome: 'Ônix',
    acento: '#3A2E31',
    acentoSuave: '#EBE5E6',
    acentoContraste: '#FFFFFF',
  },
}

export const TEMA_PADRAO = TEMAS['quartzo-ouro'] as Tema
