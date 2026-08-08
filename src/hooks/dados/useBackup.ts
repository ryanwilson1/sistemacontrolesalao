import {
  analisarImportacao, backupsRepo, configuracaoBackupRepo, criarBackup,
  exportarColecao, importar, medirArmazenamento, registrosBackupRepo,
  removerBackup, restaurarDeArquivo, restaurarDeBackup,
} from '@/services'
import type { Colecao } from '@/services'
import { useAcao, useConsulta } from './useConsulta'
import { CHAVES } from './cache'
import type {
  ArquivoBackup, Backup, ConfiguracaoBackup, FormatoExportacao, RegistroBackup,
} from '@/types'
import type { EstrategiaImportacao } from '@/services'

/** Restaurar e importar mexem em tudo: o cache inteiro precisa cair. */
const TUDO = Object.values(CHAVES)

export function useHistoricoDeBackups() {
  return useConsulta<Backup[]>(`${CHAVES.backup}:historico`, () => backupsRepo.historico())
}

export function useUltimoBackup() {
  return useConsulta<Backup | null>(`${CHAVES.backup}:ultimo`, () => backupsRepo.ultimo())
}

export function useConfiguracaoBackup() {
  return useConsulta<ConfiguracaoBackup>(`${CHAVES.backup}:configuracao`, () =>
    configuracaoBackupRepo.ler(),
  )
}

export function useRegistrosDeBackup(limite = 60) {
  return useConsulta<RegistroBackup[]>(`${CHAVES.backup}:registros`, () =>
    registrosBackupRepo.recentes(limite),
  )
}

export function useSaudeDoArmazenamento() {
  return useConsulta(`${CHAVES.backup}:armazenamento`, () => medirArmazenamento())
}

export function useCriarBackup() {
  return useAcao(
    (opcoes: {
      nome?: string
      incluirFotos?: boolean
      observacoes?: string | null
      responsavelId?: string | null
    }) => criarBackup(opcoes),
    [CHAVES.backup],
  )
}

export function useRemoverBackup() {
  return useAcao(
    ({ id, responsavelId }: { id: string; responsavelId?: string | null }) =>
      removerBackup(id, responsavelId),
    [CHAVES.backup],
  )
}

export function useSalvarConfiguracaoBackup() {
  return useAcao(
    (mudancas: Partial<ConfiguracaoBackup>) => configuracaoBackupRepo.atualizar(mudancas),
    [CHAVES.backup],
  )
}

export function useExportarColecao() {
  return useAcao(
    ({ colecao, formato }: { colecao: Colecao; formato: FormatoExportacao }) =>
      exportarColecao(colecao, formato),
    [CHAVES.backup],
  )
}

export function useRestaurarBackup() {
  return useAcao(
    ({ id, responsavelId }: { id: string; responsavelId?: string | null }) =>
      restaurarDeBackup(id, { responsavelId }),
    TUDO,
  )
}

export function useRestaurarArquivo() {
  return useAcao(
    ({ arquivo, responsavelId }: { arquivo: ArquivoBackup; responsavelId?: string | null }) =>
      restaurarDeArquivo(arquivo, { responsavelId }),
    TUDO,
  )
}

export function useAnalisarImportacao() {
  return useAcao((bruto: string) => analisarImportacao(bruto), [])
}

export function useImportar() {
  return useAcao(
    ({
      arquivo, estrategia, colecoes, responsavelId,
    }: {
      arquivo: ArquivoBackup
      estrategia: EstrategiaImportacao
      colecoes?: Colecao[]
      responsavelId?: string | null
    }) => importar(arquivo, { estrategia, colecoes, responsavelId }),
    TUDO,
  )
}
