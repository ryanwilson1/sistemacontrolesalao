import { CanalLocal, CanalSilencioso, IDENTIDADE_DESTA_ABA } from './CanalLocal'
import { CanalSupabase } from './CanalSupabase'
import { temSupabase } from '../supabase/cliente'
import type { CanalTempoReal } from './tipos'

export type { CanalTempoReal, EventoTempoReal, OuvinteTempoReal } from './tipos'
export { CanalLocal, CanalSilencioso, IDENTIDADE_DESTA_ABA } from './CanalLocal'
export { CanalSupabase } from './CanalSupabase'

/**
 * O canal em uso.
 *
 * A escolha é automática e segue o armazenamento: com banco configurado,
 * tempo real entre aparelhos; sem banco, entre abas do mesmo navegador.
 *
 * Deixar isto automático evita a combinação que quebraria tudo — dados
 * no Supabase e avisos só locais, ou o contrário. Os dois vêm da mesma
 * pergunta, então respondem juntos.
 */
export const tempoReal: CanalTempoReal =
  typeof window === 'undefined'
    ? new CanalSilencioso()
    : temSupabase()
      ? new CanalSupabase()
      : new CanalLocal()

/**
 * Publica a mudança de uma coleção.
 *
 * Chamado de um lugar só — `RepositorioBase` — porque todo caminho de
 * escrita passa por lá. Espalhar esta chamada pelas telas seria garantir
 * que uma delas esquecesse.
 *
 * Com Supabase isto vira um no-op: quem avisa passa a ser o Postgres,
 * a partir da própria gravação.
 */
export function publicarMudanca(colecao: Parameters<CanalTempoReal['publicar']>[0]): void {
  tempoReal.publicar(colecao)
}

export { IDENTIDADE_DESTA_ABA as identidadeDestaAba }
