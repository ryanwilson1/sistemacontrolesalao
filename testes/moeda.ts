/** Moeda brasileira: os formatos que uma pessoa digita de verdade. */
import { parseMoedaBR, formatarMoedaBR, digitandoMoeda, moedaOuZero } from '../src/utils/moeda'

let falhas = 0
const ok = (n: string, c: boolean, e = '') => {
  console.log(`${c ? '  ok ' : ' FALHA'} ${n}${e ? ' — ' + e : ''}`); if (!c) falhas++
}
const eq = (entrada: string, esperado: number | null) => {
  const r = parseMoedaBR(entrada)
  ok(`"${entrada}" → ${esperado}`, r === esperado, r === esperado ? '' : `veio ${r}`)
}

console.log('\n── Os casos do escopo')
eq('50', 50)
eq('50,00', 50)
eq('50,5', 50.5)
eq('1.000', 1000)
eq('1.000,50', 1000.5)
eq('1000', 1000)
eq('1000,50', 1000.5)
eq('10.000,99', 10000.99)
eq('120,50', 120.5)
eq('1.250,00', 1250)
eq('2.500,75', 2500.75)
eq('10.000', 10000)

console.log('\n── Ponto ambíguo (a decisão difícil)')
eq('10.50', 10.5)      // dois dígitos, sem vírgula = decimal
eq('1.250', 1250)      // três dígitos = milhar
eq('1.250.000', 1250000)
eq('1.5', 1.5)         // um dígito: Number() resolve

console.log('\n── Com R$ e sujeira de planilha')
eq('R$ 50,00', 50)
eq('R$1.250,50', 1250.5)
eq(' 99,90 ', 99.9)
eq('R$ 2.500,75', 2500.75)

console.log('\n── Vazio e inválido')
eq('', null)
eq('abc', null)
eq('-', null)
ok('null → null', parseMoedaBR(null) === null)
ok('undefined → null', parseMoedaBR(undefined) === null)
ok('vazio NÃO vira zero', parseMoedaBR('') !== 0, 'campo vazio ≠ de graça')
ok('moedaOuZero devolve 0', moedaOuZero('') === 0)

console.log('\n── Negativos (despesas)')
eq('-50,00', -50)
eq('-1.250,50', -1250.5)

console.log('\n── Arredondamento de dinheiro')
ok('0,1 + 0,2 fecha em 0,30',
   Math.round((parseMoedaBR('0,1')! + parseMoedaBR('0,2')!) * 100) / 100 === 0.3)
eq('10,999', 11)
ok('número puro passa direto', parseMoedaBR(1250.5) === 1250.5)

console.log('\n── Formatação de volta')
ok('1250.5 → "1.250,50"', formatarMoedaBR(1250.5) === '1.250,50', formatarMoedaBR(1250.5))
ok('50 → "50,00"', formatarMoedaBR(50) === '50,00', formatarMoedaBR(50))
ok('0 → "0,00"', formatarMoedaBR(0) === '0,00')
ok('null → vazio', formatarMoedaBR(null) === '')

console.log('\n── Ida e volta preserva o valor')
for (const v of [0, 50, 99.9, 1250.5, 10000.99, 2500.75]) {
  const volta = parseMoedaBR(formatarMoedaBR(v))
  ok(`${v} sobrevive`, volta === v, volta === v ? '' : `virou ${volta}`)
}

console.log('\n── Enquanto digita')
ok('remove letras', digitandoMoeda('12a3') === '123')
ok('só uma vírgula', digitandoMoeda('1,2,3') === '1,23')
ok('máximo 2 centavos', digitandoMoeda('10,999') === '10,99')
ok('vírgula solta permitida', digitandoMoeda('10,') === '10,', digitandoMoeda('10,'))
ok('não formata no meio', digitandoMoeda('1250') === '1250')

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
