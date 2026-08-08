import { RepositorioBase } from './base'
import { servicosRepo } from './servicos'
import { clientesRepo } from './clientes'
import { profissionaisRepo, jornadaRepo, studioRepo } from './equipe'
import { reservasRepo } from './portal'
import { bloqueiosRepo } from './bloqueios'
import {
  calcularFim, garantirCapacidade, garantirHorarioLivre, garantirSemBloqueio,
  garantirSemReserva, estaAtivo,
} from '../agenda/regras'
import { gradeDeHorarios, horariosLivres, profissionaisDoServico } from '../agenda/horarios'
import { confereTelefone, gerarProtocolo, limparProtocolo } from '../agenda/protocolo'
import { ErroDeRegra } from '@/utils/erros'
import { faixaDeDias } from '@/utils/datas'
import type {
  Agendamento, AgendamentoDetalhado, OpcaoDeHorario, SituacaoAgendamento,
} from '@/types'

class RepositorioAgendamentos extends RepositorioBase<Agendamento> {
  constructor() {
    super('agendamentos')
  }

  async noPeriodo(de: string, ate: string): Promise<Agendamento[]> {
    const todos = await this.listar()
    return todos
      .filter((a) => a.inicio >= de && a.inicio < ate)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
  }

  async doCliente(clienteId: string): Promise<Agendamento[]> {
    const todos = await this.listar()
    return todos
      .filter((a) => a.clienteId === clienteId)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }

  /**
   * Busca pelo código que a cliente guardou.
   *
   * É a chave dela para o portal: sem senha, sem cadastro, sem login.
   * O telefone entra junto como segunda confirmação — protocolo sozinho
   * seria adivinhável em seis tentativas de sorte.
   */
  async porProtocolo(protocolo: string, telefone?: string): Promise<Agendamento | null> {
    const alvo = limparProtocolo(protocolo)
    if (!alvo) return null

    const todos = await this.listar()
    const encontrado = todos.find((a) => a.protocolo === alvo)
    if (!encontrado || !telefone) return encontrado ?? null

    return confereTelefone(await this.telefoneDe(encontrado), telefone) ? encontrado : null
  }

  /** O telefone de contato, venha da ficha da cliente ou do avulso. */
  private async telefoneDe(agendamento: Agendamento): Promise<string | null> {
    if (agendamento.telefoneAvulso) return agendamento.telefoneAvulso
    if (!agendamento.clienteId) return null

    const cliente = await clientesRepo.buscar(agendamento.clienteId)
    return cliente?.whatsapp ?? cliente?.telefone ?? null
  }

  private async novoProtocolo(): Promise<string> {
    const todos = await this.listar()
    return gerarProtocolo(new Set(todos.map((a) => a.protocolo)))
  }

  /** Junta serviço, cliente e profissional numa consulta só. */
  async detalhar(agendamentos: Agendamento[]): Promise<AgendamentoDetalhado[]> {
    const [servicos, clientes, profissionais] = await Promise.all([
      servicosRepo.listar(),
      clientesRepo.listar(),
      profissionaisRepo.listar(),
    ])

    const porId = <T extends { id: string }>(lista: T[]) =>
      new Map(lista.map((item) => [item.id, item]))

    const mapaServicos = porId(servicos)
    const mapaClientes = porId(clientes)
    const mapaProfissionais = porId(profissionais)

    return agendamentos.map((a) => ({
      ...a,
      servico: mapaServicos.get(a.servicoId) ?? null,
      cliente: a.clienteId ? mapaClientes.get(a.clienteId) ?? null : null,
      profissional: mapaProfissionais.get(a.profissionalId) ?? null,
    }))
  }

  async detalhadosNoPeriodo(de: string, ate: string): Promise<AgendamentoDetalhado[]> {
    return this.detalhar(await this.noPeriodo(de, ate))
  }

