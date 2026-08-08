import { gerarQrCode, qrCodeSvg } from '../src/utils/qrcode'

const matrizQrCode = (t: string) => gerarQrCode(t).modulos

let falhas = 0
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

// 1. Link típico de agendamento
const link = 'https://system-studio.vercel.app/agendar/emely-barbosa'
const m = matrizQrCode(link)
ok('matriz é quadrada', m.length === m[0].length, `${m.length}x${m[0].length}`)
ok('tamanho é 4*v+17', (m.length - 17) % 4 === 0, `lado=${m.length}`)

// 2. Padrões de localização nos três cantos
const finder = (mx: boolean[][], li: number, co: number) => {
  const esperado = [
    [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
  ]
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    if (mx[li+i][co+j] !== !!esperado[i][j]) return false
  }
  return true
}
const n = m.length
ok('localizador superior esquerdo', finder(m, 0, 0))
ok('localizador superior direito', finder(m, 0, n - 7))
ok('localizador inferior esquerdo', finder(m, n - 7, 0))

// 3. Módulo de tempo (timing pattern) alterna
let tempoOk = true
for (let i = 8; i < n - 8; i++) if (m[6][i] !== (i % 2 === 0)) tempoOk = false
ok('padrão de tempo alterna', tempoOk)

// 4. Módulo escuro obrigatório
ok('módulo escuro presente', m[n - 8][8] === true)

// 5. Vários tamanhos de entrada
for (const texto of ['a', 'https://x.co/a', link, 'x'.repeat(100), 'x'.repeat(169)]) {
  try {
    const mm = matrizQrCode(texto)
    ok(`gera para ${texto.length} caracteres`, mm.length >= 21 && mm.length <= 57, `lado=${mm.length}`)
  } catch (e) {
    ok(`gera para ${texto.length} caracteres`, false, String(e))
  }
}

// 6. Acentos (UTF-8 em modo byte)
try {
  const mm = matrizQrCode('https://x.co/agendar/salão-beleza')
  ok('aceita acentos', mm.length >= 21)
} catch (e) { ok('aceita acentos', false, String(e)) }

// 7. Texto grande demais deve recusar, não gerar lixo
try {
  matrizQrCode('x'.repeat(5000))
  ok('recusa texto grande demais', false, 'não lançou')
} catch { ok('recusa texto grande demais', true) }

// 8. SVG bem formado
const svg = qrCodeSvg(link)
ok('SVG tem tag de abertura', svg.startsWith('<svg'))
ok('SVG fecha', svg.trim().endsWith('</svg>'))
ok('SVG tem viewBox', svg.includes('viewBox'))
ok('SVG tem conteúdo desenhado', svg.includes('<path') || svg.includes('<rect'))

// 9. Determinístico
ok('mesma entrada, mesma saída', qrCodeSvg(link) === svg)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
