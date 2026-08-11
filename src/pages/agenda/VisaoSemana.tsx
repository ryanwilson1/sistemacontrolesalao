import { useMemo } from 'react'
import { CalendarX2 } from 'lucide-react'
import { EstadoVazio } from '@/components/feedback'
import { useSessao } from '@/contexts'
import { SITUACAO } from '@/constants'
import { diaDaSemana, diasDaSemana, dt, format, hora, isSameDay } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { cn } from '@/utils/cn'
import type { AgendamentoDetalhado } from '@/types'

interface Props {
  dia: Date
  agendamentos: AgendamentoDetalhado[]
  aoAbrir: (agendamento: AgendamentoDetalhado) => void
  aoTrocarDia: (dia: Date) => void
}

export function VisaoSemana({ dia, agendamentos, aoAbrir, aoTrocarDia }: Props) {
  const { soAgenda } = useSessao()
  const dias = useMemo(() => diasDaSemana(dia), [dia])

  const porDia = useMemo(() => {
    const mapa = new Map<string, AgendamentoDetalhado[]>()
    for (const d of dias) mapa.set(format(d, 'yyyy-MM-dd'), [])

    for (const agendamento of agendamentos) {
      if (agendamento.situacao === 'cancelado') continue
      mapa.get(format(dt(agendamento.inicio), 'yyyy-MM-dd'))?.push(agendamento)
    }
    return mapa
  }, [dias, agendamentos])

  const vazia = [...porDia.values()].every((lista) => lista.length === 0)

  if (vazia) {
    return (
      <EstadoVazio
        icone={CalendarX2}
        titulo="Semana livre"
        descricao="Nenhum atendimento marcado nestes sete dias."
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {dias.map((data) => {
        const lista = porDia.get(format(data, 'yyyy-MM-dd')) ?? []
        const ehHoje = isSameDay(data, new Date())
        const total = lista.reduce((soma, a) => soma + a.preco - a.desconto, 0)

        return (
          <div
            key={data.toISOString()}
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-carta',
              ehHoje ? 'border-ouro-300' : 'border-onix-100',
            )}
          >
            <button
              onClick={() => aoTrocarDia(data)}
              className="flex items-baseline justify-between gap-2 border-b border-onix-50 px-4 py-3 text-left transition-colors hover:bg-quartzo-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-[10.5px] uppercase tracking-[0.16em] text-onix-300">
                  {diaDaSemana(data)}
                </span>
                <span
                  className={cn(
                    'tabular font-display text-[19px] font-light',
                    ehHoje ? 'text-marca' : 'text-onix-800',
                  )}
                >
                  {format(data, 'd')}
                </span>
              </span>
              <span className="tabular shrink-0 text-[12px] text-onix-400">{lista.length}</span>
            </button>

            <ul className="min-h-0 flex-1 space-y-1 p-2">
              {lista.length === 0 ? (
                <li className="px-2 py-6 text-center text-[12.5px] text-onix-300">Sem atendimentos</li>
              ) : (
                lista.map((agendamento) => {
                  const situacao = SITUACAO[agendamento.situacao]
                  return (
                    <li key={agendamento.id}>
                      <button
                        onClick={() => aoAbrir(agendamento)}
                        className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-quartzo-50"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', situacao.ponto)} />
                          <span className="tabular text-[11.5px] font-medium text-onix-500">
                            {hora(agendamento.inicio)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] font-medium text-onix-800">
                          {agendamento.cliente?.nome ?? agendamento.nomeAvulso}
                        </span>
                        <span className="block truncate text-[11.5px] text-onix-400">
                          {agendamento.servico?.nome}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            {total > 0 && !soAgenda && (
              <p className="tabular border-t border-onix-50 bg-quartzo-50 px-4 py-2 text-right text-[12px] font-medium text-onix-600">
                {dinheiro(total)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
