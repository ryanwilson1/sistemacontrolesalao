import { RepositorioBase } from './base'
import { armazenamento } from '../storage'
import type { Backup, ConfiguracaoBackup, RegistroBackup, TipoOperacao } from '@/types'

const PADRAO: ConfiguracaoBackup = {
  frequencia: 'semanal',
  manterUltimos: 5,
  avisarAposDias: 7,
  ultimoEm: null,
  proximoEm: null,
  incluirFotos: true,
}

class RepositorioBackups extends RepositorioBase<Backup> {
  constructor() {
    super('backups')
  }

  /** Lista sem o conteúdo: a tela de histórico não precisa dos dados. */
  async historico(): Promise<Backup[]> {
    const todos = await this.listar()
    return todos
      .map(({ conteudo: _conteudo, ...metadados }) => metadados as Backup)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  async ultimo(): Promise<Backup | null> {
    const historico = await this.historico()
    return historico.find((b) => b.situacao === 'concluido') ?? null
  }

  /**
   * Descarta os mais antigos além do limite configurado.
   *
   * Sem isto o armazenamento enche: cada cópia guardada duplica os dados
   * do studio dentro do mesmo orçamento de espaço do navegador.
   */
  async podar(manter: number): Promise<number> {
    const todos = await this.listar()
    const ordenados = todos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))

    if (ordenados.length <= manter) return 0

    const sobreviventes = ordenados.slice(0, manter)
    await this.substituirTudo(sobreviventes)
    return ordenados.length - manter
  }

  /** Espaço ocupado pelos backups guardados no sistema. */
  async espacoOcupado(): Promise<number> {
    const todos = await this.listar()
    return todos.reduce(
      (soma, b) => soma + (b.conteudo ? JSON.stringify(b.conteudo).length : 0),
      0,
    )
  }
}

class RepositorioRegistros extends RepositorioBase<RegistroBackup> {
  constructor() {
    super('registrosBackup')
  }

  async recentes(limite = 60): Promise<RegistroBackup[]> {
    const todos = await this.listar()
    return todos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limite)
  }

  /** Registra a operação. Nunca lança: log não pode derrubar o fluxo. */
  async anotar(dados: {
    operacao: TipoOperacao
    descricao: string
    sucesso: boolean
    backupId?: string | null
    detalhe?: string | null
    registrosAfetados?: number
    responsavelId?: string | null
  }): Promise<void> {
    try {
      await this.criar({
        operacao: dados.operacao,
        backupId: dados.backupId ?? null,
        descricao: dados.descricao,
        sucesso: dados.sucesso,
        detalhe: dados.detalhe ?? null,
        registrosAfetados: dados.registrosAfetados ?? 0,
        responsavelId: dados.responsavelId ?? null,
      })

      // O log não pode crescer sem fim dentro do orçamento do navegador.
      const todos = await this.listar()
      if (todos.length > 200) {
        const recentes = todos
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
          .slice(0, 150)
        await this.substituirTudo(recentes)
      }
    } catch {
      /*
        Só a poda do log falhou.

        O registro que importa já foi gravado nas linhas acima; isto
        aqui é a faxina que impede o log de crescer sem fim. Propagar
        transformaria "não consegui apagar histórico antigo" num erro
        na cara de quem acabou de fazer um backup com sucesso.
      */
    }
  }
}

class RepositorioConfiguracaoBackup {
  async ler(): Promise<ConfiguracaoBackup> {
    const registros = await armazenamento.listar<ConfiguracaoBackup>('configuracaoBackup')
    return { ...PADRAO, ...(registros[0] ?? {}) }
  }

  async gravar(configuracao: ConfiguracaoBackup): Promise<void> {
    await armazenamento.gravar('configuracaoBackup', [configuracao])
  }

  async atualizar(mudancas: Partial<ConfiguracaoBackup>): Promise<ConfiguracaoBackup> {
    const atual = await this.ler()
    const nova = { ...atual, ...mudancas }
    await this.gravar(nova)
    return nova
  }
}

export const backupsRepo = new RepositorioBackups()
export const registrosBackupRepo = new RepositorioRegistros()
export const configuracaoBackupRepo = new RepositorioConfiguracaoBackup()
export { PADRAO as CONFIGURACAO_BACKUP_PADRAO }
