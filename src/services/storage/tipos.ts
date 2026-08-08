/**
 * A PORTA do armazenamento.
 *
 * Todo o sistema conversa com esta interface e com mais nada. Trocar o
 * armazenamento é escrever uma classe que a implemente e apontar
 * `storage/index.ts` para ela.
 *
 * Todos os métodos são assíncronos de propósito: IndexedDB, SQLite e
 * Supabase são assíncronos. Uma assinatura síncrona obrigaria a reescrever
 * o sistema inteiro na migração.
 */

/** Nome de cada coleção guardada. Equivale a uma tabela. */
export type Colecao =
  // Studio e equipe
  | 'studio' | 'profissionais' | 'jornada'
  // Clientes e atendimento
  | 'clientes' | 'categorias' | 'servicos' | 'agendamentos' | 'bloqueios'
  | 'procedimentos' | 'fotos'
  // Portal de agendamento
  | 'reservas' | 'solicitacoes' | 'listaEspera'
  // Estoque
  | 'fornecedores' | 'produtos' | 'movimentos'
  // Financeiro
  | 'lancamentos' | 'metas' | 'caixas' | 'movimentosCaixa'
  // Comercial
  | 'cupons' | 'usosCupom' | 'fidelidade' | 'pontos'
  // Comunicação
  | 'lembretes' | 'notificacoes' | 'modelosMensagem'
  // Sistema
  | 'backups' | 'registrosBackup' | 'configuracaoBackup' | 'sessao'

/**
 * Dados do studio. São estas — e apenas estas — que entram no backup.
 *
 * Duas coisas ruins aconteceriam se as coleções de sistema entrassem aqui:
 *
 * 1. Cada backup guardaria os backups anteriores dentro de si. O segundo
 *    conteria o primeiro, o terceiro conteria os dois... o arquivo cresce
 *    em progressão e enche o armazenamento.
 *
 * 2. Restaurar apagaria o histórico de backups do aparelho — inclusive a
 *    cópia de segurança criada instantes antes, que é justamente o
 *    caminho de volta se a restauração trouxer o arquivo errado.
 */
export const COLECOES: Colecao[] = [
  'studio', 'profissionais', 'jornada',
  'clientes', 'categorias', 'servicos', 'agendamentos', 'bloqueios',
  'procedimentos', 'fotos',
  'solicitacoes', 'listaEspera',
  'fornecedores', 'produtos', 'movimentos',
  'lancamentos', 'metas', 'caixas', 'movimentosCaixa',
  'cupons', 'usosCupom', 'fidelidade', 'pontos',
  'lembretes', 'notificacoes', 'modelosMensagem',
]

/**
 * Coleções que pertencem a este aparelho, não ao studio.
 * Nunca são exportadas nem sobrescritas por uma restauração.
 */
export const COLECOES_SISTEMA: Colecao[] = [
  'backups', 'registrosBackup', 'configuracaoBackup', 'sessao',
  // Reservas duram cinco minutos. Guardar num backup só ressuscitaria
  // horários presos por ninguém.
  'reservas',
]

/** Rótulos exibidos na Central de Backup. */
export const ROTULO_COLECAO: Record<Colecao, string> = {
  studio: 'Dados do studio',
  profissionais: 'Equipe',
  jornada: 'Horários de funcionamento',
  clientes: 'Clientes',
  categorias: 'Categorias de serviço',
  servicos: 'Serviços',
  agendamentos: 'Agendamentos',
  bloqueios: 'Bloqueios de agenda',
  reservas: 'Reservas temporárias do portal',
  solicitacoes: 'Pedidos de alteração e cancelamento',
  listaEspera: 'Lista de espera',
  procedimentos: 'Histórico de procedimentos',
  fotos: 'Fotos de antes e depois',
  fornecedores: 'Fornecedores',
  produtos: 'Produtos',
  movimentos: 'Movimentações de estoque',
  lancamentos: 'Lançamentos financeiros',
  metas: 'Metas',
  caixas: 'Caixas diários',
  movimentosCaixa: 'Movimentações de caixa',
  cupons: 'Cupons',
  usosCupom: 'Usos de cupom',
  fidelidade: 'Programa de fidelidade',
  pontos: 'Pontos acumulados',
  lembretes: 'Lembretes',
  notificacoes: 'Notificações',
  modelosMensagem: 'Modelos de mensagem',
  backups: 'Backups',
  registrosBackup: 'Registro de operações',
  configuracaoBackup: 'Configuração de backup',
  sessao: 'Sessão',
}

