export { supabase, temSupabase, chamarPortal, sessaoAtiva } from './cliente'
export {
  aoMudarSessao, cadastrar, contaDaEquipe, definirNovaSenha, entrarComSenha,
  pessoaAtual, recuperarSenha, sairDaConta, sessaoDeRecuperacao,
} from './autenticacao'
export type { ContaDaEquipe, PessoaAutenticada } from './autenticacao'
