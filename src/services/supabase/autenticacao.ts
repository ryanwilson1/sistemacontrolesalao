import { supabase, temSupabase } from './cliente'
import { ErroDeEspera } from '@/utils/erros'
import { ROTAS } from '@/constants/rotas'
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

/**
 * A conta da equipe, lida de `contas_equipe`.
 *
 * ---------------------------------------------------------------
 * Por que esta função precisou existir
 * ---------------------------------------------------------------
 * O sistema tinha DUAS respostas para \"quem é esta pessoa\", e elas
 * nunca se falavam:
 *
 *   o BANCO perguntava a `contas_equipe` — é o que `papel_da_conta()`
 *   lê, e é o que decide quais linhas o Postgres entrega;
 *
 *   a TELA perguntava a `user_metadata.profissional_id` — um campo que
 *   **nenhum código deste projeto grava**. `cadastrar()` está desligado
 *   e `autorizar_conta` escreve em `contas_equipe`, não nos metadados.
 *
 * O resultado era silencioso e perfeitamente invertido. Rodar o comando
 * que o próprio LEIA-ME manda rodar —
 *
 *   select autorizar_conta('carol@gmail.com', 'profissional', 'id-da-carol');
 *
 * — deixava a conta correta no banco e mandava a tela cair no
 * `?? 'proprietaria'`. A Carol entrava vendo Financeiro, Relatórios,
 * Backup e Ajustes. O menu inteiro, para quem foi cadastrada como
 * profissional.
 *
 * Para o acesso restrito isso seria fatal: a Samara entraria como
 * proprietária, a guarda de rota nunca dispararia, e o único freio
 * restante seria o RLS — que recusa os dados mas não fecha as telas.
 * Ela veria o sistema inteiro dando erro de permissão em cada clique, o
 * que parece defeito e não parece restrição.
 *
 * Uma fonte só resolve. `contas_equipe` é a candidata natural: já é a
 * autoridade do lado do banco, e a política \"ver a propria conta\"
 * (02-seguranca.sql) existe exatamente para a pessoa poder ler a
 * própria linha. Tela e Postgres passam a responder juntos porque
 * passam a ler o mesmo lugar.
 */
export interface ContaDaEquipe {
  profissionalId: string | null
  papel: string
  ativo: boolean
}

/**
 * O resultado da consulta, com a distinção que importa.
 *
 * `ausente` e `indisponivel` pareciam a mesma coisa — as duas devolviam
 * nulo — e não são:
 *
 *   **ausente**      o banco respondeu, e não há linha para esta conta.
 *                    A pessoa existe em `auth.users` e ninguém a
 *                    autorizou. O RLS vai recusar tudo.
 *
 *   **indisponivel** não deu para perguntar: tabela ainda não criada
 *                    (projeto sem o 02-seguranca.sql), rede fora.
 *                    Nada se pode concluir sobre quem é a pessoa.
 *
 * Tratá-las igual criava o pior desfecho possível: quem não estava
 * autorizado recebia o papel de proprietária por omissão, via o menu
 * completo — Financeiro, Backup, Ajustes — e cada clique dava erro de
 * permissão. Parece sistema quebrado, e é conta não cadastrada.
 */
export type ResultadoDaConta =
  | { situacao: 'autorizada'; conta: ContaDaEquipe }
  | { situacao: 'ausente' }
  | { situacao: 'indisponivel' }

export async function contaDaEquipe(): Promise<ResultadoDaConta> {
  if (!temSupabase()) return { situacao: 'indisponivel' }

  const { data, error } = await supabase()
    .from('contas_equipe')
    .select('profissional_id, papel, ativo')
    .maybeSingle()

  /*
    Erro aqui não derruba a entrada.

    Um projeto que ainda não rodou o 02-seguranca.sql não tem a tabela,
    e recusar o login por causa disso trancaria a proprietária para fora
    do próprio sistema. Neste caso o sistema segue pelo caminho antigo.
  */
  if (error) return { situacao: 'indisponivel' }
  if (!data) return { situacao: 'ausente' }

  return {
    situacao: 'autorizada',
    conta: {
      profissionalId: (data.profissional_id as string | null) ?? null,
      papel: String(data.papel ?? ''),
      ativo: data.ativo !== false,
    },
  }
}

export async function recuperarSenha(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}${ROTAS.novaSenha}`,
  })

  if (error) {
    /*
      429 é o limite de envios do Supabase, não uma falha do sistema.

      Ele existe para o sistema não virar ferramenta de inundar a caixa
      de entrada de terceiros. Traduzir para "aguarde" muda o
      comportamento de quem lê: com "não foi possível enviar", a reação
      é clicar de novo — e cada clique renova o bloqueio, prendendo a
      pessoa num ciclo que ela mesma alimenta.
    */
    if (error.status === 429 || /rate|limit|too many/i.test(error.message)) {
      throw new ErroDeEspera(
        'Já pedimos um link há pouco. Aguarde cerca de um minuto antes de tentar de novo.',
      )
    }
    throw error
  }
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
    /*
      `INITIAL_SESSION` entra na lista.

      É o evento que o Supabase dispara ao abrir a página com sessão já
      guardada — o caso mais comum de todos. Ele estava de fora, e isso
      não aparecia porque `inscrever()` abria o canal por conta própria.
      Ao tirar aquela linha (ver CanalSupabase), esta virou a única
      forma de o tempo real subir num F5.
    */
    if (
      evento === 'SIGNED_OUT' ||
      evento === 'TOKEN_REFRESHED' ||
      evento === 'SIGNED_IN' ||
      evento === 'USER_UPDATED' ||
      evento === 'INITIAL_SESSION'
    ) {
      quando(!!sessao)
    }
  })

  return () => data.subscription.unsubscribe()
}
