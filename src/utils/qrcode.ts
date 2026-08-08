/**
 * QR Code gerado aqui dentro.
 *
 * A versão anterior montava uma URL para `api.qrserver.com`. Funcionava
 * — e mandava o endereço do salão para um servidor de terceiro toda vez
 * que a proprietária abria a tela. Aquele endereço é o link público de
 * agendamento: não é segredo de Estado, mas também não é assunto de
 * mais ninguém, e depender de um site alheio significa que o QR Code
 * some no dia em que ele sair do ar ou passar a cobrar.
 *
 * São ~120 linhas para não ter nem a dependência de rede nem a de
 * pacote. O suficiente para links de agendamento: nível de correção M,
 * modo byte, versões 1 a 10 — **até 169 caracteres**, medido, o que dá
 * folga larga sobre os ~70 de um endereço de salão. Acima disso a
 * função avisa em vez de gerar um código que o celular não lê.
 *
 * Implementação de referência: ISO/IEC 18004.
 */

/* ---------------- Aritmética do corpo de Galois GF(256) ---------------- */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

const multiplicar = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]

/** Polinômio gerador para `grau` bytes de correção. */
function gerador(grau: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < grau; i++) {
    const novo = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      novo[j] ^= poly[j]
      novo[j + 1] ^= multiplicar(poly[j], EXP[i])
    }
    poly = novo
  }
  return poly
}

function correcao(dados: Uint8Array, quantos: number): Uint8Array {
  const poly = gerador(quantos)
  const resto = new Uint8Array(dados.length + quantos)
  resto.set(dados)

  for (let i = 0; i < dados.length; i++) {
    const fator = resto[i]
    if (fator === 0) continue
    for (let j = 0; j < poly.length; j++) {
      resto[i + j] ^= multiplicar(poly[j], fator)
    }
  }
  return resto.slice(dados.length)
}

/* ---------------- Capacidade por versão, correção M ---------------- */

/** [total de bytes, blocos do grupo 1, bytes de dados por bloco]. */
const VERSOES: Array<[number, number, number]> = [
  [26, 1, 16], [44, 1, 28], [70, 1, 44], [100, 2, 32], [134, 2, 43],
  [172, 4, 27], [196, 4, 31], [242, 2, 38], [292, 3, 36], [346, 4, 43],
]

const ALINHAMENTO: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

/* ---------------- Montagem ---------------- */

export interface QrCode {
  tamanho: number
  /** `modulos[y][x]` — verdadeiro é escuro. */
  modulos: boolean[][]
}

