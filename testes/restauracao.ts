/**
 * Rollback da restauração de backup.
 *
 * O cenário do escopo: "se a coleção 7 falhar, as seis anteriores já
 * foram alteradas". Aqui a lógica de instantâneo+desfazer é exercitada
 * contra um armazenamento falso que quebra numa coleção escolhida.
 */
let falhas = 0
const ok = (n: string, c: boolean, e = '') => {
  console.log(`${c ? '  ok ' : ' FALHA'} ${n}${e ? ' — ' + e : ''}`); if (!c) falhas++
}

type Colecao = string

class ArmazenamentoFalso {
  dados = new Map<Colecao, unknown[]>()
  falharEm: Colecao | null = null
  falharAoDesfazer = false
  private desfazendo = false

  async listar(c: Colecao) { return [...(this.dados.get(c) ?? [])] }
  async gravar(c: Colecao, r: unknown[]) {
    if (this.desfazendo && this.falharAoDesfazer) throw new Error('falha ao desfazer ' + c)
    if (!this.desfazendo && c === this.falharEm) throw new Error('falha ao gravar ' + c)
    this.dados.set(c, [...r])
  }
  marcarDesfazendo(v: boolean) { this.desfazendo = v }
}

/** Mesma lógica de restaurar.ts: instantâneo, escrita, desfazer. */
async function restaurar(arm: ArmazenamentoFalso, preparadas: [Colecao, unknown[]][]) {
  const instantaneo = new Map<Colecao, unknown[]>()
  for (const [c] of preparadas) instantaneo.set(c, await arm.listar(c))

  const jaEscritas: Colecao[] = []
  try {
    for (const [c, r] of preparadas) { await arm.gravar(c, r); jaEscritas.push(c) }
  } catch (falha) {
    arm.marcarDesfazendo(true)
    const problemas: string[] = []
    for (const c of [...jaEscritas].reverse()) {
      try { await arm.gravar(c, instantaneo.get(c) ?? []) } catch { problemas.push(c) }
    }
    arm.marcarDesfazendo(false)
    throw { desfeito: problemas.length === 0, problemas, causa: falha }
  }
}

const montar = () => {
  const arm = new ArmazenamentoFalso()
  for (let i = 1; i <= 8; i++) arm.dados.set(`col${i}`, [{ id: `antigo${i}` }])
  return arm
}
const novo: [Colecao, unknown[]][] =
  Array.from({ length: 8 }, (_, i) => [`col${i + 1}`, [{ id: `novo${i + 1}` }]])

const rodar = async () => {
  /* --- Caminho feliz --- */
  const a1 = montar()
  await restaurar(a1, novo)
  ok('restauração completa grava todas as 8',
     [...a1.dados.values()].every((v: any) => v[0].id.startsWith('novo')))

  /* --- A coleção 7 falha (o cenário do escopo) --- */
  const a2 = montar()
  let erro: any = null
  try { await restaurar(a2, novo) } catch (e) { erro = e }
  a2.falharEm = 'col7'
  const a3 = montar(); a3.falharEm = 'col7'
  erro = null
  try { await restaurar(a3, novo) } catch (e) { erro = e }

  ok('falha na coleção 7 lança', erro !== null)
  ok('rollback reportado como completo', erro?.desfeito === true)

  const restaram = [...a3.dados.entries()].filter(([, v]: any) => v[0]?.id?.startsWith('novo'))
  ok('NENHUMA coleção ficou com dado novo', restaram.length === 0,
     restaram.length ? `sobraram: ${restaram.map(([k]) => k).join(', ')}` : 'estado anterior intacto')
  ok('as 8 voltaram ao valor antigo',
     [...a3.dados.values()].every((v: any) => v[0].id.startsWith('antigo')))

  /* --- Falha na primeira coleção --- */
  const a4 = montar(); a4.falharEm = 'col1'
  erro = null
  try { await restaurar(a4, novo) } catch (e) { erro = e }
  ok('falha na primeira também é reportada', erro !== null)
  ok('nada foi alterado', [...a4.dados.values()].every((v: any) => v[0].id.startsWith('antigo')))

  /* --- Desfazer também falha: precisa avisar, não fingir --- */
  const a5 = montar(); a5.falharEm = 'col5'; a5.falharAoDesfazer = true
  erro = null
  try { await restaurar(a5, novo) } catch (e) { erro = e }
  ok('rollback parcial é sinalizado', erro?.desfeito === false)
  ok('lista quais coleções não voltaram', erro?.problemas?.length > 0,
     erro?.problemas?.join(', '))

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
  process.exit(falhas === 0 ? 0 : 1)
}
void rodar()
