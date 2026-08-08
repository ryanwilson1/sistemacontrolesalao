import { AlertTriangle, Check, Database, HardDrive, Shield, ShieldCheck } from 'lucide-react'
import { Botao, Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EsqueletoCarta } from '@/components/feedback'
import { Indicador } from '@/components/common'
import { backupVencido, diasDesdeUltimo, formatarBytes } from '@/services'
import { useConfiguracaoBackup, useHistoricoDeBackups, useSaudeDoArmazenamento, useUltimoBackup } from '@/hooks'
import { dataNumerica, hora, tempoRelativo } from '@/utils/datas'
import { temSupabase } from '@/services'
import { cn } from '@/utils/cn'

const ORIGEM: Record<string, string> = {
  manual: 'Manual',
  automatico: 'Automático',
  antes_da_restauracao: 'Antes de restaurar',
}

/** Visão geral: quando foi o último backup e se o espaço está apertado. */
export function PainelBackup({ aoCriar }: { aoCriar: () => void }) {
  const { dados: ultimo, carregando } = useUltimoBackup()
  const { dados: historico } = useHistoricoDeBackups()
  const { dados: configuracao } = useConfiguracaoBackup()
  const { dados: saude } = useSaudeDoArmazenamento()

  if (carregando) {
    return (
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <EsqueletoCarta key={i} />)}
      </div>
    )
  }

  const dias = configuracao ? diasDesdeUltimo(configuracao) : null
  const vencido = configuracao ? backupVencido(configuracao) : true

  return (
    <div className="space-y-4">
      {/*
        A verdade sobre onde o backup mora.

        Com Supabase ligado, o histórico desta tela vive na memória da
        aba: ele some ao recarregar a página. Era uma promessa que o
        sistema não cumpria — a proprietária via "protegido" e concluía
        que havia cópias guardadas em algum lugar.

        O arquivo exportado é real e é dela. O que não é real é a lista
        aqui dentro fazer as vezes de cofre.
      */}
      {temSupabase() && (
        <Carta className="border-ouro-200 bg-ouro-100/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ouro-600" strokeWidth={1.8} />
            <div className="min-w-0 text-[12.5px] leading-relaxed text-ouro-700">
              <p className="font-medium">Esta lista não é o seu backup.</p>
              <p className="mt-1">
                Com banco de dados ligado, o histórico abaixo vale só enquanto esta
                aba estiver aberta. O backup que fica é o <strong className="font-medium">arquivo
                que você baixa</strong> em Exportar — guarde-o fora do computador do
                salão. A cópia diária do banco é feita pelo Supabase, no painel dele,
                em Database → Backups.
              </p>
            </div>
          </div>
        </Carta>
      )}

      {/* Aviso de proteção */}
      <Carta
        className={cn(
          vencido ? 'border-ouro-300 bg-ouro-100/50' : 'border-[#CFE0D5] bg-[#E8F0EA]/50',
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            className={cn(
              'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-carta',
              vencido ? 'text-ouro-600' : 'text-sucesso',
            )}
          >
            {vencido ? <Shield className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] font-medium text-onix-900">
              {!ultimo
                ? 'Nenhum backup foi feito ainda'
                : vencido
                  ? 'Está na hora de um novo backup'
                  : 'Seus dados estão protegidos'}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-onix-500">
              {!ultimo
                ? 'Os dados ficam apenas neste aparelho. Se o navegador for limpo, tudo se perde.'
                : `Último backup ${tempoRelativo(ultimo.criadoEm)}${dias !== null && dias > 0 ? ` — ${dias} dia(s) atrás` : ''}.`}
            </p>
          </div>

          <Botao variante="ouro" onClick={aoCriar} className="shrink-0">
            <Database className="h-4 w-4" /> Fazer backup agora
          </Botao>
        </div>
      </Carta>

      {/* Indicadores */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Indicador
          rotulo="Backups guardados"
          valor={String(historico?.length ?? 0)}
          icone={Database}
          detalhe={configuracao ? `Mantendo os ${configuracao.manterUltimos} últimos` : undefined}
          atraso={0}
        />
        <Indicador
          rotulo="Último backup"
          valor={ultimo ? dataNumerica(ultimo.criadoEm) : '—'}
          detalhe={ultimo ? `às ${hora(ultimo.criadoEm)}` : 'Nunca'}
          atraso={1}
        />
        <Indicador
          rotulo="Registros salvos"
          valor={ultimo ? String(ultimo.totalRegistros) : '—'}
          detalhe={ultimo ? formatarBytes(ultimo.tamanhoBytes) : undefined}
          destaque
          atraso={2}
        />
        <Indicador
          rotulo="Espaço em uso"
          valor={saude ? `${Math.round(saude.proporcao * 100)}%` : '—'}
          icone={HardDrive}
          detalhe={saude ? formatarBytes(saude.bytesUsados) : undefined}
          atraso={3}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Detalhes do último */}
        {ultimo && (
          <Carta>
            <CartaTitulo titulo="Último backup" descricao={ultimo.nome} />

            <dl className="space-y-2 text-[13.5px]">
              {[
                ['Data', `${dataNumerica(ultimo.criadoEm)} às ${hora(ultimo.criadoEm)}`],
                ['Origem', ORIGEM[ultimo.origem] ?? ultimo.origem],
                ['Versão do formato', String(ultimo.versao)],
                ['Versão do sistema', ultimo.versaoSistema],
                ['Registros', String(ultimo.totalRegistros)],
                ['Tamanho', formatarBytes(ultimo.tamanhoBytes)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-onix-400">{rotulo}</dt>
                  <dd className="truncate text-right font-medium text-onix-800">{valor}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 border-t border-onix-100 pt-3">
              <p className="eyebrow mb-1.5">Impressão digital</p>
              <p className="break-all font-mono text-[11px] leading-relaxed text-onix-400">
                {ultimo.hash}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Etiqueta className="border-[#CFE0D5] bg-[#E8F0EA] text-[#3D6250]" ponto="bg-sucesso">
                Íntegro
              </Etiqueta>
              <Etiqueta>
                {ultimo.temConteudo ? 'Guardado no sistema' : 'Somente no arquivo baixado'}
              </Etiqueta>
            </div>
          </Carta>
        )}

        {/* Saúde do armazenamento */}
        <Carta>
          <CartaTitulo
            titulo="Espaço do navegador"
            descricao="O studio divide cerca de 5 MB com os backups guardados"
          />

          {saude && (
            <>
              <div className="mb-2 flex items-baseline justify-between text-[13px]">
                <span className="text-onix-500">{formatarBytes(saude.bytesUsados)} em uso</span>
                <span className="tabular text-onix-400">
                  de {formatarBytes(saude.limiteEstimado)}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-onix-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    saude.apertado ? 'bg-perigo' : 'bg-marca',
                  )}
                  style={{ width: `${Math.max(saude.proporcao * 100, 2)}%` }}
                />
              </div>

              <div
                className={cn(
                  'mt-4 flex gap-3 rounded-xl border p-3.5',
                  saude.apertado
                    ? 'border-[#EBD2D4] bg-[#FBF3F4]'
                    : 'border-onix-100 bg-quartzo-50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0',
                    saude.apertado ? 'text-perigo' : 'text-sucesso',
                  )}
                >
                  {saude.apertado ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </span>
                <p className="text-[12.5px] leading-relaxed text-onix-500">
                  {saude.apertado
                    ? 'O espaço está apertado. Baixe os backups antigos e remova-os daqui, ou desligue a inclusão de fotos nas cópias.'
                    : 'Há espaço de sobra. Fotos de antes e depois são o que mais consome — vale acompanhar.'}
                </p>
              </div>
            </>
          )}
        </Carta>
      </div>
    </div>
  )
}
