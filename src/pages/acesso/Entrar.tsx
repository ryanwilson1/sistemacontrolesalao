import { useSessao } from '@/contexts'
import { CarregandoTela } from '@/components/feedback'
import { LayoutAcesso } from '@/layouts'
import { EntrarComSenha } from './EntrarComSenha'

/**
 * Entrada no sistema: e-mail e senha, e nada mais.
 *
 * Antes esta tela perguntava "Quem está no comando?" e listava as
 * profissionais para clicar. Aquilo era um atalho de desenvolvimento —
 * escolher um perfil não é autenticar. Qualquer pessoa com o link
 * entrava como proprietária, sem senha, e o sistema tratava aquela
 * escolha como identidade real para o resto da sessão.
 *
 * Num produto entregue isso não pode existir. Agora quem decide se
 * alguém entra é o Supabase Auth, e quem decide se essa conta enxerga
 * dados é a tabela `contas_equipe` no banco — duas barreiras, nenhuma
 * delas no navegador.
 *
 * Cadastro público continua não existindo de propósito: as contas são
 * criadas no painel do Supabase por quem administra o sistema.
 */
function Entrar() {
  const { carregando } = useSessao()

  if (carregando) return <CarregandoTela mensagem="Abrindo o studio" />

  return (
    <LayoutAcesso titulo="Entrar no studio" subtitulo="Use seu e-mail e senha.">
      <EntrarComSenha />
    </LayoutAcesso>
  )
}

export { Entrar }
export default Entrar