  /**
   * Cria o agendamento aplicando todas as regras do domínio.
   * Nenhuma tela grava direto: passa por aqui.
   */
  async agendar(dados: {
    clienteId: string | null
    profissionalId: string
    servicoId: string
    inicio: string
    preco?: number
    desconto?: number
    observacao?: string | null
    cupomId?: string | null
    origem?: 'painel' | 'link'
    nomeAvulso?: string | null
    telefoneAvulso?: string | null
    situacao?: SituacaoAgendamento
    /** Quem está confirmando pelo portal: a própria reserva não a atrapalha. */
    visitanteId?: string | null
  }): Promise<Agendamento> {
    const [servico, studio] = await Promise.all([
      servicosRepo.buscar(dados.servicoId),
      studioRepo.ler(),
    ])
    if (!servico) throw new ErroDeRegra('Serviço não encontrado.')

    const fim = calcularFim(dados.inicio, servico)
    const { de, ate } = faixaDeDias(new Date(dados.inicio), new Date(dados.inicio))

    const [existentes, bloqueios, reservas] = await Promise.all([
      this.noPeriodo(de, ate),
      bloqueiosRepo.noPeriodo(de, ate),
      reservasRepo.ativasNoPeriodo(de, ate),
    ])

    // A ordem das checagens é a ordem em que a cliente entende a recusa:
    // primeiro o studio está fechado, depois a profissional está ocupada,
    // depois alguém chegou antes, e só então o teto do espaço.
    garantirSemBloqueio({ ...dados, fim }, bloqueios)
    garantirHorarioLivre({ ...dados, fim }, existentes)
    garantirSemReserva({ ...dados, fim, visitanteId: dados.visitanteId ?? null }, reservas)
    garantirCapacidade({ inicio: dados.inicio, fim }, existentes, studio?.atendimentosSimultaneos ?? 0)

    return this.criar({
      clienteId: dados.clienteId,
      profissionalId: dados.profissionalId,
      servicoId: dados.servicoId,
      inicio: dados.inicio,
      fim,
      situacao: dados.situacao ?? 'confirmado',
      preco: dados.preco ?? servico.preco,
      desconto: dados.desconto ?? 0,
      observacao: dados.observacao ?? null,
      origem: dados.origem ?? 'painel',
      nomeAvulso: dados.nomeAvulso ?? null,
      telefoneAvulso: dados.telefoneAvulso ?? null,
      cupomId: dados.cupomId ?? null,
      protocolo: await this.novoProtocolo(),
      situacaoAnterior: null,
      chegouEm: null,
      iniciadoEm: null,
      finalizadoEm: null,
      remarcacoes: [],
    })
  }

  /** Move ou altera um agendamento, revalidando o conflito. */
  async remarcar(
    id: string,
    mudancas: Partial<Pick<Agendamento, 'inicio' | 'profissionalId' | 'servicoId' | 'preco' | 'desconto' | 'observacao' | 'clienteId' | 'cupomId'>>,
    motivo?: string,
    porQuem?: string | null,
  ): Promise<Agendamento> {
    const atual = await this.buscar(id)
    if (!atual) throw new ErroDeRegra('Agendamento não encontrado.')

    const servicoId = mudancas.servicoId ?? atual.servicoId
    const servico = await servicosRepo.buscar(servicoId)
    if (!servico) throw new ErroDeRegra('Serviço não encontrado.')

    const inicio = mudancas.inicio ?? atual.inicio
    const profissionalId = mudancas.profissionalId ?? atual.profissionalId
    const fim = calcularFim(inicio, servico)

    const { de, ate } = faixaDeDias(new Date(inicio), new Date(inicio))
    const [existentes, bloqueios] = await Promise.all([
      this.noPeriodo(de, ate),
      bloqueiosRepo.noPeriodo(de, ate),
    ])

    const studio = await studioRepo.ler()

    garantirSemBloqueio({ profissionalId, inicio, fim }, bloqueios)
    garantirHorarioLivre({ profissionalId, inicio, fim, id }, existentes)
    garantirCapacidade({ inicio, fim, id }, existentes, studio?.atendimentosSimultaneos ?? 0)

    // O histórico de remarcação nunca é sobrescrito: empilha. É o que
    // permite responder depois "quantas vezes esta cliente remarcou".
    const mudouHorario = inicio !== atual.inicio || profissionalId !== atual.profissionalId

    const remarcacoes = mudouHorario
      ? [
          ...atual.remarcacoes,
          {
            em: new Date().toISOString(),
            deInicio: atual.inicio,
            paraInicio: inicio,
            deProfissionalId: atual.profissionalId,
            paraProfissionalId: profissionalId,
            motivo: motivo ?? null,
            porQuem: porQuem ?? null,
          },
        ]
      : atual.remarcacoes

    return this.atualizar(id, { ...mudancas, inicio, fim, remarcacoes })
  }

