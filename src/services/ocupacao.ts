import { agendamentosRepo } from './repositorios/agenda'
import { clientesRepo } from './repositorios/clientes'
import { jornadaRepo, profissionaisRepo, studioRepo } from './repositorios/equipe'
import { estaAtivo } from './agenda/regras'
import { resumoDoCliente } from './atendimento'
import { DIAS_SEMANA, ROTAS } from '@/constants'
import { addDays, faixaDeDias, isoData } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Mapa de ocupação e leituras da agenda.
 *
 * Tudo aqui é derivado do que já existe. Nenhum número é digitado ou
 * guardado à parte — é o que garante que a análise nunca contradiga o
 * painel, mesmo depois de um cancelamento tardio.
 */

export interface FaixaDeOcupacao {
  /** Hora cheia: 9 significa 09:00–09:59. */
  hora: number
  atendimentos: number
  /** Fração da capacidade daquela hora, de 0 a 1. */
  taxa: number
}

export interface DiaDeOcupacao {
  diaSemana: number
  rotulo: string
  atendimentos: number
  taxa: number
}

export interface MapaDeOcupacao {
  porHora: FaixaDeOcupacao[]
  porDiaSemana: DiaDeOcupacao[]
  servicos: { nome: string; vezes: number; total: number }[]
  profissionais: { nome: string; vezes: number; minutos: number; total: number }[]
  taxaGeral: number
  minutosMedios: number
  totalAtendimentos: number
}

/**
 * Levanta o mapa de um período.
 *
 * A taxa compara minutos ocupados com minutos disponíveis de verdade —
 * jornada aberta vezes gente que atende. Dividir por "horas do dia"
 * daria um número menor e bonito que não significa nada: um studio que
 * abre seis horas e fica cheio está a 100%, não a 25%.
 */
export async function mapaDeOcupacao(de: Date, ate: Date): Promise<MapaDeOcupacao> {
  const faixa = faixaDeDias(de, ate)

  const [agendamentos, jornada, equipe] = await Promise.all([
    agendamentosRepo.detalhadosNoPeriodo(faixa.de, faixa.ate),
    jornadaRepo.ler(),
    profissionaisRepo.atendentes(),
  ])

  const ativos = agendamentos.filter(estaAtivo)
  const quantasAtendem = Math.max(equipe.length, 1)

  /* ---- Por hora ---- */
  const porHoraBruto = new Map<number, number>()
  for (const a of ativos) {
    const hora = new Date(a.inicio).getHours()
    porHoraBruto.set(hora, (porHoraBruto.get(hora) ?? 0) + 1)
  }

  const diasNoPeriodo = Math.max(
    Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1,
    1,
  )

  const porHora: FaixaDeOcupacao[] = []
  for (let hora = 6; hora <= 21; hora += 1) {
    const abertoNessaHora = jornada.filter(
      (j) => j.aberto && Number(j.abre.slice(0, 2)) <= hora && Number(j.fecha.slice(0, 2)) > hora,
    ).length

    // Quantos encaixes caberiam nesta hora, no período todo.
    const capacidade = Math.max((abertoNessaHora / 7) * diasNoPeriodo * quantasAtendem, 1)
    const atendimentos = porHoraBruto.get(hora) ?? 0

    porHora.push({ hora, atendimentos, taxa: Math.min(atendimentos / capacidade, 1) })
  }

  /* ---- Por dia da semana ---- */
  const porDiaBruto = new Map<number, number>()
  for (const a of ativos) {
    const dia = new Date(a.inicio).getDay()
    porDiaBruto.set(dia, (porDiaBruto.get(dia) ?? 0) + 1)
  }

  const maiorDia = Math.max(...[...porDiaBruto.values()], 1)

  const porDiaSemana: DiaDeOcupacao[] = DIAS_SEMANA.map((rotulo, diaSemana) => ({
    diaSemana,
    rotulo,
    atendimentos: porDiaBruto.get(diaSemana) ?? 0,
    taxa: (porDiaBruto.get(diaSemana) ?? 0) / maiorDia,
  }))

  /* ---- Serviços e profissionais ---- */
  const servicos = agrupar(ativos, (a) => a.servico?.nome ?? 'Sem serviço')
  const profissionais = agrupar(ativos, (a) => a.profissional?.nome ?? 'Sem profissional')

  /* ---- Taxa geral e tempo médio ---- */
  const minutosOcupados = ativos.reduce((soma, a) => soma + duracaoEm(a), 0)

  const minutosAbertosPorSemana = jornada
    .filter((j) => j.aberto)
    .reduce((soma, j) => soma + minutosEntre(j.abre, j.fecha) - minutosDeAlmoco(j), 0)

  const minutosDisponiveis = Math.max(
    (minutosAbertosPorSemana / 7) * diasNoPeriodo * quantasAtendem,
    1,
  )

  return {
    porHora,
    porDiaSemana,
    servicos: servicos.map(({ nome, vezes, total }) => ({ nome, vezes, total })),
    profissionais,
    taxaGeral: Math.min(minutosOcupados / minutosDisponiveis, 1),
    minutosMedios: ativos.length > 0 ? Math.round(minutosOcupados / ativos.length) : 0,
    totalAtendimentos: ativos.length,
  }
}

