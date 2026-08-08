import { useState } from 'react'
import { cache } from '@/hooks/dados/cache'
import { motion } from 'framer-motion'
import { Database, Download, RotateCcw, Trash2 } from 'lucide-react'
import { Botao, Carta, Etiqueta } from '@/components/ui'
import { Confirmar, EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAviso, useSessao } from '@/contexts'
import { useHistoricoDeBackups, useRemoverBackup, useRestaurarBackup } from '@/hooks'
import { baixarBackup, formatarBytes } from '@/services'
import { backupsRepo } from '@/services'
import { dataNumerica, hora } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import type { Backup } from '@/types'

const ORIGEM: Record<string, { rotulo: string; classe: string }> = {
  manual: { rotulo: 'Manual', classe: 'border-onix-200 bg-onix-50 text-onix-500' },
  automatico: { rotulo: 'Automático', classe: 'border-quartzo-200 bg-quartzo-100 text-quartzo-700' },
  antes_da_restauracao: {
    rotulo: 'Antes de restaurar',
    classe: 'border-ouro-200 bg-ouro-100 text-ouro-700',
  },
}

export function HistoricoBackups() {
  const { dados: backups, carregando } = useHistoricoDeBackups()
  const remover = useRemoverBackup()
  const restaurar = useRestaurarBackup()
  const { sessao } = useSessao()
  const aviso = useAviso()

  const [removendo, setRemovendo] = useState<Backup | null>(null)
  const [restaurando, setRestaurando] = useState<Backup | null>(null)

  const baixar = async (backup: Backup) => {
    try {
      const completo = await backupsRepo.buscar(backup.id)
      if (!completo?.conteudo) {
        aviso.info(
          'Este backup não guardou os dados',
          'Só o registro ficou aqui. O arquivo que você baixou na hora é a cópia completa.',
        )
        return
      }
      baixarBackup({ metadados: completo, conteudo: completo.conteudo })
      aviso.sucesso('Arquivo baixado')
    } catch (falha) {
      aviso.erro('Não foi possível baixar', mensagemDeErro(falha))
    }
  }

  const confirmarRemocao = async () => {
    if (!removendo) return
    try {
      await remover.executar({ id: removendo.id, responsavelId: sessao?.profissionalId })
      aviso.sucesso('Backup removido', removendo.nome)
      setRemovendo(null)
    } catch (falha) {
      aviso.erro('Não foi possível remover', mensagemDeErro(falha))
    }
  }

  const confirmarRestauracao = async () => {
    if (!restaurando) return
    try {
      const resultado = await restaurar.executar({
        id: restaurando.id,
        responsavelId: sessao?.profissionalId,
      })
      aviso.sucesso(
        'Dados restaurados',
        `${resultado.restaurados} registros em ${resultado.colecoes} coleções.`,
      )
      setRestaurando(null)
      // O sistema inteiro mudou por baixo: recarregar evita tela com dado velho.
      /*
        Invalidar em vez de recarregar.

        `location.reload()` num `setTimeout` de 1,2s é um chute: se a
        gravação ainda não terminou, a página recarrega e mostra o
        estado anterior — e a proprietária conclui que a operação não
        funcionou. Se terminou, a recarga é um susto desnecessário que
        derruba o que ela estivesse fazendo em outra aba do sistema.

        Os serviços de importação e restauração já derrubam o espelho e
        o cache ao terminar. As telas abertas releem sozinhas, na hora
        certa, porque o dado mudou — não porque o relógio disparou.
      */
      cache.limpar()
    } catch (falha) {
      aviso.erro('Não foi possível restaurar', mensagemDeErro(falha))
    }
  }

  if (carregando) return <EsqueletoLista linhas={4} />

  if (!backups?.length) {
    return (
      <Carta>
        <EstadoVazio
          icone={Database}
          titulo="Nenhum backup ainda"
          descricao="Assim que você criar o primeiro, ele aparece aqui com data, tamanho e impressão digital."
        />
      </Carta>
    )
  }

  return (
    <>
      <ul className="space-y-2.5">
        {backups.map((backup, indice) => {
          const origem = ORIGEM[backup.origem] ?? ORIGEM.manual!

          return (
            <motion.li
              key={backup.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(indice * 0.03, 0.3), duration: 0.25 }}
              className="rounded-2xl border border-onix-100 bg-white p-4 shadow-carta"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14.5px] font-medium text-onix-800">
                      {backup.nome}
                    </p>
                    <Etiqueta className={origem.classe}>{origem.rotulo}</Etiqueta>
                    {!backup.temConteudo && <Etiqueta>Só o arquivo baixado</Etiqueta>}
                  </div>

                  <p className="tabular mt-1 text-[12.5px] text-onix-400">
                    {dataNumerica(backup.criadoEm)} às {hora(backup.criadoEm)} ·{' '}
                    {backup.totalRegistros} registros · {formatarBytes(backup.tamanhoBytes)}
                  </p>

                  {backup.observacoes && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-onix-500">
                      {backup.observacoes}
                    </p>
                  )}

                  <p className="mt-1.5 truncate font-mono text-[10.5px] text-onix-300">
                    {backup.hash.slice(0, 32)}…
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Botao variante="secundario" tamanho="sm" onClick={() => void baixar(backup)}>
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Baixar</span>
                  </Botao>
                  <Botao
                    variante="secundario" tamanho="sm"
                    onClick={() => setRestaurando(backup)}
                    disabled={!backup.temConteudo}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Restaurar</span>
                  </Botao>
                  <Botao variante="perigo" tamanho="sm" onClick={() => setRemovendo(backup)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Botao>
                </div>
              </div>
            </motion.li>
          )
        })}
      </ul>

      <Confirmar
        aberto={!!removendo}
        aoFechar={() => setRemovendo(null)}
        aoConfirmar={() => void confirmarRemocao()}
        titulo="Remover este backup?"
        descricao="O registro sai da lista. O arquivo que você já baixou continua no seu computador."
        rotuloConfirmar="Remover"
        destrutivo
        carregando={remover.salvando}
      />

      <Confirmar
        aberto={!!restaurando}
        aoFechar={() => setRestaurando(null)}
        aoConfirmar={() => void confirmarRestauracao()}
        titulo="Restaurar este backup?"
        descricao={`Todos os dados atuais do studio serão substituídos pelos de ${restaurando ? dataNumerica(restaurando.criadoEm) : ''}. Uma cópia de segurança do estado atual é criada antes.`}
        rotuloConfirmar="Restaurar agora"
        destrutivo
        carregando={restaurar.salvando}
      />
    </>
  )
}
