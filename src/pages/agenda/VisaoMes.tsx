import { useMemo } from 'react'
import { diasDoMes, dt, format, isSameDay } from '@/utils/datas'
import { cn } from '@/utils/cn'
import type { AgendamentoDetalhado } from '@/types'

const CABECALHO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function VisaoMes({
  dia, agendamentos, aoTrocarDia,
}: {
  dia: Date
  agendamentos: AgendamentoDetalhado[]
  aoTrocarDia: (dia: Date) => void
}) {
  const dias = useMemo(() => diasDoMes(dia), [dia])
  const mesAtual = dia.getMonth()

  const contagem = useMemo(() => {
    const mapa = new Map<string, { total: number; concluidos: number }>()

    for (const agendamento of agendamentos) {
      if (agendamento.situacao === 'cancelado') continue

      const chave = format(dt(agendamento.inicio), 'yyyy-MM-dd')
      const atual = mapa.get(chave) ?? { total: 0, concluidos: 0 }
      atual.total += 1
      if (agendamento.situacao === 'concluido') atual.concluidos += 1
      mapa.set(chave, atual)
    }

    return mapa
  }, [agendamentos])

  return (
    <div className="overflow-hidden rounded-2xl border border-onix-100 bg-white shadow-carta">
      <div className="grid grid-cols-7 border-b border-onix-100">
        {CABECALHO.map((rotulo) => (
          <span
            key={rotulo}
            className="py-2.5 text-center text-[10.5px] uppercase tracking-[0.14em] text-onix-300"
          >
            {rotulo}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dias.map((data) => {
          const dados = contagem.get(format(data, 'yyyy-MM-dd'))
          const doMes = data.getMonth() === mesAtual
          const ehHoje = isSameDay(data, new Date())

          return (
            <button
              key={data.toISOString()}
              onClick={() => aoTrocarDia(data)}
              className={cn(
                'relative flex min-h-[68px] flex-col items-start gap-1.5 border-b border-r border-onix-50 p-1.5 text-left transition-colors sm:min-h-[96px] sm:p-2',
                doMes ? 'hover:bg-quartzo-50' : 'bg-quartzo-50/40',
              )}
            >
              <span
                className={cn(
                  'tabular grid h-6 w-6 place-items-center rounded-full text-[12.5px]',
                  ehHoje
                    ? 'bg-onix-800 font-medium text-white'
                    : doMes ? 'text-onix-700' : 'text-onix-300',
                )}
              >
                {format(data, 'd')}
              </span>

              {dados && (
                <span className="flex w-full min-w-0 flex-col gap-1">
                  <span className="truncate rounded-md bg-quartzo-100 px-1.5 py-0.5 text-[10px] font-medium text-quartzo-700 sm:text-[10.5px]">
                    {dados.total} <span className="hidden sm:inline">atend.</span>
                  </span>
                  {dados.concluidos > 0 && (
                    <span className="hidden truncate text-[10.5px] text-onix-400 sm:block">
                      {dados.concluidos} concluído{dados.concluidos > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
