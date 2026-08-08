import { sobrepoe, estaAtivo, reservaValida } from './regras'
import { SO_BLOQUEIA_O_PORTAL } from '@/constants'
import type {
  Agendamento, Bloqueio, JornadaDia, OpcaoDeHorario, Profissional,
  ReservaTemporaria, Servico, Studio,
} from '@/types'

/**
 * Motor de horários livres.
 *
 * Recebe tudo o que precisa por parâmetro — não busca nada por conta
 * própria. Isso deixa a função pura, fácil de testar e independente de
 * onde os dados moram. É a mesma função que alimenta a agenda interna e
 * o portal da cliente: se fossem duas, um dia divergiriam, e o dia em
 * que divergissem seria o dia de duas clientes no mesmo horário.
 *
 * Leva em conta, nesta ordem:
 *   jornada do dia · almoço · bloqueios · atendimentos já marcados ·
 *   reservas temporárias de outras clientes · antecedência mínima ·
 *   duração real do serviço · quem sabe fazer o serviço ·
 *   teto de atendimentos simultâneos
 */

export interface EntradaGrade {
  data: Date
  servico: Servico
  /** Quem pode atender. Já filtrada por quem atende de verdade. */
  profissionais: Profissional[]
  /** null = qualquer profissional serve. */
  profissionalId: string | null
  jornada: JornadaDia | null
  bloqueios: Bloqueio[]
  agendamentos: Agendamento[]
  /** Reservas de poucos minutos em andamento no portal. */
  reservas?: ReservaTemporaria[]
  /** A reserva da própria visitante não pode bloquear o horário dela. */
  visitanteId?: string | null
  studio: Pick<
    Studio,
    'antecedenciaMinutos' | 'intervaloMinutos' | 'atendimentosSimultaneos' | 'limiteDiario'
  >
  /** Ignora este agendamento no cálculo. Usado ao remarcar. */
  ignorarAgendamentoId?: string
  /**
   * Estamos calculando para o portal?
   *
   * Muda duas coisas: os horários guardados para encaixe somem, e o
   * teto diário passa a valer. Pelo painel a proprietária continua
   * podendo furar os próprios limites — eles existem para conter a
   * agenda pública, não para amarrar quem toca o studio.
   */
  paraOPortal?: boolean
}

/**
 * A grade completa: cada horário possível com quem está livre nele.
 *
 * Devolver a lista de profissionais junto — em vez de só o horário — é
 * o que permite oferecer "qualquer profissional" sem escolher cedo
 * demais. A escolha só acontece na confirmação, com a informação toda.
 */
export function gradeDeHorarios(entrada: EntradaGrade): OpcaoDeHorario[] {
  const {
    data, servico, profissionais, profissionalId, jornada, bloqueios,
    agendamentos, reservas = [], visitanteId = null, studio, ignorarAgendamentoId,
    paraOPortal = false,
  } = entrada

  if (!jornada?.aberto) return []

  const candidatas = profissionaisDoServico(servico, profissionais, profissionalId)
  if (candidatas.length === 0) return []

  const ocupacao = servico.duracaoMinutos + servico.intervaloMinutos
  const passo = studio.intervaloMinutos || 15
  const limiteMinimo = new Date(Date.now() + studio.antecedenciaMinutos * 60_000)
  const teto = studio.atendimentosSimultaneos > 0 ? studio.atendimentosSimultaneos : Infinity

  const base = new Date(data)
  base.setHours(0, 0, 0, 0)

  const abertura = comHora(base, jornada.abre)
  const fechamento = comHora(base, jornada.fecha)
  const almoco =
    jornada.almocoInicio && jornada.almocoFim
      ? { inicio: comHora(base, jornada.almocoInicio), fim: comHora(base, jornada.almocoFim) }
      : null

  // Só o que importa para este dia — a comparação fica muito mais barata
  // dentro do laço.
  const ocupados = agendamentos.filter((a) => estaAtivo(a) && a.id !== ignorarAgendamentoId)
  const presos = reservas.filter((r) => reservaValida(r) && r.visitanteId !== visitanteId)

  // Encaixe é bloqueio só para quem vem de fora.
  const impedimentos = paraOPortal
    ? bloqueios
    : bloqueios.filter((b) => !SO_BLOQUEIA_O_PORTAL.includes(b.tipo))

  // O teto do dia se esgota antes de qualquer horário aparecer.
  if (paraOPortal && studio.limiteDiario > 0 && ocupados.length >= studio.limiteDiario) return []

  const opcoes: OpcaoDeHorario[] = []
  const cursor = new Date(abertura)

  while (true) {
    const fim = new Date(cursor.getTime() + ocupacao * 60_000)
    if (fim > fechamento) break

    const cabeNoDia =
      cursor >= limiteMinimo && !(almoco && sobrepoe(cursor, fim, almoco.inicio, almoco.fim))

    if (cabeNoDia) {
      // Quantas cadeiras já estão tomadas nesta faixa, contando toda a
      // equipe: o teto é do studio, não de cada profissional.
      const simultaneos =
        ocupados.filter((a) => sobrepoe(cursor, fim, a.inicio, a.fim)).length +
        presos.filter((r) => sobrepoe(cursor, fim, r.inicio, r.fim)).length

      if (simultaneos < teto) {
        const livres = candidatas
          .filter((quem) => estaLivre(quem.id, cursor, fim, impedimentos, ocupados, presos))
          .map((quem) => quem.id)

        if (livres.length > 0) {
          opcoes.push({ inicio: new Date(cursor), fim: new Date(fim), profissionaisLivres: livres })
        }
      }
    }

    cursor.setMinutes(cursor.getMinutes() + passo)
  }

  return opcoes
}

