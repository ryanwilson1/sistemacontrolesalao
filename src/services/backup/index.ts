import { backupsRepo, configuracaoBackupRepo, registrosBackupRepo } from '../repositorios/backup'
import { armazenamento } from '../storage'
import { baixarBackup, montarArquivo, type OpcoesBackup } from './exportar'
import { tamanhoEmBytes } from './arquivo'
import type { Backup, ConfiguracaoBackup, FrequenciaBackup } from '@/types'

export * from './arquivo'
export * from './csv'
export * from './exportar'
export * from './hash'
export * from './importar'
export * from './restaurar'
export * from './validador'

/**
 * Orquestra a criação de backups.
 *
 * Decisão que vale explicar: o conteúdo só fica guardado dentro do
 * sistema quando é pequeno o bastante. O navegador reserva cerca de 5 MB
 * por site — guardar cinco cópias completas ali dentro encheria o espaço
 * e derrubaria o próprio studio. O arquivo baixado é a cópia que importa;
 * a guardada é só a conveniência de restaurar em um clique.
 */
const LIMITE_PARA_GUARDAR = 700_000

export interface ResultadoCriacao {
  backup: Backup
  nomeArquivo: string | null
  guardadoNoSistema: boolean
  descartados: number
  duracaoMs: number
}

export async function criarBackup(
  opcoes: OpcoesBackup & { baixarArquivo?: boolean; responsavelId?: string | null } = {},
): Promise<ResultadoCriacao> {
  const comecou = performance.now()

  try {
    const configuracao = await configuracaoBackupRepo.ler()

    const arquivo = await montarArquivo({
      ...opcoes,
      incluirFotos: opcoes.incluirFotos ?? configuracao.incluirFotos,
    })

    const cabe = arquivo.metadados.tamanhoBytes <= LIMITE_PARA_GUARDAR

    const backup = await backupsRepo.criar({
      ...arquivo.metadados,
      temConteudo: cabe,
      conteudo: cabe ? arquivo.conteudo : undefined,
    } as never)

    const nomeArquivo = (opcoes.baixarArquivo ?? true) ? baixarBackup(arquivo) : null
    const descartados = await backupsRepo.podar(configuracao.manterUltimos)

    const agora = new Date().toISOString()
    await configuracaoBackupRepo.atualizar({
      ultimoEm: agora,
      proximoEm: calcularProximo(configuracao.frequencia, new Date()),
    })

    const duracaoMs = Math.round(performance.now() - comecou)

    await registrosBackupRepo.anotar({
      operacao: 'exportacao',
      backupId: backup.id,
      descricao: `Backup "${arquivo.metadados.nome}" criado`,
      sucesso: true,
      detalhe: [
        `${arquivo.metadados.totalRegistros} registros`,
        cabe ? 'guardado no sistema' : 'apenas no arquivo baixado',
        `${duracaoMs} ms`,
      ].join(' · '),
      registrosAfetados: arquivo.metadados.totalRegistros,
      responsavelId: opcoes.responsavelId ?? null,
    })

    return { backup, nomeArquivo, guardadoNoSistema: cabe, descartados, duracaoMs }
  } catch (falha) {
    await registrosBackupRepo.anotar({
      operacao: 'exportacao',
      descricao: 'Falha ao criar backup',
      sucesso: false,
      detalhe: falha instanceof Error ? falha.message : 'Erro desconhecido',
      responsavelId: opcoes.responsavelId ?? null,
    })
    throw falha
  }
}

export async function removerBackup(id: string, responsavelId?: string | null): Promise<void> {
  const backup = await backupsRepo.buscar(id)
  await backupsRepo.remover(id)

  await registrosBackupRepo.anotar({
    operacao: 'exclusao',
    backupId: id,
    descricao: `Backup "${backup?.nome ?? id}" removido`,
    sucesso: true,
    responsavelId: responsavelId ?? null,
  })
}

/* ------------------------------------------------------------------ */
/* Agendamento                                                         */
/* ------------------------------------------------------------------ */

const DIAS: Record<FrequenciaBackup, number> = {
  manual: 0, diario: 1, semanal: 7, mensal: 30,
}

export function calcularProximo(frequencia: FrequenciaBackup, base: Date): string | null {
  if (frequencia === 'manual') return null

  const proximo = new Date(base)
  proximo.setDate(proximo.getDate() + DIAS[frequencia])
  proximo.setHours(9, 0, 0, 0)
  return proximo.toISOString()
}

/**
 * O backup automático está vencido?
 *
 * Sem servidor não existe tarefa agendada de verdade: a verificação
 * acontece quando alguém abre o sistema. É honesto chamar de lembrete,
 * não de automação.
 */
export function backupVencido(configuracao: ConfiguracaoBackup): boolean {
  if (configuracao.frequencia === 'manual') {
    if (!configuracao.ultimoEm) return true
    const dias = (Date.now() - new Date(configuracao.ultimoEm).getTime()) / 86_400_000
    return dias >= configuracao.avisarAposDias
  }

  if (!configuracao.proximoEm) return true
  return new Date(configuracao.proximoEm).getTime() <= Date.now()
}

/** Quantos dias desde o último backup. Nulo se nunca houve. */
export function diasDesdeUltimo(configuracao: ConfiguracaoBackup): number | null {
  if (!configuracao.ultimoEm) return null
  return Math.floor((Date.now() - new Date(configuracao.ultimoEm).getTime()) / 86_400_000)
}

/* ------------------------------------------------------------------ */
/* Diagnóstico                                                         */
/* ------------------------------------------------------------------ */

export interface SaudeDoArmazenamento {
  bytesUsados: number
  bytesBackups: number
  limiteEstimado: number
  proporcao: number
  apertado: boolean
}

/** Quanto do orçamento do navegador já foi usado. */
export async function medirArmazenamento(): Promise<SaudeDoArmazenamento> {
  const bytesUsados = armazenamento.espacoUsado?.() ?? 0
  const bytesBackups = await backupsRepo.espacoOcupado()
  const limiteEstimado = 5 * 1024 * 1024

  const proporcao = Math.min(bytesUsados / limiteEstimado, 1)

  return {
    bytesUsados,
    bytesBackups: tamanhoEmBytes(String(bytesBackups)) && bytesBackups,
    limiteEstimado,
    proporcao,
    apertado: proporcao > 0.75,
  }
}
