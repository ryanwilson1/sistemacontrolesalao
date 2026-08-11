import { agendamentosRepo, bloqueiosRepo } from './repositorios/agenda'
import { clientesRepo } from './repositorios/clientes'
import { profissionaisRepo, jornadaRepo } from './repositorios/equipe'
import { produtosRepo } from './repositorios/estoque'
import { lancamentosRepo, metasRepo } from './repositorios/financeiro'
import { procedimentosRepo } from './repositorios/procedimentos'
import { estaAtivo } from './agenda/regras'
import { QUITADO } from '@/constants'
import {
  addDays, faixaDeDias, faixaDoDia, isoData, primeiroDiaDoMes, semanaDe, ultimoDiaDoMes,
} from '@/utils/datas'
import type { AgendamentoDetalhado, PainelCompleto, ResumoDoDia } from '@/types'

/**
 * Indicadores do painel.
 *
 * Tudo é derivado dos módulos existentes — nenhum número é guardado à
 * parte, então nada fica desatualizado. As consultas saem em paralelo:
 * o tempo total é o da mais lenta, não a soma de todas.
 */

/* ------------------------------------------------------------------ */
/* Resumo simples — usado pelo cabeçalho do painel                     */
/* ------------------------------------------------------------------ */

export async function montarResumoDoDia(data: Date): Promise<ResumoDoDia> {
  const { de, ate } = faixaDoDia(data)

  const [detalhados, aniversariantes, estoqueBaixo, faturamentoDoMes, meta, serie] =
    await Promise.all([
      agendamentosRepo.detalhadosNoPeriodo(de, ate),
      clientesRepo.aniversariantes(data),
      produtosRepo.abaixoDoMinimo(),
      lancamentosRepo.faturamentoDoMes(data),
      metasRepo.doMes(data),
      lancamentosRepo.serieDiaria(data, 14),
    ])

  const ativos = detalhados.filter(estaAtivo)

  return {
    data: isoData(data),
    atendimentos: ativos.length,
    cancelados: detalhados.filter((a) => a.situacao === 'cancelado').length,
    clientes: new Set(ativos.map((a) => a.clienteId).filter(Boolean)).size,
    faturamentoPrevisto: ativos.reduce((soma, a) => soma + a.preco - a.desconto, 0),
    faturamentoDoMes,
    metaDoMes: meta?.valor ?? null,

    estoqueBaixo: estoqueBaixo.map((p) => ({
      id: p.id, nome: p.nome, quantidade: p.quantidade,
      minimo: p.quantidadeMinima, unidade: p.unidade,
    })),

    aniversariantes: aniversariantes.map((c) => ({
      id: c.id, nome: c.nome, telefone: c.telefone, nascimento: c.nascimento ?? '',
    })),

    proximos: ativos.slice(0, 12).map((a) => ({
      id: a.id, inicio: a.inicio, fim: a.fim, situacao: a.situacao,
      cliente: a.cliente?.nome ?? a.nomeAvulso, clienteId: a.clienteId,
      servico: a.servico?.nome ?? 'Atendimento',
      cor: a.servico?.cor ?? null,
      profissional: a.profissional?.nome ?? '',
    })),

    serieFaturamento: serie,
  }
}

/* ------------------------------------------------------------------ */
/* Painel completo                                                     */
/* ------------------------------------------------------------------ */

const somar = (lista: AgendamentoDetalhado[]) =>
  lista.reduce((total, a) => total + a.preco - a.desconto, 0)

const recebidoEm = (lancamentos: { tipo: string; situacao: string; valor: number }[]) =>
  lancamentos
    .filter((l) => l.tipo === 'receita' && QUITADO.includes(l.situacao as never))
    .reduce((total, l) => total + l.valor, 0)

