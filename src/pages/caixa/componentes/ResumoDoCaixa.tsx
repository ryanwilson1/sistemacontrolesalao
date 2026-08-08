import { Carta, CartaTitulo } from '@/components/ui'
import { FORMA_PAGAMENTO } from '@/constants'
import { dinheiro } from '@/utils/formato'
import { hora } from '@/utils/datas'
import { cn } from '@/utils/cn'
import type { Caixa, FormaPagamento, ResumoCaixa } from '@/types'

/** Distribuição por forma de pagamento. Mostra só o que teve movimento. */
export function PorFormaDePagamento({ resumo }: { resumo: ResumoCaixa }) {
  const linhas = (Object.entries(resumo.porForma) as [FormaPagamento, number][])
    .filter(([, valor]) => valor !== 0)
    .sort(([, a], [, b]) => b - a)

  if (linhas.length === 0) return null

  const total = linhas.reduce((soma, [, valor]) => soma + Math.abs(valor), 0)

  return (
    <Carta>
      <CartaTitulo titulo="Por forma de pagamento" />
      <ul className="space-y-3">
        {linhas.map(([forma, valor]) => (
          <li key={forma}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="truncate text-onix-700">{FORMA_PAGAMENTO[forma]}</span>
              <span className="tabular shrink-0 font-medium text-onix-800">{dinheiro(valor)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-onix-100">
              <div
                className={cn('h-full rounded-full', forma === 'dinheiro' ? 'bg-marca' : 'bg-quartzo-400')}
                style={{ width: `${total ? (Math.abs(valor) / total) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg bg-quartzo-50 px-3 py-2 text-[12px] leading-relaxed text-onix-400">
        Só o dinheiro altera o que há na gaveta. Pix e cartão entram no faturamento
        mas não na conferência do fechamento.
      </p>
    </Carta>
  )
}

/** Cartão de fechamento, exibido quando o caixa já foi encerrado. */
export function CaixaFechado({ caixa }: { caixa: Caixa }) {
  const diferenca = caixa.diferenca ?? 0

  return (
    <Carta
      className={cn(
        diferenca === 0 ? 'border-[#CFE0D5] bg-[#E8F0EA]/50' : 'border-ouro-200 bg-ouro-100/40',
      )}
    >
      <CartaTitulo
        titulo="Caixa fechado"
        descricao={caixa.fechadoEm ? `Encerrado às ${hora(caixa.fechadoEm)}` : undefined}
      />

      <dl className="space-y-2 text-[13.5px]">
        {[
          ['Contado na gaveta', dinheiro(caixa.valorInformado ?? 0)],
          [
            'Diferença',
            diferenca === 0
              ? 'Bateu certinho'
              : diferenca > 0
                ? `Sobrou ${dinheiro(diferenca)}`
                : `Faltou ${dinheiro(Math.abs(diferenca))}`,
          ],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <dt className="text-onix-500">{rotulo}</dt>
            <dd className="tabular font-medium text-onix-800">{valor}</dd>
          </div>
        ))}
      </dl>

      {caixa.observacoes && (
        <p className="mt-3 border-t border-onix-100 pt-3 text-[13px] leading-relaxed text-onix-500">
          {caixa.observacoes}
        </p>
      )}
    </Carta>
  )
}
