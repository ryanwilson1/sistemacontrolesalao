import { avaliarCorDaMarca, razaoDeContraste, textoSobre, paraRgb, escurecer, clarear } from '../src/utils/contraste'

let falhas = 0
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

// Valores de referência da própria WCAG
ok('preto sobre branco = 21:1', Math.round(razaoDeContraste('#000000', '#FFFFFF')) === 21)
ok('branco sobre branco = 1:1', Math.round(razaoDeContraste('#FFFFFF', '#FFFFFF')) === 1)

// O caso que motivou o arquivo: amarelo
const amarelo = avaliarCorDaMarca('#FFEB3B')
ok('amarelo recebe texto escuro', amarelo.corDoTexto === '#2A2224', `texto=${amarelo.corDoTexto}`)
ok('amarelo é legível com texto escuro', amarelo.nivel === 'bom', `razão=${amarelo.razao.toFixed(1)}`)

// Cor escura clássica
const bordo = avaliarCorDaMarca('#7B1E3A')
ok('bordô recebe texto branco', bordo.corDoTexto === '#FFFFFF')
ok('bordô é legível', bordo.nivel === 'bom', `razão=${bordo.razao.toFixed(1)}`)

// Cores da paleta do próprio sistema
for (const [nome, cor] of [['ouro','#B08A3E'], ['rosé','#B0737E'], ['ônix','#3A2E31']] as const) {
  const v = avaliarCorDaMarca(cor)
  ok(`paleta ${nome} é legível`, v.nivel !== 'ruim', `${v.nivel}, razão=${v.razao.toFixed(1)}, texto=${v.corDoTexto}`)
}

// Cor problemática deve ser sinalizada, não silenciada.
// Cinza médio é o pior caso real: fica longe do branco E do grafite.
const cinzaMedio = avaliarCorDaMarca('#808080')
ok('cinza médio é sinalizado como justo', cinzaMedio.nivel === 'aceitavel',
   `${cinzaMedio.nivel}, razão=${cinzaMedio.razao.toFixed(1)}`)
ok('cinza médio tem recado útil', cinzaMedio.recado.length > 20)

// Cinza CLARO, por outro lado, é legível com texto escuro — e o sistema
// deve dizer isso em vez de reclamar de uma cor que funciona.
const cinzaClaro = avaliarCorDaMarca('#BFBFBF')
ok('cinza claro é aprovado (texto escuro resolve)', cinzaClaro.nivel === 'bom',
   `razão=${cinzaClaro.razao.toFixed(1)} com ${cinzaClaro.corDoTexto}`)

// Entradas inválidas não podem quebrar a tela
ok('cor inválida não quebra', textoSobre('nao-e-cor') === '#FFFFFF')
ok('nulo não quebra', textoSobre(null) === '#FFFFFF')
ok('paraRgb rejeita lixo', paraRgb('xyz') === null)
ok('paraRgb aceita 3 dígitos', JSON.stringify(paraRgb('#fff')) === '[255,255,255]')

// Escurecer/clarear
ok('escurecer reduz', escurecer('#B08A3E') !== '#B08A3E' && escurecer('#B08A3E') < '#B08A3E')
ok('clarear aproxima do branco', clarear('#B08A3E').toUpperCase() > '#B08A3E')
ok('escurecer preserva formato', /^#[0-9a-f]{6}$/.test(escurecer('#B08A3E')))

// Toda cor possível recebe um texto legível — o teste que importa
let piorRazao = 21, piorCor = ''
for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
  const cor = '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('')
  const razao = razaoDeContraste(cor, textoSobre(cor))
  if (razao < piorRazao) { piorRazao = razao; piorCor = cor }
}
ok('nenhuma cor fica ilegível (varredura de 4096 cores)', piorRazao >= 3,
   `pior caso ${piorCor} = ${piorRazao.toFixed(2)}:1`)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
