import { armazenamento } from './storage'
import { novoId, protocoloCurto } from '@/utils/id'
import { isoData } from '@/utils/datas'
import type {
  Agendamento, Categoria, Cliente, ConfiguracaoFidelidade, Cupom, EntradaListaEspera,
  JornadaDia, Lancamento, Produto, Profissional, Servico, Studio,
} from '@/types'

/**
 * Carga de demonstração.
 *
 * Existe para as telas terem o que mostrar enquanto não há armazenamento
 * local. É volátil: recarregou a página, volta ao início.
 *
 * PRÓXIMA ETAPA — quando o IndexedDB entrar, este arquivo passa a rodar
 * só na primeira abertura (quando o banco estiver vazio), ou pode ser
 * removido inteiro. Nada mais depende dele.
 */

const agora = () => new Date().toISOString()

const base = () => ({ id: novoId(), criadoEm: agora(), atualizadoEm: agora() })

/** Data relativa a hoje, para a demonstração nunca parecer velha. */
function dia(deslocamento: number, hora: number, minuto = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + deslocamento)
  d.setHours(hora, minuto, 0, 0)
  return d.toISOString()
}

export async function carregarDemonstracao(): Promise<void> {
  /* ---- Studio ---- */
  const studio: Studio = {
    ...base(),
    nome: 'Emely Barbosa Studio de Beleza',
    identificador: 'emely-barbosa',
    telefone: '11987654321',
    whatsapp: '11987654321',
    instagram: '@emelybarbosa',
    endereco: 'Rua das Acácias, 128 — Centro',
    tema: 'quartzo-ouro',

    /* Identidade — a demonstração mostra a área preenchida. */
    nomeFantasia: 'Emely Barbosa',
    razaoSocial: null,
    cnpj: null,
    descricao: 'Cabelo, unhas e estética no coração do bairro. Atendimento com hora marcada.',
    slogan: 'Sua beleza, no seu tempo',
    email: 'contato@emelybarbosa.com.br',
    facebook: null,
    site: null,
    logoUrl: null,
    capaUrl: null,
    corPrincipal: null,
    corSecundaria: null,

    agendamentoAtivo: true,
    antecedenciaMinutos: 120,
    horizonteDias: 60,
    intervaloMinutos: 15,
    confirmacaoManual: false,

    /* Portal de Agendamento */
    atendimentosSimultaneos: 2,
    reservaMinutos: 5,
    escolhaDeProfissional: true,
    aceitaSolicitacoes: true,
    listaEsperaAtiva: true,
    recadoDoPortal: 'Chegue com 10 minutinhos de antecedência 💛',
    limiteDiario: 0,
    checkinAtivo: true,
  }

  /* ---- Equipe ---- */
  const emely: Profissional = {
    ...base(), nome: 'Emely Barbosa', papel: 'proprietaria',
    cor: '#B08A3E', atende: true, ativo: true,
  }
  const carol: Profissional = {
    ...base(), nome: 'Carolina Reis', papel: 'profissional',
    cor: '#C98F98', atende: true, ativo: true,
  }
  const recepcao: Profissional = {
    ...base(), nome: 'Juliana Prado', papel: 'recepcao',
    cor: '#6B5B5E', atende: false, ativo: true,
  }

  /* ---- Jornada: terça a sábado ---- */
  const jornada: JornadaDia[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    aberto: diaSemana >= 2,
    abre: '09:00',
    fecha: '19:00',
    almocoInicio: '12:00',
    almocoFim: '13:00',
  }))

  /* ---- Serviços ---- */
  const catCabelo: Categoria = { ...base(), nome: 'Cabelo', ordem: 1 }
  const catUnhas: Categoria = { ...base(), nome: 'Unhas', ordem: 2 }
  const catEstetica: Categoria = { ...base(), nome: 'Estética', ordem: 3 }

  const servico = (
    categoriaId: string, nome: string, duracao: number,
    intervalo: number, preco: number, ordem: number, cor: string,
    descricao: string | null = null, profissionaisIds: string[] = [],
  ): Servico => ({
    ...base(),
    categoriaId, nome, descricao,
    duracaoMinutos: duracao, intervaloMinutos: intervalo,
    preco, cor, noLinkPublico: true, ativo: true, ordem,
    profissionaisIds, produtos: [],
  })

  const escova = servico(catCabelo.id, 'Escova', 40, 5, 60, 1, '#C98F98',
    'Lavagem, finalização e escova modelada.')
  const corte = servico(catCabelo.id, 'Corte feminino', 50, 10, 90, 2, '#B0737E',
    'Corte com consultoria de formato de rosto.')
  const coloracao = servico(catCabelo.id, 'Coloração', 120, 15, 220, 3, '#8E5A65',
    'Cor completa com finalização. Reserve duas horas.')
  // Progressiva e coloração são da Emely: é o serviço que exige a mão
  // dela, e oferecer no portal com quem não faz seria vender o que não
  // se pode entregar.
  const progressiva = servico(catCabelo.id, 'Progressiva', 180, 20, 350, 4, '#B08A3E',
    'Alisamento com selagem. A manhã inteira do studio é sua.', [emely.id])
  const hidratacao = servico(catCabelo.id, 'Hidratação', 60, 10, 110, 5, '#C8A85F',
    'Máscara profunda com finalização leve.')
  const manicure = servico(catUnhas.id, 'Manicure', 45, 5, 45, 6, '#D5AEB4',
    'Cutícula, lixamento e esmaltação.', [carol.id])
  const pedicure = servico(catUnhas.id, 'Pedicure', 50, 5, 50, 7, '#E4CDD0',
    'Cuidado completo dos pés com esmaltação.', [carol.id])
  const sobrancelha = servico(catEstetica.id, 'Design de sobrancelha', 30, 5, 45, 8, '#4F7A62',
    'Design com pinça e mapeamento do olhar.')
  const limpeza = servico(catEstetica.id, 'Limpeza de pele', 75, 15, 160, 9, '#6B5B5E',
    'Extração, máscara calmante e hidratação.', [carol.id])

  /* ---- Clientes ---- */
  const hoje = new Date()
  const cliente = (
    nome: string, telefone: string, nascimentoMes: number, nascimentoDia: number,
    preferencias: string | null = null,
  ): Cliente => ({
    ...base(),
    nome, telefone, whatsapp: telefone, instagram: null,
    nascimento: `1994-${String(nascimentoMes).padStart(2, '0')}-${String(nascimentoDia).padStart(2, '0')}`,
    observacoes: null, preferencias, etiquetas: [], aceitaContato: true, ativo: true,
  })

  const clientes: Cliente[] = [
    cliente('Beatriz Almeida', '11991234567', hoje.getMonth() + 1, hoje.getDate(), 'Prefere loiro frio'),
    cliente('Larissa Monteiro', '11992345678', 3, 14, 'Alérgica a amônia'),
    cliente('Fernanda Costa', '11993456789', 7, 2),
    cliente('Patrícia Nunes', '11994567890', 11, 23, 'Gosta de café sem açúcar'),
    cliente('Camila Duarte', '11995678901', 5, 9),
    cliente('Renata Lopes', '11996789012', 9, 30),
    cliente('Aline Barros', '11997890123', 1, 18),
    cliente('Vanessa Pires', '11998901234', 4, 5),
  ]

  /* ---- Agenda de hoje e dos próximos dias ---- */
  const agendamento = (
    clienteIndice: number, servicoAlvo: Servico, profissionalId: string,
    inicio: string, situacao: Agendamento['situacao'],
  ): Agendamento => {
    const minutos = servicoAlvo.duracaoMinutos + servicoAlvo.intervaloMinutos
    return {
      ...base(),
      clienteId: clientes[clienteIndice]!.id,
      profissionalId,
      servicoId: servicoAlvo.id,
      inicio,
      fim: new Date(new Date(inicio).getTime() + minutos * 60_000).toISOString(),
      situacao,
      preco: servicoAlvo.preco,
      desconto: 0,
      observacao: null,
      origem: 'painel',
      nomeAvulso: null,
      telefoneAvulso: null,
      cupomId: null,
      protocolo: protocoloCurto(),
      situacaoAnterior: null,
      chegouEm: null,
      iniciadoEm: situacao === 'concluido' || situacao === 'em_atendimento' ? inicio : null,
      finalizadoEm: situacao === 'concluido'
        ? new Date(new Date(inicio).getTime() + minutos * 60_000).toISOString()
        : null,
      remarcacoes: [],
    }
  }

  const agendamentos: Agendamento[] = [
    agendamento(0, escova, emely.id, dia(0, 9, 0), 'concluido'),
    agendamento(1, coloracao, emely.id, dia(0, 10, 0), 'em_atendimento'),
    agendamento(2, manicure, carol.id, dia(0, 9, 30), 'concluido'),
    agendamento(3, sobrancelha, carol.id, dia(0, 11, 0), 'confirmado'),
    agendamento(4, corte, emely.id, dia(0, 14, 0), 'confirmado'),
    agendamento(5, hidratacao, carol.id, dia(0, 15, 0), 'confirmado'),
    agendamento(6, progressiva, emely.id, dia(1, 9, 0), 'confirmado'),
    agendamento(7, pedicure, carol.id, dia(1, 10, 0), 'pendente'),
    agendamento(0, limpeza, carol.id, dia(2, 14, 0), 'confirmado'),
    agendamento(1, escova, emely.id, dia(3, 16, 0), 'confirmado'),
    agendamento(2, coloracao, emely.id, dia(-7, 10, 0), 'concluido'),
    agendamento(3, escova, carol.id, dia(-14, 11, 0), 'concluido'),
    agendamento(4, manicure, carol.id, dia(-21, 9, 0), 'concluido'),
    agendamento(5, corte, emely.id, dia(-3, 15, 0), 'faltou'),
  ]

  /* ---- Estoque ---- */
  let sequencia = 0
  const produto = (
    nome: string, marca: string, categoria: string, unidade: string,
    quantidade: number, minimo: number, custo: number,
  ): Produto => ({
    ...base(),
    fornecedorId: null,
    codigo: `P${String(++sequencia).padStart(4, '0')}`,
    nome, marca, categoria, unidade,
    quantidade, quantidadeMinima: minimo,
    precoCusto: custo, precoMedio: custo, precoVenda: custo * 2,
    validade: null, ativo: true,
  })

  const produtos: Produto[] = [
    produto('Shampoo hidratante 1L', 'Wella', 'Lavatório', 'un', 6, 2, 48),
    produto('Condicionador 1L', 'Wella', 'Lavatório', 'un', 4, 2, 52),
    produto('Coloração 7.1', 'L\'Oréal', 'Coloração', 'un', 2, 3, 34),
    produto('Água oxigenada 20vol', 'L\'Oréal', 'Coloração', 'un', 8, 3, 18),
    produto('Máscara de tratamento', 'Kérastase', 'Tratamento', 'un', 1, 2, 120),
    produto('Esmalte base', 'Risqué', 'Unhas', 'un', 12, 5, 8),
  ]

  /* ---- Financeiro: receitas dos concluídos + despesas fixas ---- */
  const lancamentos: Lancamento[] = []

  for (const a of agendamentos.filter((x) => x.situacao === 'concluido')) {
    const servicoDoAgendamento = [escova, corte, coloracao, progressiva, hidratacao, manicure, pedicure, sobrancelha, limpeza]
      .find((s) => s.id === a.servicoId)

    lancamentos.push({
      ...base(),
      agendamentoId: a.id,
      clienteId: a.clienteId,
      tipo: 'receita',
      situacao: 'recebido',
      categoria: 'Serviços',
      descricao: servicoDoAgendamento?.nome ?? 'Atendimento',
      valor: a.preco - a.desconto,
      forma: 'pix',
      vencimento: isoData(new Date(a.inicio)),
      pagoEm: a.inicio,
    })
  }

  lancamentos.push(
    {
      ...base(), agendamentoId: null, clienteId: null, tipo: 'despesa', situacao: 'pago',
      categoria: 'Fixas', descricao: 'Aluguel do espaço', valor: 1800, forma: 'transferencia',
      vencimento: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 5)), pagoEm: agora(),
    },
    {
      ...base(), agendamentoId: null, clienteId: null, tipo: 'despesa', situacao: 'previsto',
      categoria: 'Produtos', descricao: 'Reposição de coloração', valor: 420, forma: 'pix',
      vencimento: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 25)), pagoEm: null,
    },
  )

  /* ---- Cupons ---- */
  const cupons: Cupom[] = [
    {
      ...base(),
      codigo: 'VOLTA10', descricao: 'Retorno em até 30 dias',
      tipo: 'percentual', valor: 10,
      validoDe: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      validoAte: isoData(new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0)),
      limiteUsos: 50, usos: 7, servicosIds: [],
      valorMinimo: 80, descontoMaximo: 40, ativo: true,
    },
    {
      ...base(),
      codigo: 'INDICA25', descricao: 'Indicação de amiga',
      tipo: 'fixo', valor: 25,
      validoDe: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      validoAte: isoData(new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0)),
      limiteUsos: 0, usos: 3, servicosIds: [],
      valorMinimo: 100, descontoMaximo: 0, ativo: true,
    },
    {
      ...base(),
      codigo: 'PRIMEIRA15', descricao: 'Primeira visita ao studio',
      tipo: 'percentual', valor: 15,
      validoDe: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      validoAte: isoData(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
      limiteUsos: 20, usos: 20, servicosIds: [escova.id, corte.id],
      valorMinimo: 0, descontoMaximo: 60, ativo: true,
    },
  ]

  const fidelidade: ConfiguracaoFidelidade = {
    ativo: true, pontosPorReal: 1, valorDoPonto: 0.05, validadeDias: 365,
  }

  /* ---- Lista de espera ---- */
  const espera = (
    nome: string, telefone: string, servicoAlvo: Servico,
    deslocamento: number | null, periodo: EntradaListaEspera['periodo'],
    observacao: string | null = null,
  ): EntradaListaEspera => {
    const quando = new Date()
    quando.setDate(quando.getDate() + (deslocamento ?? 0))

    return {
      ...base(),
      clienteId: null, nome, telefone,
      servicoId: servicoAlvo.id,
      profissionalId: null,
      data: deslocamento === null ? null : isoData(quando),
      periodo, observacao,
      situacao: 'aguardando', avisadaEm: null, vagaInicio: null,
    }
  }

  const listaEspera: EntradaListaEspera[] = [
    espera('Juliana Ferraz', '11990011223', escova, 0, 'tarde', 'Casamento no sábado'),
    espera('Tatiane Alves', '11990022334', escova, 0, 'qualquer'),
    espera('Marina Rocha', '11990033445', coloracao, 1, 'manha'),
    espera('Cristiane Melo', '11990044556', manicure, null, 'tarde', 'Consegue vir correndo'),
  ]

  /* ---- Grava tudo ---- */
  await Promise.all([
    armazenamento.gravar('studio', [studio]),
    armazenamento.gravar('profissionais', [emely, carol, recepcao]),
    armazenamento.gravar('jornada', jornada),
    armazenamento.gravar('categorias', [catCabelo, catUnhas, catEstetica]),
    armazenamento.gravar('servicos', [
      escova, corte, coloracao, progressiva, hidratacao,
      manicure, pedicure, sobrancelha, limpeza,
    ]),
    armazenamento.gravar('clientes', clientes),
    armazenamento.gravar('agendamentos', agendamentos),
    armazenamento.gravar('bloqueios', []),
    armazenamento.gravar('reservas', []),
    armazenamento.gravar('solicitacoes', []),
    armazenamento.gravar('listaEspera', listaEspera),
    armazenamento.gravar('produtos', produtos),
    armazenamento.gravar('movimentos', []),
    armazenamento.gravar('fornecedores', []),
    armazenamento.gravar('lancamentos', lancamentos),
    armazenamento.gravar('metas', [{ ...base(), mes: isoData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), valor: 12000 }]),
    armazenamento.gravar('cupons', cupons),
    armazenamento.gravar('usosCupom', []),
    armazenamento.gravar('procedimentos', []),
    armazenamento.gravar('fotos', []),
    armazenamento.gravar('caixas', []),
    armazenamento.gravar('movimentosCaixa', []),
    armazenamento.gravar('lembretes', []),
    armazenamento.gravar('notificacoes', []),
    armazenamento.gravar('backups', []),
    armazenamento.gravar('registrosBackup', []),
    armazenamento.gravar('fidelidade', [fidelidade]),
    armazenamento.gravar('pontos', []),
    armazenamento.gravar('sessao', []),
  ])
}
