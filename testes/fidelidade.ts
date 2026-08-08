/** Validade dos pontos: o saldo somava tudo, para sempre. */
import { limiteDeValidade, venceu, somarValidos } from '../src/utils/fidelidade'

let falhas = 0
const ok = (n: string, c: boolean, e = '') => {
  console.log(`${c ? '  ok ' : ' FALHA'} ${n}${e ? ' — ' + e : ''}`); if (!c) falhas++
}

const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

const pontos = [
  { criadoEm: diasAtras(300), pontos: 500 },  // vencido com validade 180
  { criadoEm: diasAtras(100), pontos: 200 },  // válido
  { criadoEm: diasAtras(10),  pontos: 100 },  // válido
  { criadoEm: diasAtras(400), pontos: -150 }, // resgate antigo: nunca vence
]

ok('validade nula = tudo vale', limiteDeValidade(null) === null)
ok('validade zero = tudo vale', limiteDeValidade(0) === null)
ok('validade positiva devolve limite', typeof limiteDeValidade(180) === 'number')

const limite180 = limiteDeValidade(180)
ok('ponto de 300 dias venceu', venceu(pontos[0], limite180))
ok('ponto de 100 dias vale',  !venceu(pontos[1], limite180))
ok('resgate antigo NÃO vence', !venceu(pontos[3], limite180),
   'senão uma dívida sumiria e o saldo subiria sozinho')

ok('sem validade soma tudo', somarValidos(pontos, null) === 650, String(somarValidos(pontos, null)))
ok('com validade 180 exclui o vencido', somarValidos(pontos, 180) === 150,
   `${somarValidos(pontos, 180)} (200+100-150)`)
ok('validade curta zera os antigos', somarValidos(pontos, 30) === -50,
   String(somarValidos(pontos, 30)))
ok('lista vazia = zero', somarValidos([], 180) === 0)

// O caso que motivou a correção: a tela dizia 800, a regra dizia outra coisa
const antes = pontos.reduce((t, p) => t + p.pontos, 0)
const depois = somarValidos(pontos, 180)
ok('comportamento mudou de fato', antes !== depois, `antes=${antes} depois=${depois}`)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
