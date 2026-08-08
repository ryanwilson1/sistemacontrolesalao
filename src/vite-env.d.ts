/// <reference types="vite/client" />

/**
 * Variáveis de ambiente.
 *
 * Só o que começa com `VITE_` chega ao navegador — é a proteção do Vite
 * contra vazar segredo de servidor no pacote. Por isso a chave `anon`
 * pode morar aqui e a `service_role` jamais: ela ignora o RLS e daria a
 * qualquer visitante do site o banco inteiro.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
