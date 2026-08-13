import { motion } from 'framer-motion'
import {
  Award, CalendarCheck, Clock, Repeat, Scissors, TrendingUp, UserPlus, XCircle,
} from 'lucide-react'
import { Carta, CartaTitulo } from '@/components/ui'
import { dinheiro, duracao } from '@/utils/formato'
import { cn } from '@/utils/cn'
import type { PainelCompleto } from '@/types'

/** Número com comparação entre hoje, semana e mês. */
export function IndicadorPeriodo({
  rotulo, valores, formato = 'numero', atraso = 0,
}: {
  rotulo: string
  valores: { hoje: number; semana: number; mes: number }
  formato?: 'numero' | 'dinheiro'
  atraso?: number
}) {
  const exibir = (v: number) => (formato === 'dinheiro' ? dinheiro(v) : String(v))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: atraso * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
      className="min-w-0 rounded-2xl border border-onix-100 bg-white p-4 shadow-carta sm:p-5"
    >
      <p className="eyebrow truncate">{rotulo}</p>
      <p className="tabular mt-2.5 truncate font-display text-[22px] font-light leading-none tracking-tight text-onix-900 sm:text-[26px]">
        {exibir(valores.hoje)}
      </p>
      <p className="mt-1 text-[11px] text-onix-300">hoje</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-onix-50 pt-3">
        {[['Semana', valores.semana], ['Mês', valores.mes]].map(([r, v]) => (
          <div key={String(r)} className="min-w-0">
            <dt className="truncate text-[11px] text-onix-300">{r}</dt>
            <dd className="tabular truncate text-[13.5px] font-medium text-onix-700">
              {exibir(Number(v))}
            </dd>
          </div>
        ))}
      </dl>
    </motion.div>
  )
}

/** Anel de progresso para taxas. */
export function Taxa({
  rotulo, valor, detalhe, invertido, atraso = 0,
}: {
  rotulo: string
  valor: number
  detalhe: string
  /** Quando alto é ruim (cancelamento). */
  invertido?: boolean
  atraso?: number
}) {
  const proporcao = Math.min(Math.max(valor, 0), 1)
  const bom = invertido ? proporcao < 0.15 : proporcao > 0.5

  const raio = 26
  const circunferencia = 2 * Math.PI * raio

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: atraso * 0.05 }}
      /*
        Empilhado no celular, lado a lado a partir de `sm`.

        Com o círculo de 68px ao lado do texto numa coluna de metade da
        tela de um iPhone, sobravam ~90px para a palavra — e "Ocupação
        da agenda" virava seis linhas, uma palavra por linha, com o
        detalhe abaixo espremido do mesmo jeito.

        O anel também encolhe no celular: 56px continua legível e
        devolve espaço para o texto.
      */
      className="flex min-w-0 flex-col items-start gap-2.5 rounded-2xl border border-onix-100 bg-white p-4 shadow-carta sm:flex-row sm:items-center sm:gap-4 sm:p-5"
    >
      <span className="relative grid h-14 w-14 shrink-0 place-items-center sm:h-[68px] sm:w-[68px]">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={raio} fill="none" stroke="#F0E3E4" strokeWidth="6" />
          <motion.circle
            cx="32" cy="32" r={raio} fill="none" strokeWidth="6" strokeLinecap="round"
            stroke={bom ? '#4F7A62' : '#B08A3E'}
            strokeDasharray={circunferencia}
            initial={{ strokeDashoffset: circunferencia }}
            animate={{ strokeDashoffset: circunferencia * (1 - proporcao) }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </svg>
        <span className="tabular relative font-display text-[14px] font-medium text-onix-900 sm:text-[15px]">
          {Math.round(proporcao * 100)}%
        </span>
      </span>

      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-onix-800">{rotulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-onix-400">{detalhe}</span>
      </span>
    </motion.div>
  )
}

/** Cartão de destaque: profissional ou serviço campeão. */
export function CartaoDestaque({
  titulo, destaque, icone: Icone, formato = 'dinheiro',
}: {
  titulo: string
  destaque: PainelCompleto['profissionalDestaque']
  icone: typeof Award
  formato?: 'dinheiro' | 'numero'
}) {
  if (!destaque) return null

  return (
    <Carta className="border-ouro-200 bg-ouro-100/40">
      <div className="flex items-center gap-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-ouro-600 shadow-carta">
          <Icone className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow truncate">{titulo}</p>
          <p className="mt-0.5 truncate font-display text-[17px] font-medium text-onix-900">
            {destaque.nome}
          </p>
          <p className="tabular mt-0.5 truncate text-[12.5px] text-onix-500">
            {formato === 'dinheiro' ? dinheiro(destaque.valor) : `${destaque.valor}×`} ·{' '}
            {destaque.detalhe}
          </p>
        </div>
      </div>
    </Carta>
  )
}

