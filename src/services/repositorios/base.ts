import { armazenamento, type Colecao } from '../storage'
import { publicarMudanca } from '../tempo-real'
import { novoId } from '@/utils/id'
import type { Registro } from '@/types'

/**
 * Repositório genérico.
 *
 * Todo CRUD do sistema nasce daqui — é o que impede oito arquivos de
 * repetirem o mesmo "buscar, alterar, gravar". Cada repositório concreto
 * herda isto e adiciona apenas as consultas próprias do seu domínio.
 */
export class RepositorioBase<T extends Registro> {
  constructor(protected readonly colecao: Colecao) {}

  /**
   * Grava a coleção inteira e avisa quem estiver ouvindo.
   *
   * Todo caminho de escrita passa por aqui — é por isso que o aviso de
   * tempo real mora neste ponto e em nenhum outro. Espalhar a chamada
   * pelas telas seria garantir que uma delas esquecesse, e um horário
   * que some numa aba e continua noutra é pior do que não ter tempo
   * real nenhum.
   */
  protected async persistir(registros: T[]): Promise<void> {
    await armazenamento.gravar(this.colecao, registros)
    publicarMudanca(this.colecao)
  }

  /**
   * Grava UMA alteração.
   *
   * A diferença entre este método e `persistir` é a diferença entre
   * "esta linha mudou" e "a coleção inteira agora é esta". A segunda
   * frase é forte demais para um botão de cancelar: ela desfaz, sem
   * erro e sem rastro, tudo que outra tela gravou desde que esta
   * carregou os dados.
   *
   * Quando o adaptador não sabe escrever linha a linha — memória e
   * localStorage não sabem, e não precisam — cai no caminho antigo.
   * Ali a coleção inteira é o aparelho inteiro, então não há nada a
   * atropelar.
   */
  private async persistirUm(
    operacao: 'inserir' | 'atualizar' | 'remover',
    id: string,
    registro: T | null,
    listaCompleta: T[],
    mudancas?: Partial<T>,
  ): Promise<T | null> {
    const granular =
      operacao === 'inserir' ? armazenamento.inserir
      : operacao === 'atualizar' ? armazenamento.atualizarUm
      : armazenamento.removerUm

    if (!granular) {
      await this.persistir(listaCompleta)
      return null
    }

    /*
      Devolve o que o banco confirmou, quando ele confirma algo.

      Importa para os registros versionados: a linha que volta traz a
      `versao` nova, e é ela que a tela precisa guardar. Sem isso, a
      segunda edição da mesma aba declararia uma versão já superada e o
      banco acusaria conflito da tela consigo mesma.
    */
    let confirmado: T | null = null

    if (operacao === 'inserir') {
      await armazenamento.inserir!(this.colecao, registro as T)
    } else if (operacao === 'atualizar') {
      confirmado = await armazenamento.atualizarUm!(this.colecao, id, registro as T, mudancas)
    } else {
      await armazenamento.removerUm!(this.colecao, id)
    }

    publicarMudanca(this.colecao)
    return confirmado
  }

  async listar(): Promise<T[]> {
    return armazenamento.listar<T>(this.colecao)
  }

  async buscar(id: string): Promise<T | null> {
    const todos = await this.listar()
    return todos.find((r) => r.id === id) ?? null
  }

  async filtrar(criterio: (registro: T) => boolean): Promise<T[]> {
    const todos = await this.listar()
    return todos.filter(criterio)
  }

  async criar(dados: Omit<T, keyof Registro>): Promise<T> {
    const agora = new Date().toISOString()
    const registro = { ...dados, id: novoId(), criadoEm: agora, atualizadoEm: agora } as T

    const todos = await this.listar()
    await this.persistirUm('inserir', registro.id, registro, [...todos, registro])
    return registro
  }

  async atualizar(id: string, mudancas: Partial<Omit<T, keyof Registro>>): Promise<T> {
    const todos = await this.listar()
    const indice = todos.findIndex((r) => r.id === id)
    if (indice === -1) throw new Error(`Registro não encontrado em ${this.colecao}`)

    const atualizado = {
      ...todos[indice],
      ...mudancas,
      atualizadoEm: new Date().toISOString(),
    } as T

    todos[indice] = atualizado

    /*
      O delta segue junto com a linha completa.

      Quem sabe escrever campo a campo usa o delta e preserva o que
      outra aba alterou; quem não sabe (memória, localStorage) usa a
      lista inteira, e ali a corrida não existe porque o armazenamento
      é de um aparelho só.
    */
    const confirmado = await this.persistirUm('atualizar', id, atualizado, todos, {
      ...mudancas,
      atualizadoEm: atualizado.atualizadoEm,
    } as Partial<T>)

    // A versão do banco vence a montada aqui.
    return confirmado ?? atualizado
  }

  async remover(id: string): Promise<void> {
    const todos = await this.listar()
    await this.persistirUm('remover', id, null, todos.filter((r) => r.id !== id))
  }

  /** Grava vários de uma vez. Usado na carga inicial. */
  async substituirTudo(registros: T[]): Promise<void> {
    await this.persistir(registros)
  }
}
