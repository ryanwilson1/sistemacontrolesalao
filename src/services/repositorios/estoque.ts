import { RepositorioBase } from './base'
import { armazenamento } from '../storage'
import { chamarPortal, temSupabase } from '../supabase/cliente'
import { publicarMudanca } from '../tempo-real'
import { TIPO_MOVIMENTO } from '@/constants'
import { ErroDeRegra } from '@/utils/erros'
import type {
  Fornecedor, MovimentoEstoque, Produto, SituacaoProduto, TipoMovimento,
} from '@/types'

class RepositorioMovimentos extends RepositorioBase<MovimentoEstoque> {
  constructor() {
    super('movimentos')
  }

  async doProduto(produtoId: string): Promise<MovimentoEstoque[]> {
    const todos = await this.listar()
    return todos
      .filter((m) => m.produtoId === produtoId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }
}

class RepositorioProdutos extends RepositorioBase<Produto> {
  constructor() {
    super('produtos')
  }

  async ativos(termo = ''): Promise<Produto[]> {
    const busca = termo.trim().toLowerCase()
    const todos = (await this.listar()).filter((p) => p.ativo)

    return (busca ? todos.filter((p) => p.nome.toLowerCase().includes(busca)) : todos)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async abaixoDoMinimo(): Promise<Produto[]> {
    const ativos = await this.ativos()
    return ativos
      .filter((p) => p.quantidade <= p.quantidadeMinima)
      .sort((a, b) => a.quantidade - b.quantidade)
  }

  /**
   * O saldo é sempre consequência das movimentações — nunca digitado
   * direto. É o que garante que o estoque tenha história, e não só um
   * número solto que alguém pode ter corrigido no susto.
   */
  async movimentar(dados: {
    produtoId: string
    tipo: TipoMovimento
    quantidade: number
    motivo?: string | null
    agendamentoId?: string | null
    custoUnitario?: number
  }): Promise<void> {
    if (dados.quantidade <= 0) {
      throw new ErroDeRegra('A quantidade precisa ser maior que zero.')
    }

    /*
      Com banco, o movimento e o saldo entram juntos — e o produto fica
      travado enquanto isso.

      Sem o lock, duas baixas simultâneas do mesmo produto leem o mesmo
      saldo, cada uma subtrai a sua quantidade e as duas gravam o mesmo
      resultado. Saíram doze unidades, o sistema registra seis, e o
      produto acaba na prateleira antes de acabar na tela.

      A ordem antiga — criar o movimento, depois atualizar o produto —
      tinha o problema irmão: uma falha entre as duas deixava um
      movimento gravado sem efeito no saldo. Como o saldo é derivado
      das movimentações, a contagem física deixava de bater para
      sempre, e sem saber qual movimento não foi aplicado.
    */
    if (temSupabase()) {
      await chamarPortal('movimentar_estoque', {
        p_produto_id: dados.produtoId,
        p_tipo: dados.tipo,
        p_quantidade: dados.quantidade,
        p_motivo: dados.motivo ?? null,
        p_agendamento_id: dados.agendamentoId ?? null,
        p_custo_unitario: dados.custoUnitario ?? null,
      })

      armazenamento.invalidar?.('produtos')
      armazenamento.invalidar?.('movimentos')
      publicarMudanca('produtos')
      publicarMudanca('movimentos')
      return
    }

    const produto = await this.buscar(dados.produtoId)
    if (!produto) throw new ErroDeRegra('Produto não encontrado.')

    const regra = TIPO_MOVIMENTO[dados.tipo]
    const delta = regra.soma ? dados.quantidade : -dados.quantidade
    const saldo = Number((produto.quantidade + delta).toFixed(3))

    if (saldo < 0) {
      throw new ErroDeRegra(
        `Saldo insuficiente: restam ${produto.quantidade} ${produto.unidade} de ${produto.nome}.`,
      )
    }

    await movimentosRepo.criar({
      produtoId: dados.produtoId,
      agendamentoId: dados.agendamentoId ?? null,
      tipo: dados.tipo,
      quantidade: dados.quantidade,
      motivo: dados.motivo ?? null,
    })

    const mudancas: Partial<Produto> = { quantidade: saldo }

    /**
     * Entrada com preço informado recalcula o custo médio ponderado.
     * É esse número que vale para apurar margem: o preço da última
     * compra distorce quando o fornecedor varia.
     */
    if (dados.tipo === 'entrada' && dados.custoUnitario && dados.custoUnitario > 0) {
      const valorAtual = produto.quantidade * produto.precoMedio
      const valorEntrada = dados.quantidade * dados.custoUnitario

      mudancas.precoMedio = Number(((valorAtual + valorEntrada) / saldo).toFixed(4))
      mudancas.precoCusto = dados.custoUnitario
    }

    await this.atualizar(dados.produtoId, mudancas)
  }

  /** Situação derivada do saldo e da validade. Nunca é digitada. */
  situacao(produto: Produto): SituacaoProduto {
    if (!produto.ativo) return 'inativo'
    if (produto.validade && new Date(produto.validade) < new Date()) return 'vencido'
    if (produto.quantidade <= 0) return 'esgotado'
    if (produto.quantidade <= produto.quantidadeMinima) return 'baixo'
    return 'disponivel'
  }

  /** Produtos vencendo dentro da janela informada. */
  async vencendoEm(dias: number): Promise<Produto[]> {
    const limite = new Date()
    limite.setDate(limite.getDate() + dias)

    const ativos = await this.ativos()
    return ativos
      .filter((p) => p.validade && new Date(p.validade) <= limite)
      .sort((a, b) => (a.validade ?? '').localeCompare(b.validade ?? ''))
  }

  /** Valor imobilizado em estoque, pelo custo médio. */
  async valorImobilizado(): Promise<number> {
    const ativos = await this.ativos()
    return ativos.reduce((soma, p) => soma + p.quantidade * p.precoMedio, 0)
  }
}

class RepositorioFornecedores extends RepositorioBase<Fornecedor> {
  constructor() {
    super('fornecedores')
  }

  async ordenados(): Promise<Fornecedor[]> {
    const todos = await this.listar()
    return todos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
}

export const produtosRepo = new RepositorioProdutos()
export const movimentosRepo = new RepositorioMovimentos()
export const fornecedoresRepo = new RepositorioFornecedores()