/* ------------------------------------------------------------------ */
/* Análises                                                            */
/* ------------------------------------------------------------------ */

export interface Analise {
  /** Ordena a lista: quanto maior, mais cedo aparece. */
  peso: number
  tom: 'oportunidade' | 'atencao' | 'boa'
  texto: string
  destino: string | null
}

/**
 * Lê os dados e diz o que salta aos olhos.
 *
 * Cada análise segue a mesma forma: um fato mensurável e o que fazer
 * com ele. "Terça de tarde está vazia" sozinho é uma reclamação; com a
 * sugestão junto vira uma decisão possível.
 *
 * O que este arquivo evita de propósito é opinar sem número atrás. Um
 * conselho que a proprietária não consegue conferir na própria agenda
 * queima a confiança em todos os outros.
 */
export async function analisarAgenda(): Promise<Analise[]> {
  const hoje = new Date()
  const inicioDoPeriodo = addDays(hoje, -29)

  const [mapa, studio, clientes, proximos] = await Promise.all([
    mapaDeOcupacao(inicioDoPeriodo, hoje),
    studioRepo.ler(),
    clientesRepo.listar(),
    agendamentosRepo.detalhadosNoPeriodo(
      faixaDeDias(hoje, addDays(hoje, 13)).de,
      faixaDeDias(hoje, addDays(hoje, 13)).ate,
    ),
  ])

  const analises: Analise[] = []

  /* ---- Buracos na agenda ---- */
  const vazias = mapa.porHora
    .filter((f) => f.taxa < 0.25 && f.atendimentos >= 0)
    .filter((f) => f.hora >= 9 && f.hora <= 18)

  if (vazias.length > 0 && mapa.totalAtendimentos > 8) {
    const pior = vazias.sort((a, b) => a.taxa - b.taxa)[0]!
    analises.push({
      peso: 70,
      tom: 'oportunidade',
      texto:
        `O horário das ${String(pior.hora).padStart(2, '0')}h é o mais vazio do mês ` +
        `(${pior.atendimentos} atendimento(s) em 30 dias). Uma promoção nessa faixa ` +
        'costuma encher sem tirar cliente de horário cheio.',
      destino: ROTAS.cupons,
    })
  }

  const diaFraco = [...mapa.porDiaSemana]
    .filter((d) => d.atendimentos > 0)
    .sort((a, b) => a.atendimentos - b.atendimentos)[0]

  if (diaFraco && mapa.totalAtendimentos > 12) {
    analises.push({
      peso: 55,
      tom: 'oportunidade',
      texto:
        `${diaFraco.rotulo} é o dia mais parado: ${diaFraco.atendimentos} atendimento(s) ` +
        'no mês. Vale testar um valor promocional ou combinar folga da equipe nele.',
      destino: ROTAS.relatorios,
    })
  }

  /* ---- Dias quase cheios ---- */
  const porDia = new Map<string, AgendamentoDetalhado[]>()
  for (const a of proximos.filter(estaAtivo)) {
    const chave = isoData(new Date(a.inicio))
    porDia.set(chave, [...(porDia.get(chave) ?? []), a])
  }

  const teto = studio?.limiteDiario && studio.limiteDiario > 0 ? studio.limiteDiario : null

  for (const [dia, lista] of porDia) {
    const cheio = teto ? lista.length / teto : lista.length / 10
    if (cheio >= 0.9) {
      analises.push({
        peso: 80,
        tom: 'boa',
        texto:
          `${new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} ` +
          `já está com ${lista.length} atendimento(s) — praticamente cheio. ` +
          'Quem ligar depois vai para a lista de espera.',
        destino: ROTAS.agenda,
      })
      break
    }
  }

  /* ---- Clientes que passaram do próprio ritmo ---- */
  const atrasadas: { nome: string; dias: number; media: number }[] = []

  for (const cliente of clientes.filter((c) => c.ativo).slice(0, 60)) {
    const resumo = await resumoDoCliente(cliente.id)
    if (!resumo.ultimaVisita || !resumo.intervaloMedioDias || resumo.visitas < 3) continue

    const dias = Math.round((Date.now() - new Date(resumo.ultimaVisita).getTime()) / 86_400_000)
    if (dias > resumo.intervaloMedioDias * 1.2) {
      atrasadas.push({ nome: cliente.nome, dias, media: Math.round(resumo.intervaloMedioDias) })
    }
  }

  const maisAtrasada = atrasadas.sort((a, b) => b.dias - a.dias)[0]
  if (maisAtrasada) {
    analises.push({
      peso: 75,
      tom: 'atencao',
      texto:
        `${maisAtrasada.nome} costuma voltar a cada ${maisAtrasada.media} dias e já está há ` +
        `${maisAtrasada.dias} sem atendimento. Um convite de retorno agora ainda pega o hábito dela.`,
      destino: ROTAS.lembretes,
    })
  }

  if (atrasadas.length > 3) {
    analises.push({
      peso: 60,
      tom: 'atencao',
      texto:
        `${atrasadas.length} clientes passaram do próprio intervalo de retorno. ` +
        'Juntas, elas valem mais do que qualquer cliente nova.',
      destino: ROTAS.clientes,
    })
  }

  /* ---- Serviço em alta ---- */
  const anterior = await mapaDeOcupacao(addDays(hoje, -59), addDays(hoje, -30))
  const antes = new Map(anterior.servicos.map((s) => [s.nome, s.vezes]))

  for (const servico of mapa.servicos.slice(0, 4)) {
    const passado = antes.get(servico.nome) ?? 0
    if (passado < 3 || servico.vezes <= passado) continue

    const alta = Math.round(((servico.vezes - passado) / passado) * 100)
    if (alta >= 15) {
      analises.push({
        peso: 65,
        tom: 'boa',
        texto:
          `${servico.nome} cresceu ${alta}% em relação ao mês anterior ` +
          `(${servico.vezes} contra ${passado}), somando ${dinheiro(servico.total)}.`,
        destino: ROTAS.relatorios,
      })
      break
    }
  }

  /* ---- Ocupação geral ---- */
  if (mapa.totalAtendimentos > 10) {
    const porcento = Math.round(mapa.taxaGeral * 100)
    analises.push({
      peso: 40,
      tom: porcento >= 70 ? 'boa' : 'oportunidade',
      texto:
        `Sua agenda ficou ${porcento}% ocupada nos últimos 30 dias, com atendimentos de ` +
        `${mapa.minutosMedios} minutos em média.` +
        (porcento >= 85 ? ' Nesse ritmo, aumentar preço pesa menos do que perder horário.' : ''),
      destino: ROTAS.relatorios,
    })
  }

  return analises.sort((a, b) => b.peso - a.peso)
}

