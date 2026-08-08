import * as agenda from './agenda'
import * as clientes from './clientes'
import * as dinheiro from './dinheiro'
import * as equipe from './equipe'
import * as estoque from './estoque'
import * as panorama from './panorama'
import type { Intencao, Interpretacao, Resposta } from '../tipos'

/**
 * Busca de respostas.
 *
 * Cada intenção tem uma função que consulta os repositórios e monta o
 * texto. Nada é inventado: os números saem dos mesmos serviços que
 * alimentam as telas, então o assistente nunca contradiz o painel.
 *
 * As funções ficam agrupadas por assunto — dinheiro, agenda, clientes,
 * equipe, estoque — porque é assim que elas mudam: quem mexe no cálculo
 * de faturamento não costuma mexer no de estoque no mesmo dia.
 */

export * from './comuns'

const AJUDA: Resposta = {
  intencao: 'ajuda',
  texto:
    'Pode perguntar do jeito que vier à cabeça — eu procuro nos dados do salão ' +
    'e respondo. Estes são os assuntos que eu conheço:',
  destaques: [
    { rotulo: 'Dinheiro', valor: 'Quanto vou faturar hoje?' },
    { rotulo: 'Equipe', valor: 'Qual profissional mais atendeu?' },
    { rotulo: 'Agenda', valor: 'Mostrar agenda de sexta-feira' },
    { rotulo: 'Portal', valor: 'Tem pedido de alteração?' },
    { rotulo: 'Clientes', valor: 'Quem faltou esta semana?' },
    { rotulo: 'Estoque', valor: 'Qual produto está acabando?' },
  ],
  destino: null,
  rotuloDestino: null,
}

const BUSCADORES: Record<Intencao, (p: Interpretacao['parametros']) => Promise<Resposta>> = {
  faturamento_hoje: dinheiro.faturamentoHoje,
  faturamento_periodo: dinheiro.faturamentoPeriodo,
  ticket_medio: dinheiro.ticketMedio,

  profissional_destaque: equipe.profissionalDestaque,
  servico_mais_vendido: equipe.servicoMaisVendido,

  horarios_livres: agenda.horariosLivres,
  agenda_do_dia: agenda.agendaDoDia,
  agenda_dia_semana: agenda.agendaDiaSemana,
  cancelamentos: agenda.cancelamentos,
  pedidos_do_portal: agenda.pedidosDoPortal,

  clientes_sumidas: clientes.clientesSumidas,
  aniversariantes: clientes.aniversariantes,
  clientes_faltosas: clientes.clientesFaltosas,
  faltas_periodo: clientes.faltasPeriodo,

  produto_acabando: estoque.produtoAcabando,
  produto_vencendo: estoque.produtoVencendo,

  resumo_geral: panorama.resumoGeral,

  ajuda: async () => AJUDA,
  /*
    Quando não entende.

    A versão anterior abria com "Não entendi bem a pergunta" — o que é
    verdade e é a coisa errada a dizer primeiro. Quem lê aquilo conclui
    que errou ao perguntar, e a próxima reação é desistir do assistente.

    A culpa vai para quem a tem: o assistente lê por palavras-chave e
    tem alcance limitado. Dizer isso, e emendar com o que ele *sabe*
    fazer, transforma um beco sem saída num convite a tentar de novo.
  */
  desconhecida: async () => ({
    ...AJUDA,
    intencao: 'desconhecida' as Intencao,
    texto:
      'Essa eu não consegui entender 🤔 Tente com outras palavras, ou escolha ' +
      'uma das perguntas abaixo — sei responder sobre agenda, clientes, ' +
      'faturamento, equipe e estoque.',
  }),
}

export async function buscarResposta(interpretacao: Interpretacao): Promise<Resposta> {
  // Leitura fraca é tratada como não compreendida: melhor pedir para
  // reformular do que responder com confiança sobre a pergunta errada.
  const intencao = interpretacao.confianca < 0.4 ? 'desconhecida' : interpretacao.intencao
  return BUSCADORES[intencao](interpretacao.parametros)
}