export interface AdaptadorDeArmazenamento {
  /** Nome legível, exibido no diagnóstico. */
  readonly nome: string

  /** Persiste entre recarregamentos da página? */
  readonly persistente: boolean

  /** Prepara o armazenamento. Chamado uma vez, na abertura do sistema. */
  iniciar(): Promise<void>

  /** Devolve todos os registros de uma coleção. Pode vir do espelho. */
  listar<T>(colecao: Colecao): Promise<T[]>

  /**
   * Instantâneo de tudo, sem passar pelo espelho.
   *
   * Existe para a cópia de segurança feita antes de uma restauração.
   * O espelho em memória pode estar velho — outra aba gravou, o tempo
   * real ainda não avisou — e uma cópia de segurança velha é pior do
   * que nenhuma: ela dá a confiança para restaurar e não devolve o
   * estado certo se der errado.
   *
   * Opcional: adaptadores sem servidor não têm espelho para contornar.
   */
  instantaneo?(): Promise<Record<string, unknown[]>>

  /**
   * Substitui o conteúdo inteiro de uma coleção.
   *
   * Continua sendo o contrato base — é o que o `MemoriaAdapter` e o
   * `LocalStorageAdapter` sabem fazer, e é o que a restauração de
   * backup precisa. Para uma alteração pontual, prefira os três
   * métodos abaixo.
   */
  gravar<T>(colecao: Colecao, registros: T[]): Promise<void>

  /* ------------------------------------------------------------------
     Escrita granular

     Existem por uma razão concreta, não por elegância.

     Com `gravar`, marcar um horário significa reenviar a agenda
     inteira. Num studio com trinta mil atendimentos isso é caro — mas
     o caro não é o pior. O pior é o que acontece com duas telas
     abertas:

       1. o celular carrega os 300 agendamentos da semana;
       2. o computador cancela um deles;
       3. o celular marca um novo e reenvia os seus 300 —
          incluindo o que o computador acabou de cancelar.

     O cancelamento é desfeito sem erro, sem aviso e sem rastro. Não é
     um caso raro: é o dia normal de um salão em que a recepção e a
     proprietária mexem na agenda ao mesmo tempo.

     Com escrita granular, o passo 3 manda uma linha. O que as outras
     telas fizeram continua de pé.

     São opcionais: um adaptador que não os implemente continua
     funcionando pelo caminho antigo. `RepositorioBase` verifica antes
     de usar.
  ------------------------------------------------------------------ */

  /** Grava um registro novo. */
  inserir?<T>(colecao: Colecao, registro: T): Promise<void>

  /**
   * Grava a versão nova de um registro que já existe.
   *
   * `mudancas` traz **apenas os campos alterados**. É o que evita a
   * sobrescrita cega descrita abaixo; `registro` vai junto porque os
   * adaptadores sem servidor precisam da linha inteira.
   *
   *   aba A abre a ficha da Maria e altera o telefone
   *   aba B abre a mesma ficha e altera a observação
   *   B salva depois
   *
   * Enviando a linha inteira, B grava o telefone **velho** que tinha
   * em mãos e desfaz o trabalho de A — sem erro, sem aviso e sem
   * rastro. Enviando só `{ observacoes }`, o telefone de A continua de
   * pé: as duas edições convivem porque tocaram em colunas diferentes.
   */
  atualizarUm?<T>(
    colecao: Colecao,
    id: string,
    registro: T,
    mudancas?: Partial<T>,
  ): Promise<T>

  /** Remove um registro. */
  removerUm?(colecao: Colecao, id: string): Promise<void>

  /** Apaga tudo. */
  limpar(): Promise<void>

  /** Espaço ocupado em bytes, quando o adaptador souber informar. */
  espacoUsado?(): number

  /**
   * Descarta o que o adaptador guardou em memória.
   *
   * Existe por causa do tempo real: quando outra aba grava, o espelho
   * desta aba fica velho e a próxima leitura devolveria o estado
   * anterior. Sem coleção, descarta tudo.
   *
   * Um adaptador com servidor (Supabase) implementa isto derrubando o
   * cache local antes de reconsultar.
   */
  invalidar?(colecao?: Colecao): void
}
