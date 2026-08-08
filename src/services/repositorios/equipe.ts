import { RepositorioBase } from './base'
import { publicarMudanca } from '../tempo-real'
import { armazenamento } from '../storage'
import { novoId } from '@/utils/id'
import type { JornadaDia, Profissional, Studio } from '@/types'

class RepositorioProfissionais extends RepositorioBase<Profissional> {
  constructor() {
    super('profissionais')
  }

  async ativos(): Promise<Profissional[]> {
    const todos = await this.listar()
    return todos
      .filter((p) => p.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  /** Quem aparece na grade da agenda e no link público. */
  async atendentes(): Promise<Profissional[]> {
    return (await this.ativos()).filter((p) => p.atende)
  }
}

class RepositorioStudio {
  async ler(): Promise<Studio | null> {
    const registros = await armazenamento.listar<Studio>('studio')
    return registros[0] ?? null
  }

  async gravar(studio: Studio): Promise<void> {
    await armazenamento.gravar('studio', [studio])
    publicarMudanca('studio')
  }

  async atualizar(mudancas: Partial<Studio>): Promise<Studio> {
    // `garantir` em vez de lançar: num banco recém-criado não existe
    // linha para atualizar, e recusar aqui deixava a proprietária sem
    // saída — ver o comentário de `garantir`.
    const atual = await this.garantir()

    const novo = { ...atual, ...mudancas, atualizadoEm: new Date().toISOString() }
    await this.gravar(novo)
    return novo
  }

  /**
   * Devolve o studio, criando um em branco se ainda não existir.
   *
   * Resolve um beco sem saída que aparecia só com banco de verdade.
   * Antes, a demonstração era carregada quando a tabela vinha vazia — e
   * um salão real abria o sistema pela primeira vez e encontrava
   * "Emely Barbosa Studio", três profissionais fictícias e catorze
   * clientes inventadas dentro do próprio Postgres.
   *
   * Bloquear aquilo estava certo. O que faltou foi o substituto: sem
   * linha na tabela `studio`, `atualizar` lançava "Studio ainda não
   * configurado", a tela de Configurações mostrava erro, e **não havia
   * como criar o studio pela interface**. O sistema abria e não deixava
   * começar.
   *
   * O que entra aqui não é demonstração: é uma ficha em branco. Nome
   * genérico para a proprietária trocar, horário comercial de terça a
   * sábado como ponto de partida, e nada mais. Nenhuma cliente,
   * nenhum serviço, nenhum agendamento inventado.
   */
  async garantir(): Promise<Studio> {
    const atual = await this.ler()
    if (atual) return atual

    const agora = new Date().toISOString()

    const novo: Studio = {
      id: novoId(),
      criadoEm: agora,
      atualizadoEm: agora,

      nome: 'Meu Studio',
      identificador: `studio-${Math.random().toString(36).slice(2, 8)}`,
      telefone: null,
      whatsapp: null,
      instagram: null,
      endereco: null,
      tema: 'quartzo-ouro',

      nomeFantasia: null,
      razaoSocial: null,
      cnpj: null,
      descricao: null,
      slogan: null,
      email: null,
      facebook: null,
      site: null,
      logoUrl: null,
      capaUrl: null,
      corPrincipal: null,
      corSecundaria: null,

      // O agendamento nasce PAUSADO de propósito: o link não pode
      // receber cliente antes de existir serviço e horário cadastrados.
      agendamentoAtivo: false,
      antecedenciaMinutos: 60,
      horizonteDias: 60,
      intervaloMinutos: 30,
      confirmacaoManual: false,
      atendimentosSimultaneos: 0,
      // Zero = sem teto diário. A proprietária define se quiser.
      limiteDiario: 0,
      reservaMinutos: 5,
      escolhaDeProfissional: true,
      aceitaSolicitacoes: true,
      listaEsperaAtiva: false,
      checkinAtivo: false,
      recadoDoPortal: null,
    }

    await this.gravar(novo)
    return novo
  }
}

class RepositorioJornada {
  /**
   * Semana de trabalho inicial: terça a sábado, 9h às 18h.
   *
   * Sem nenhum dia aberto o portal não mostra horário algum, e a
   * proprietária não tem como saber por quê. Um ponto de partida
   * plausível é mais útil do que uma semana vazia — e ela troca em
   * Configurações → Horários em trinta segundos.
   */
  async garantir(): Promise<JornadaDia[]> {
    const atual = await this.ler()
    if (atual.length > 0) return atual

    const semana: JornadaDia[] = Array.from({ length: 7 }, (_, dia) => ({
      diaSemana: dia,
      aberto: dia >= 2 && dia <= 6,
      abre: '09:00',
      fecha: '18:00',
      almocoInicio: '12:00',
      almocoFim: '13:00',
    }))

    await this.gravar(semana)
    return semana
  }

  async ler(): Promise<JornadaDia[]> {
    return armazenamento.listar<JornadaDia>('jornada')
  }

  async gravar(jornada: JornadaDia[]): Promise<void> {
    await armazenamento.gravar('jornada', jornada)
    publicarMudanca('jornada')
  }

  async doDia(diaSemana: number): Promise<JornadaDia | null> {
    const jornada = await this.ler()
    return jornada.find((j) => j.diaSemana === diaSemana && j.aberto) ?? null
  }
}

export const profissionaisRepo = new RepositorioProfissionais()
export const studioRepo = new RepositorioStudio()
export const jornadaRepo = new RepositorioJornada()
