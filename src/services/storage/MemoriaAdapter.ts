import type { AdaptadorDeArmazenamento, Colecao } from './tipos'

/**
 * Armazenamento em memória.
 *
 * É o adaptador ativo enquanto o armazenamento local não é implementado.
 * Os dados vivem apenas durante a sessão do navegador — recarregou a
 * página, volta ao estado inicial.
 *
 * Serve para validar telas, fluxos e responsividade sem depender de nada
 * externo. Na próxima etapa, `IndexedDBAdapter` toma este lugar.
 */
export class MemoriaAdapter implements AdaptadorDeArmazenamento {
  readonly nome = 'Memória (temporário)'
  readonly persistente = false

  private dados = new Map<Colecao, unknown[]>()

  async iniciar(): Promise<void> {
    // Nada a preparar: o Map já nasce pronto.
  }

  async listar<T>(colecao: Colecao): Promise<T[]> {
    return [...((this.dados.get(colecao) ?? []) as T[])]
  }

  async gravar<T>(colecao: Colecao, registros: T[]): Promise<void> {
    // Cópia rasa evita que quem chamou altere o conteúdo por referência.
    this.dados.set(colecao, [...registros])
  }

  async limpar(): Promise<void> {
    this.dados.clear()
  }
}
