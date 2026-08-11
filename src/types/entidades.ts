/**
 * Entidades do domínio.
 *
 * Nenhum tipo aqui depende de biblioteca externa ou de serviço online.
 * Quando o armazenamento local entrar (IndexedDB ou SQLite), estas
 * mesmas formas viram as tabelas — sem reescrever nada.
 */

/** Toda entidade persistida carrega identidade e carimbo de tempo. */
export interface Registro {
  id: string
  criadoEm: string
  atualizadoEm: string

  /**
   * Contador de alterações, mantido pelo banco.
   *
   * Serve para o controle otimista de concorrência: quem salva declara
   * em cima de qual versão estava editando, e o banco recusa se já
   * avançou. Sem isso, duas pessoas na mesma ficha significam que a
   * última a salvar apaga o trabalho da primeira — sem erro e sem
   * aviso.
   *
   * Opcional porque só existe com banco: no modo local não há duas
   * pessoas, e um registro recém-criado ainda não tem versão.
   */
  versao?: number
}

export type Papel =
  | 'proprietaria' | 'gerente' | 'profissional' | 'recepcao'
  /**
   * Acesso restrito à agenda.
   *
   * Não é um cargo — é um nível de acesso, e por isso destoa dos
   * outros quatro. Existe para a profissional parceira que precisa
   * enxergar e marcar horários sem alcançar dinheiro, estoque ou o
   * cadastro do salão.
   *
   * Fica no mesmo campo que os cargos porque é o campo que as telas já
   * consultam para decidir o que aparece. Separar em duas colunas
   * criaria a combinação impossível — "gerente com acesso só à
   * agenda" — e alguém acabaria por marcá-la.
   */
  | 'agenda'

export type SituacaoAgendamento =
  | 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'faltou'
  /* Pedidos vindos do portal. A cliente pede; quem decide é a proprietária. */
  | 'solicitou_alteracao' | 'solicitou_cancelamento'

export type TipoBloqueio =
  | 'almoco' | 'folga' | 'ferias' | 'bloqueio' | 'feriado' | 'pausa'
  /**
   * Horário guardado para encaixe.
   *
   * Some do portal e continua marcável pelo painel. É o intervalo que a
   * proprietária segura para a cliente antiga que liga em cima da hora —
   * quem sempre existiu e nunca coube num campo do sistema.
   */
  | 'encaixe'

export type TipoMovimento = 'entrada' | 'saida' | 'ajuste' | 'consumo' | 'perda'

export type TipoLancamento = 'receita' | 'despesa'

export type SituacaoLancamento = 'previsto' | 'pago' | 'recebido' | 'atrasado' | 'cancelado'

export type FormaPagamento =
  | 'dinheiro' | 'pix' | 'debito' | 'credito' | 'transferencia' | 'outro'

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */
export interface Studio extends Registro {
  nome: string
  identificador: string
  telefone: string | null
  whatsapp: string | null
  instagram: string | null
  endereco: string | null
  tema: string
  agendamentoAtivo: boolean
  antecedenciaMinutos: number
  horizonteDias: number
  intervaloMinutos: number
  confirmacaoManual: boolean

  /* ---- Identidade do salão ---------------------------------------
     Uma fonte de verdade só. Se o WhatsApp morar em dois lugares, um
     dia eles divergem — e o que a cliente vê é o errado, porque
     ninguém lembra de atualizar os dois.

     Tudo opcional: um salão sem logo, sem slogan e sem CNPJ funciona
     exatamente como antes.                                          */

  /** O nome que a cliente vê. Vazio = usa `nome`. */
  nomeFantasia: string | null
  /** Dados de contrato. Nunca saem para o portal público. */
  razaoSocial: string | null
  /** Só dígitos. A máscara é da tela. */
  cnpj: string | null
  descricao: string | null
  slogan: string | null
  email: string | null
  facebook: string | null
  site: string | null

  /** URL pública no bucket `identidade`. */
  logoUrl: string | null
  capaUrl: string | null

  /**
   * Cor escolhida pela proprietária. Vazio = usa a paleta de `tema`.
   *
   * Fica separada de `tema` de propósito: `tema` é uma das paletas
   * prontas, e esta é a escolha livre. O contraste do texto sobre ela
   * é calculado, nunca escolhido — ver `utils/contraste.ts`.
   */
  corPrincipal: string | null
  corSecundaria: string | null

  /* ---- Portal de Agendamento ---- */

  /**
   * Quantos atendimentos podem acontecer ao mesmo tempo no studio.
   * 0 = sem teto além da própria equipe. Serve para salas e lavatórios:
   * três profissionais livres não adiantam se só há duas cadeiras.
   */
  atendimentosSimultaneos: number

  /** Quanto tempo o horário fica preso enquanto a cliente preenche. */
  reservaMinutos: number

  /** A cliente escolhe a profissional, ou o sistema distribui? */
  escolhaDeProfissional: boolean

  /** Aceita pedidos de alteração e cancelamento pelo portal. */
  aceitaSolicitacoes: boolean

  /** Oferece entrar na lista de espera quando o dia está cheio. */
  listaEsperaAtiva: boolean

  /** Recado exibido no topo do portal. Vazio = não aparece. */
  recadoDoPortal: string | null

  /**
   * Teto de atendimentos por dia. 0 = sem teto.
   * Diferente do simultâneo: este é o fôlego do dia, não do momento.
   */
  limiteDiario: number

  /** A cliente pode avisar que chegou pelo portal. */
  checkinAtivo: boolean
}

export interface Profissional extends Registro {
  nome: string
  papel: Papel
  cor: string
  atende: boolean
  ativo: boolean
}

