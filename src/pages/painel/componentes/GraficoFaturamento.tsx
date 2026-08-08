import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Carta, CartaTitulo } from '@/components/ui'
import { Esqueleto } from '@/components/feedback'
import { dinheiro } from '@/utils/formato'
import { format } from '@/utils/datas'

export function GraficoFaturamento({
  serie, faturado, meta, carregando,
}: {
  serie: { dia: string; valor: number }[]
  faturado: number
  meta: number | null
  carregando: boolean
}) {
  const pontos = serie.map((ponto) => ({
    rotulo: format(new Date(`${ponto.dia}T12:00:00`), 'dd/MM'),
    valor: ponto.valor,
  }))

  const progresso = meta && meta > 0 ? Math.min(faturado / meta, 1) : null

  return (
    <Carta>
      <CartaTitulo titulo="Faturamento" descricao="Últimos 14 dias" />

      {carregando ? (
        <Esqueleto className="h-[132px] w-full" />
      ) : (
        <>
          <div className="h-[132px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pontos} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradiente-faturamento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B08A3E" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#B08A3E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="rotulo" tick={{ fontSize: 10, fill: '#B7A9AB' }}
                  axisLine={false} tickLine={false} interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#B7A9AB' }} axisLine={false} tickLine={false} width={42}
                  tickFormatter={(valor: number) => (valor >= 1000 ? `${Math.round(valor / 1000)}k` : String(valor))}
                />
                <Tooltip
                  cursor={{ stroke: '#E4CDD0', strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 12, border: '1px solid #EBE5E6', fontSize: 12,
                    boxShadow: '0 8px 24px -12px rgba(58,46,49,.2)',
                  }}
                  formatter={(valor: number) => [dinheiro(valor), 'Faturado']}
                />
                <Area type="monotone" dataKey="valor" stroke="#B08A3E" strokeWidth={2} fill="url(#gradiente-faturamento)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {progresso !== null && (
            <div className="mt-4 border-t border-onix-50 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[12.5px] text-onix-400">Meta do mês</p>
                <p className="tabular text-[13px] font-medium text-onix-800">
                  {dinheiro(faturado)} <span className="text-onix-300">de {dinheiro(meta!)}</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-onix-100">
                <motion.div
                  className="filete-ouro h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progresso * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Carta>
  )
}
