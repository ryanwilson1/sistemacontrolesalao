import { Link } from 'react-router-dom'
import { ArrowRight, CalendarX2 } from 'lucide-react'
import { Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EstadoVazio, Esqueleto } from '@/components/feedback'
import { ROTAS, SITUACAO } from '@/constants'
import { hora } from '@/utils/datas'
import type { AgendamentoResumido, SituacaoAgendamento } from '@/types'

export function ProximosAtendimentos({
  itens, carregando,
}: {
  itens: AgendamentoResumido[]
  carregando: boolean
}) {
  return (
    <Carta espacamento={false} className="overflow-hidden">
      <div className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CartaTitulo
          titulo="Próximos atendimentos"
          descricao="Agenda de hoje, em ordem"
          acao={
            <Link
              to={ROTAS.agenda}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-onix-500 transition-colors hover:text-onix-900"
            >
              Ver agenda <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>

      {carregando ? (
        <div className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          {Array.from({ length: 4 }).map((_, indice) => (
            <div key={indice} className="flex items-center gap-3">
              <Esqueleto className="h-10 w-12" />
              <div className="flex-1 space-y-2">
                <Esqueleto className="h-3.5 w-1/3" />
                <Esqueleto className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : itens.length === 0 ? (
        <EstadoVazio
          icone={CalendarX2}
          titulo="Nenhum atendimento hoje"
          descricao="Quando alguém marcar pelo link ou pelo painel, aparece aqui."
          compacto
        />
      ) : (
        <ul className="divide-y divide-onix-50">
          {itens.map((item, indice) => {
            const situacao = SITUACAO[item.situacao as SituacaoAgendamento]
            return (
              <li
                key={item.id}
                className="entra-lista-lateral flex items-center gap-3 px-4 py-3 transition-colors hover:bg-quartzo-50 sm:gap-3.5 sm:px-5"
                style={{ animationDelay: `${Math.min(indice * 0.035, 0.3)}s` }}
              >
                <div className="tabular w-[46px] shrink-0 text-right sm:w-[52px]">
                  <p className="font-display text-[14px] font-medium leading-none text-onix-800 sm:text-[15px]">
                    {hora(item.inicio)}
                  </p>
                  <p className="mt-1 text-[11px] leading-none text-onix-300">{hora(item.fim)}</p>
                </div>

                <span
                  className="h-9 w-[3px] shrink-0 rounded-full"
                  style={{ background: item.cor ?? '#C98F98' }}
                />

                <div className="min-w-0 flex-1">
                  {item.clienteId ? (
                    <Link
                      to={ROTAS.cliente(item.clienteId)}
                      className="block truncate text-[14px] font-medium text-onix-800 hover:underline"
                    >
                      {item.cliente ?? 'Sem nome'}
                    </Link>
                  ) : (
                    <p className="truncate text-[14px] font-medium text-onix-800">
                      {item.cliente ?? 'Sem nome'}
                    </p>
                  )}
                  <p className="truncate text-[12.5px] text-onix-400">
                    {item.servico} · {item.profissional}
                  </p>
                </div>

                <Etiqueta className={`hidden sm:inline-flex ${situacao.classe}`} ponto={situacao.ponto}>
                  {situacao.rotulo}
                </Etiqueta>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full sm:hidden ${situacao.ponto}`}
                  title={situacao.rotulo}
                />
              </li>
            )
          })}
        </ul>
      )}
    </Carta>
  )
}
