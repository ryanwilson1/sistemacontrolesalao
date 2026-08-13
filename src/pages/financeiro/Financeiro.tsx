import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Plus, Target, Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CabecalhoPagina, Indicador, NavegadorDePeriodo } from '@/components/common'
import { Abas, Botao, Carta, CartaTitulo, Etiqueta } from '@/components/ui'
import { EstadoErro, EstadoVazio, EsqueletoLista } from '@/components/feedback'
import { useAviso } from '@/contexts'
import { useLancamentos, useMetaDoMes, useQuitarLancamento, resumirLancamentos } from '@/hooks'
import { QUITADO, SITUACAO_LANCAMENTO } from '@/constants'
import { dinheiro } from '@/utils/formato'
import { dataCurta, format, isoData, mesAno, primeiroDiaDoMes, ultimoDiaDoMes } from '@/utils/datas'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import { FormularioLancamento } from './FormularioLancamento'
import { FormularioMeta } from './FormularioMeta'
import type { Lancamento } from '@/types'

type Filtro = 'todos' | 'receita' | 'despesa' | 'aberto'

export default function Financeiro() {
  const [mes, setMes] = useState(() => primeiroDiaDoMes(new Date()))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [lancando, setLancando] = useState(false)
  const [definindoMeta, setDefinindoMeta] = useState(false)

  const aviso = useAviso()
  const quitar = useQuitarLancamento()

  const de = isoData(primeiroDiaDoMes(mes))
  const ate = isoData(ultimoDiaDoMes(mes))

  const { dados: lancamentos, carregando, erro, recarregar } = useLancamentos(de, ate)
  const { dados: meta } = useMetaDoMes(mes)

  const resumo = useMemo(() => resumirLancamentos(lancamentos ?? []), [lancamentos])

  /** Receitas e despesas por dia, para o gráfico comparativo. */
  const serie = useMemo(() => {
    const porDia = new Map<string, { receita: number; despesa: number }>()

    for (const lancamento of lancamentos ?? []) {
      if (!QUITADO.includes(lancamento.situacao)) continue

      const atual = porDia.get(lancamento.vencimento) ?? { receita: 0, despesa: 0 }
      atual[lancamento.tipo] += lancamento.valor
      porDia.set(lancamento.vencimento, atual)
    }

    return [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, valores]) => ({
        rotulo: format(new Date(`${dia}T12:00:00`), 'dd'),
        ...valores,
      }))
  }, [lancamentos])

  const visiveis = useMemo(() => {
    const lista = lancamentos ?? []
    if (filtro === 'aberto') {
      return lista.filter((l) => !QUITADO.includes(l.situacao) && l.situacao !== 'cancelado')
    }
    if (filtro === 'todos') return lista
    return lista.filter((l) => l.tipo === filtro)
  }, [lancamentos, filtro])

  const emAberto = useMemo(
    () =>
      (lancamentos ?? []).filter(
        (l) => !QUITADO.includes(l.situacao) && l.situacao !== 'cancelado',
      ).length,
    [lancamentos],
  )

  const confirmarQuitacao = async (lancamento: Lancamento) => {
    try {
      await quitar.executar({ id: lancamento.id, tipo: lancamento.tipo })
      aviso.sucesso(lancamento.tipo === 'receita' ? 'Recebimento confirmado' : 'Pagamento confirmado')
    } catch (falha) {
      aviso.erro('Não foi possível confirmar', mensagemDeErro(falha))
    }
  }

  const navegar = (direcao: -1 | 1) =>
    setMes((atual) => new Date(atual.getFullYear(), atual.getMonth() + direcao, 1))

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Financeiro"
        titulo={mesAno(mes)}
        acoes={
          <>
            <Botao variante="secundario" tamanho="sm" onClick={() => setDefinindoMeta(true)}>
              <Target className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Meta</span>
            </Botao>
            <Botao variante="ouro" tamanho="sm" onClick={() => setLancando(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Lançar</span>
            </Botao>
          </>
        }
      />

      <div className="mb-4">
        <NavegadorDePeriodo
          aoVoltar={() => navegar(-1)}
          aoAvancar={() => navegar(1)}
          aoIrParaHoje={() => setMes(primeiroDiaDoMes(new Date()))}
          rotuloAtalho="Mês atual"
        />
      </div>

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Indicador
          rotulo="Recebido" valor={dinheiro(resumo.recebido)} icone={ArrowUpRight}
          detalhe={resumo.aReceber ? `${dinheiro(resumo.aReceber)} a receber` : 'Tudo recebido'}
          atraso={0}
        />
        <Indicador
          rotulo="Pago" valor={dinheiro(resumo.pago)} icone={ArrowDownLeft}
          detalhe={resumo.aPagar ? `${dinheiro(resumo.aPagar)} a pagar` : 'Nada em aberto'}
          atraso={1}
        />
        <Indicador
          rotulo="Resultado" valor={dinheiro(resumo.lucro)} icone={Wallet}
          detalhe={resumo.lucro >= 0 ? 'Saldo positivo' : 'Saldo negativo'}
          destaque atraso={2}
        />
        <Indicador
          rotulo="Meta do mês"
          valor={meta ? dinheiro(meta.valor) : '—'}
          icone={Target}
          detalhe={
            meta?.valor
              ? `${Math.round((resumo.recebido / meta.valor) * 100)}% alcançado`
              : 'Nenhuma meta definida'
          }
          atraso={3}
        />
      </section>

      {serie.length > 0 && (
        <Carta className="mb-4">
          <CartaTitulo titulo="Entradas e saídas" descricao="Movimentação do mês, dia a dia" />
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0E3E4" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: '#B7A9AB' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#B7A9AB' }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={(valor: number) => (valor >= 1000 ? `${Math.round(valor / 1000)}k` : String(valor))}
                />
                <Tooltip
                  cursor={{ fill: '#FBF6F6' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #EBE5E6', fontSize: 12 }}
                  formatter={(valor: number, nome: string) => [
                    dinheiro(valor),
                    nome === 'receita' ? 'Entradas' : 'Saídas',
                  ]}
                />
                <Bar dataKey="receita" fill="#4F7A62" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="despesa" fill="#C98F98" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Carta>
      )}

      <div className="mb-3">
        <Abas
          idAnimacao="financeiro"
          abas={[
            { valor: 'todos', rotulo: 'Todos', contador: lancamentos?.length },
            { valor: 'receita', rotulo: 'Entradas' },
            { valor: 'despesa', rotulo: 'Saídas' },
            { valor: 'aberto', rotulo: 'Em aberto', contador: emAberto },
          ]}
          ativa={filtro}
          aoTrocar={setFiltro}
        />
      </div>

      {erro ? (
        <EstadoErro descricao={erro} aoTentarNovamente={recarregar} />
      ) : carregando ? (
        <EsqueletoLista linhas={6} />
      ) : visiveis.length === 0 ? (
        <Carta>
          <EstadoVazio
            icone={Wallet}
            titulo="Nenhum lançamento"
            descricao="Atendimentos concluídos entram aqui sozinhos. Outras entradas e saídas você lança à mão."
            acao={
              <Botao variante="ouro" onClick={() => setLancando(true)}>
                <Plus className="h-4 w-4" /> Novo lançamento
              </Botao>
            }
          />
        </Carta>
      ) : (
        <Carta espacamento={false} className="overflow-hidden">
          <ul className="divide-y divide-onix-50">
            {visiveis.map((lancamento, indice) => {
              const quitado = QUITADO.includes(lancamento.situacao)
              const receita = lancamento.tipo === 'receita'

              return (
                <li
                  key={lancamento.id}
                  className="entra-lista-lateral flex items-center gap-3 px-4 py-3 transition-colors hover:bg-quartzo-50"
                  style={{ animationDelay: `${Math.min(indice * 0.02, 0.3)}s` }}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                      receita ? 'bg-[#E8F0EA] text-sucesso' : 'bg-[#F7E9EA] text-perigo',
                    )}
                  >
                    {receita ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-onix-800">
                      {lancamento.descricao}
                    </p>
                    <p className="truncate text-[12.5px] text-onix-400">
                      {dataCurta(lancamento.vencimento)}
                      {lancamento.categoria && ` · ${lancamento.categoria}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'tabular text-[14px] font-medium',
                        receita ? 'text-sucesso' : 'text-onix-700',
                      )}
                    >
                      {receita ? '+' : '−'} {dinheiro(lancamento.valor)}
                    </p>
                    {!quitado && (
                      <Etiqueta className="mt-1 border-ouro-200 bg-ouro-100 text-ouro-700">
                        {SITUACAO_LANCAMENTO[lancamento.situacao]}
                      </Etiqueta>
                    )}
                  </div>

                  {!quitado && lancamento.situacao !== 'cancelado' && (
                    <button
                      onClick={() => void confirmarQuitacao(lancamento)}
                      disabled={quitar.salvando}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-onix-200 bg-white text-onix-400 transition-colors hover:border-sucesso hover:text-sucesso disabled:opacity-50"
                      aria-label={receita ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                      title={receita ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Carta>
      )}

      <FormularioLancamento
        aberto={lancando}
        aoFechar={() => setLancando(false)}
        mesReferencia={mes}
      />
      <FormularioMeta
        aberto={definindoMeta}
        aoFechar={() => setDefinindoMeta(false)}
        mesReferencia={mes}
        valorAtual={meta?.valor ?? null}
      />
    </>
  )
}
