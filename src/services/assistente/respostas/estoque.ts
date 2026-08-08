import { produtosRepo } from '../../repositorios/estoque'
import { ROTAS } from '@/constants'
import { semDados } from './comuns'
import type { Resposta } from '../tipos'

/** Respostas sobre estoque: o que falta e o que está vencendo. */

export async function produtoAcabando(): Promise<Resposta> {
  const baixo = await produtosRepo.abaixoDoMinimo()

  if (baixo.length === 0) {
    return semDados('Nenhum produto está abaixo do mínimo. O estoque está em ordem.', 'produto_acabando')
  }

  return {
    intencao: 'produto_acabando',
    texto:
      `${baixo.length} produto(s) precisam de reposição. O mais crítico é ${baixo[0]!.nome}, ` +
      `com ${baixo[0]!.quantidade} ${baixo[0]!.unidade} restantes.`,
    destaques: baixo.slice(0, 5).map((p) => ({
      rotulo: p.nome,
      valor: `${p.quantidade} ${p.unidade}`,
      detalhe: `Mínimo: ${p.quantidadeMinima}`,
    })),
    destino: ROTAS.estoque,
    rotuloDestino: 'Abrir o estoque',
  }
}

export async function produtoVencendo(): Promise<Resposta> {
  const vencendo = await produtosRepo.vencendoEm(60)

  if (vencendo.length === 0) {
    return semDados('Nenhum produto vence nos próximos 60 dias.', 'produto_vencendo')
  }

  return {
    intencao: 'produto_vencendo',
    texto: `${vencendo.length} produto(s) vencem nos próximos 60 dias.`,
    destaques: vencendo.slice(0, 5).map((p) => ({
      rotulo: p.nome,
      valor: p.validade ? new Date(p.validade).toLocaleDateString('pt-BR') : '—',
      detalhe: `${p.quantidade} ${p.unidade} em estoque`,
    })),
    destino: ROTAS.estoque,
    rotuloDestino: 'Abrir o estoque',
  }
}
