import type { Colecao } from '@/services/storage/tipos'
import type { Registro } from './entidades'

/**
 * Central de Backup.
 *
 * Um backup é a fotografia do armazenamento inteiro num instante, com
 * metadados suficientes para conferir integridade antes de restaurar.
 */

export type FormatoExportacao = 'json' | 'csv' | 'excel' | 'pdf'

export type OrigemBackup = 'manual' | 'automatico' | 'antes_da_restauracao'

export type SituacaoBackup = 'concluido' | 'falhou' | 'em_andamento'

export interface ContagemPorColecao {
  colecao: Colecao
  rotulo: string
  registros: number
  bytes: number
}

export interface Backup extends Registro {
  nome: string
  origem: OrigemBackup
  situacao: SituacaoBackup

  /** Versão do formato de dados no momento da cópia. */
  versao: number
  /** Versão do sistema que gerou. */
  versaoSistema: string

  totalRegistros: number
  tamanhoBytes: number
  contagens: ContagemPorColecao[]

  /**
   * Impressão digital do conteúdo. Confere se o arquivo foi alterado
   * entre a exportação e a restauração.
   */
  hash: string
  observacoes: string | null

  /**
   * O conteúdo ficou guardado no sistema?
   *
   * A listagem descarta o conteúdo para não pesar; sem este campo a tela
   * não saberia se a restauração em um clique está disponível.
   */
  temConteudo: boolean

  /** O conteúdo em si. Separado dos metadados para a listagem ser leve. */
  conteudo?: ConteudoBackup
}

export interface ConteudoBackup {
  versao: number
  versaoSistema: string
  geradoEm: string
  studio: string
  colecoes: Partial<Record<Colecao, unknown[]>>
}

/** Arquivo de backup completo, como sai e entra no disco. */
export interface ArquivoBackup {
  metadados: Omit<Backup, 'conteudo'>
  conteudo: ConteudoBackup
}

export type FrequenciaBackup = 'manual' | 'diario' | 'semanal' | 'mensal'

export interface ConfiguracaoBackup {
  frequencia: FrequenciaBackup
  /** Quantos backups guardar antes de descartar o mais antigo. */
  manterUltimos: number
  /** Avisar quando o último backup passar deste tempo. */
  avisarAposDias: number
  ultimoEm: string | null
  proximoEm: string | null
  incluirFotos: boolean
}

export type TipoOperacao = 'exportacao' | 'importacao' | 'restauracao' | 'exclusao'

/** Linha do log de operações da Central de Backup. */
export interface RegistroBackup extends Registro {
  operacao: TipoOperacao
  backupId: string | null
  descricao: string
  sucesso: boolean
  detalhe: string | null
  registrosAfetados: number
  responsavelId: string | null
}

/** Resultado da conferência de um arquivo antes de restaurar. */
export interface ValidacaoBackup {
  valido: boolean
  problemas: string[]
  avisos: string[]
  contagens: ContagemPorColecao[]
  versaoCompativel: boolean
  hashConfere: boolean
}
