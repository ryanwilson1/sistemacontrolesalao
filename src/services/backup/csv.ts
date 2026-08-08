/**
 * Geração de CSV.
 *
 * O prefixo em valores que começam com =, +, − ou @ evita injeção de
 * fórmula: sem isso, uma observação digitada como "=CMD()" viraria
 * fórmula ativa ao abrir a planilha no Excel.
 */

function protegerCelula(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  const perigoso = /^[=+\-@\t\r]/.test(texto)
  const escapado = texto.replace(/"/g, '""')
  return `"${perigoso ? `'${escapado}` : escapado}"`
}

export function montarCSV(cabecalho: string[], linhas: unknown[][]): string {
  return [cabecalho, ...linhas]
    .map((linha) => linha.map(protegerCelula).join(';'))
    .join('\r\n')
}

/**
 * Converte uma coleção qualquer em CSV, achatando objetos e listas.
 * Usado na exportação individual de módulos.
 */
export function colecaoParaCSV(registros: Record<string, unknown>[]): string {
  if (registros.length === 0) return ''

  // A união das chaves cobre registros com campos opcionais ausentes.
  const colunas = [...new Set(registros.flatMap((r) => Object.keys(r)))]

  const linhas = registros.map((registro) =>
    colunas.map((coluna) => {
      const valor = registro[coluna]
      if (valor === null || valor === undefined) return ''
      if (typeof valor === 'object') return JSON.stringify(valor)
      return valor
    }),
  )

  return montarCSV(colunas, linhas)
}

/** O BOM faz o Excel reconhecer a acentuação. */
export const comBOM = (conteudo: string) => `\uFEFF${conteudo}`
