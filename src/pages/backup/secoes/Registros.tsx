import {
  Check, Download, FileClock, Trash2, Upload, X, type LucideIcon,
} from 'lucide-react'
import { Carta } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useRegistrosDeBackup } from '@/hooks'
import { dataNumerica, hora } from '@/utils/datas'
import { cn } from '@/utils/cn'
import type { TipoOperacao } from '@/types'

const OPERACAO: Record<TipoOperacao, { rotulo: string; icone: LucideIcon }> = {
  exportacao: { rotulo: 'Backup', icone: Download },
  importacao: { rotulo: 'Importação', icone: Upload },
  restauracao: { rotulo: 'Restauração', icone: FileClock },
  exclusao: { rotulo: 'Exclusão', icone: Trash2 },
}

/** Log de tudo que aconteceu na Central. */
export function Registros() {
  const { dados: registros, carregando } = useRegistrosDeBackup()

  if (carregando) return <EsqueletoLista linhas={5} />

  if (!registros?.length) {
    return (
      <Carta>
        <EstadoVazio
          icone={FileClock}
          titulo="Nenhuma operação registrada"
          descricao="Backups, importações e restaurações aparecem aqui com data, resultado e tempo gasto."
        />
      </Carta>
    )
  }

  return (
    <Carta espacamento={false} className="overflow-hidden">
      <ul className="divide-y divide-onix-50">
        {registros.map((registro, indice) => {
          const { rotulo, icone: Icone } = OPERACAO[registro.operacao]

          return (
            <li
              key={registro.id}
              className="entra-lista-lateral flex items-start gap-3 px-4 py-3 sm:px-5"
              style={{ animationDelay: `${Math.min(indice * 0.02, 0.3)}s` }}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  registro.sucesso ? 'bg-quartzo-100 text-quartzo-700' : 'bg-[#F7E9EA] text-perigo',
                )}
              >
                <Icone className="h-3.5 w-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-[13.5px] font-medium text-onix-800">{registro.descricao}</p>
                  <span className="text-[11.5px] uppercase tracking-wider text-onix-300">
                    {rotulo}
                  </span>
                </div>

                <p className="tabular mt-0.5 text-[12px] text-onix-400">
                  {dataNumerica(registro.criadoEm)} às {hora(registro.criadoEm)}
                  {registro.registrosAfetados > 0 && ` · ${registro.registrosAfetados} registros`}
                </p>

                {registro.detalhe && (
                  <p className="mt-1 text-[12px] leading-relaxed text-onix-400">
                    {registro.detalhe}
                  </p>
                )}
              </div>

              <span
                className={cn(
                  'mt-1 shrink-0',
                  registro.sucesso ? 'text-sucesso' : 'text-perigo',
                )}
                title={registro.sucesso ? 'Concluído' : 'Falhou'}
              >
                {registro.sucesso ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
            </li>
          )
        })}
      </ul>
    </Carta>
  )
}
