import { agendamentosRepo } from './repositorios/agenda'
import { caixaRepo } from './repositorios/caixa'
import { procedimentosRepo } from './repositorios/procedimentos'
import { servicosRepo } from './repositorios/servicos'
import { clientesRepo } from './repositorios/clientes'
import { lancamentosRepo } from './repositorios/financeiro'
import { fidelidadeRepo, pontosRepo } from './repositorios/fidelidade'
import { armazenamento } from './storage'
import { chamarPortal, temSupabase } from './supabase/cliente'
import { isoData } from '@/utils/datas'
import { ErroDeRegra } from '@/utils/erros'
import type { Agendamento, FormaPagamento, ProdutoConsumido } from '@/types'

/**
 * Fechamento do atendimento.
 *
 * Concluir dispara seis consequências: fecha o atendimento, registra o
 * procedimento, dá baixa nos produtos consumidos, lança a receita,
 * credita pontos e entra no caixa.
 *
 * **Com banco, as seis acontecem dentro de uma função do Postgres.**
 *
 * Não é preferência arquitetural. Feitas daqui, são seis gravações
 * independentes, e entre uma e outra cabe uma queda de sinal no meio
 * de um atendimento. O que sobra é um banco pela metade: atendimento
 * concluído sem receita — e o dia fecha com menos dinheiro do que
 * entrou —, ou receita sem atendimento, e fecha com mais. Pontos
 * creditados para um atendimento que não existe. Baixa de estoque
 * gravada com o saldo do produto intacto.
 *
 * Nenhum código de aplicação fecha essa janela, porque o problema é
 * justamente o código de aplicação parar no meio. Uma função do
 * Postgres roda inteira ou não roda.
 *
 * Sem banco, o caminho antigo continua: ali o armazenamento é de um
 * aparelho só, síncrono, e não há rede para cair entre as etapas.
 */
export async function concluirAtendimento(
  id: string,
  extras: {
    produtos?: ProdutoConsumido[]
    observacoes?: string | null
    recomendacoes?: string | null
    proximoPasso?: string | null
    forma?: FormaPagamento
  } = {},
): Promise<Agendamento> {
  if (temSupabase()) {
    const [bruto] = await chamarPortal<Record<string, unknown>[]>('concluir_atendimento', {
      p_agendamento_id: id,
      p_produtos: extras.produtos ?? [],
      p_observacoes: extras.observacoes ?? null,
      p_recomendacoes: extras.recomendacoes ?? null,
      p_proximo_passo: extras.proximoPasso ?? null,
      p_forma: extras.forma ?? 'pix',
    })

    if (!bruto) throw new ErroDeRegra('Não foi possível concluir o atendimento.')

    // O espelho desta aba está velho: a função mexeu em seis tabelas.
    armazenamento.invalidar?.()
    return paraCamelo(bruto) as unknown as Agendamento
  }

  const agendamento = await agendamentosRepo.buscar(id)
  if (!agendamento) throw new Error('Agendamento não encontrado.')
  if (agendamento.situacao === 'concluido') return agendamento

  const agora = new Date().toISOString()
  const atualizado = await agendamentosRepo.atualizar(id, {
    situacao: 'concluido',
    finalizadoEm: agora,
    iniciadoEm: agendamento.iniciadoEm ?? agendamento.inicio,
  })

  const liquido = Math.max(atualizado.preco - atualizado.desconto, 0)

  // O procedimento é o registro do que aconteceu — é ele que alimenta a
  // ficha de evolução da cliente e dá baixa nos produtos consumidos.
  await registrarProcedimento(atualizado, extras)

  if (liquido > 0) {
    await lancarReceita(atualizado, liquido)
    await creditarPontos(atualizado, liquido)
    await lancarNoCaixa(atualizado, liquido, extras.forma ?? 'pix')
  }

  return atualizado
}

