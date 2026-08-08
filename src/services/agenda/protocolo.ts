import { protocoloCurto } from '@/utils/id'
import { digitos } from '@/utils/formato'

/**
 * O protocolo da cliente.
 *
 * Seis caracteres legíveis em voz alta — sem I, O, 0 nem 1, que são os
 * que geram "é i ou é um?" ao telefone. É a chave dela para consultar o
 * próprio horário no portal: sem senha, sem cadastro, sem login.
 *
 * Vive fora do repositório porque é regra, não acesso a dado. As duas
 * funções aqui são puras e por isso conferíveis de fora.
 */

/**
 * Um protocolo que ainda não está em uso.
 *
 * Colisão em seis caracteres é rara, não impossível — e um protocolo
 * repetido faria a consulta devolver o horário de outra pessoa, com o
 * telefone certo por coincidência de família. Doze tentativas resolvem
 * qualquer volume real; o desempate final existe para nunca devolver
 * nada duvidoso.
 */
export function gerarProtocolo(usados: Set<string>): string {
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const candidato = protocoloCurto()
    if (!usados.has(candidato)) return candidato
  }
  return `${protocoloCurto()}${Date.now().toString(36).slice(-2).toUpperCase()}`
}

/**
 * O telefone informado bate com o guardado?
 *
 * Segunda confirmação da consulta pública. Protocolo sozinho seria
 * adivinhável em algumas tentativas de sorte, e quem adivinhasse veria
 * o nome e o horário de uma desconhecida.
 */
export function confereTelefone(guardado: string | null, informado: string): boolean {
  const alvo = digitos(informado)
  if (!alvo || !guardado) return false
  return digitos(guardado) === alvo
}

/** Normaliza o que a cliente digitou. Ela escreve em minúscula e com espaço. */
export const limparProtocolo = (bruto: string): string => bruto.trim().toUpperCase()