/** Horários com mais movimento, em barras. */
export function HorariosMovimentados({ faixas }: { faixas: PainelCompleto['horariosMovimentados'] }) {
  if (faixas.length === 0) return null
  const maximo = Math.max(...faixas.map((f) => f.atendimentos))

  return (
    <Carta>
      <CartaTitulo titulo="Horários mais movimentados" descricao="Onde o dia costuma encher" />
      <ul className="space-y-2.5">
        {faixas.map((faixa) => (
          <li key={faixa.hora} className="flex items-center gap-3">
            <span className="tabular w-11 shrink-0 text-[12.5px] text-onix-400">
              {String(faixa.hora).padStart(2, '0')}:00
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-onix-100">
              <motion.span
                className="block h-full rounded-full bg-marca"
                initial={{ width: 0 }}
                animate={{ width: `${(faixa.atendimentos / maximo) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </span>
            <span className="tabular w-6 shrink-0 text-right text-[12.5px] text-onix-500">
              {faixa.atendimentos}
            </span>
          </li>
        ))}
      </ul>
    </Carta>
  )
}

/** Números secundários agrupados. */
export function NumerosSecundarios({
  painel, retornoMedio,
}: {
  painel: PainelCompleto
  retornoMedio: number | null
}) {
  const itens = [
    { rotulo: 'Clientes novas', valor: String(painel.clientesNovos), icone: UserPlus, detalhe: 'Neste mês' },
    { rotulo: 'Recorrentes', valor: String(painel.clientesRecorrentes), icone: Repeat, detalhe: 'Voltaram no mês' },
    { rotulo: 'Horários livres', valor: String(painel.horariosLivresHoje), icone: CalendarCheck, detalhe: 'Hoje' },
    { rotulo: 'Ticket médio', valor: dinheiro(painel.ticketMedio), icone: TrendingUp, detalhe: 'No mês' },
    {
      rotulo: 'Tempo médio',
      valor: painel.duracaoMediaAtendimento ? duracao(painel.duracaoMediaAtendimento) : '—',
      icone: Clock, detalhe: 'Por atendimento',
    },
    {
      rotulo: 'Retorno médio',
      valor: retornoMedio ? `${retornoMedio}d` : '—',
      icone: Repeat, detalhe: 'Entre visitas',
    },
    {
      rotulo: 'Não compareceram',
      valor: String(painel.faltas), icone: XCircle, detalhe: 'No mês',
    },
    {
      rotulo: 'Em estoque',
      valor: dinheiro(painel.valorEmEstoque), icone: Scissors, detalhe: 'Pelo custo médio',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {itens.map((item, indice) => (
        <div
          key={item.rotulo}
          className="entra-lista min-w-0 rounded-xl border border-onix-100 bg-white p-3.5"
          style={{ animationDelay: `${Math.min(indice * 0.03, 0.3)}s` }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="eyebrow truncate">{item.rotulo}</p>
            <item.icone className="h-3.5 w-3.5 shrink-0 text-onix-200" strokeWidth={1.8} />
          </div>
          <p className="tabular mt-1.5 truncate font-display text-[18px] font-light leading-none text-onix-900">
            {item.valor}
          </p>
          <p className="mt-1.5 truncate text-[11px] text-onix-300">{item.detalhe}</p>
        </div>
      ))}
    </div>
  )
}

/** Produtos mais consumidos nos atendimentos do mês. */
export function ProdutosMaisUsados({ produtos }: { produtos: PainelCompleto['produtosMaisUsados'] }) {
  if (produtos.length === 0) return null

  return (
    <Carta>
      <CartaTitulo titulo="Produtos mais usados" descricao="Consumo nos atendimentos do mês" />
      <ul className="space-y-2">
        {produtos.map((produto) => (
          <li key={produto.nome} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate text-onix-700">{produto.nome}</span>
            <span className="tabular shrink-0 text-onix-400">{produto.quantidade}×</span>
          </li>
        ))}
      </ul>
    </Carta>
  )
}

export { cn }
