/**
 * Caixa físico: só dinheiro mexe na gaveta.
 *
 * O cenário do escopo: venda de R$150 paga com R$100 Pix + R$50
 * dinheiro. O faturamento sobe R$150; a gaveta, só R$50.
 */
import { AFETA_GAVETA, FORMAS_PAGAMENTO as FORMAS } from '../src/constants/dominio'

let falhas = 0
const ok = (n: string, c: boolean, e = '') => {
  console.log(`${c ? '  ok ' : ' FALHA'} ${n}${e ? ' — ' + e : ''}`); if (!c) falhas++
}

type Mov = { tipo: 'entrada' | 'saida'; forma: string; valor: number }

/** Mesma conta do repositório: gaveta soma só o que AFETA_GAVETA lista. */
const resumir = (abertura: number, movimentos: Mov[]) => {
  let entradas = 0, saidas = 0, gaveta = abertura
  for (const m of movimentos) {
    const sinal = m.tipo === 'entrada' ? 1 : -1
    if (m.tipo === 'entrada') entradas += m.valor; else saidas += m.valor
    if (AFETA_GAVETA.includes(m.forma as never)) gaveta += sinal * m.valor
  }
  return { entradas, saidas, gaveta, faturamento: entradas - saidas }
}

console.log('\n── O cenário do escopo: R$150 = R$100 Pix + R$50 dinheiro')
const r = resumir(100, [
  { tipo: 'entrada', forma: 'pix', valor: 100 },
  { tipo: 'entrada', forma: 'dinheiro', valor: 50 },
])
ok('faturamento é R$ 150', r.entradas === 150, `veio ${r.entradas}`)
ok('gaveta subiu só R$ 50', r.gaveta === 150, `abertura 100 + 50 = ${r.gaveta}`)

console.log('\n── Cada forma isolada')
for (const forma of FORMAS) {
  const x = resumir(0, [{ tipo: 'entrada', forma, valor: 100 }])
  const mexe = x.gaveta === 100
  const deveria = AFETA_GAVETA.includes(forma as never)
  ok(`${forma}: ${mexe ? 'mexe' : 'não mexe'} na gaveta`, mexe === deveria)
}

console.log('\n── Só dinheiro está em AFETA_GAVETA')
ok('dinheiro afeta', AFETA_GAVETA.includes('dinheiro' as never))
ok('pix NÃO afeta', !AFETA_GAVETA.includes('pix' as never))
ok('débito NÃO afeta', !AFETA_GAVETA.includes('debito' as never))
ok('crédito NÃO afeta', !AFETA_GAVETA.includes('credito' as never))

console.log('\n── Sangria e saída em dinheiro')
const s = resumir(200, [
  { tipo: 'entrada', forma: 'dinheiro', valor: 150 },
  { tipo: 'saida',   forma: 'dinheiro', valor: 80 },
  { tipo: 'entrada', forma: 'pix',      valor: 300 },
])
ok('gaveta = 200 + 150 - 80', s.gaveta === 270, `veio ${s.gaveta}`)
ok('entradas contam o Pix', s.entradas === 450, `veio ${s.entradas}`)
ok('saída em Pix não some da gaveta',
   resumir(100, [{ tipo: 'saida', forma: 'pix', valor: 50 }]).gaveta === 100)

console.log('\n── Dia inteiro de salão')
const dia = resumir(150, [
  { tipo: 'entrada', forma: 'dinheiro', valor: 60 },
  { tipo: 'entrada', forma: 'pix', valor: 220 },
  { tipo: 'entrada', forma: 'credito', valor: 90 },
  { tipo: 'entrada', forma: 'debito', valor: 120 },
  { tipo: 'entrada', forma: 'dinheiro', valor: 40 },
  { tipo: 'saida', forma: 'dinheiro', valor: 30 },
])
ok('faturamento do dia = R$ 530', dia.entradas === 530, `veio ${dia.entradas}`)
ok('gaveta ao fechar = R$ 220', dia.gaveta === 220, `150+60+40-30 = ${dia.gaveta}`)
ok('a diferença é grande e proposital', dia.entradas !== dia.gaveta)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
