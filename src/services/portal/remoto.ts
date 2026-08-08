import { chamarPortal, temSupabase } from '../supabase/cliente'
import { gradeDeHorarios } from '../agenda/horarios'
import { PORTAL } from '@/constants'
import type {
  Agendamento, AgendamentoDetalhado, Bloqueio, DadosDoPortal, JornadaDia,
  OpcaoDeHorario, Profissional, ReservaTemporaria, Servico, Studio,
} from '@/types'

/**
 * O portal falando com o banco.
 *
 * Aqui está a consequência prática do RLS: a visitante do link **não
 * está autenticada**, e `anon` não enxerga tabela alguma. Se o portal
 * lesse `agendamentos` direto, receberia erro de permissão — e é bom
 * que receba, porque ler aquela tabela entregaria nome de cliente,
 * serviço e preço de todo mundo para quem abriu o link.
 *
 * Então o portal fala por funções estreitas (`supabase/03-portal.sql`),
 * que devolvem só o recorte necessário. A mais importante é
 * `portal_ocupacao`: ela responde "das 14h às 16h está ocupado" sem
 * dizer com quem nem para quê.
 *
 * O motor de horários continua sendo o mesmo do painel. Muda a origem
 * dos dados, não a regra — que é a razão de `gradeDeHorarios` receber
 * tudo por parâmetro em vez de buscar por conta própria.
 */

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export async function carregarPortalRemoto(
  identificador?: string,
): Promise<DadosDoPortal | null> {
  const [studio] = await chamarPortal<Studio[]>('portal_studio', {
    p_identificador: identificador ?? null,
  })
  if (!studio) return null

  const [servicos, profissionais] = await Promise.all([
    chamarPortal<Servico[]>('portal_servicos'),
    chamarPortal<Profissional[]>('portal_profissionais'),
  ])

  return {
    studio: normalizarStudio(studio),
    servicos: servicos.map(normalizarServico),
    profissionais: profissionais.map((p) => ({
      ...p, papel: 'profissional', atende: true, ativo: true,
      criadoEm: '', atualizadoEm: '',
    })) as Profissional[],
  }
}

/** Faixa ocupada do dia, sem dizer quem ocupa nem por quê. */
interface FaixaOcupada {
  profissional_id: string
  inicio: string
  fim: string
  tipo: 'atendimento' | 'bloqueio' | 'reserva'
}

