import { interpretador } from './interpretador'
import { buscarResposta } from './respostas'
import type { Resposta } from './tipos'

export * from './interpretador'
export * from './respostas'
export * from './tipos'

/**
 * Ponto de entrada do assistente.
 *
 * Entender a pergunta e buscar a resposta são etapas separadas de
 * propósito: o interpretador pode virar um modelo de linguagem sem que a
 * busca de dados mude, e é a busca que garante que a resposta venha dos
 * números reais do studio.
 */
export async function perguntar(pergunta: string): Promise<Resposta> {
  const interpretacao = await interpretador.interpretar(pergunta)
  return buscarResposta(interpretacao)
}

/** Sugestões exibidas quando a conversa começa. */
export const SUGESTOES: { grupo: string; perguntas: string[] }[] = [
  {
    grupo: 'Dinheiro',
    perguntas: ['Quanto vendi hoje?', 'Qual o faturamento do mês?', 'Qual o ticket médio?'],
  },
  {
    grupo: 'Equipe',
    perguntas: ['Quem mais faturou?', 'Qual serviço é o mais vendido?'],
  },
  {
    grupo: 'Agenda',
    perguntas: [
      'Como está a agenda de hoje?',
      'Quais horários livres amanhã?',
      'Mostrar agenda de sexta-feira',
      'Quais cancelamentos hoje?',
    ],
  },
  {
    grupo: 'Portal',
    perguntas: ['Tem pedido de alteração?', 'Quem está na lista de espera?'],
  },
  {
    grupo: 'Clientes',
    perguntas: [
      'Quem faltou esta semana?',
      'Quem não retorna há mais tempo?',
      'Quem faz aniversário hoje?',
      'Quais clientes cancelam com frequência?',
    ],
  },
  {
    grupo: 'Estoque',
    perguntas: ['Qual produto está acabando?', 'Tem produto vencendo?'],
  },
]