/** Cria o procedimento correspondente, se ainda não existir. */
async function registrarProcedimento(
  agendamento: Agendamento,
  extras: {
    produtos?: ProdutoConsumido[]
    observacoes?: string | null
    recomendacoes?: string | null
    proximoPasso?: string | null
  },
): Promise<void> {
  if (!agendamento.clienteId) return

  const existente = await procedimentosRepo.doAgendamento(agendamento.id)
  if (existente) return

  const minutos = Math.round(
    (new Date(agendamento.fim).getTime() - new Date(agendamento.inicio).getTime()) / 60_000,
  )

  await procedimentosRepo.registrar({
    agendamentoId: agendamento.id,
    clienteId: agendamento.clienteId,
    profissionalId: agendamento.profissionalId,
    servicoId: agendamento.servicoId,
    realizadoEm: agendamento.inicio,
    duracaoMinutos: minutos,
    valor: agendamento.preco,
    desconto: agendamento.desconto,
    produtos: extras.produtos ?? [],
    observacoes: extras.observacoes ?? agendamento.observacao,
    recomendacoes: extras.recomendacoes ?? null,
    proximoPasso: extras.proximoPasso ?? null,
  })
}

/**
 * Lança no caixa do dia, quando houver um aberto.
 *
 * Não abrimos caixa automaticamente: abrir é um ato consciente, com
 * valor de troco conferido. Sem caixa aberto, a receita entra só no
 * financeiro e o painel do caixa mostra o atendimento como pendente.
 */
async function lancarNoCaixa(
  agendamento: Agendamento,
  valor: number,
  forma: FormaPagamento,
): Promise<void> {
  const caixa = await caixaRepo.aberto()
  if (!caixa) return

  const servico = await servicosRepo.buscar(agendamento.servicoId)

  await caixaRepo.movimentar({
    tipo: 'entrada',
    origem: 'atendimento',
    descricao: servico?.nome ?? 'Atendimento',
    valor,
    forma,
    agendamentoId: agendamento.id,
    profissionalId: agendamento.profissionalId,
  })
}

/** Receita entra no caixa como já recebida, na data do atendimento. */
async function lancarReceita(agendamento: Agendamento, valor: number): Promise<void> {
  const jaLancado = await lancamentosRepo.doAgendamento(agendamento.id)
  if (jaLancado) return

  const [servico, cliente] = await Promise.all([
    servicosRepo.buscar(agendamento.servicoId),
    agendamento.clienteId ? clientesRepo.buscar(agendamento.clienteId) : Promise.resolve(null),
  ])

  const descricao = [servico?.nome ?? 'Atendimento', cliente?.nome].filter(Boolean).join(' · ')

  await lancamentosRepo.criar({
    agendamentoId: agendamento.id,
    clienteId: agendamento.clienteId,
    tipo: 'receita',
    situacao: 'recebido',
    categoria: 'Serviços',
    descricao,
    valor,
    forma: null,
    vencimento: isoData(new Date(agendamento.inicio)),
    pagoEm: new Date().toISOString(),
  })
}

/** Pontos só entram se o programa estiver ligado e houver ficha de cliente. */
async function creditarPontos(agendamento: Agendamento, valor: number): Promise<void> {
  if (!agendamento.clienteId) return

  const configuracao = await fidelidadeRepo.ler()
  if (!configuracao.ativo) return

  await pontosRepo.criar({
    clienteId: agendamento.clienteId,
    agendamentoId: agendamento.id,
    pontos: Math.floor(valor * configuracao.pontosPorReal),
    motivo: 'atendimento',
  })
}

/**
 * Resumo consolidado de uma cliente. Calculado do histórico, nunca
 * guardado — assim nunca fica desatualizado.
 */
export async function resumoDoCliente(clienteId: string) {
  const [agendamentos, pontos] = await Promise.all([
    agendamentosRepo.doCliente(clienteId),
    pontosRepo.saldoDoCliente(clienteId),
  ])

  const concluidos = agendamentos.filter((a) => a.situacao === 'concluido')
  const datas = concluidos.map((a) => a.inicio).sort()

  const primeira = datas[0] ?? null
  const ultima = datas[datas.length - 1] ?? null

  const intervaloMedioDias =
    concluidos.length > 1 && primeira && ultima
      ? Math.round(
          (new Date(ultima).getTime() - new Date(primeira).getTime()) /
            86_400_000 /
            (concluidos.length - 1),
        )
      : null

  return {
    visitas: concluidos.length,
    totalGasto: concluidos.reduce((soma, a) => soma + a.preco - a.desconto, 0),
    ultimaVisita: ultima,
    primeiraVisita: primeira,
    faltas: agendamentos.filter((a) => a.situacao === 'faltou').length,
    intervaloMedioDias,
    pontos,
  }
}

/** snake_case do Postgres para o camelCase que as telas falam. */
function paraCamelo(linha: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    saida[chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase())] = valor
  }
  return saida
}