export function gerarQrCode(texto: string): QrCode {
  const bytes = new TextEncoder().encode(texto)

  const versao = VERSOES.findIndex(([total, blocos, porBloco]) => {
    const dados = blocos * porBloco
    return dados >= bytes.length + 3 && total > 0
  })
  if (versao === -1) {
    throw new Error('Texto longo demais para o QR Code deste tamanho.')
  }

  const numeroVersao = versao + 1
  const [, blocos, bytesPorBloco] = VERSOES[versao]
  const totalDados = blocos * bytesPorBloco
  const bytesCorrecao = Math.floor((VERSOES[versao][0] - totalDados) / blocos)

  /* --- fluxo de bits: modo byte + tamanho + conteúdo --- */
  const bits: number[] = []
  const empilhar = (valor: number, largura: number) => {
    for (let i = largura - 1; i >= 0; i--) bits.push((valor >> i) & 1)
  }

  empilhar(0b0100, 4)
  empilhar(bytes.length, numeroVersao <= 9 ? 8 : 16)
  for (const b of bytes) empilhar(b, 8)

  empilhar(0, Math.min(4, totalDados * 8 - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const dados = new Uint8Array(totalDados)
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j]
    dados[i] = byte
  }
  // Preenchimento padrão da norma.
  for (let i = Math.ceil(bits.length / 8); i < totalDados; i++) {
    dados[i] = i % 2 === 0 ? 0xec : 0x11
  }

  /* --- blocos e intercalação --- */
  const blocosDados: Uint8Array[] = []
  const blocosCorrecao: Uint8Array[] = []
  for (let i = 0; i < blocos; i++) {
    const parte = dados.slice(i * bytesPorBloco, (i + 1) * bytesPorBloco)
    blocosDados.push(parte)
    blocosCorrecao.push(correcao(parte, bytesCorrecao))
  }

  const fluxo: number[] = []
  for (let i = 0; i < bytesPorBloco; i++) {
    for (const bloco of blocosDados) if (i < bloco.length) fluxo.push(bloco[i])
  }
  for (let i = 0; i < bytesCorrecao; i++) {
    for (const bloco of blocosCorrecao) if (i < bloco.length) fluxo.push(bloco[i])
  }

  /* --- matriz --- */
  const tamanho = numeroVersao * 4 + 17
  const modulos: (boolean | null)[][] = Array.from({ length: tamanho }, () =>
    Array<boolean | null>(tamanho).fill(null),
  )

  const marcar = (x: number, y: number, escuro: boolean) => {
    if (x >= 0 && x < tamanho && y >= 0 && y < tamanho) modulos[y][x] = escuro
  }

  // Localizadores dos três cantos.
  const localizador = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const dentro =
          (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
          (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
        marcar(cx + dx, cy + dy, dentro)
      }
    }
  }
  localizador(0, 0)
  localizador(tamanho - 7, 0)
  localizador(0, tamanho - 7)

  // Alinhamento.
  const posicoes = ALINHAMENTO[versao]
  for (const py of posicoes) {
    for (const px of posicoes) {
      if ((px === 6 && py === 6) ||
          (px === 6 && py === tamanho - 7) ||
          (px === tamanho - 7 && py === 6)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          marcar(px + dx, py + dy,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }

  // Linhas de sincronia.
  for (let i = 8; i < tamanho - 8; i++) {
    if (modulos[6][i] === null) marcar(i, 6, i % 2 === 0)
    if (modulos[i][6] === null) marcar(6, i, i % 2 === 0)
  }
  marcar(8, tamanho - 8, true)

  // Reserva das áreas de formato.
  for (let i = 0; i < 9; i++) {
    if (modulos[8][i] === null) modulos[8][i] = false
    if (modulos[i][8] === null) modulos[i][8] = false
  }
  for (let i = tamanho - 8; i < tamanho; i++) {
    if (modulos[8][i] === null) modulos[8][i] = false
    if (modulos[i][8] === null) modulos[i][8] = false
  }

  /* --- dados, em zigue-zague de baixo para cima --- */
  const mascara = (x: number, y: number) => (x + y) % 2 === 0 // padrão 000

  let indice = 0
  let subindo = true
  for (let direita = tamanho - 1; direita > 0; direita -= 2) {
    if (direita === 6) direita = 5
    for (let passo = 0; passo < tamanho; passo++) {
      const y = subindo ? tamanho - 1 - passo : passo
      for (const x of [direita, direita - 1]) {
        if (modulos[y][x] !== null) continue
        const bit = indice < fluxo.length * 8
          ? (fluxo[indice >> 3] >> (7 - (indice & 7))) & 1
          : 0
        modulos[y][x] = (bit === 1) !== mascara(x, y)
        indice++
      }
    }
    subindo = !subindo
  }

  /* --- informação de formato: correção M, máscara 000 --- */
  const FORMATO = 0b101010000010010
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMATO >> i) & 1) === 1
    if (i < 6) modulos[i][8] = bit
    else if (i < 8) modulos[i + 1][8] = bit
    else if (i === 8) modulos[8][7] = bit
    else modulos[8][14 - i] = bit

    if (i < 8) modulos[8][tamanho - 1 - i] = bit
    else modulos[tamanho - 15 + i][8] = bit
  }

  return {
    tamanho,
    modulos: modulos.map((linha) => linha.map((v) => v === true)),
  }
}

/** O mesmo código, como SVG pronto para a tela ou para download. */
export function qrCodeSvg(texto: string, lado = 320): string {
  const { tamanho, modulos } = gerarQrCode(texto)
  const margem = 4
  const total = tamanho + margem * 2

  let caminho = ''
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      if (modulos[y][x]) caminho += `M${x + margem} ${y + margem}h1v1h-1z`
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"`,
    ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${caminho}" fill="#1A1416"/>`,
    '</svg>',
  ].join('')
}
