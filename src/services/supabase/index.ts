export { supabase, temSupabase, chamarPortal, sessaoAtiva } from './cliente'
export {
  aoMudarSessao, cadastrar, definirNovaSenha, entrarComSenha, pessoaAtual,
  recuperarSenha, sairDaConta, sessaoDeRecuperacao,
} from './autenticacao'
export type { PessoaAutenticada } from './autenticacao'