export async function gradeRemota(
  data: Date,
  servico: Servico,
  profissionais: Profissional[],
  profissionalId: string | null,
  studio: Studio,
  visitanteId: string,
): Promise<OpcaoDeHorario[]> {
  const dia = new Date(data)
  dia.setHours(0, 0, 0, 0)
  const seguinte = new Date(dia.getTime() + 86_400_000)

  const [jornadaBruta, ocupacao] = await Promise.all([
    chamarPortal<JornadaDia[]>('portal_jornada'),
    chamarPortal<FaixaOcupada[]>('portal_ocupacao', {
      p_de: dia.toISOString(), p_ate: seguinte.toISOString(),
    }),
  ])

  const jornada = jornadaBruta
    .map(normalizarJornada)
    .find((j) => j.diaSemana === dia.getDay() && j.aberto) ?? null

  /*
    As três origens voltam no mesmo formato e aqui viram de volta as
    formas que o motor conhece. A tradução é boba de propósito: o motor
    não precisa distinguir bloqueio de reserva — para ele tudo é tempo
    que não está livre —, e dar essa distinção a ele só criaria caminhos
    a mais para errar.

    A reserva da própria visitante não é devolvida como reserva alheia
    porque o banco não sabe quem está perguntando. Ela é filtrada
    depois, pelo `visitanteId`, do mesmo jeito que no modo local.
  */
  const agendamentos: Agendamento[] = ocupacao
    .filter((f) => f.tipo === 'atendimento')
    .map((f) => faixaComoAgendamento(f))

  const bloqueios: Bloqueio[] = ocupacao
    .filter((f) => f.tipo === 'bloqueio')
    .map((f) => ({
      id: '', criadoEm: '', atualizadoEm: '',
      profissionalId: f.profissional_id === '*' ? null : f.profissional_id,
      tipo: 'bloqueio', motivo: null, inicio: f.inicio, fim: f.fim,
    }))

  const reservas: ReservaTemporaria[] = ocupacao
    .filter((f) => f.tipo === 'reserva')
    .map((f) => ({
      id: '', criadoEm: '', atualizadoEm: '',
      servicoId: '', profissionalId: f.profissional_id,
      inicio: f.inicio, fim: f.fim,
      // O banco já filtrou o que venceu; o motor confere de novo pela
      // sua própria régua, então a validade precisa ser futura.
      expiraEm: new Date(Date.now() + 60_000).toISOString(),
      visitanteId: 'outra-pessoa', situacao: 'ativa', agendamentoId: null,
    }))

  return gradeDeHorarios({
    data: dia, servico, profissionais, profissionalId, jornada,
    bloqueios, agendamentos, reservas, visitanteId, studio,
  })
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

export async function reservarRemoto(
  servicoId: string, profissionalId: string, inicio: string, visitanteId: string,
): Promise<ReservaTemporaria> {
  const bruta = await chamarPortal<Record<string, string>>('portal_reservar', {
    p_servico_id: servicoId,
    p_profissional_id: profissionalId,
    p_inicio: inicio,
    p_visitante_id: visitanteId,
  })
  return normalizar<ReservaTemporaria>(bruta)
}

export async function liberarRemoto(visitanteId: string): Promise<void> {
  await chamarPortal('portal_liberar', { p_visitante_id: visitanteId })
}

export async function agendarRemoto(dados: {
  reservaId: string
  visitanteId: string
  nome: string
  telefone: string
  observacao: string
}): Promise<Agendamento> {
  const [bruto] = await chamarPortal<Record<string, string>[]>('portal_agendar', {
    p_reserva_id: dados.reservaId,
    p_visitante_id: dados.visitanteId,
    p_nome: dados.nome,
    p_telefone: dados.telefone,
    p_observacao: dados.observacao,
  })
  if (!bruto) throw new Error('Não foi possível confirmar. Tente novamente.')
  return normalizar<Agendamento>(bruto)
}

export async function consultarRemoto(
  protocolo: string, telefone: string,
): Promise<AgendamentoDetalhado | null> {
  const [bruto] = await chamarPortal<Record<string, string>[]>('portal_consultar', {
    p_protocolo: protocolo, p_telefone: telefone,
  })
  if (!bruto) return null

  const base = normalizar<AgendamentoDetalhado>(bruto)

  // A função devolve os nomes já resolvidos, não os registros inteiros:
  // a cliente precisa ler "Escova com a Carol", não a ficha da Carol.
  return {
    ...base,
    servico: bruto.servico ? ({ nome: bruto.servico } as never) : null,
    profissional: bruto.profissional ? ({ nome: bruto.profissional } as never) : null,
    cliente: null,
    nomeAvulso: bruto.cliente ?? null,
  }
}

export async function solicitarRemoto(
  protocolo: string, telefone: string, tipo: string, mensagem: string,
): Promise<void> {
  await chamarPortal('portal_solicitar', {
    p_protocolo: protocolo, p_telefone: telefone,
    p_tipo: tipo, p_mensagem: mensagem,
  })
}

export async function entrarNaFilaRemoto(dados: {
  nome: string; telefone: string; servicoId: string
  profissionalId: string | null; data: string | null
  periodo: string; observacao: string | null
}): Promise<void> {
  await chamarPortal('portal_entrar_na_fila', {
    p_nome: dados.nome, p_telefone: dados.telefone,
    p_servico_id: dados.servicoId, p_profissional_id: dados.profissionalId,
    p_data: dados.data, p_periodo: dados.periodo, p_observacao: dados.observacao,
  })
}

export async function chegueiRemoto(
  protocolo: string, telefone: string,
): Promise<string | null> {
  /*
    Devolve o `chegou_em` gravado pelo servidor.

    A tela usava `new Date()` do próprio aparelho para mostrar o
    horário da chegada. Um celular com relógio adiantado registrava a
    cliente chegando às 15h20 quando o banco anotou 15h05 — e a
    recepção, olhando a agenda, via a hora do banco. Duas telas, dois
    horários, e nenhuma forma de saber qual era o certo.

    Só existe uma autoridade sobre "que horas são": o servidor.
  */
  return chamarPortal<string | null>('portal_cheguei', {
    p_protocolo: protocolo,
    p_telefone: telefone,
  })
}

/**
 * A faxina que, sem banco, cabe à tela aberta fazer.
 *
 * `portal_faxina` e não `limpar_reservas`: a segunda também APAGA
 * linhas antigas, e uma função que apaga não fica ao alcance da chave
 * pública. Esta só marca como vencido o que já venceu — chamada mil
 * vezes, mil vezes não acontece nada.
 */
export async function varrerRemoto(): Promise<number> {
  return chamarPortal<number>('portal_faxina')
}

/** O portal está falando com o banco ou com o navegador? */
export const portalRemoto = (): boolean => temSupabase()

/* ------------------------------------------------------------------ */
/* Tradução                                                            */
/* ------------------------------------------------------------------ */

function normalizar<T>(linha: Record<string, unknown>): T {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    saida[chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase())] = valor
  }
  return saida as T
}

const normalizarStudio = (bruto: Studio): Studio => ({
  ...normalizar<Studio>(bruto as unknown as Record<string, unknown>),
  reservaMinutos:
    (bruto as unknown as Record<string, number>).reserva_minutos ??
    PORTAL.reservaMinutosPadrao,
})

const normalizarServico = (bruto: Servico): Servico => ({
  ...normalizar<Servico>(bruto as unknown as Record<string, unknown>),
  ativo: true, noLinkPublico: true, categoriaId: null,
  criadoEm: '', atualizadoEm: '',
})

const normalizarJornada = (bruto: JornadaDia): JornadaDia =>
  normalizar<JornadaDia>(bruto as unknown as Record<string, unknown>)

const faixaComoAgendamento = (f: FaixaOcupada): Agendamento =>
  ({
    id: '', criadoEm: '', atualizadoEm: '',
    clienteId: null, profissionalId: f.profissional_id,
    servicoId: '', inicio: f.inicio, fim: f.fim,
    situacao: 'confirmado', preco: 0, desconto: 0, observacao: null,
    origem: 'link', nomeAvulso: null, telefoneAvulso: null, cupomId: null,
    protocolo: '', situacaoAnterior: null, iniciadoEm: null,
    finalizadoEm: null, chegouEm: null, remarcacoes: [],
  }) as Agendamento
