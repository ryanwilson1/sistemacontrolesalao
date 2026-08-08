import { armazenamento } from '../storage'
import { publicarMudanca } from '../tempo-real'
import { novoId } from '@/utils/id'
import { dinheiro, telefone as formatarTelefone } from '@/utils/formato'
import { dataRelativa, hora } from '@/utils/datas'
import type { CanalMensagem, ModeloMensagem, TipoLembrete } from '@/types'

/**
 * Modelos de mensagem.
 *
 * O texto fica separado do código de propósito: quem cuida do studio
 * ajusta o tom sem precisar de programador, e quando o envio automático
 * entrar, os mesmos modelos continuam valendo.
 */

export interface ContextoMensagem {
  cliente?: string | null
  clienteCompleto?: string | null
  servico?: string | null
  profissional?: string | null
  inicio?: string | null
  valor?: number | null
  studio?: string | null
  endereco?: string | null
  telefone?: string | null
  protocolo?: string | null
  chavePix?: string | null
  linkPortal?: string | null
}

/**
 * Troca os marcadores pelo conteúdo real.
 *
 * Marcador sem valor vira texto vazio, nunca "undefined" — a cliente não
 * pode receber uma mensagem com lixo do sistema.
 */
export function preencher(corpo: string, contexto: ContextoMensagem): string {
  const inicio = contexto.inicio ? new Date(contexto.inicio) : null
  const primeiroNome = contexto.cliente?.split(' ')[0] ?? contexto.clienteCompleto?.split(' ')[0] ?? ''

  const valores: Record<string, string> = {
    '{cliente}': primeiroNome,
    '{clienteCompleto}': contexto.clienteCompleto ?? contexto.cliente ?? '',
    '{servico}': contexto.servico ?? '',
    '{profissional}': contexto.profissional ?? '',
    '{data}': inicio ? dataRelativa(inicio) : '',
    '{hora}': inicio ? hora(inicio) : '',
    '{valor}': contexto.valor != null ? dinheiro(contexto.valor) : '',
    '{studio}': contexto.studio ?? '',
    '{endereco}': contexto.endereco ?? '',
    '{telefone}': contexto.telefone ? formatarTelefone(contexto.telefone) : '',
    '{protocolo}': contexto.protocolo ?? '',
    '{chavePix}': contexto.chavePix ?? '',
    '{linkPortal}': contexto.linkPortal ?? '',
  }

  return Object.entries(valores)
    .reduce((texto, [marcador, valor]) => texto.split(marcador).join(valor), corpo)
    // Espaços duplicados sobram quando um marcador fica vazio.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ------------------------------------------------------------------ */
/* Modelos de fábrica                                                  */
/* ------------------------------------------------------------------ */

interface Semente {
  chave: TipoLembrete
  nome: string
  canal: CanalMensagem
  corpo: string
}

/**
 * Textos padrão, no tom do studio: caloroso, direto, sem jargão.
 * Servem de ponto de partida — tudo é editável.
 */
export const MODELOS_PADRAO: Semente[] = [
  {
    chave: 'confirmacao',
    nome: 'Confirmação de agendamento',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! 💛\n\nSeu horário no {studio} está confirmado:\n\n' +
      '📅 {data}\n🕐 {hora}\n✨ {servico} com {profissional}\n\n' +
      'Protocolo: {protocolo}\n\nAté lá!',
  },
  {
    chave: 'lembrete_24h',
    nome: 'Lembrete — véspera',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Passando para lembrar do seu horário amanhã:\n\n' +
      '🕐 {hora} · {servico}\n💇 Com {profissional}\n\n' +
      'Se precisar remarcar, é só me avisar. Até amanhã!',
  },
  {
    chave: 'lembrete_12h',
    nome: 'Lembrete — 12 horas antes',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Seu horário de {servico} é {data} às {hora}.\n\n' +
      'Estamos te esperando no {studio} 💛',
  },
  {
    chave: 'lembrete_3h',
    nome: 'Lembrete — poucas horas antes',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Seu horário é hoje às {hora}.\n\n' +
      '📍 {endereco}\n\nAté já!',
  },
  {
    chave: 'lembrete_2h',
    nome: 'Lembrete — 2 horas antes',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Seu horário é daqui a pouco, às {hora}.\n\n' +
      '✨ {servico} com {profissional}\n📍 {endereco}\n\nAté já!',
  },
  {
    chave: 'lembrete_30min',
    nome: 'Lembrete — 30 minutos antes',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Seu horário é em meia hora, às {hora}.\n\n' +
      '📍 {endereco}\n\nEstamos te esperando 💛',
  },
  {
    chave: 'alteracao_aprovada',
    nome: 'Alteração aprovada',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Consegui remarcar como você pediu 💛\n\n' +
      '📅 {data}\n🕐 {hora}\n✨ {servico} com {profissional}\n\n' +
      'Protocolo: {protocolo}\n\nAté lá!',
  },
  {
    chave: 'cancelamento_aprovado',
    nome: 'Cancelamento aprovado',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}. Cancelei seu horário de {data} às {hora}, como você pediu.\n\n' +
      'Quando quiser voltar, é só marcar de novo 💛',
  },
  {
    chave: 'vaga_disponivel',
    nome: 'Vaga na lista de espera',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Abriu uma vaga que você estava esperando 🎉\n\n' +
      '📅 {data}\n🕐 {hora}\n✨ {servico} com {profissional}\n\n' +
      'É por ordem de confirmação — quem responder primeiro fica com ela.\n\n' +
      'Me avisa se quiser?',
  },
  {
    chave: 'aniversario',
    nome: 'Aniversário',
    canal: 'whatsapp',
    corpo:
      'Feliz aniversário, {cliente}! 🎉\n\n' +
      'Que seu dia seja lindo do jeitinho que você merece.\n\n' +
      'Com carinho, {studio} 💛',
  },
  {
    chave: 'retorno',
    nome: 'Convite de retorno',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Faz um tempinho que você não aparece por aqui.\n\n' +
      'Que tal marcar um horário? Sua agenda está guardadinha com a gente.\n\n' +
      '{studio} 💛',
  },
  {
    chave: 'pos_atendimento',
    nome: 'Depois do atendimento',
    canal: 'whatsapp',
    corpo:
      'Oi, {cliente}! Foi um prazer te atender hoje 💛\n\n' +
      'Qualquer dúvida sobre os cuidados, é só chamar.\n\n' +
      'Até a próxima!',
  },
]

