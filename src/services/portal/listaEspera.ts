import { listaEsperaRepo } from '../repositorios/portal'
import { agendamentosRepo } from '../repositorios/agenda'
import { servicosRepo } from '../repositorios/servicos'
import { profissionaisRepo, studioRepo } from '../repositorios/equipe'
import { clientesRepo } from '../repositorios/clientes'
import { lembretesRepo } from '../repositorios/comunicacao'
import { modelosRepo, preencher } from '../comunicacao/modelos'
import { entrarNaFilaRemoto, portalRemoto } from './remoto'
import { FAIXAS_DO_DIA, PORTAL } from '@/constants'
import { isoData } from '@/utils/datas'
import { digitos } from '@/utils/formato'
import { ErroDeRegra } from '@/utils/erros'
import type {
  Agendamento, EntradaListaEspera, EsperaDetalhada, PeriodoDoDia,
} from '@/types'

/**
 * Lista de espera.
 *
 * Um horário cancelado é receita que evapora. A lista existe para que
 * ele não evapore: quando uma vaga abre, o sistema já sabe quem a quer.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * 1. A entrada guarda **intenção** — serviço, dia desejado, período —
 *    e nunca um horário. Guardar horário criaria uma segunda agenda,
 *    com todos os problemas que uma segunda agenda tem.
 *
 * 2. Avisar é sempre decisão da proprietária. Disparar mensagem sozinho
 *    no instante do cancelamento entregaria a vaga antes de ela decidir
 *    se quer preenchê-la — às vezes o cancelamento é o respiro do dia.
 */

export interface NovaEspera {
  clienteId?: string | null
  nome: string
  telefone: string
  servicoId: string
  profissionalId?: string | null
  data?: string | null
  periodo?: PeriodoDoDia
  observacao?: string | null
}

export async function entrarNaFila(dados: NovaEspera): Promise<EntradaListaEspera> {
  const telefone = digitos(dados.telefone)
  if (telefone.length < 10) throw new ErroDeRegra('Informe um telefone com DDD.')

  const data = dados.data ?? null

  if (portalRemoto()) {
    await entrarNaFilaRemoto({
      nome: dados.nome, telefone, servicoId: dados.servicoId,
      profissionalId: dados.profissionalId ?? null, data,
      periodo: dados.periodo ?? 'qualquer', observacao: dados.observacao ?? null,
    })
    return {
      id: '', criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
      clienteId: null, nome: dados.nome.trim(), telefone,
      servicoId: dados.servicoId, profissionalId: dados.profissionalId ?? null,
      data, periodo: dados.periodo ?? 'qualquer',
      observacao: dados.observacao ?? null, situacao: 'aguardando',
      avisadaEm: null, vagaInicio: null,
    }
  }

  if (await listaEsperaRepo.jaEstaNaFila(telefone, dados.servicoId, data)) {
    throw new ErroDeRegra('Você já está na lista de espera para este serviço. Avisamos assim que abrir vaga.')
  }

  return listaEsperaRepo.criar({
    clienteId: dados.clienteId ?? null,
    nome: dados.nome.trim(),
    telefone,
    servicoId: dados.servicoId,
    profissionalId: dados.profissionalId ?? null,
    data,
    periodo: dados.periodo ?? 'qualquer',
    observacao: dados.observacao?.trim() || null,
    situacao: 'aguardando',
    avisadaEm: null,
    vagaInicio: null,
  })
}

/* ------------------------------------------------------------------ */
/* Casar vaga com quem espera                                          */
/* ------------------------------------------------------------------ */

export interface Vaga {
  inicio: string
  fim: string
  servicoId: string
  profissionalId: string
}

/** A vaga serve para esta pessoa? */
export function combina(entrada: EntradaListaEspera, vaga: Vaga): boolean {
  if (entrada.situacao !== 'aguardando') return false
  if (entrada.servicoId !== vaga.servicoId) return false

  if (entrada.profissionalId && entrada.profissionalId !== vaga.profissionalId) return false

  const quando = new Date(vaga.inicio)
  if (entrada.data && entrada.data !== isoData(quando)) return false

  const faixa = FAIXAS_DO_DIA[entrada.periodo]
  const horaDaVaga = quando.getHours()

  return horaDaVaga >= faixa.de && horaDaVaga < faixa.ate
}

/**
 * Quem está esperando por esta vaga, na ordem de chegada.
 *
 * A ordem é o contrato com a cliente: quem entrou primeiro é avisada
 * primeiro. Ordenar por qualquer outro critério seria furar a fila sem
 * ninguém perceber.
 */
export async function interessadasNaVaga(vaga: Vaga): Promise<EntradaListaEspera[]> {
  const fila = await listaEsperaRepo.aguardando()
  return fila.filter((entrada) => combina(entrada, vaga))
}

/** A vaga que um agendamento cancelado deixou para trás. */
export function vagaDoAgendamento(agendamento: Agendamento): Vaga {
  return {
    inicio: agendamento.inicio,
    fim: agendamento.fim,
    servicoId: agendamento.servicoId,
    profissionalId: agendamento.profissionalId,
  }
}

/** Quantas pessoas um cancelamento acabou de interessar. */
export async function interessadasEm(agendamentoId: string): Promise<EntradaListaEspera[]> {
  const agendamento = await agendamentosRepo.buscar(agendamentoId)
  if (!agendamento) return []
  return interessadasNaVaga(vagaDoAgendamento(agendamento))
}

/* ------------------------------------------------------------------ */
/* Aviso                                                               */
/* ------------------------------------------------------------------ */

export interface ResultadoDoAviso {
  avisadas: number
  semTelefone: number
}

