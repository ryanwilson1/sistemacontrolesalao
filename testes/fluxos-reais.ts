/**
 * Fluxos de uso real, executados de verdade.
 *
 * Os testes anteriores exercitavam funções isoladas. Este monta o
 * armazenamento que a aplicação usa no modo local, roda os mesmos
 * repositórios e serviços das telas, e faz o que a proprietária faria
 * num dia de trabalho — inclusive fechar o navegador e voltar.
 *
 * O que ele NÃO é: um teste de interface. Não há React aqui. O que ele
 * cobre é a camada onde os dados vivem, que é onde "salvei e sumiu"
 * acontece.
 */
import { JSDOM } from 'jsdom'

/* ---- Um navegador de mentira, com localStorage de verdade ---- */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://studio.teste/',
})
const g = globalThis as Record<string, unknown>
g.window = dom.window
g.document = dom.window.document
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true })
g.localStorage = dom.window.localStorage
g.sessionStorage = dom.window.sessionStorage
g.DOMException = dom.window.DOMException
Object.defineProperty(g, "crypto", {
  value: { randomUUID: () => `id-${Math.random().toString(36).slice(2, 12)}` },
  configurable: true,
})
// O Vite injeta isto no build; fora dele, não existe.
;(g as { importMetaEnv?: unknown }).importMetaEnv = {}

let falhas = 0
const grupos: string[] = []
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}
const grupo = (nome: string) => {
  grupos.push(nome)
  console.log(`\n── ${nome}`)
}

