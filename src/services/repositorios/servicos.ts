import { RepositorioBase } from './base'
import type { Categoria, Servico } from '@/types'

class RepositorioServicos extends RepositorioBase<Servico> {
  constructor() {
    super('servicos')
  }

  async ativos(): Promise<Servico[]> {
    const todos = await this.listar()
    return todos.filter((s) => s.ativo).sort(porOrdemENome)
  }

  async publicos(): Promise<Servico[]> {
    return (await this.ativos()).filter((s) => s.noLinkPublico)
  }

  /** Tempo total que o serviço ocupa na agenda, incluindo o intervalo. */
  ocupacaoMinutos(servico: Servico): number {
    return servico.duracaoMinutos + servico.intervaloMinutos
  }
}

class RepositorioCategorias extends RepositorioBase<Categoria> {
  constructor() {
    super('categorias')
  }

  async ordenadas(): Promise<Categoria[]> {
    const todas = await this.listar()
    return todas.sort((a, b) => a.ordem - b.ordem)
  }
}

const porOrdemENome = (a: Servico, b: Servico) =>
  a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')

export const servicosRepo = new RepositorioServicos()
export const categoriasRepo = new RepositorioCategorias()