/** Modelos avulsos, usados fora da fila de lembretes. */
export const MODELOS_AVULSOS = {
  cancelamento:
    'Oi, {cliente}. Seu horário de {data} às {hora} foi cancelado.\n\n' +
    'Quando quiser remarcar, é só me chamar 💛',
  reagendamento:
    'Oi, {cliente}! Seu horário foi remarcado:\n\n' +
    '📅 {data}\n🕐 {hora}\n✨ {servico} com {profissional}\n\nAté lá!',
  pix:
    'Oi, {cliente}! Segue a chave Pix para o pagamento:\n\n' +
    '🔑 {chavePix}\n💰 {valor}\n\nAssim que enviar, me avisa 💛',
  localizacao:
    'Oi, {cliente}! Estamos aqui:\n\n📍 {endereco}\n📞 {telefone}\n\nAté logo!',
} as const

export type ModeloAvulso = keyof typeof MODELOS_AVULSOS

export const ROTULO_AVULSO: Record<ModeloAvulso, string> = {
  cancelamento: 'Cancelamento',
  reagendamento: 'Reagendamento',
  pix: 'Cobrança por Pix',
  localizacao: 'Endereço do studio',
}

/* ------------------------------------------------------------------ */

class RepositorioModelos {
  async listar(): Promise<ModeloMensagem[]> {
    const guardados = await armazenamento.listar<ModeloMensagem>('modelosMensagem')
    if (guardados.length > 0) return guardados

    // Primeira abertura: instala os modelos de fábrica.
    const agora = new Date().toISOString()
    const iniciais: ModeloMensagem[] = MODELOS_PADRAO.map((semente) => ({
      ...semente,
      id: novoId(),
      criadoEm: agora,
      atualizadoEm: agora,
      ativo: true,
    }))

    await armazenamento.gravar('modelosMensagem', iniciais)
    publicarMudanca('modelosMensagem')
    return iniciais
  }

  async porChave(chave: TipoLembrete): Promise<ModeloMensagem | null> {
    const todos = await this.listar()
    return todos.find((m) => m.chave === chave && m.ativo) ?? null
  }

  async atualizar(id: string, mudancas: Partial<ModeloMensagem>): Promise<ModeloMensagem> {
    const todos = await this.listar()
    const indice = todos.findIndex((m) => m.id === id)
    if (indice === -1) throw new Error('Modelo não encontrado')

    const atualizado = { ...todos[indice]!, ...mudancas, atualizadoEm: new Date().toISOString() }
    todos[indice] = atualizado

    await armazenamento.gravar('modelosMensagem', todos)
    publicarMudanca('modelosMensagem')
    return atualizado
  }

  /** Devolve o texto de fábrica de um modelo. */
  restaurarPadrao(chave: TipoLembrete): string {
    return MODELOS_PADRAO.find((m) => m.chave === chave)?.corpo ?? ''
  }
}

export const modelosRepo = new RepositorioModelos()