export interface JornadaDia {
  diaSemana: number
  aberto: boolean
  abre: string
  fecha: string
  almocoInicio: string | null
  almocoFim: string | null
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */
export interface Cliente extends Registro {
  nome: string
  telefone: string | null
  whatsapp: string | null
  instagram: string | null
  nascimento: string | null
  observacoes: string | null
  preferencias: string | null
  etiquetas: string[]
  aceitaContato: boolean
  ativo: boolean
}

/** Números derivados do histórico. Calculados, nunca digitados. */
export interface ResumoCliente {
  visitas: number
  totalGasto: number
  ultimaVisita: string | null
  primeiraVisita: string | null
  faltas: number
  intervaloMedioDias: number | null
  pontos: number
}

/* ------------------------------------------------------------------ */
/* Serviços                                                            */
/* ------------------------------------------------------------------ */
export interface Categoria extends Registro {
  nome: string
  ordem: number
}

export interface Servico extends Registro {
  categoriaId: string | null
  nome: string
  descricao: string | null
  duracaoMinutos: number
  intervaloMinutos: number
  preco: number
  cor: string
  noLinkPublico: boolean
  ativo: boolean
  ordem: number
  /**
   * Quem sabe fazer este serviço. Lista vazia = toda a equipe que atende.
   * É o que impede o portal de oferecer progressiva com a manicure.
   */
  profissionaisIds: string[]
  /**
   * O que este serviço consome do estoque.
   *
   * Concluir o atendimento dá baixa sozinho — é o que faz o estoque
   * bater sem ninguém anotar nada, que é justamente o momento em que
   * todo controle de estoque manual morre.
   */
  produtos: ConsumoDeProduto[]
}

/** Quanto de um produto um serviço gasta. */
export interface ConsumoDeProduto {
  produtoId: string
  quantidade: number
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */
export interface Agendamento extends Registro {
  clienteId: string | null
  profissionalId: string
  servicoId: string
  inicio: string
  fim: string
  situacao: SituacaoAgendamento
  preco: number
  desconto: number
  observacao: string | null
  origem: 'painel' | 'link'
  nomeAvulso: string | null
  telefoneAvulso: string | null
  cupomId: string | null
  /**
   * Código curto que a cliente guarda. É a chave dela para consultar o
   * próprio horário no portal — sem senha, sem cadastro, sem login.
   */
  protocolo: string
  /**
   * Guarda a situação de antes quando entra um pedido da cliente.
   * Recusar o pedido devolve o agendamento exatamente onde estava.
   */
  situacaoAnterior: SituacaoAgendamento | null
  /** Preenchido quando o atendimento é iniciado e concluído de fato. */
  iniciadoEm: string | null
  finalizadoEm: string | null
  /** Quando a cliente avisou que chegou. Null = ainda não avisou. */
  chegouEm: string | null
  /** Histórico de remarcações, para a agenda nunca perder o rastro. */
  remarcacoes: Remarcacao[]
}

/** Registro de uma mudança de horário. Nunca apaga, só empilha. */
export interface Remarcacao {
  em: string
  deInicio: string
  paraInicio: string
  deProfissionalId: string
  paraProfissionalId: string
  motivo: string | null
  /** Quem mexeu. Sem isto o histórico responde "quando" e não "quem". */
  porQuem: string | null
}

export interface Bloqueio extends Registro {
  profissionalId: string | null
  tipo: TipoBloqueio
  motivo: string | null
  inicio: string
  fim: string
}

/** Agendamento com serviço, cliente e profissional já resolvidos. */
export interface AgendamentoDetalhado extends Agendamento {
  servico: Servico | null
  cliente: Cliente | null
  profissional: Profissional | null
}

/* ------------------------------------------------------------------ */
/* Estoque                                                             */
/* ------------------------------------------------------------------ */
export interface Fornecedor extends Registro {
  nome: string
  telefone: string | null
  observacoes: string | null
}

export type SituacaoProduto = 'disponivel' | 'baixo' | 'esgotado' | 'vencido' | 'inativo'

export interface Produto extends Registro {
  fornecedorId: string | null
  codigo: string | null
  nome: string
  marca: string | null
  categoria: string | null
  unidade: string
  quantidade: number
  quantidadeMinima: number
  precoCusto: number
  /**
   * Custo médio ponderado, recalculado a cada entrada. É o número que
   * vale para apurar margem — o preço da última compra distorce.
   */
  precoMedio: number
  precoVenda: number
  validade: string | null
  ativo: boolean
}

export interface MovimentoEstoque extends Registro {
  produtoId: string
  agendamentoId: string | null
  tipo: TipoMovimento
  quantidade: number
  motivo: string | null
}

/* ------------------------------------------------------------------ */
/* Financeiro                                                          */
/* ------------------------------------------------------------------ */
export interface Lancamento extends Registro {
  agendamentoId: string | null
  clienteId: string | null
  tipo: TipoLancamento
  situacao: SituacaoLancamento
  categoria: string | null
  descricao: string
  valor: number
  forma: FormaPagamento | null
  vencimento: string
  pagoEm: string | null
}

export interface Meta extends Registro {
  mes: string
  valor: number
}

/* ------------------------------------------------------------------ */
/* Fidelidade                                                          */
/* ------------------------------------------------------------------ */
export interface ConfiguracaoFidelidade {
  ativo: boolean
  pontosPorReal: number
  valorDoPonto: number
  validadeDias: number | null
}

export interface PontoFidelidade extends Registro {
  clienteId: string
  agendamentoId: string | null
  pontos: number
  motivo: string
}
