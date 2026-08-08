import { agendamentosRepo } from '../../repositorios/agenda'
import { estaAtivo } from '../../agenda/regras'
import { ROTAS } from '@/constants'
import { faixaDeDias, primeiroDiaDoMes } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { semDados } from './comuns'
import type { Resposta } from '../tipos'

/** Respostas sobre desempenho da equipe e dos serviços. */

export async function profissionalDestaque(): Promise<Resposta> {
  const hoje = new Date()
  const { de, ate } = faixaDeDias(primeiroDiaDoMes(hoje), hoje)

  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const ativos = agendamentos.filter(estaAtivo)

  if (ativos.length === 0) {
    return semDados('Ainda não há atendimentos neste mês para comparar.', 'profissional_destaque')
  }

  const porPessoa = new Map<string, { nome: string; total: number; vezes: number }>()

  for (const a of ativos) {
    const nome = a.profissional?.nome ?? 'Sem profissional'
    const atual = porPessoa.get(nome) ?? { nome, total: 0, vezes: 0 }
    atual.total += a.preco - a.desconto
    atual.vezes += 1
    porPessoa.set(nome, atual)
  }

  const ranking = [...porPessoa.values()].sort((a, b) => b.total - a.total)
  const primeira = ranking[0]!

  return {
    intencao: 'profissional_destaque',
    texto:
      `${primeira.nome} lidera o mês com ${dinheiro(primeira.total)} em ${primeira.vezes} atendimento(s).` +
      (ranking[1] ? ` Em seguida vem ${ranking[1].nome}, com ${dinheiro(ranking[1].total)}.` : ''),
    destaques: ranking.slice(0, 3).map((p) => ({
      rotulo: p.nome,
      valor: dinheiro(p.total),
      detalhe: `${p.vezes} atendimentos`,
    })),
    destino: ROTAS.relatorios,
    rotuloDestino: 'Ver relatórios',
  }
}

export async function servicoMaisVendido(): Promise<Resposta> {
  const hoje = new Date()
  const { de, ate } = faixaDeDias(primeiroDiaDoMes(hoje), hoje)

  const agendamentos = await agendamentosRepo.detalhadosNoPeriodo(de, ate)
  const ativos = agendamentos.filter(estaAtivo)

  if (ativos.length === 0) {
    return semDados('Ainda não há atendimentos neste mês.', 'servico_mais_vendido')
  }

  const porServico = new Map<string, { nome: string; vezes: number; total: number }>()

  for (const a of ativos) {
    const nome = a.servico?.nome ?? 'Outro'
    const atual = porServico.get(nome) ?? { nome, vezes: 0, total: 0 }
    atual.vezes += 1
    atual.total += a.preco - a.desconto
    porServico.set(nome, atual)
  }

  const porVolume = [...porServico.values()].sort((a, b) => b.vezes - a.vezes)
  const porValor = [...porServico.values()].sort((a, b) => b.total - a.total)

  const campeao = porVolume[0]!
  const maisRende = porValor[0]!

  const observacao =
    campeao.nome !== maisRende.nome
      ? ` Em faturamento, quem rende mais é ${maisRende.nome}, com ${dinheiro(maisRende.total)}.`
      : ''

  return {
    intencao: 'servico_mais_vendido',
    texto: `${campeao.nome} é o mais procurado do mês, com ${campeao.vezes} atendimento(s).${observacao}`,
    destaques: porVolume.slice(0, 3).map((s) => ({
      rotulo: s.nome,
      valor: `${s.vezes}×`,
      detalhe: dinheiro(s.total),
    })),
    destino: ROTAS.relatorios,
    rotuloDestino: 'Ver relatórios',
  }
}
