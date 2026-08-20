import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ErroDeRegra } from '@/utils/erros'

/**
 * O cliente do Supabase.
 *
 * As credenciais vêm de variáveis de ambiente. Sem as duas, o sistema
 * continua no localStorage — é o que permite publicar antes do banco
 * existir, e continuar funcionando se ele cair.
 *
 * Sobre a chave `anon`: ela é pública por natureza. Vai dentro do
 * JavaScript que o navegador baixa e não há como escondê-la. O que
 * protege os dados é o Row Level Security, e as políticas estão em
 * `supabase/02-seguranca.sql`. Sem rodá-las, qualquer pessoa com o link
 * do agendamento lê a lista inteira de clientes.
 */

const URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** Há credenciais para conversar com o banco? */
export const temSupabase = (): boolean =>
  URL.startsWith('https://') && CHAVE.length > 20

let instancia: SupabaseClient | null = null

/**
 * O cliente, criado uma vez só.
 *
 * Duas instâncias disputariam a mesma sessão no armazenamento e uma
 * derrubaria o login da outra — falha que só aparece depois de meia
 * hora de uso, quando o token precisa renovar.
 */
export function supabase(): SupabaseClient {
  if (!temSupabase()) {
    throw new Error(
      'Supabase sem credenciais. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.',
    )
  }

  instancia ??= createClient(URL, CHAVE, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'studio:sessao-supabase',
    },
    realtime: {
      // Dez eventos por segundo já é mais do que uma agenda de salão
      // produz num dia inteiro. O teto existe para uma importação em
      // massa não inundar as telas abertas.
      params: { eventsPerSecond: 10 },
    },
  })

  return instancia
}

/**
 * Chama uma função do portal público.
 *
 * O portal não toca em tabela alguma: fala só por estas funções, que
 * devolvem o recorte estritamente necessário. É o que faz a chave
 * pública ser inofensiva — quem a extrair do JavaScript consegue ver os
 * serviços do salão e nada além disso.
 */
export async function chamarPortal<T>(
  funcao: string, parametros: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase().rpc(funcao, parametros)

  if (error) {
    /*
      O Postgres devolve a mensagem de `raise exception` já pronta para
      a cliente — "Este horário já está ocupado" e não um código.

      Precisa ser `ErroDeRegra`, e não `Error`: em produção
      `mensagemDeErro` troca todo `Error` comum por uma frase genérica,
      para não vazar detalhe interno. Com `Error`, a cliente lia
      "Algo não saiu como esperado" no lugar da explicação que as
      funções do portal foram escritas para dar.
    */
    if (/^(P0001|23P01|23505)$/.test(error.code ?? '') || error.message) {
      const tecnico = /^(PGRST|42|08|57)/.test(error.code ?? '')
      throw new ErroDeRegra(
        tecnico
          ? 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
          : error.message,
      )
    }
    throw new ErroDeRegra('Não foi possível falar com o servidor. Tente novamente.')
  }
  return data as T
}

/** Está autenticada? O painel exige; o portal não. */
export async function sessaoAtiva(): Promise<boolean> {
  if (!temSupabase()) return false
  const { data } = await supabase().auth.getSession()
  return !!data.session
}