/**
 * Horários livres de uma profissional específica.
 *
 * Assinatura preservada: a agenda interna trabalha sempre com uma
 * profissional escolhida e não precisa da grade completa.
 */
export interface EntradaHorarios {
  data: Date
  servico: Servico
  profissionalId: string
  jornada: JornadaDia | null
  bloqueios: Bloqueio[]
  agendamentos: Agendamento[]
  reservas?: ReservaTemporaria[]
  studio: Pick<
    Studio,
    'antecedenciaMinutos' | 'intervaloMinutos' | 'atendimentosSimultaneos' | 'limiteDiario'
  >
  ignorarAgendamentoId?: string
}

export function horariosLivres(entrada: EntradaHorarios): Date[] {
  // A grade precisa de uma profissional para conferir; aqui já sabemos
  // qual é, então basta descrevê-la no formato que ela espera.
  const escolhida: Profissional = {
    id: entrada.profissionalId,
    nome: '', papel: 'profissional', cor: '', atende: true, ativo: true,
    criadoEm: '', atualizadoEm: '',
  }

  return gradeDeHorarios({
    ...entrada,
    profissionais: [escolhida],
    profissionalId: entrada.profissionalId,
  }).map((opcao) => opcao.inicio)
}

/* ------------------------------------------------------------------ */
/* Apoio                                                               */
/* ------------------------------------------------------------------ */

/**
 * Quem pode atender este serviço.
 *
 * Serviço sem lista de profissionais vale para toda a equipe — é o
 * padrão sensato para quem cadastra rápido e não quer preencher nada.
 */
export function profissionaisDoServico(
  servico: Servico,
  profissionais: Profissional[],
  escolhida: string | null = null,
): Profissional[] {
  const habilitadas =
    servico.profissionaisIds.length > 0
      ? profissionais.filter((p) => servico.profissionaisIds.includes(p.id))
      : profissionais

  return escolhida ? habilitadas.filter((p) => p.id === escolhida) : habilitadas
}

function estaLivre(
  profissionalId: string,
  inicio: Date,
  fim: Date,
  bloqueios: Bloqueio[],
  agendamentos: Agendamento[],
  reservas: ReservaTemporaria[],
): boolean {
  const impedida = bloqueios.some(
    (b) =>
      (b.profissionalId === null || b.profissionalId === profissionalId) &&
      sobrepoe(inicio, fim, b.inicio, b.fim),
  )
  if (impedida) return false

  const ocupada = agendamentos.some(
    (a) => a.profissionalId === profissionalId && sobrepoe(inicio, fim, a.inicio, a.fim),
  )
  if (ocupada) return false

  return !reservas.some(
    (r) => r.profissionalId === profissionalId && sobrepoe(inicio, fim, r.inicio, r.fim),
  )
}

/** "09:30" aplicado a uma data vira um Date completo. */
function comHora(data: Date, hora: string): Date {
  const [h, m] = hora.split(':').map(Number)
  const saida = new Date(data)
  saida.setHours(h ?? 0, m ?? 0, 0, 0)
  return saida
}
