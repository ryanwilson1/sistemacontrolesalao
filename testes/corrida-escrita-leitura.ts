/**
 * A corrida "escrevi enquanto a lista carregava" — segunda auditoria.
 *
 * Reproduz, com a mesma lógica do `SupabaseAdapter` destilada, a
 * sequência que fazia um registro recém-salvo SUMIR da lista:
 *
 *   listar() parte (estado antigo)
 *   ↓ escrita confirma
 *   ↓ o evento do Postgres volta e o eco o assina como local
 *     (espelho preservado — ver ecos.ts)
 *   listar() antigo aterrissa
 *   → sem o fecho: espelho = estado SEM a escrita, e nada mais o derruba
 *   → com o fecho: a leitura nasceu numa geração superada e é descartada
 *
 * O teste roda a MESMA sequência nas duas versões — com e sem o bump de
 * geração na escrita — e exige que a versão sem o fecho falhe. É a
 * prova de que o teste detecta o problema, e não apenas passa.
 */

let testes = 0
let falhas = 0

function ok(condicao: boolean, rotulo: string, detalhe = '') {
  testes += 1
  if (condicao) console.log(`  ok  ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  else {
    falhas += 1
    console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Adaptador destilado: espelho + emVoo + geração, parametrizado. */
function criarAdaptador(comFecho: boolean) {
  const espelho = new Map<string, string[]>()
  const emVoo = new Map<string, Promise<string[]>>()
  const geracao = new Map<string, number>()

  /** O "banco": responde com atraso configurável. */
  let banco: string[] = ['registro-antigo']

  return {
    definirBanco(registros: string[]) {
      banco = registros
    },

    listar(colecao: string, atrasoMs: number): Promise<string[]> {
      const guardado = espelho.get(colecao)
      if (guardado) return Promise.resolve([...guardado])

      const voando = emVoo.get(colecao)
      if (voando) return voando

      const nascidaEm = geracao.get(colecao) ?? 0
      const congelado = [...banco] // o que o banco tinha QUANDO a busca partiu

      const busca = dormir(atrasoMs)
        .then(() => {
          if ((geracao.get(colecao) ?? 0) === nascidaEm) {
            espelho.set(colecao, congelado)
          }
          return congelado
        })
        .finally(() => {
          if (emVoo.get(colecao) === busca) emVoo.delete(colecao)
        })

      emVoo.set(colecao, busca)
      return busca
    },

    inserir(colecao: string, registro: string): void {
      banco = [...banco, registro]

      if (comFecho) {
        geracao.set(colecao, (geracao.get(colecao) ?? 0) + 1)
        emVoo.delete(colecao)
      }

      const atual = espelho.get(colecao)
      if (atual) espelho.set(colecao, [...atual, registro])
    },

    /** O que o `useTempoReal` faz quando o eco é reconhecido: NADA no espelho. */
    eventoLocalChegou(): void {},

    espelhoDe(colecao: string): string[] | undefined {
      return espelho.get(colecao)
    },
  }
}

async function rodarCorrida(comFecho: boolean): Promise<string[]> {
  const adaptador = criarAdaptador(comFecho)

  // 1. A tela abre: listar parte com o banco no estado antigo (lento).
  const leituraAntiga = adaptador.listar('agendamentos', 30)

  // 2. A pessoa salva rápido: escrita confirmada.
  await dormir(5)
  adaptador.inserir('agendamentos', 'registro-NOVO')

  // 3. O evento volta do Postgres; o eco o assina como local — o
  //    espelho não é derrubado (comportamento do useTempoReal).
  adaptador.eventoLocalChegou()

  // 4. A leitura antiga aterrissa.
  await leituraAntiga.catch(() => [])
  await dormir(40)

  // 5. A tela relê (cache invalidado pela escrita) — do espelho.
  return adaptador.listar('agendamentos', 1)
}

/* ------------------------------------------------------------------ */
console.log('\n── SEM o fecho: a corrida existe (prova de que o teste detecta)\n')

{
  const lista = await rodarCorrida(false)
  ok(
    !lista.includes('registro-NOVO'),
    'sem o bump, o registro salvo some da lista',
    `lista = [${lista.join(', ')}]`,
  )
}

/* ------------------------------------------------------------------ */
console.log('\n── COM o fecho: a escrita sobrevive à leitura atrasada\n')

{
  const lista = await rodarCorrida(true)
  ok(
    lista.includes('registro-NOVO'),
    'com o bump, o registro salvo continua na lista',
    `lista = [${lista.join(', ')}]`,
  )
  ok(
    !lista.includes('registro-fantasma'),
    'e nada além do banco aparece',
  )
}

/* ------------------------------------------------------------------ */
console.log('\n── O fecho não quebra o caminho comum (sem corrida)\n')

{
  const adaptador = criarAdaptador(true)
  const primeira = await adaptador.listar('clientes', 1)
  ok(primeira.length === 1, 'leitura simples funciona', `[${primeira.join(', ')}]`)

  adaptador.inserir('clientes', 'cliente-nova')
  const segunda = await adaptador.listar('clientes', 1)
  ok(
    segunda.includes('cliente-nova'),
    'escrita com espelho quente aparece na leitura seguinte',
    `[${segunda.join(', ')}]`,
  )
}

/* ------------------------------------------------------------------ */

console.log(`\n${'─'.repeat(60)}`)
if (falhas === 0) console.log(`TODOS OS ${testes} TESTES PASSARAM`)
else {
  console.log(`${falhas} de ${testes} FALHARAM`)
  process.exit(1)
}
