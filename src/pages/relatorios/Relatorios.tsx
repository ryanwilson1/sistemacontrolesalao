import { useMemo, useState } from 'react'
import { Download, FileBarChart, Printer } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CabecalhoPagina, Indicador } from '@/components/common'
import { Botao, Campo, Carta, CartaTitulo, Entrada } from '@/components/ui'
import { EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAgendamentos, useLancamentos, resumirLancamentos } from '@/hooks'
import { OCUPA_HORARIO } from '@/constants'
import { dinheiro, duracao } from '@/utils/formato'
import { addDays, dataNumerica, faixaDeDias, isoData } from '@/utils/datas'
import { baixarCSV } from './exportar'

const CORES = ['#B08A3E', '#C98F98', '#8E5A65', '#4F7A62', '#6B5B5E', '#D5AEB4', '#C8A85F']

export default function Relatorios() {
  const [de, setDe] = useState(() => isoData(addDays(new Date(), -29)))
  const [ate, setAte] = useState(() => isoData(new Date()))

  const faixa = useMemo(
    () => faixaDeDias(new Date(`${de}T12:00:00`), new Date(`${ate}T12:00:00`)),
    [de, ate],
  )

  const { dados: agendamentos, carregando } = useAgendamentos(faixa.de, faixa.ate)
  const { dados: lancamentos } = useLancamentos(de, ate)

  const resumo = useMemo(() => resumirLancamentos(lancamentos ?? []), [lancamentos])

  /** Consolida por serviço: quantas vezes, quanto rendeu, quanto tempo tomou. */
  const porServico = useMemo(() => {
    const mapa = new Map<string, { nome: string; vezes: number; total: number; minutos: number }>()

    for (const agendamento of agendamentos ?? []) {
      if (!OCUPA_HORARIO.includes(agendamento.situacao)) continue

      const nome = agendamento.servico?.nome ?? 'Outro'
      const atual = mapa.get(nome) ?? { nome, vezes: 0, total: 0, minutos: 0 }

      atual.vezes += 1
      atual.total += agendamento.preco - agendamento.desconto
      atual.minutos += agendamento.servico?.duracaoMinutos ?? 0

      mapa.set(nome, atual)
    }

    return [...mapa.values()].sort((a, b) => b.total - a.total)
  }, [agendamentos])

  const porProfissional = useMemo(() => {
    const mapa = new Map<string, { nome: string; vezes: number; total: number }>()

    for (const agendamento of agendamentos ?? []) {
      if (!OCUPA_HORARIO.includes(agendamento.situacao)) continue

      const nome = agendamento.profissional?.nome ?? 'Sem profissional'
      const atual = mapa.get(nome) ?? { nome, vezes: 0, total: 0 }

      atual.vezes += 1
      atual.total += agendamento.preco - agendamento.desconto

      mapa.set(nome, atual)
    }

    return [...mapa.values()].sort((a, b) => b.total - a.total)
  }, [agendamentos])

  const totais = useMemo(() => {
    const ativos = (agendamentos ?? []).filter((a) => OCUPA_HORARIO.includes(a.situacao))
    const cancelados = (agendamentos ?? []).filter((a) => a.situacao === 'cancelado').length
    const faltas = (agendamentos ?? []).filter((a) => a.situacao === 'faltou').length
    const receita = ativos.reduce((soma, a) => soma + a.preco - a.desconto, 0)

    return {
      atendimentos: ativos.length,
      cancelados,
      faltas,
      receita,
      ticket: ativos.length ? receita / ativos.length : 0,
      clientes: new Set(ativos.map((a) => a.clienteId).filter(Boolean)).size,
    }
  }, [agendamentos])

  const exportar = () => {
    baixarCSV(
      `relatorio-${de}-a-${ate}.csv`,
      ['Data', 'Cliente', 'Serviço', 'Profissional', 'Situação', 'Valor', 'Desconto', 'Total'],
      (agendamentos ?? []).map((a) => [
        dataNumerica(a.inicio),
        a.cliente?.nome ?? a.nomeAvulso ?? '',
        a.servico?.nome ?? '',
        a.profissional?.nome ?? '',
        a.situacao,
        a.preco.toFixed(2),
        a.desconto.toFixed(2),
        (a.preco - a.desconto).toFixed(2),
      ]),
    )
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Relatórios"
        titulo="Desempenho"
        descricao="Escolha o período e veja o que rendeu mais."
        acoes={
          <>
            <Botao variante="secundario" tamanho="sm" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </Botao>
            <Botao variante="ouro" tamanho="sm" onClick={exportar} className="print:hidden">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Botao>
          </>
        }
      />

      <Carta className="mb-4 print:hidden">
        <div className="grid gap-4 sm:grid-cols-2 sm:max-w-lg">
          <Campo rotulo="De">
            <Entrada type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até">
            <Entrada type="date" value={ate} min={de} max={isoData(new Date())} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>
      </Carta>

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Atendimentos" valor={String(totais.atendimentos)} detalhe={`${totais.clientes} clientes`} atraso={0} />
        <Indicador rotulo="Faturamento" valor={dinheiro(totais.receita)} detalhe="No período" destaque atraso={1} />
        <Indicador rotulo="Ticket médio" valor={dinheiro(totais.ticket)} detalhe="Por atendimento" atraso={2} />
        <Indicador
          rotulo="Cancelamentos"
          valor={String(totais.cancelados + totais.faltas)}
          detalhe={`${totais.faltas} falta(s)`}
          atraso={3}
        />
      </section>

      {carregando ? (
        <EsqueletoLista linhas={6} />
      ) : porServico.length === 0 ? (
        <Carta>
          <EstadoVazio
            icone={FileBarChart}
            titulo="Nenhum atendimento no período"
            descricao="Escolha outras datas para ver os números."
          />
        </Carta>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Carta espacamento={false} className="overflow-hidden">
            <div className="p-4 pb-1 sm:p-5 sm:pb-1">
              <CartaTitulo titulo="Por serviço" descricao="Ordenado pelo que mais rendeu" />
            </div>

            <div className="scroll-fino overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="border-y border-onix-100 bg-quartzo-50">
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-onix-400 sm:px-5">Serviço</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-onix-400">Vezes</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-onix-400">Tempo</th>
                    <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wider text-onix-400 sm:px-5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-onix-50">
                  {porServico.map((linha) => (
                    <tr key={linha.nome} className="transition-colors hover:bg-quartzo-50">
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-[13.5px] font-medium text-onix-800 sm:px-5">
                        {linha.nome}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-[13px] text-onix-500">{linha.vezes}</td>
                      <td className="tabular px-3 py-2.5 text-right text-[13px] text-onix-400">
                        {duracao(linha.minutos)}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-[13.5px] font-medium text-onix-800 sm:px-5">
                        {dinheiro(linha.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carta>

          <div className="space-y-4">
            <Carta>
              <CartaTitulo titulo="Participação" descricao="Peso de cada serviço no faturamento" />
              <div className="h-[196px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={porServico.slice(0, 7)}
                      dataKey="total"
                      nameKey="nome"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {porServico.slice(0, 7).map((_, indice) => (
                        <Cell key={indice} fill={CORES[indice % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #EBE5E6', fontSize: 12 }}
                      formatter={(valor: number) => dinheiro(valor)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-3 space-y-1.5">
                {porServico.slice(0, 5).map((linha, indice) => (
                  <li key={linha.nome} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: CORES[indice % CORES.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-onix-600">{linha.nome}</span>
                    <span className="tabular shrink-0 text-onix-400">
                      {Math.round((linha.total / (totais.receita || 1)) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Carta>

            <Carta>
              <CartaTitulo titulo="Por profissional" />
              <ul className="space-y-2.5">
                {porProfissional.map((linha) => (
                  <li key={linha.nome} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-onix-800">
                        {linha.nome}
                      </span>
                      <span className="block text-[12px] text-onix-400">
                        {linha.vezes} atendimento{linha.vezes === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[13.5px] font-medium text-onix-700">
                      {dinheiro(linha.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Carta>

            <Carta>
              <CartaTitulo titulo="Caixa no período" />
              <dl className="space-y-2 text-[13.5px]">
                {[
                  ['Entradas', dinheiro(resumo.recebido)],
                  ['Saídas', dinheiro(resumo.pago)],
                  ['Resultado', dinheiro(resumo.lucro)],
                ].map(([rotulo, valor], indice) => (
                  <div
                    key={rotulo}
                    className={
                      indice === 2
                        ? 'flex justify-between border-t border-onix-100 pt-2 font-medium text-onix-900'
                        : 'flex justify-between text-onix-500'
                    }
                  >
                    <dt>{rotulo}</dt>
                    <dd className="tabular">{valor}</dd>
                  </div>
                ))}
              </dl>
            </Carta>
          </div>
        </div>
      )}
    </>
  )
}
