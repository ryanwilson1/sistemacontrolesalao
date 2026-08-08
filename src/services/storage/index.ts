import { LocalStorageAdapter } from './LocalStorageAdapter'
import { MemoriaAdapter } from './MemoriaAdapter'
import { SupabaseAdapter } from './SupabaseAdapter'
import { temSupabase } from '../supabase/cliente'
import type { AdaptadorDeArmazenamento } from './tipos'

export type { AdaptadorDeArmazenamento, Colecao } from './tipos'
export { COLECOES, COLECOES_SISTEMA, ROTULO_COLECAO } from './tipos'
export { LocalStorageAdapter } from './LocalStorageAdapter'
export { MemoriaAdapter } from './MemoriaAdapter'
export { SupabaseAdapter } from './SupabaseAdapter'

/**
 * O adaptador em uso.
 *
 * A escolha é automática: com `VITE_SUPABASE_URL` e
 * `VITE_SUPABASE_ANON_KEY` definidas, os dados moram no banco; sem elas,
 * no navegador.
 *
 * Automático, e não uma linha trocada à mão, por um motivo prático: o
 * mesmo código precisa rodar em desenvolvimento sem banco e em produção
 * com banco. Uma constante editada manualmente vira, mais cedo ou mais
 * tarde, um deploy apontando para o lugar errado.
 *
 *   MemoriaAdapter        volátil, para testes
 *   LocalStorageAdapter   sem credenciais — os dados ficam no aparelho
 *   SupabaseAdapter       com credenciais — os dados ficam no servidor
 */
export const armazenamento: AdaptadorDeArmazenamento =
  typeof window === 'undefined'
    ? new MemoriaAdapter()
    : temSupabase()
      ? new SupabaseAdapter()
      : new LocalStorageAdapter()

/** Onde os dados estão morando agora. Exibido no diagnóstico. */
export const usandoServidor = (): boolean => temSupabase()
