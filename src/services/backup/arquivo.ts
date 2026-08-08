/**
 * Entrada e saída de arquivos no navegador.
 *
 * Isolado num arquivo só para que, quando houver servidor, apenas estas
 * funções mudem — nem o serviço de backup nem as telas.
 */

export const TIPOS_MIME = {
  json: 'application/json;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  excel: 'application/vnd.ms-excel;charset=utf-8',
  pdf: 'application/pdf',
  texto: 'text/plain;charset=utf-8',
} as const

/** Dispara o download de um conteúdo gerado em memória. */
export function baixar(nomeArquivo: string, conteudo: string, mime: string): void {
  const blob = new Blob([conteudo], { type: mime })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.rel = 'noopener'
  link.click()

  // Sem isto o blob fica na memória até a aba fechar.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Abre o seletor de arquivos e devolve o conteúdo como texto. */
export function escolherArquivo(extensoes = '.json'): Promise<{ nome: string; conteudo: string; tamanho: number } | null> {
  return new Promise((resolver) => {
    const entrada = document.createElement('input')
    entrada.type = 'file'
    entrada.accept = extensoes

    entrada.onchange = () => {
      const arquivo = entrada.files?.[0]
      if (!arquivo) return resolver(null)

      const leitor = new FileReader()
      leitor.onload = () =>
        resolver({
          nome: arquivo.name,
          conteudo: String(leitor.result ?? ''),
          tamanho: arquivo.size,
        })
      leitor.onerror = () => resolver(null)
      leitor.readAsText(arquivo)
    }

    entrada.click()
  })
}

/** Tamanho aproximado de um texto em bytes (UTF-8). */
export const tamanhoEmBytes = (texto: string): number =>
  typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(texto).length : texto.length

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Nome de arquivo seguro, com data e hora. */
export function nomearArquivo(prefixo: string, extensao: string): string {
  const agora = new Date()
  const carimbo = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0'),
  ].join('-')

  const hora = [
    String(agora.getHours()).padStart(2, '0'),
    String(agora.getMinutes()).padStart(2, '0'),
  ].join('h')

  const limpo = prefixo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${limpo}-${carimbo}-${hora}.${extensao}`
}
