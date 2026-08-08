import { armazenamento } from './storage'
import { tempoReal } from './tempo-real'
import { carregarDemonstracao } from './seed'
import { jornadaRepo, studioRepo } from './repositorios/equipe'
import { temSupabase } from './supabase/cliente'
import { ErroDeRegra } from '@/utils/erros'

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
export { carregarDemonstracao } from './seed'

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
    await armazenamento.iniciar()
    tempoReal.iniciar()

    // Com banco, a demonstração não entra. Nunca.
    if (temSupabase()) {
      /*
        Com banco, nada de demonstração — mas também não dá para deixar
        o sistema sem chão.

        A ficha em branco é o mínimo para a proprietária conseguir
        começar: sem linha na tabela `studio`, a tela de Configurações
        mostrava erro e não havia como criar o studio pela interface.
        Ela abria o sistema e não conseguia dar o primeiro passo.

        `garantir` cria uma ficha vazia com o agendamento PAUSADO, não
        um salão fictício. Nenhuma cliente, nenhum serviço, nenhum
        agendamento inventado — só o registro que as telas precisam
        para existir.
      */
      await studioRepo.garantir()
      await jornadaRepo.garantir()
      return
    }

    const studio = await studioRepo.ler()
    if (!studio) await carregarDemonstracao()
  })()

  return promessaDeInicio
}

/**
 * Recomeça do zero. Usado no botão de reiniciar dados.
 *
 * Só existe sem banco, onde "tudo" é o que está neste aparelho. Com
 * banco, apagar o studio inteiro é operação de painel do Supabase, com
 * backup na mão — não um botão dentro do produto.
 */
export async function reiniciarDados(): Promise<void> {
  if (temSupabase()) {
    throw new ErroDeRegra(
      'Com banco de dados ligado, recomeçar do zero é feito pelo painel do Supabase. ' +
      'Assim ninguém apaga um studio inteiro por engano.',
    )
  }
  await armazenamento.limpar()
  await carregarDemonstracao()
}
