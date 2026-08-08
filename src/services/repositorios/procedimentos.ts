import { RepositorioBase } from './base'
import { produtosRepo } from './estoque'
import { ErroDeRegra } from '@/utils/erros'
import type { Foto, MomentoFoto, Procedimento, ProdutoConsumido } from '@/types'

/** Limite por foto. Acima disso o armazenamento do navegador estoura rápido. */
const LIMITE_FOTO_BYTES = 900_000

class RepositorioFotos extends RepositorioBase<Foto> {
  constructor() {
    super('fotos')
  }

  async doProcedimento(procedimentoId: string): Promise<Foto[]> {
    const todas = await this.listar()
    return todas.filter((f) => f.procedimentoId === procedimentoId)
  }

  async doCliente(clienteId: string): Promise<Foto[]> {
    const todas = await this.listar()
    return todas
      .filter((f) => f.clienteId === clienteId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  /**
   * Guarda a imagem.
   *
   * Hoje o conteúdo vai em base64 no armazenamento local. Quando o
   * Supabase Storage entrar, este método passa a subir o arquivo e
   * preencher `url` — a ficha da cliente lê `url ?? conteudo` e não muda.
   */
  async guardar(dados: {
    procedimentoId: string
    clienteId: string
    momento: MomentoFoto
    conteudo: string
    legenda?: string | null
    largura?: number | null
    altura?: number | null
  }): Promise<Foto> {
    const bytes = Math.ceil((dados.conteudo.length * 3) / 4)
    if (bytes > LIMITE_FOTO_BYTES) {
      throw new ErroDeRegra('A foto está muito grande. Reduza a qualidade e tente de novo.')
    }

    return this.criar({
      procedimentoId: dados.procedimentoId,
      clienteId: dados.clienteId,
      momento: dados.momento,
      conteudo: dados.conteudo,
      url: null,
      legenda: dados.legenda ?? null,
      largura: dados.largura ?? null,
      altura: dados.altura ?? null,
      tamanhoBytes: bytes,
    })
  }
}

class RepositorioProcedimentos extends RepositorioBase<Procedimento> {
  constructor() {
    super('procedimentos')
  }

  async doCliente(clienteId: string): Promise<Procedimento[]> {
    const todos = await this.listar()
    return todos
      .filter((p) => p.clienteId === clienteId)
      .sort((a, b) => b.realizadoEm.localeCompare(a.realizadoEm))
  }

  async doAgendamento(agendamentoId: string): Promise<Procedimento | null> {
    const todos = await this.listar()
    return todos.find((p) => p.agendamentoId === agendamentoId) ?? null
  }

  async noPeriodo(de: string, ate: string): Promise<Procedimento[]> {
    const todos = await this.listar()
    return todos
      .filter((p) => p.realizadoEm >= de && p.realizadoEm < ate)
      .sort((a, b) => b.realizadoEm.localeCompare(a.realizadoEm))
  }

  /** Carrega as fotos junto — a ficha precisa das duas coisas. */
  async comFotos(clienteId: string): Promise<Procedimento[]> {
    const [procedimentos, fotos] = await Promise.all([
      this.doCliente(clienteId),
      fotosRepo.doCliente(clienteId),
    ])

    const porProcedimento = new Map<string, Foto[]>()
    for (const foto of fotos) {
      porProcedimento.set(foto.procedimentoId, [
        ...(porProcedimento.get(foto.procedimentoId) ?? []),
        foto,
      ])
    }

    return procedimentos.map((p) => ({ ...p, fotos: porProcedimento.get(p.id) ?? [] }))
  }

  /**
   * Registra o que foi feito e dá baixa nos produtos consumidos.
   *
   * A baixa acontece aqui, e não na tela, para valer igual venha de onde
   * vier — painel, importação ou automação futura.
   */
  async registrar(dados: {
    agendamentoId: string | null
    clienteId: string
    profissionalId: string
    servicoId: string
    realizadoEm: string
    duracaoMinutos: number
    valor: number
    desconto?: number
    produtos?: ProdutoConsumido[]
    observacoes?: string | null
    recomendacoes?: string | null
    proximoPasso?: string | null
  }): Promise<Procedimento> {
    const produtos = dados.produtos ?? []
    const desconto = dados.desconto ?? 0

    // Valida o saldo de tudo antes de baixar qualquer coisa: assim não
    // resta um consumo pela metade se o terceiro item faltar.
    for (const item of produtos) {
      const produto = await produtosRepo.buscar(item.produtoId)
      if (!produto) throw new ErroDeRegra(`Produto não encontrado: ${item.nome}.`)
      if (produto.quantidade < item.quantidade) {
        throw new ErroDeRegra(
          `Saldo insuficiente de ${produto.nome}: restam ${produto.quantidade} ${produto.unidade}.`,
        )
      }
    }

    const procedimento = await this.criar({
      agendamentoId: dados.agendamentoId,
      clienteId: dados.clienteId,
      profissionalId: dados.profissionalId,
      servicoId: dados.servicoId,
      realizadoEm: dados.realizadoEm,
      duracaoMinutos: dados.duracaoMinutos,
      valor: dados.valor,
      desconto,
      valorFinal: Number((dados.valor - desconto).toFixed(2)),
      produtos,
      observacoes: dados.observacoes ?? null,
      recomendacoes: dados.recomendacoes ?? null,
      proximoPasso: dados.proximoPasso ?? null,
    })

    for (const item of produtos) {
      await produtosRepo.movimentar({
        produtoId: item.produtoId,
        tipo: 'consumo',
        quantidade: item.quantidade,
        motivo: `Atendimento de ${dados.realizadoEm.slice(0, 10)}`,
      })
    }

    return procedimento
  }
}

export const procedimentosRepo = new RepositorioProcedimentos()
export const fotosRepo = new RepositorioFotos()