/**
 * Avisa quem espera que a vaga abriu.
 *
 * A mensagem entra na mesma fila de lembretes do resto do sistema —
 * um segundo caminho de envio significaria um segundo lugar para
 * consertar quando a API do WhatsApp entrar.
 *
 * Todas são avisadas ao mesmo tempo, e a primeira que confirmar fica
 * com a vaga. Avisar uma por vez seria mais justo no papel e perderia a
 * vaga na prática: ninguém responde WhatsApp em dez minutos garantidos.
 */
export async function avisarInteressadas(
  vaga: Vaga, entradas?: EntradaListaEspera[],
): Promise<ResultadoDoAviso> {
  const fila = entradas ?? (await interessadasNaVaga(vaga))
  const alvos = fila.slice(0, PORTAL.esperaMaximoAvisos)

  const [servico, profissional, studio, modelo] = await Promise.all([
    servicosRepo.buscar(vaga.servicoId),
    profissionaisRepo.buscar(vaga.profissionalId),
    studioRepo.ler(),
    modelosRepo.porChave('vaga_disponivel'),
  ])

  const resultado: ResultadoDoAviso = { avisadas: 0, semTelefone: 0 }
  if (!modelo) return resultado

  const agora = new Date().toISOString()

  for (const entrada of alvos) {
    if (!entrada.telefone) {
      resultado.semTelefone += 1
      continue
    }

    await lembretesRepo.criar({
      tipo: 'vaga_disponivel',
      canal: modelo.canal,
      situacao: 'agendado',
      agendamentoId: null,
      clienteId: entrada.clienteId,
      destinatario: entrada.telefone,
      nomeDestinatario: entrada.nome,
      agendadoPara: agora,
      enviadoEm: null,
      tentativas: 0,
      ultimoErro: null,
      mensagem: preencher(modelo.corpo, {
        cliente: entrada.nome,
        servico: servico?.nome,
        profissional: profissional?.nome,
        inicio: vaga.inicio,
        studio: studio?.nome,
        endereco: studio?.endereco,
        telefone: studio?.telefone,
        linkPortal: studio ? `/agendar/${studio.identificador}` : null,
      }),
    })

    await listaEsperaRepo.atualizar(entrada.id, {
      situacao: 'avisada',
      avisadaEm: agora,
      vagaInicio: vaga.inicio,
    })

    resultado.avisadas += 1
  }

  return resultado
}

/** Atalho: avisa a partir do agendamento que acabou de ser cancelado. */
export async function avisarSobreCancelamento(agendamentoId: string): Promise<ResultadoDoAviso> {
  const agendamento = await agendamentosRepo.buscar(agendamentoId)
  if (!agendamento) return { avisadas: 0, semTelefone: 0 }

  const vaga = vagaDoAgendamento(agendamento)
  return avisarInteressadas(vaga)
}

/* ------------------------------------------------------------------ */
/* Fechamento                                                          */
/* ------------------------------------------------------------------ */

/** Alguém pegou a vaga: sai da fila e as demais voltam a aguardar. */
export async function marcarAtendida(entradaId: string): Promise<void> {
  const entrada = await listaEsperaRepo.buscar(entradaId)
  if (!entrada) return

  await listaEsperaRepo.atualizar(entradaId, { situacao: 'atendida' })

  // As outras avisadas pela mesma vaga voltam para a fila — a vaga
  // acabou, mas a vontade delas de serem atendidas não.
  const avisadas = await listaEsperaRepo.porSituacao('avisada')
  const mesmaVaga = avisadas.filter(
    (e) => e.id !== entradaId && e.vagaInicio === entrada.vagaInicio,
  )

  for (const outra of mesmaVaga) {
    await listaEsperaRepo.atualizar(outra.id, {
      situacao: 'aguardando', avisadaEm: null, vagaInicio: null,
    })
  }
}

export async function sairDaFila(entradaId: string): Promise<void> {
  await listaEsperaRepo.atualizar(entradaId, { situacao: 'cancelada' })
}

/** Devolve à fila quem foi avisada e não respondeu no prazo. */
export async function expirarAvisos(): Promise<number> {
  return listaEsperaRepo.expirarAvisos(PORTAL.esperaHorasParaResponder)
}

/* ------------------------------------------------------------------ */

/** Junta serviço e profissional a cada entrada, para a tela mostrar. */
export async function detalharFila(
  entradas: EntradaListaEspera[],
): Promise<EsperaDetalhada[]> {
  if (entradas.length === 0) return []

  const [servicos, profissionais] = await Promise.all([
    servicosRepo.listar(),
    profissionaisRepo.listar(),
  ])

  const mapaServicos = new Map(servicos.map((s) => [s.id, s]))
  const mapaProfissionais = new Map(profissionais.map((p) => [p.id, p]))

  return entradas.map((entrada) => ({
    ...entrada,
    servico: mapaServicos.get(entrada.servicoId) ?? null,
    profissional: entrada.profissionalId
      ? mapaProfissionais.get(entrada.profissionalId) ?? null
      : null,
  }))
}

export async function filaDetalhada(): Promise<EsperaDetalhada[]> {
  return detalharFila(await listaEsperaRepo.aguardando())
}

export async function avisadasDetalhadas(): Promise<EsperaDetalhada[]> {
  return detalharFila(await listaEsperaRepo.porSituacao('avisada'))
}

/** Cria a ficha da cliente se ela ainda não existir. Usado ao entrar na fila. */
export async function vincularCliente(entrada: EntradaListaEspera): Promise<string | null> {
  if (entrada.clienteId) return entrada.clienteId

  const existente = await clientesRepo.porTelefone(entrada.telefone)
  if (!existente) return null

  await listaEsperaRepo.atualizar(entrada.id, { clienteId: existente.id })
  return existente.id
}
