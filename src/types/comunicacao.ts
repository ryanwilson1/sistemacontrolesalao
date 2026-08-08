import type { Registro } from './entidades'

/**
 * Lembretes, notificações e modelos de mensagem.
 *
 * Nada é enviado ainda: a fila existe e é processada, mas o canal de
 * saída é simulado. Quando a API do WhatsApp entrar, só o adaptador de
 * envio muda — fila, modelos e agendamento continuam iguais.
 */

export type CanalMensagem = 'whatsapp' | 'sms' | 'email' | 'interno'

export type TipoLembrete =
  | 'confirmacao' | 'lembrete_24h' | 'lembrete_12h' | 'lembrete_3h' | 'lembrete_2h'
  | 'lembrete_30min'
  | 'aniversario' | 'retorno' | 'pos_atendimento'
  /* Portal de Agendamento */
  | 'alteracao_aprovada' | 'cancelamento_aprovado' | 'vaga_disponivel' | 'checkin'

export type SituacaoLembrete = 'agendado' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'

export interface Lembrete extends Registro {
  tipo: TipoLembrete
  canal: CanalMensagem
  situacao: SituacaoLembrete

  agendamentoId: string | null
  clienteId: string | null
  destinatario: string
  nomeDestinatario: string

  /** Quando deve sair da fila. */
  agendadoPara: string
  enviadoEm: string | null
  tentativas: number
  ultimoErro: string | null

  /** Texto já montado a partir do modelo. */
  mensagem: string
}

export type TipoNotificacao = 'info' | 'alerta' | 'sucesso' | 'erro'

/** Aviso interno para a equipe. Aparece no sino do painel. */
export interface Notificacao extends Registro {
  tipo: TipoNotificacao
  titulo: string
  detalhe: string | null
  lida: boolean
  /** Para onde levar ao clicar. */
  destino: string | null
}

export interface ModeloMensagem extends Registro {
  chave: TipoLembrete
  nome: string
  canal: CanalMensagem
  /** Texto com marcadores: {cliente}, {servico}, {data}, {hora}... */
  corpo: string
  ativo: boolean
}

/** Marcadores aceitos nos modelos, com o que cada um significa. */
export const MARCADORES: Record<string, string> = {
  '{cliente}': 'Primeiro nome da cliente',
  '{clienteCompleto}': 'Nome completo da cliente',
  '{servico}': 'Nome do serviço',
  '{profissional}': 'Nome de quem atende',
  '{data}': 'Data do atendimento',
  '{hora}': 'Horário do atendimento',
  '{valor}': 'Valor do atendimento',
  '{studio}': 'Nome do studio',
  '{endereco}': 'Endereço do studio',
  '{telefone}': 'Telefone do studio',
  '{protocolo}': 'Protocolo do agendamento',
  '{linkPortal}': 'Link do portal de agendamento',
}
