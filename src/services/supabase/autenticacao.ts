import { supabase, temSupabase } from './cliente'
import { ErroDeRegra } from '@/utils/erros'

/**
 * Autenticação de verdade.
 *
 * Enquanto tudo morava no navegador, "entrar" era escolher um perfil —
 * e o próprio README dizia que não era autenticação, porque não era:
 * sem servidor não existe segredo que o navegador guarde.
 *
 * Com banco, isso muda de natureza. A fronteira deixa de ser interface e
 * passa a ser o Postgres: `anon` não enxerga tabela alguma, e só um
 * token válido abre a agenda, a ficha das clientes e o financeiro. Quem
 * não entrou não vê nada, mesmo digitando o endereço direto.
 *
 * A tela de escolha de perfil continua existindo para o caso sem banco,
 * onde ela é honesta. Com banco, entra esta.
 */

export interface PessoaAutenticada {
  id: string
  email: string
  /** Vinculado ao cadastro da equipe por `profissional_id` nos metadados. */
  profissionalId: string | null
}

function traduzir(mensagem: string): string {
  // As mensagens do Supabase vêm em inglês e algumas são técnicas
  // demais para quem só quer entrar no sistema.
  if (/invalid login credentials/i.test(mensagem)) {
    return 'E-mail ou senha incorretos.'
  }
  if (/email not confirmed/i.test(mensagem)) {
    return 'Confirme o e-mail pelo link que enviamos antes de entrar.'
  }
  if (/rate limit|too many/i.test(mensagem)) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  }
  if (/password should be at least/i.test(mensagem)) {
    return 'A senha precisa de pelo menos 6 caracteres.'
  }
  return mensagem
}

const converter = (usuario: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): PessoaAutenticada => ({
  id: usuario.id,
  email: usuario.email ?? '',
  profissionalId: (usuario.user_metadata?.profissional_id as string) ?? null,
})

export async function entrarComSenha(
  email: string, senha: string,
): Promise<PessoaAutenticada> {
  const { data, error } = await supabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  })

  if (error) throw new ErroDeRegra(traduzir(error.message))
  if (!data.user) throw new ErroDeRegra('Não foi possível entrar.')

  return converter(data.user)
}

/**
 * Cadastro pelo próprio sistema — desligado.
 *
 * A função continua exportada porque a estrutura para SaaS deve seguir
 * existindo, mas ela recusa. O motivo é a regra 4 do escopo: neste
 * momento quem cria conta é a administradora, no painel do Supabase, e
 * depois autoriza no banco:
 *
 *   select autorizar_conta('email@dominio.com');
 *
 * Deixá-la funcionando seria manter aberta a porta que o
 * `02-seguranca.sql` acabou de fechar. Quando houver convite com
 * código, é aqui que ele entra — a assinatura já está pronta.
 */
export async function cadastrar(
  _email: string, _senha: string, _profissionalId?: string,
): Promise<void> {
  throw new ErroDeRegra(
    'O cadastro é feito pela administradora do sistema. Peça o e-mail e a senha iniciais.',
  )
}

export async function sairDaConta(): Promise<void> {
  if (!temSupabase()) return
  await supabase().auth.signOut()
}

export async function pessoaAtual(): Promise<PessoaAutenticada | null> {
  if (!temSupabase()) return null

  const { data } = await supabase().auth.getUser()
  return data.user ? converter(data.user) : null
}

export async function recuperarSenha(email: string): Promise<void> {
  /*
    O destino é `/nova-senha`, não `/entrar`.

    Com `/entrar`, o link do e-mail abria uma sessão e a guarda
    `SomenteVisitante` mandava a pessoa direto para o painel — ela
    entrava sem nunca ver um campo de senha nova. O link se gastava, a
    senha antiga continuava valendo e o problema voltava no dia
    seguinte.
  */
  const { error } = await supabase().auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${window.location.origin}/nova-senha` },
  )
  if (error) throw new ErroDeRegra(traduzir(error.message))
}

/**
 * Existe uma sessão aberta pelo link de recuperação?
 *
 * O cliente do Supabase lê o token do endereço sozinho, mas isso
 * acontece depois da primeira renderização. Esperar aqui evita a tela
 * dizer "link expirado" meio segundo antes de o token ser processado.
 */
export async function sessaoDeRecuperacao(): Promise<boolean> {
  if (!temSupabase()) return false

  const { data } = await supabase().auth.getSession()
  if (data.session) return true

  // Segunda chance: o token pode estar sendo lido neste instante.
  await new Promise((seguir) => setTimeout(seguir, 600))
  const { data: segunda } = await supabase().auth.getSession()
  return !!segunda.session
}

/** Grava a senha nova da conta que está com a sessão aberta. */
export async function definirNovaSenha(senha: string): Promise<void> {
  if (senha.length < 8) {
    throw new ErroDeRegra('A senha precisa de pelo menos 8 caracteres.')
  }

  const { error } = await supabase().auth.updateUser({ password: senha })
  if (error) throw new ErroDeRegra(traduzir(error.message))
}

/**
 * Avisa quando a sessão cai.
 *
 * Um token expirado transforma cada leitura num erro de permissão, e a
 * tela mostraria "sem permissão para acessar clientes" — que soa como
 * defeito e é só logout. Ouvir aqui permite mandar a pessoa de volta
 * para o login com a explicação certa.
 */
export function aoMudarSessao(quando: (dentro: boolean) => void): () => void {
  if (!temSupabase()) return () => {}

  const { data } = supabase().auth.onAuthStateChange((evento, sessao) => {
    // `TOKEN_REFRESHED` sem sessão é o sinal de que a renovação falhou:
    // o token venceu de vez e a pessoa precisa entrar de novo.
    if (
      evento === 'SIGNED_OUT' ||
      evento === 'TOKEN_REFRESHED' ||
      evento === 'SIGNED_IN' ||
      evento === 'USER_UPDATED'
    ) {
      quando(!!sessao)
    }
  })

  return () => data.subscription.unsubscribe()
}
