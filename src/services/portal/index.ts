/**
 * Portal de Agendamento.
 *
 * Quatro arquivos, quatro responsabilidades:
 *
 *   visitante.ts     quem está do outro lado da tela, sem login
 *   reservas.ts      o horário preso enquanto ela preenche
 *   agendamento.ts   abrir o portal, ver a grade, confirmar, consultar
 *   solicitacoes.ts  o pedido de mudança que a proprietária decide
 *   listaEspera.ts   quem quer a vaga se alguém desmarcar
 *   chegadas.ts      o que entrou pelo link desde a última olhada
 *
 * Nenhum deles guarda horário próprio. Tudo desemboca no repositório de
 * agenda — o mesmo que o painel usa.
 */

export * from './visitante'
export * from './reservas'
export * from './agendamento'
export * from './solicitacoes'
export * from './listaEspera'
export * from './chegadas'

export { reservasRepo, solicitacoesRepo, listaEsperaRepo } from '../repositorios/portal'