/* ------------------------------------------------------------------ */

function agrupar(
  agendamentos: AgendamentoDetalhado[],
  chave: (a: AgendamentoDetalhado) => string,
) {
  const mapa = new Map<string, { nome: string; vezes: number; minutos: number; total: number }>()

  for (const a of agendamentos) {
    const nome = chave(a)
    const atual = mapa.get(nome) ?? { nome, vezes: 0, minutos: 0, total: 0 }
    atual.vezes += 1
    atual.minutos += duracaoEm(a)
    atual.total += a.preco - a.desconto
    mapa.set(nome, atual)
  }

  return [...mapa.values()].sort((a, b) => b.vezes - a.vezes)
}

const duracaoEm = (a: { inicio: string; fim: string }) =>
  Math.max((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60_000, 0)

const minutosEntre = (de: string, ate: string) => {
  const [h1, m1] = de.split(':').map(Number)
  const [h2, m2] = ate.split(':').map(Number)
  return Math.max((h2 ?? 0) * 60 + (m2 ?? 0) - ((h1 ?? 0) * 60 + (m1 ?? 0)), 0)
}

const minutosDeAlmoco = (j: { almocoInicio: string | null; almocoFim: string | null }) =>
  j.almocoInicio && j.almocoFim ? minutosEntre(j.almocoInicio, j.almocoFim) : 0
