import { CalendarClock, Gem } from 'lucide-react'
import { Carta, CartaTitulo } from '@/components/ui'
import { dinheiro } from '@/utils/formato'
import { tempoRelativo } from '@/utils/datas'
import type { AgendamentoDetalhado, Cliente, ResumoCliente } from '@/types'

/** Preferências e observações registradas na ficha. */
export function NotasDoCliente({ cliente }: { cliente: Cliente }) {
  if (!cliente.preferencias && !cliente.observacoes) return null

  return (
    <Carta>
      <CartaTitulo titulo="No atendimento" />
      {cliente.preferencias && (
        <div className="mb-3">
          <p className="eyebrow mb-1.5">Preferências</p>
          <p className="text-[13.5px] leading-relaxed text-onix-600">{cliente.preferencias}</p>
        </div>
      )}
      {cliente.observacoes && (
        <div>
          <p className="eyebrow mb-1.5">Observações</p>
          <p className="text-[13.5px] leading-relaxed text-onix-600">{cliente.observacoes}</p>
        </div>
      )}
    </Carta>
  )
}

export function PontosDoCliente({ pontos }: { pontos: number }) {
  if (!pontos) return null

  return (
    <Carta className="border-ouro-200 bg-ouro-100/40">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-ouro-600 shadow-carta">
          <Gem className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div>
          <p className="eyebrow">Pontos acumulados</p>
          <p className="tabular font-display text-[22px] font-light leading-none text-onix-900">
            {pontos}
          </p>
        </div>
      </div>
    </Carta>
  )
}

/** Ranking dos serviços que ela mais faz. */
export function ServicosPreferidos({ historico }: { historico: AgendamentoDetalhado[] }) {
  const concluidos = historico.filter((a) => a.situacao === 'concluido')
  if (concluidos.length === 0) return null

  const contagem = concluidos.reduce<Record<string, number>>((acumulado, atendimento) => {
    const nome = atendimento.servico?.nome ?? 'Outro'
    acumulado[nome] = (acumulado[nome] ?? 0) + 1
    return acumulado
  }, {})

  const ranking = Object.entries(contagem)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  return (
    <Carta>
      <CartaTitulo titulo="Serviços preferidos" />
      <ul className="space-y-2">
        {ranking.map(([nome, vezes]) => (
          <li key={nome} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="truncate text-onix-700">{nome}</span>
            <span className="tabular shrink-0 text-onix-400">{vezes}×</span>
          </li>
        ))}
      </ul>
    </Carta>
  )
}

/** Previsão de retorno com base na frequência observada. */
export function RitmoDeRetorno({ resumo }: { resumo: ResumoCliente }) {
  if (!resumo.intervaloMedioDias || !resumo.ultimaVisita) return null

  return (
    <Carta>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-quartzo-100 text-quartzo-700">
          <CalendarClock className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-onix-800">
            Costuma voltar a cada {resumo.intervaloMedioDias} dias
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-onix-400">
            Última visita {tempoRelativo(resumo.ultimaVisita)}.
          </p>
        </div>
      </div>
    </Carta>
  )
}

/** Números da ficha, em bloco compacto. */
export function NumerosDoCliente({ resumo }: { resumo: ResumoCliente }) {
  const itens = [
    {
      rotulo: 'Visitas',
      valor: String(resumo.visitas),
      detalhe: resumo.faltas ? `${resumo.faltas} falta(s)` : undefined,
    },
    {
      rotulo: 'Total gasto',
      valor: dinheiro(resumo.totalGasto),
      detalhe: resumo.visitas ? `Média de ${dinheiro(resumo.totalGasto / resumo.visitas)}` : undefined,
    },
    {
      rotulo: 'Última visita',
      valor: resumo.ultimaVisita ? tempoRelativo(resumo.ultimaVisita) : '—',
      detalhe: resumo.ultimaVisita ? undefined : 'Ainda não veio',
    },
    {
      rotulo: 'Frequência',
      valor: resumo.intervaloMedioDias ? `${resumo.intervaloMedioDias}d` : '—',
      detalhe: resumo.intervaloMedioDias ? 'Entre atendimentos' : 'Precisa de mais visitas',
    },
  ]

  return (
    <section className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {itens.map((item) => (
        <div key={item.rotulo} className="min-w-0 rounded-xl border border-onix-100 bg-white p-3.5">
          <p className="eyebrow truncate">{item.rotulo}</p>
          <p className="tabular mt-1.5 truncate font-display text-[19px] font-light leading-none text-onix-900 sm:text-[21px]">
            {item.valor}
          </p>
          {item.detalhe && <p className="mt-1.5 truncate text-[11.5px] text-onix-400">{item.detalhe}</p>}
        </div>
      ))}
    </section>
  )
}
