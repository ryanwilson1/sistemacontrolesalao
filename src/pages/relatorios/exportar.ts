/**
 * Exportação para CSV.
 *
 * O prefixo em valores que começam com =, +, − ou @ evita injeção de
 * fórmula: sem isso, uma observação digitada como "=CMD()" viraria
 * fórmula ativa ao abrir a planilha no Excel.
 */
function protegerCelula(valor: string): string {
  const texto = String(valor ?? '')
  const perigoso = /^[=+\-@\t\r]/.test(texto)
  const escapado = texto.replace(/"/g, '""')
  return `"${perigoso ? `'${escapado}` : escapado}"`
}

export function baixarCSV(nomeArquivo: string, cabecalho: string[], linhas: (string | number)[][]) {
  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map((celula) => protegerCelula(String(celula))).join(';'))
    .join('\n')

  // O BOM faz o Excel reconhecer acentuação corretamente.
  const blob = new Blob([`\uFEFF${conteudo}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()

  URL.revokeObjectURL(url)
}
