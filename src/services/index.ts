import { armazenamento } from './storage'
import { tempoReal } from './tempo-real'
import { jornadaRepo, studioRepo } from './repositorios/equipe'
import { temSupabase } from './supabase/cliente'
import { ErroDeConfiguracao, ErroDeRegra } from '@/utils/erros'

export { armazenamento } from './storage'
export type { AdaptadorDeArmazenamento, Colecao } from './storage'
export { COLECOES, COLECOES_SISTEMA, ROTULO_COLECAO } from './storage'

export * from './backup'
export * from './assistente'
export * from './comunicacao'
export * from './repositorios/agenda'
export * from './repositorios/backup'
export * from './repositorios/caixa'
export * from './repositorios/cupons'
export * from './repositorios/procedimentos'
export * from './repositorios/clientes'
export * from './repositorios/equipe'
export * from './repositorios/estoque'
export * from './repositorios/fidelidade'
export * from './repositorios/financeiro'
export * from './repositorios/servicos'

/* Portal de Agendamento — reserva temporária, pedidos e lista de espera. */
export * as portal from './portal'
export {
  carregarPortal, horariosDoDia, confirmar as confirmarAgendamentoPublico,
  consultarHorario, desistir, nomeDaCliente, registrarChegada, podeFazerCheckin,
  reservar, liberarDaVisitante, concluirReserva, varrerReservas,
  segundosRestantes, relogioDaReserva, idDoVisitante, renovarVisitante,
  abrirSolicitacao, recusarSolicitacao, aprovarCancelamento, aprovarAlteracao,
  abertasDetalhadas, historicoDetalhado,
  entrarNaFila, interessadasEm, interessadasNaVaga, avisarInteressadas,
  avisarSobreCancelamento, marcarAtendida, sairDaFila, expirarAvisos,
  filaDetalhada, avisadasDetalhadas, vagaDoAgendamento,
  chegadasRecentes, ignorarAnteriores,
} from './portal'
export { reservasRepo, solicitacoesRepo, listaEsperaRepo } from './repositorios/portal'

/* Supabase — cliente, autenticação e funções do portal público. */
export {
  supabase, temSupabase, chamarPortal, sessaoAtiva,
  aoMudarSessao, cadastrar, definirNovaSenha, entrarComSenha, pessoaAtual,
  recuperarSenha, sairDaConta, sessaoDeRecuperacao,
} from './supabase'
export type { PessoaAutenticada } from './supabase'

/* Tempo real — a porta e o canal ativo. */
export { tempoReal, publicarMudanca, IDENTIDADE_DESTA_ABA } from './tempo-real'
export type { CanalTempoReal, EventoTempoReal } from './tempo-real'

export * from './agenda/regras'
export * from './agenda/horarios'
export * from './atendimento'
export * from './painel'
export * from './ocupacao'
export { conexao, comAcompanhamento, observarRede } from './conexao'
export type { EstadoConexao } from './conexao'
export * from './sessao'

/**
 * Ponto único de partida do sistema.
 *
 * Prepara o armazenamento e, **sem banco**, carrega a demonstração se
 * não houver nada guardado.
 *
 * A ressalva em negrito é a correção de um caminho perigoso. A versão
 * anterior semeava sempre que `studioRepo.ler()` voltasse vazio — e um
 * Supabase recém-criado volta vazio. O resultado era o studio de
 * verdade nascer chamado "Emely Barbosa Studio de Beleza", com três
 * profissionais inventadas, clientes fictícias e lançamentos
 * financeiros de mentira gravados no banco de produção.
 *
 * Com banco, um studio vazio é um studio que ainda não foi configurado.
 * A tela de configuração resolve isso; despejar dados de exemplo por
 * cima, não.
 */
let promessaDeInicio: Promise<void> | null = null

export function iniciarSistema(): Promise<void> {
  promessaDeInicio ??= (async () => {
    /*
      Sem banco, o sistema não abre. E isso é a correção, não a falha.

      Antes ele caía no armazenamento do navegador e carregava dados de
      demonstração. Num deploy com as variáveis de ambiente faltando —
      que é fácil de acontecer, porque elas entram no build e não em
      execução — o efeito era o pior possível: a proprietária via um
      salão funcionando, com agendamentos, faturamento e clientes, e
      concluía que estava tudo certo.

      Nada daquilo existia. Os dados moravam só naquele celular, o link
      público não abria para ninguém, e a descoberta viria dias depois,
      quando alguma cliente reclamasse de um horário que o salão não
      tinha.

      Recusar na cara é a única resposta honesta. A tela diz exatamente
      o que falta, e o sistema só começa quando o banco responde.
    */
    if (!temSupabase()) {
      throw new ErroDeConfiguracao(
        'O sistema não está conectado ao banco de dados.',
      )
    }

    await armazenamento.iniciar()
    tempoReal.iniciar()

    /*
      A ficha em branco do primeiro acesso.

      Não é demonstração. Sem linha na tabela `studio`, a tela de
      Configurações mostrava erro e não havia como criar o studio pela
      interface — a proprietária abria o sistema e não conseguia dar o
      primeiro passo.

      O que entra aqui é um registro vazio, com o agendamento PAUSADO.
      Nenhuma cliente, nenhum serviço, nenhum agendamento inventado.
    */
    await studioRepo.garantir()
    await jornadaRepo.garantir()
  })()

  return promessaDeInicio
}

/**
 * Antes recarregava a demonstração.
 *
 * A demonstração deixou de existir, e apagar a agenda de um salão de
 * verdade não pode ser um botão dentro do produto — com o backup
 * dependendo da sorte de alguém ter exportado antes.
 */
export async function reiniciarDados(): Promise<void> {
  throw new ErroDeRegra(
    'Para recomeçar do zero, use o painel do Supabase — com um backup exportado antes.',
  )
}
