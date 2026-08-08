import { CheckCircle2, History, XCircle } from 'lucide-react'
import { Carta, Etiqueta } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useHistoricoDeSolicitacoes } from '@/hooks'
import { ROTULO_SOLICITACAO } from '@/types'
import { dataRelativa, hora, tempoRelativo } from '@/utils/datas'

/**
 * Pedidos já resolvidos.
 *
 * Existe porque decisão sem registro vira discussão: "eu avisei que ia
 * desmarcar" é palavra contra palavra quando não há onde conferir.
 */
export function HistoricoDePedidos() {
  const { dados: pedidos, carregando } = useHistoricoDeSolicitacoes()

  if (carregando) return <EsqueletoLista linhas={3} />

  if (!pedidos?.length) {
    return (
      <EstadoVazio
        icone={History}
        titulo="Nada por aqui ainda"
        descricao="Os pedidos que você aprovar ou recusar ficam registrados nesta aba."
      />
    )
  }

  return (
    <Carta>
      <ul className="divide-y divide-onix-50">
        {pedidos.map((pedido) => {
          const aprovado = pedido.situacao === 'aprovada'
          const cliente =
            pedido.agendamento?.cliente?.nome ?? pedido.agendamento?.nomeAvulso ?? 'Cliente'

          return (
            <li key={pedido.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className={
                  aprovado
                    ? 'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#E8F0EA] text-sucesso'
                    : 'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onix-50 text-onix-400'
                }
              >
                {aprovado ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-medium text-onix-800">{cliente}</p>
                  <Etiqueta className="border-onix-200 bg-onix-50 text-onix-500">
                    {ROTULO_SOLICITACAO[pedido.tipo]}
                  </Etiqueta>
                </div>

                <p className="mt-0.5 text-[12.5px] leading-snug text-onix-400">
                  {aprovado ? 'Aprovado' : 'Recusado'}
                  {pedido.respondidaEm && ` ${tempoRelativo(pedido.respondidaEm)}`}
                  {pedido.respondidaPor && ` por ${pedido.respondidaPor.split(' ')[0]}`}
                  {pedido.agendamento &&
                    ` · era ${dataRelativa(pedido.agendamento.inicio)} às ${hora(pedido.agendamento.inicio)}`}
                </p>

                {pedido.mensagem && (
                  <p className="mt-1 text-[12.5px] leading-snug text-onix-400">
                    Cliente: {pedido.mensagem}
                  </p>
                )}
                {pedido.resposta && (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-onix-500">
                    Você: {pedido.resposta}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Carta>
  )
}
