/**
 * Testes de integridade da camada de persistência.
 *
 * Cobrem os defeitos corrigidos nesta rodada — cada teste falha na
 * versão anterior do código e passa na atual.
 */
import { LocalStorageAdapter } from '../src/services/storage/LocalStorageAdapter'

let falhas = 0
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

/* ---- localStorage falso, com cota controlável ---- */
/*
  O `localStorage` de verdade expõe cada chave também como propriedade
  do objeto — é o que faz `Object.keys(localStorage)` funcionar, e o
  adaptador depende disso para varrer as chaves do sistema. Um Map puro
  não faz isso, então o falso precisa espelhar as duas formas.
*/
class MemoriaLS {
  [chave: string]: unknown
  cotaEstourada = false

  get length() { return this.chaves().length }
  private chaves() {
    return Object.keys(this).filter((k) => k !== 'cotaEstourada')
  }
  key(i: number) { return this.chaves()[i] ?? null }
  getItem(k: string) { return (this[k] as string) ?? null }
  removeItem(k: string) { delete this[k] }
  clear() { for (const k of this.chaves()) delete this[k] }
  setItem(k: string, v: string) {
    if (this.cotaEstourada && !k.endsWith(':teste')) {
      const erro: any = new Error('QuotaExceededError')
      erro.name = 'QuotaExceededError'
      erro.code = 22
      throw erro
    }
    this[k] = v
  }
}

const ls = new MemoriaLS()
;(globalThis as any).window = { localStorage: ls }
;(globalThis as any).DOMException = class extends Error {
  code = 22
  constructor(msg?: string, nome?: string) { super(msg); this.name = nome ?? 'DOMException' }
}

const rodar = async () => {
  const adaptador = new LocalStorageAdapter()
  await adaptador.iniciar()

  /* ---------- P0.9: estado fantasma na cota estourada ---------- */
  await adaptador.gravar('clientes', [{ id: '1', nome: 'Ana' }])
  const antes = await adaptador.listar('clientes')
  ok('grava normalmente', antes.length === 1)

  ls.cotaEstourada = true
  let lancou = false
  try {
    await adaptador.gravar('clientes', [{ id: '1', nome: 'Ana' }, { id: '2', nome: 'Bia' }])
  } catch { lancou = true }
  ok('cota estourada lança erro', lancou)

  // O TESTE QUE IMPORTA: memória e disco não podem divergir.
  const depoisMemoria = await adaptador.listar<{ id: string }>('clientes')
  ok('espelho NÃO avançou após falha', depoisMemoria.length === 1,
     `espelho tem ${depoisMemoria.length}, disco tem 1`)

  // Simula o F5: adaptador novo lê do disco.
  ls.cotaEstourada = false
  const outroAdaptador = new LocalStorageAdapter()
  await outroAdaptador.iniciar()
  const aposReload = await outroAdaptador.listar<{ id: string }>('clientes')
  ok('após reload, disco e espelho batem', aposReload.length === depoisMemoria.length,
     `disco=${aposReload.length} espelho=${depoisMemoria.length}`)

  /* ---------- Gravação inválida não corrompe o espelho ---------- */
  const circular: any = { id: '9' }
  circular.eu = circular
  let recusou = false
  try { await adaptador.gravar('clientes', [circular]) } catch { recusou = true }
  ok('recusa dado não serializável', recusou)
  ok('espelho intacto após dado inválido',
     (await adaptador.listar('clientes')).length === 1)

  /* ---------- Preservação de dados de versão antiga ---------- */
  ls.clear()
  ls.setItem('studio:versao', '4')
  ls.setItem('studio:clientes', JSON.stringify([{ id: 'x', nome: 'Antiga' }]))

  const migrado = new LocalStorageAdapter()
  await migrado.iniciar()

  ok('formato antigo não é apagado', ls.getItem('studio:v-anterior:4:studio:clientes') !== null)
  ok('sistema abre com armazenamento limpo',
     (await migrado.listar('clientes')).length === 0)
  const pendente = migrado.dadosDeVersaoAntiga()
  ok('sistema sabe informar que há dados antigos', pendente !== null && pendente.versao === 4,
     JSON.stringify(pendente))
  migrado.descartarVersaoAntiga()
  ok('descarte consciente limpa', migrado.dadosDeVersaoAntiga() === null)

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
  process.exit(falhas === 0 ? 0 : 1)
}
void rodar()
