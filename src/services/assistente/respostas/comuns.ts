import type { Intencao, Resposta } from '../tipos'

/**
 * Resposta sem números.
 *
 * Existe para o assistente dizer "não há dado sobre isso" em vez de
 * mostrar zero. Um zero parece um resultado; a frase deixa claro que
 * não houve movimento nenhum.
 */
export const semDados = (texto: string, intencao: Intencao): Resposta => ({
  texto, destaques: [], destino: null, rotuloDestino: null, intencao,
})
