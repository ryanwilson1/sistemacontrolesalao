import { digitos } from '@/utils/formato'
import type { CanalMensagem } from '@/types'

/**
 * A PORTA do envio de mensagens.
 *
 * Mesmo padrão do armazenamento: o sistema conversa com esta interface,
 * e trocar o meio de envio é escrever uma classe nova e mudar uma linha.
 */

export interface MensagemParaEnvio {
  destinatario: string
  nomeDestinatario: string
  corpo: string
  canal: CanalMensagem
}

export interface ResultadoEnvio {
  enviado: boolean
  /** Quando o envio depende de uma ação humana (abrir o WhatsApp). */
  precisaDeAcao: boolean
  link: string | null
  erro: string | null
}

export interface CanalDeEnvio {
  readonly nome: string
  /** Sai sozinho, sem ninguém clicar? */
  readonly automatico: boolean
  enviar(mensagem: MensagemParaEnvio): Promise<ResultadoEnvio>
}

/** Número no formato internacional que o WhatsApp entende. */
export function numeroInternacional(telefone: string): string {
  const numero = digitos(telefone)
  if (!numero) return ''
  // Brasileiro sem código do país: acrescenta o 55.
  return numero.length <= 11 ? `55${numero}` : numero
}

/** Link wa.me com o texto já preenchido. */
export function montarLinkWhatsApp(telefone: string, corpo: string): string {
  return `https://wa.me/${numeroInternacional(telefone)}?text=${encodeURIComponent(corpo)}`
}

/**
 * Envio por link.
 *
 * Este funciona de verdade hoje, sem API nenhuma: abre o WhatsApp com a
 * mensagem digitada, faltando só apertar enviar. Não é automático — e é
 * exatamente por isso que é honesto chamá-lo de semiautomático.
 */
export class CanalPorLink implements CanalDeEnvio {
  readonly nome = 'WhatsApp por link'
  readonly automatico = false

  async enviar(mensagem: MensagemParaEnvio): Promise<ResultadoEnvio> {
    const link = montarLinkWhatsApp(mensagem.destinatario, mensagem.corpo)

    return {
      enviado: false,
      precisaDeAcao: true,
      link,
      erro: mensagem.destinatario ? null : 'Sem telefone cadastrado.',
    }
  }
}

/**
 * Envio simulado.
 *
 * Marca como enviado sem enviar nada. Serve para testar a fila e ver o
 * fluxo completo funcionando antes de existir integração de verdade.
 */
export class CanalSimulado implements CanalDeEnvio {
  readonly nome = 'Simulado (nada é enviado)'
  readonly automatico = true

  async enviar(mensagem: MensagemParaEnvio): Promise<ResultadoEnvio> {
    if (!mensagem.destinatario) {
      return { enviado: false, precisaDeAcao: false, link: null, erro: 'Sem telefone cadastrado.' }
    }

    // Um instante de espera para o estado "enviando" aparecer na tela.
    await new Promise((resolver) => setTimeout(resolver, 120))

    return { enviado: true, precisaDeAcao: false, link: null, erro: null }
  }
}

/**
 * PRÓXIMA ETAPA — o canal em uso.
 *
 * Quando a API oficial do WhatsApp entrar, basta:
 *
 *   export const canal: CanalDeEnvio = new CanalApiOficial(credenciais)
 *
 * A fila, os modelos e as telas continuam iguais.
 */
export const canal: CanalDeEnvio = new CanalPorLink()

/** O canal simulado fica disponível para quem quiser ver a fila rodando. */
export const canalSimulado = new CanalSimulado()
