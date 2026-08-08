import { RepositorioBase } from './base'
import { digitos } from '@/utils/formato'
import { ErroDeRegra } from '@/utils/erros'
import type { Cliente, Pagina } from '@/types'

class RepositorioClientes extends RepositorioBase<Cliente> {
  constructor() {
    super('clientes')
  }

  /** Busca por nome ou telefone, já paginada. */
  async paginar(termo: string, pagina: number, porPagina: number): Promise<Pagina<Cliente>> {
    const todos = (await this.listar()).filter((c) => c.ativo)
    const busca = termo.trim().toLowerCase()
    const numero = digitos(termo)

    const filtrados = !busca
      ? todos
      : todos.filter(
          (c) =>
            c.nome.toLowerCase().includes(busca) ||
            (numero.length >= 3 && digitos(c.telefone ?? '').includes(numero)),
        )

    const ordenados = filtrados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const inicio = pagina * porPagina

    return {
      itens: ordenados.slice(inicio, inicio + porPagina),
      total: ordenados.length,
      pagina,
      porPagina,
    }
  }

  /** Sugestões para o campo de busca do agendamento. */
  async sugerir(termo: string, limite = 6): Promise<Cliente[]> {
    const { itens } = await this.paginar(termo, 0, limite)
    return itens
  }

  async porTelefone(telefone: string): Promise<Cliente | null> {
    const numero = digitos(telefone)
    if (!numero) return null
    const todos = await this.listar()
    return todos.find((c) => digitos(c.telefone ?? '') === numero) ?? null
  }

  async aniversariantes(data: Date): Promise<Cliente[]> {
    const mes = data.getMonth() + 1
    const dia = data.getDate()
    const todos = await this.listar()

    return todos.filter((c) => {
      if (!c.nascimento || !c.ativo) return false
      const partes = c.nascimento.split('-')
      return Number(partes[1]) === mes && Number(partes[2]) === dia
    })
  }

  /**
   * Telefone é a chave natural de uma cliente. Duas fichas com o mesmo
   * número viram histórico partido ao meio.
   */
  async garantirTelefoneUnico(telefone: string | null, ignorarId?: string): Promise<void> {
    if (!telefone) return
    const existente = await this.porTelefone(telefone)
    if (existente && existente.id !== ignorarId) {
      throw new ErroDeRegra(`Já existe uma ficha com este telefone: ${existente.nome}.`)
    }
  }

  /** Exclusão lógica: o histórico de atendimentos continua íntegro. */
  async arquivar(id: string): Promise<void> {
    await this.atualizar(id, { ativo: false } as Partial<Cliente>)
  }
}

export const clientesRepo = new RepositorioClientes()
