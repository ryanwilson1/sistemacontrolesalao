type Valor = string | number | false | null | undefined

/** Junta classes CSS ignorando valores vazios. */
export const cn = (...valores: Valor[]): string =>
  valores.filter((v): v is string => typeof v === 'string' && v !== '').join(' ')
