import type { Registro } from './entidades'

/**
 * Entidades do Portal de Agendamento.
 *
 * Três formas novas — e só três. A agenda continua sendo a mesma:
 * agendamento, serviço, bloqueio e jornada não ganharam paralelo aqui.
 * O que o portal acrescenta é o que existe *em volta* da marcação:
 *
 *   ReservaTemporaria  → o horário que a cliente está preenchendo agora
 *   SolicitacaoDaCliente → o pedido de mudança que a proprietária decide
 *   EntradaListaEspera → quem quer a vaga se alguém desmarcar
 *
 * Nenhuma delas guarda horário de atendimento. Se guardassem, existiriam
 * duas agendas — e duas agendas divergem no primeiro conflito.
 */

/* ------------------------------------------------------------------ */
/* Reserva temporária                                                  */
/* ------------------------------------------------------------------ */

export type SituacaoReserva = 'ativa' | 'concluida' | 'expirada' | 'liberada'

/**
 * O horário fica preso enquanto a cliente preenche os dados.
 *
 * Sem isso, duas clientes que abriram o link ao mesmo tempo escolhem as
 * 14:00 juntas e a segunda só descobre o conflito ao confirmar — depois
 * de digitar nome e telefone. A reserva move a frustração para antes do
 * esforço.
 */
export interface ReservaTemporaria extends Registro {
  servicoId: string
  profissionalId: string
  inicio: string
  fim: string
  /** Depois deste instante a reserva não vale mais, mesmo sem ninguém liberar. */
  expiraEm: string
  /** Identifica o navegador da cliente: ela pode retomar e soltar a própria reserva. */
  visitanteId: string
  situacao: SituacaoReserva
  /** Preenchido quando a reserva vira agendamento de verdade. */
  agendamentoId: string | null
}

/* ------------------------------------------------------------------ */
/* Solicitações da cliente                                             */
/* ------------------------------------------------------------------ */

export type TipoSolicitacao = 'alteracao' | 'cancelamento'

export type SituacaoSolicitacao = 'aberta' | 'aprovada' | 'recusada'

/**
 * Pedido de mudança feito pelo portal.
 *
 * A cliente nunca move nem apaga um horário — ela pede. Quem decide é a
 * proprietária, e a decisão fica registrada: sem isso, "eu avisei que ia
 * desmarcar" vira palavra contra palavra.
 */
export interface SolicitacaoDaCliente extends Registro {
  agendamentoId: string
  tipo: TipoSolicitacao
  situacao: SituacaoSolicitacao
  /** O que a cliente escreveu ao pedir. */
  mensagem: string | null
  /** Horário que ela preferiria, quando o pedido é de alteração. */
  preferenciaInicio: string | null
  respondidaEm: string | null
  respondidaPor: string | null
  resposta: string | null
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

export type SituacaoEspera = 'aguardando' | 'avisada' | 'atendida' | 'expirada' | 'cancelada'

export type PeriodoDoDia = 'manha' | 'tarde' | 'qualquer'

/**
 * Quem quer entrar se abrir vaga.
 *
 * Guarda a *intenção* (serviço, dia desejado, período), não um horário.
 * Quando uma vaga surge, o sistema cruza a intenção com a vaga real.
 */
export interface EntradaListaEspera extends Registro {
  clienteId: string | null
  nome: string
  telefone: string
  servicoId: string
  /** null = qualquer profissional serve. */
  profissionalId: string | null
  /** Dia desejado (yyyy-MM-dd). null = qualquer dia. */
  data: string | null
  periodo: PeriodoDoDia
  observacao: string | null
  situacao: SituacaoEspera
  avisadaEm: string | null
  /** Vaga oferecida no aviso, para conferir depois quem pegou. */
  vagaInicio: string | null
}

/* ------------------------------------------------------------------ */
/* Formas de leitura usadas pelas telas                                */
/* ------------------------------------------------------------------ */

/** Uma opção de horário na grade do portal. */
export interface OpcaoDeHorario {
  inicio: Date
  fim: Date
  /** Quem está livre neste horário. A cliente escolhe, ou o sistema sorteia. */
  profissionaisLivres: string[]
}

/** Tudo que o portal precisa carregar de uma vez para abrir. */
export interface DadosDoPortal {
  studio: import('./entidades').Studio
  servicos: import('./entidades').Servico[]
  profissionais: import('./entidades').Profissional[]
}

/** Solicitação já com o agendamento e a cliente resolvidos. */
export interface SolicitacaoDetalhada extends SolicitacaoDaCliente {
  agendamento: import('./entidades').AgendamentoDetalhado | null
}

/** Entrada da lista de espera com serviço e profissional resolvidos. */
export interface EsperaDetalhada extends EntradaListaEspera {
  servico: import('./entidades').Servico | null
  profissional: import('./entidades').Profissional | null
}

export const ROTULO_PERIODO: Record<PeriodoDoDia, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  qualquer: 'Qualquer horário',
}

export const ROTULO_SOLICITACAO: Record<TipoSolicitacao, string> = {
  alteracao: 'Alteração de horário',
  cancelamento: 'Cancelamento',
}

export const ROTULO_ESPERA: Record<SituacaoEspera, string> = {
  aguardando: 'Aguardando',
  avisada: 'Avisada',
  atendida: 'Conseguiu vaga',
  expirada: 'Expirou',
  cancelada: 'Cancelada',
}