const rodar = async () => {
  const { LocalStorageAdapter } = await import('../src/services/storage/LocalStorageAdapter')

  /* ================================================================
     FLUXO 1 — Cadastrar, salvar, ATUALIZAR A PÁGINA, conferir
     ================================================================ */
  grupo('FLUXO 1 · cliente sobrevive ao F5')

  const app1 = new LocalStorageAdapter()
  await app1.iniciar()

  await app1.gravar('clientes', [
    { id: 'c1', nome: 'Maria Silva', telefone: '11987654321', criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  ])
  ok('cliente cadastrada', (await app1.listar('clientes')).length === 1)

  // F5: instância nova, mesmo localStorage.
  const app2 = new LocalStorageAdapter()
  await app2.iniciar()
  const apos = await app2.listar<{ nome: string; telefone: string }>('clientes')

  ok('cliente continua lá depois do F5', apos.length === 1)
  ok('nome intacto', apos[0]?.nome === 'Maria Silva', apos[0]?.nome)
  ok('telefone intacto', apos[0]?.telefone === '11987654321', apos[0]?.telefone)

  /* ================================================================
     FLUXO 2 — Editar e conferir que a edição venceu
     ================================================================ */
  grupo('FLUXO 2 · editar preço de serviço')

  await app2.gravar('servicos', [
    { id: 's1', nome: 'Progressiva', preco: 200, duracaoMinutos: 120, ativo: true, criadoEm: '', atualizadoEm: '' },
  ])
  const antes = await app2.listar<{ preco: number }>('servicos')
  ok('serviço cadastrado a R$ 200', antes[0]?.preco === 200)

  await app2.gravar('servicos', [{ ...(antes[0] as object), preco: 250 }])

  const app3 = new LocalStorageAdapter()
  await app3.iniciar()
  const depois = await app3.listar<{ preco: number; nome: string }>('servicos')

  ok('preço novo persistiu', depois[0]?.preco === 250, `R$ ${depois[0]?.preco}`)
  ok('nome não foi perdido na edição', depois[0]?.nome === 'Progressiva')
  ok('não duplicou o registro', depois.length === 1, `${depois.length} registro(s)`)

  /* ================================================================
     FLUXO 3 — Duas abas mexendo ao mesmo tempo
     ================================================================ */
  grupo('FLUXO 3 · duas abas')

  const abaA = new LocalStorageAdapter()
  const abaB = new LocalStorageAdapter()
  await abaA.iniciar()
  await abaB.iniciar()

  const listaA = await abaA.listar<{ id: string; nome: string }>('clientes')
  await abaB.listar('clientes') // B também carrega

  // A cadastra uma cliente nova
  await abaA.gravar('clientes', [...listaA, { id: 'c2', nome: 'Ana Costa', telefone: '11911112222' }])

  // B ainda tem o espelho velho. Sem invalidar, ela sobrescreveria.
  abaB.invalidar('clientes')
  const listaB = await abaB.listar<{ id: string }>('clientes')

  ok('aba B enxerga a cliente da aba A depois de invalidar', listaB.length === 2,
     `${listaB.length} cliente(s)`)
  ok('nenhuma cliente foi perdida', listaB.some((c) => c.id === 'c2'))

  /* ================================================================
     FLUXO 4 — Motor da agenda com dados reais
     ================================================================ */
  grupo('FLUXO 4 · agenda e conflitos')

  const { horariosLivres } = await import('../src/services/agenda/horarios')
  const { garantirHorarioLivre, garantirCapacidade, calcularFim } =
    await import('../src/services/agenda/regras')

  const servico = {
    id: 's1', nome: 'Corte', duracaoMinutos: 60, intervaloMinutos: 0,
    preco: 100, ativo: true, noLinkPublico: true, profissionaisIds: [],
  } as never

  /*
    A data é calculada, não digitada.

    A versão anterior fixava '2026-08-11' — que era \"a próxima terça\"
    no dia em que o teste foi escrito e virou o dia de hoje algumas
    semanas depois. A partir dali o teste passava de manhã e falhava à
    tarde: o motor descarta horário já vencido, e às 17h de hoje não
    existe mais nenhum horário de hoje.

    Falha que depende da hora do relógio é pior do que falha nenhuma —
    ensina a equipe a ignorar o vermelho. Uma terça no futuro mantém a
    intenção do teste (grade de um dia útil comum) sem prazo de
    validade.
  */
  const terca = proximaTerca()
  const jornada = {
    diaSemana: 2, aberto: true, abre: '09:00', fecha: '18:00',
    almocoInicio: '12:00', almocoFim: '13:00',
  } as never
  const studio = { intervaloMinutos: 60, antecedenciaMinutos: 0, atendimentosSimultaneos: 0 } as never

  const livres = horariosLivres({
    data: terca, servico, profissionalId: 'p1', jornada,
    bloqueios: [], agendamentos: [], reservas: [], studio,
  } as never)

  const horas = livres.map((d: Date) => d.getHours())
  ok('grade do dia foi gerada', horas.length > 0, `${horas.length} horários`)
  ok('respeita o almoço (12h fora)', !horas.includes(12), `horas: ${horas.join(', ')}`)
  ok('não oferece depois do fechamento', horas.every((h) => h < 18))
  ok('não oferece antes da abertura', horas.every((h) => h >= 9))

  // Conflito de horário
  const inicio = '2026-08-11T17:00:00.000Z'
  const existente = {
    id: 'a1', profissionalId: 'p1', servicoId: 's1',
    inicio, fim: calcularFim(inicio, servico), situacao: 'confirmado',
  } as never

  let recusou = false
  try {
    garantirHorarioLivre({ profissionalId: 'p1', inicio, fim: calcularFim(inicio, servico) }, [existente])
  } catch { recusou = true }
  ok('recusa dois clientes no mesmo horário', recusou)

  // Sobreposição parcial
  const meiaHoraDepois = new Date(new Date(inicio).getTime() + 30 * 60_000).toISOString()
  recusou = false
  try {
    garantirHorarioLivre(
      { profissionalId: 'p1', inicio: meiaHoraDepois, fim: calcularFim(meiaHoraDepois, servico) },
      [existente],
    )
  } catch { recusou = true }
  ok('recusa sobreposição parcial (30min depois)', recusou)

  // Outra profissional no mesmo horário: deve PASSAR
  let passou = true
  try {
    garantirHorarioLivre({ profissionalId: 'p2', inicio, fim: calcularFim(inicio, servico) }, [existente])
  } catch { passou = false }
  ok('permite outra profissional no mesmo horário', passou)

  // Teto de atendimentos simultâneos
  recusou = false
  try {
    garantirCapacidade({ inicio, fim: calcularFim(inicio, servico) }, [existente], 1)
  } catch { recusou = true }
  ok('respeita o teto de atendimentos simultâneos', recusou)

  /* ================================================================
     FLUXO 5 — Erros humanos
     ================================================================ */
  grupo('FLUXO 5 · erros humanos')

  const { limparNome, limparIdentificador, urlSegura } = await import('../src/utils/sanitizar')
  const { mascaraTelefone, digitos, dinheiro } = await import('../src/utils/formato')

  ok('nome com espaços duplos é normalizado', limparNome('Maria   Silva') === 'Maria Silva')
  ok('nome com HTML é limpo', !limparNome('<script>x</script>Ana').includes('<'))
  ok('identificador vira slug', limparIdentificador('Studio Emely!') === 'studio-emely',
     limparIdentificador('Studio Emely!'))
  ok('javascript: em URL é recusado', urlSegura('javascript:alert(1)') === null)
  ok('telefone recebe máscara', mascaraTelefone('11987654321') === '(11) 98765-4321',
     mascaraTelefone('11987654321'))
  ok('letras somem do telefone', digitos('(11) 9abc8765-4321') === '11987654321')

  // Nada pode virar NaN / undefined na tela
  ok('valor nulo não vira NaN', !dinheiro(null as never).includes('NaN'), dinheiro(null as never))
  ok('valor indefinido não vira NaN', !dinheiro(undefined as never).includes('NaN'))

  const { mensagemDeErro } = await import('../src/utils/erros')
  const tecnico = mensagemDeErro(new TypeError("Cannot read properties of undefined"))
  ok('erro técnico não vaza para a tela',
     !/undefined|Cannot read|TypeError/i.test(tecnico), tecnico)

  /* ================================================================
     FLUXO 6 — Datas e horários
     ================================================================ */
  grupo('FLUXO 6 · datas')

  const { isoData, faixaDoDia, comHora, minutosDoDia } = await import('../src/utils/datas')

  const hoje = new Date('2026-08-08T15:30:00')
  ok('isoData usa o dia local', isoData(hoje) === '2026-08-08', isoData(hoje))
  ok('comHora aplica a hora certa', comHora(hoje, '09:30').getHours() === 9)
  ok('minutosDoDia calcula certo', minutosDoDia(hoje) === 15 * 60 + 30, String(minutosDoDia(hoje)))

  const faixa = faixaDoDia(hoje)
  ok('faixa do dia começa antes de terminar', faixa.de < faixa.ate)
  ok('faixa cobre 24h',
     new Date(faixa.ate).getTime() - new Date(faixa.de).getTime() === 86_400_000)

  // Virada de mês e ano
  ok('31 de dezembro não quebra', isoData(new Date('2026-12-31T23:00:00')) === '2026-12-31')
  ok('29 de fevereiro (bissexto) existe', isoData(new Date('2028-02-29T12:00:00')) === '2028-02-29')

  /* ================================================================
     FLUXO 7 — Fechar e abrir o navegador
     ================================================================ */
  grupo('FLUXO 7 · fechar e reabrir')

  const antesDeFechar = {
    clientes: (await app3.listar('clientes')).length,
    servicos: (await app3.listar('servicos')).length,
  }

  // Simula fechar o navegador: nada em memória sobrevive.
  const depoisDeAbrir = new LocalStorageAdapter()
  await depoisDeAbrir.iniciar()

  ok('clientes continuam',
     (await depoisDeAbrir.listar('clientes')).length === antesDeFechar.clientes,
     `${antesDeFechar.clientes} antes`)
  ok('serviços continuam',
     (await depoisDeAbrir.listar('servicos')).length === antesDeFechar.servicos)

  const servicoFinal = await depoisDeAbrir.listar<{ preco: number }>('servicos')
  ok('o preço editado ainda é R$ 250', servicoFinal[0]?.preco === 250,
     `R$ ${servicoFinal[0]?.preco}`)

  /* ================================================================ */
  console.log(
    falhas === 0
      ? `\n${grupos.length} fluxos · TODOS OS TESTES PASSARAM`
      : `\n${falhas} FALHA(S)`,
  )
  process.exit(falhas === 0 ? 0 : 1)
}

void rodar()

/** A próxima terça-feira ao meio-dia. Sempre no futuro — ver FLUXO 4. */
function proximaTerca(): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7))
  return d
}