export async function montarPainelCompleto(data = new Date()): Promise<PainelCompleto> {
  const dia = faixaDoDia(data)
  const { inicio: inicioSemana, fim: fimSemana } = semanaDe(data)
  const semana = faixaDeDias(inicioSemana, fimSemana)
  const mes = faixaDeDias(primeiroDiaDoMes(data), ultimoDiaDoMes(data))

  const [
    doDia, daSemana, doMes, lancamentosMes, meta, atendentes, jornada, bloqueios,
    clientes, procedimentosMes,
  ] = await Promise.all([
    agendamentosRepo.detalhadosNoPeriodo(dia.de, dia.ate),
    agendamentosRepo.detalhadosNoPeriodo(semana.de, semana.ate),
    agendamentosRepo.detalhadosNoPeriodo(mes.de, mes.ate),
    lancamentosRepo.noPeriodo(isoData(primeiroDiaDoMes(data)), isoData(ultimoDiaDoMes(data))),
    metasRepo.doMes(data),
    profissionaisRepo.atendentes(),
    jornadaRepo.doDia(data.getDay()),
    bloqueiosRepo.noPeriodo(dia.de, dia.ate),
    clientesRepo.listar(),
    procedimentosRepo.noPeriodo(mes.de, mes.ate),
  ])

  const ativosDia = doDia.filter(estaAtivo)
  const ativosSemana = daSemana.filter(estaAtivo)
  const ativosMes = doMes.filter(estaAtivo)

  const concluidosMes = doMes.filter((a) => a.situacao === 'concluido')

  /* Clientes novas e recorrentes ---------------------------------- */
  const inicioMes = primeiroDiaDoMes(data).toISOString()
  const clientesNovas = clientes.filter((c) => c.criadoEm >= inicioMes).length

  const idsAtendidasNoMes = new Set(ativosMes.map((a) => a.clienteId).filter(Boolean))
  const idsNovas = new Set(
    clientes.filter((c) => c.criadoEm >= inicioMes).map((c) => c.id),
  )
  const recorrentes = [...idsAtendidasNoMes].filter((id) => !idsNovas.has(id!)).length

  /* Ocupação do dia ------------------------------------------------ */
  const minutosDisponiveis = calcularMinutosDisponiveis(jornada, atendentes.length)
  const minutosOcupados = ativosDia.reduce(
    (soma, a) => soma + (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60_000,
    0,
  )
  const minutosBloqueados = bloqueios.reduce(
    (soma, b) => soma + (new Date(b.fim).getTime() - new Date(b.inicio).getTime()) / 60_000,
    0,
  )

  const taxaOcupacao = minutosDisponiveis > 0
    ? Math.min(minutosOcupados / minutosDisponiveis, 1)
    : 0

  const livresMinutos = Math.max(minutosDisponiveis - minutosOcupados - minutosBloqueados, 0)
  const duracaoMediaServico = ativosMes.length > 0
    ? ativosMes.reduce((s, a) => s + (a.servico?.duracaoMinutos ?? 45), 0) / ativosMes.length
    : 45
  const horariosLivresHoje = Math.floor(livresMinutos / Math.max(duracaoMediaServico, 15))

  /* Destaques ------------------------------------------------------ */
  const profissionalDestaque = maiorPor(
    ativosMes,
    (a) => a.profissional?.id ?? '',
    (a) => a.profissional?.nome ?? 'Sem profissional',
  )

  const servicoMaisVendido = maiorPor(
    ativosMes,
    (a) => a.servico?.id ?? '',
    (a) => a.servico?.nome ?? 'Outro',
    true,
  )

  /* Horários movimentados ------------------------------------------ */
  const porHora = new Map<number, number>()
  for (const a of ativosMes) {
    const h = new Date(a.inicio).getHours()
    porHora.set(h, (porHora.get(h) ?? 0) + 1)
  }

  const horariosMovimentados = [...porHora.entries()]
    .map(([hora, atendimentos]) => ({ hora, atendimentos }))
    .sort((a, b) => b.atendimentos - a.atendimentos)
    .slice(0, 6)
    .sort((a, b) => a.hora - b.hora)

  /* Cancelamentos e faltas ----------------------------------------- */
  const cancelados = (lista: AgendamentoDetalhado[]) =>
    lista.filter((a) => a.situacao === 'cancelado').length

  const faltas = doMes.filter((a) => a.situacao === 'faltou').length
  const totalMes = doMes.length

  const recebidoMes = recebidoEm(lancamentosMes)
  const resumoMes = lancamentosRepo.resumir(lancamentosMes)

  return {
    data: isoData(data),

    agendamentos: {
      hoje: ativosDia.length,
      semana: ativosSemana.length,
      mes: ativosMes.length,
    },

    faturamento: {
      hoje: somar(doDia.filter((a) => a.situacao === 'concluido')),
      semana: somar(daSemana.filter((a) => a.situacao === 'concluido')),
      mes: recebidoMes,
    },

    clientesNovos: clientesNovas,
    clientesRecorrentes: recorrentes,
    horariosLivresHoje,

    cancelamentos: {
      hoje: cancelados(doDia),
      semana: cancelados(daSemana),
      mes: cancelados(doMes),
    },
    faltas,

    ticketMedio: concluidosMes.length > 0 ? somar(concluidosMes) / concluidosMes.length : 0,
    faturamentoEstimadoMes: somar(ativosMes),
    metaDoMes: meta?.valor ?? null,

    profissionalDestaque,
    servicoMaisVendido,
    horariosMovimentados,

    taxaOcupacao,
    taxaCancelamento: totalMes > 0 ? (cancelados(doMes) + faltas) / totalMes : 0,

    // Campos extras, calculados a partir dos procedimentos
    ...(await indicadoresDeProcedimento(procedimentosMes, resumoMes.lucro)),
  } as PainelCompleto
}

/** Minutos de agenda disponíveis no dia, somando toda a equipe. */
function calcularMinutosDisponiveis(
  jornada: { abre: string; fecha: string; almocoInicio: string | null; almocoFim: string | null } | null,
  pessoas: number,
): number {
  if (!jornada || pessoas === 0) return 0

  const minutos = (hora: string) => {
    const [h, m] = hora.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  const expediente = minutos(jornada.fecha) - minutos(jornada.abre)
  const almoco =
    jornada.almocoInicio && jornada.almocoFim
      ? minutos(jornada.almocoFim) - minutos(jornada.almocoInicio)
      : 0

  return Math.max(expediente - almoco, 0) * pessoas
}

/** Quem lidera um agrupamento, por valor ou por volume. */
function maiorPor(
  lista: AgendamentoDetalhado[],
  chave: (a: AgendamentoDetalhado) => string,
  nome: (a: AgendamentoDetalhado) => string,
  porVolume = false,
) {
  if (lista.length === 0) return null

  const mapa = new Map<string, { id: string; nome: string; valor: number; vezes: number }>()

  for (const a of lista) {
    const id = chave(a)
    if (!id) continue

    const atual = mapa.get(id) ?? { id, nome: nome(a), valor: 0, vezes: 0 }
    atual.valor += a.preco - a.desconto
    atual.vezes += 1
    mapa.set(id, atual)
  }

  const ordenados = [...mapa.values()].sort((a, b) =>
    porVolume ? b.vezes - a.vezes : b.valor - a.valor,
  )

  const primeiro = ordenados[0]
  if (!primeiro) return null

  return {
    id: primeiro.id,
    nome: primeiro.nome,
    valor: porVolume ? primeiro.vezes : primeiro.valor,
    detalhe: porVolume
      ? `${primeiro.vezes} atendimentos`
      : `${primeiro.vezes} atendimentos`,
  }
}

/** Números que só os procedimentos sabem: duração real e produtos. */
async function indicadoresDeProcedimento(
  procedimentos: { duracaoMinutos: number; produtos: { nome: string; quantidade: number }[] }[],
  lucro: number,
) {
  const duracaoMedia = procedimentos.length > 0
    ? procedimentos.reduce((s, p) => s + p.duracaoMinutos, 0) / procedimentos.length
    : 0

  const porProduto = new Map<string, number>()
  for (const p of procedimentos) {
    for (const item of p.produtos) {
      porProduto.set(item.nome, (porProduto.get(item.nome) ?? 0) + item.quantidade)
    }
  }

  const [vencendo, valorEstoque] = await Promise.all([
    produtosRepo.vencendoEm(30),
    produtosRepo.valorImobilizado(),
  ])

  return {
    duracaoMediaAtendimento: Math.round(duracaoMedia),
    lucroDoMes: lucro,
    produtosMaisUsados: [...porProduto.entries()]
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5),
    produtosVencendo: vencendo.length,
    valorEmEstoque: valorEstoque,
  }
}

/** Retorno médio das clientes, em dias. Consulta mais pesada, à parte. */
export async function calcularRetornoMedio(): Promise<number | null> {
  /*
    Uma leitura da agenda, não sessenta.

    A versão anterior chamava `doCliente` dentro do laço, e `doCliente`
    lê a coleção inteira de agendamentos para filtrar uma cliente. Com
    sessenta clientes ativas, era a agenda inteira percorrida sessenta
    vezes — e, no primeiro acesso depois de qualquer gravação, sessenta
    idas ao banco para responder um único número do painel.

    Agrupar de uma vez dá o mesmo resultado com uma leitura. Também
    some o limite de sessenta, que existia só para o laço não ficar
    insuportável: agora todas as clientes entram na conta, e o número
    passa a valer para o salão inteiro.
  */
  const [clientes, agendamentos] = await Promise.all([
    clientesRepo.listar(),
    agendamentosRepo.listar(),
  ])

  const ativas = new Set(clientes.filter((c) => c.ativo).map((c) => c.id))

  const porCliente = new Map<string, string[]>()
  for (const a of agendamentos) {
    if (a.situacao !== 'concluido') continue
    if (!a.clienteId || !ativas.has(a.clienteId)) continue

    const lista = porCliente.get(a.clienteId)
    if (lista) lista.push(a.inicio)
    else porCliente.set(a.clienteId, [a.inicio])
  }

  const intervalos: number[] = []

  for (const datas of porCliente.values()) {
    if (datas.length < 2) continue
    datas.sort()

    const primeiro = new Date(datas[0]!).getTime()
    const ultimo = new Date(datas[datas.length - 1]!).getTime()

    intervalos.push((ultimo - primeiro) / 86_400_000 / (datas.length - 1))
  }

  if (intervalos.length === 0) return null
  return Math.round(intervalos.reduce((s, i) => s + i, 0) / intervalos.length)
}

/** Série de receita por dia, para o gráfico. */
export async function serieDeReceita(dias = 14, ate = new Date()) {
  return lancamentosRepo.serieDiaria(ate, dias)
}

/** Série semanal, para comparar semanas do mês. */
export async function serieSemanal(ate = new Date()) {
  const semanas: { rotulo: string; valor: number }[] = []

  for (let i = 3; i >= 0; i--) {
    const fim = addDays(ate, -i * 7)
    const inicio = addDays(fim, -6)

    const lancamentos = await lancamentosRepo.noPeriodo(isoData(inicio), isoData(fim))
    semanas.push({
      rotulo: i === 0 ? 'Esta semana' : `${i} sem. atrás`,
      valor: recebidoEm(lancamentos),
    })
  }

  return semanas
}
