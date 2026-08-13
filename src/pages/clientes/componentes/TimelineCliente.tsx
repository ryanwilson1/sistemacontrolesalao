import { History } from 'lucide-react'
import { Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EstadoVazio, Esqueleto } from '@/components/feedback'
import { SITUACAO } from '@/constants'
import { dataNumerica, hora } from '@/utils/datas'
import { dinheiro } from '@/utils/formato'
import { cn } from '@/utils/cn'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Evolução da cliente, do mais recente ao mais antigo.
 * O fio vertical liga os atendimentos e dá a leitura de continuidade.
 */
export function TimelineCliente({
  historico, carregando,
}: {
  historico: AgendamentoDetalhado[]
  carregando: boolean
}) {
  return (
    <Carta espacamento={false} className="overflow-hidden">
      <div className="p-4 pb-1 sm:p-5 sm:pb-1">
        <CartaTitulo titulo="Evolução" descricao="Cada atendimento, do mais recente ao mais antigo" />
      </div>

      {carregando ? (
        <div className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 3 }).map((_, indice) => (
            <Esqueleto key={indice} className="h-16 w-full" />
          ))}
        </div>
      ) : historico.length === 0 ? (
        <EstadoVazio
          icone={History}
          titulo="Nenhum atendimento ainda"
          descricao="Assim que ela for atendida, a evolução aparece aqui."
          compacto
        />
      ) : (
        <ol className="relative px-4 pb-5 sm:px-5">
          <span className="absolute bottom-6 left-[27px] top-2 w-px bg-onix-100 sm:left-[31px]" aria-hidden />

          {historico.map((atendimento, indice) => {
            const situacao = SITUACAO[atendimento.situacao]
            const total = atendimento.preco - atendimento.desconto

            return (
              <li
                key={atendimento.id}
                className="entra-lista-lateral relative flex gap-4 py-3"
                style={{ animationDelay: `${Math.min(indice * 0.04, 0.4)}s` }}
              >
                <span className="relative z-[1] mt-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-white bg-white shadow-sm">
                  <span className={cn('h-2.5 w-2.5 rounded-full', situacao.ponto)} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-[14px] font-medium text-onix-800">
                      {atendimento.servico?.nome ?? 'Atendimento'}
                    </p>
                    {atendimento.situacao === 'concluido' && (
                      <p className="tabular text-[13px] font-medium text-onix-700">{dinheiro(total)}</p>
                    )}
                  </div>

                  <p className="tabular mt-0.5 text-[12.5px] text-onix-400">
                    {dataNumerica(atendimento.inicio)} · {hora(atendimento.inicio)}
                    {atendimento.profissional && ` · ${atendimento.profissional.nome}`}
                  </p>

                  {atendimento.observacao && (
                    <p className="mt-1.5 rounded-lg bg-quartzo-50 px-3 py-2 text-[12.5px] leading-relaxed text-onix-500">
                      {atendimento.observacao}
                    </p>
                  )}

                  {atendimento.situacao !== 'concluido' && (
                    <span className="mt-1.5 inline-block">
                      <Etiqueta className={situacao.classe} ponto={situacao.ponto}>
                        {situacao.rotulo}
                      </Etiqueta>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Carta>
  )
}