  async mudarSituacao(id: string, situacao: SituacaoAgendamento): Promise<Agendamento> {
    return this.atualizar(id, { situacao })
  }

  /**
   * A cliente avisou que chegou.
   *
   * Não mexe na situação: quem coloca alguém em atendimento é quem vai
   * atender. Chegar e ser chamada são coisas diferentes, e juntá-las
   * faria a agenda mentir sobre o que está acontecendo na cadeira.
   */
  async registrarChegada(id: string): Promise<Agendamento> {
    const atual = await this.buscar(id)
    if (!atual) throw new ErroDeRegra('Agendamento não encontrado.')
    if (atual.chegouEm) return atual

    return this.atualizar(id, { chegouEm: new Date().toISOString() })
  }

  /** Quem já chegou e ainda não foi chamada. */
  async aguardandoAtendimento(): Promise<Agendamento[]> {
    const { de, ate } = faixaDeDias(new Date(), new Date())
    const doDia = await this.noPeriodo(de, ate)

    return doDia.filter(
      (a) => a.chegouEm !== null && ['pendente', 'confirmado'].includes(a.situacao),
    )
  }

  /**
   * Horários livres de um dia. Reúne jornada, bloqueios e reservas e
   * entrega ao motor de cálculo.
   */
  async horariosDisponiveis(
    data: Date, servicoId: string, profissionalId: string, ignorarAgendamentoId?: string,
  ): Promise<Date[]> {
    const [servico, studio] = await Promise.all([
      servicosRepo.buscar(servicoId),
      studioRepo.ler(),
    ])
    if (!servico || !studio) return []

    const jornada = await jornadaRepo.doDia(data.getDay())
    const { de, ate } = faixaDeDias(data, data)

    const [agendamentos, bloqueios, reservas] = await Promise.all([
      this.noPeriodo(de, ate),
      bloqueiosRepo.noPeriodo(de, ate),
      reservasRepo.ativasNoPeriodo(de, ate),
    ])

    return horariosLivres({
      data, servico, profissionalId, jornada, bloqueios, agendamentos,
      reservas, studio, ignorarAgendamentoId,
    })
  }

  /**
   * A grade do dia com quem está livre em cada horário.
   *
   * É o que o portal consome. Aceita `profissionalId` nulo porque a
   * cliente pode não ter preferência — nesse caso o horário aparece se
   * *alguém* puder atender, e a escolha da pessoa fica para depois.
   */
  async gradeDoDia(
    data: Date,
    servicoId: string,
    profissionalId: string | null,
    visitanteId?: string | null,
  ): Promise<OpcaoDeHorario[]> {
    const [servico, studio, equipe] = await Promise.all([
      servicosRepo.buscar(servicoId),
      studioRepo.ler(),
      profissionaisRepo.atendentes(),
    ])
    if (!servico || !studio) return []

    const jornada = await jornadaRepo.doDia(data.getDay())
    const { de, ate } = faixaDeDias(data, data)

    const [agendamentos, bloqueios, reservas] = await Promise.all([
      this.noPeriodo(de, ate),
      bloqueiosRepo.noPeriodo(de, ate),
      reservasRepo.ativasNoPeriodo(de, ate),
    ])

    return gradeDeHorarios({
      data, servico, profissionais: equipe, profissionalId, jornada,
      bloqueios, agendamentos, reservas, visitanteId, studio,
      paraOPortal: true,
    })
  }

  /** Quem pode atender um serviço. Usado pelo portal e pelo formulário. */
  async profissionaisDoServico(servicoId: string) {
    const [servico, equipe] = await Promise.all([
      servicosRepo.buscar(servicoId),
      profissionaisRepo.atendentes(),
    ])
    return servico ? profissionaisDoServico(servico, equipe) : []
  }

  /** Total previsto de um conjunto de agendamentos. */
  totalPrevisto(agendamentos: Agendamento[]): number {
    return agendamentos
      .filter(estaAtivo)
      .reduce((soma, a) => soma + a.preco - a.desconto, 0)
  }
}

export const agendamentosRepo = new RepositorioAgendamentos()

// Reexportado para quem já importava daqui: bloqueio e agendamento são
// domínios vizinhos, e quebrar a importação de dez arquivos não pagaria
// a arrumação.
export { bloqueiosRepo } from './bloqueios'
