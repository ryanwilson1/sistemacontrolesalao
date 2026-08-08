import { Clock, Sparkles, Users } from 'lucide-react'
import { dinheiro, duracao } from '@/utils/formato'
import { Passo } from '../componentes/Moldura'
import type { Profissional, Servico } from '@/types'

export function EscolhaServico({
  servicos, aoEscolher,
}: {
  servicos: Servico[]
  aoEscolher: (servico: Servico) => void
}) {
  return (
    <Passo titulo="O que você quer fazer?">
      <ul className="space-y-2">
        {servicos.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => aoEscolher(item)}
              className="w-full rounded-2xl border border-onix-100 bg-white p-4 text-left transition-all hover:border-marca hover:shadow-carta"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-onix-800">{item.nome}</p>
                  {item.descricao && (
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-onix-400">
                      {item.descricao}
                    </p>
                  )}
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-onix-400">
                    <Clock className="h-3 w-3" /> {duracao(item.duracaoMinutos)}
                  </p>
                </div>
                <p className="tabular shrink-0 font-display text-[17px] font-light text-onix-900">
                  {dinheiro(item.preco)}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Passo>
  )
}

/**
 * Escolha da profissional — ou a recusa dela.
 *
 * "Tanto faz" vem primeiro e em destaque porque é a resposta mais comum
 * e a que abre mais horários. Obrigar a escolher cedo esconde vagas: a
 * cliente que só queria as 14h de sábado desiste ao ver a agenda de uma
 * pessoa lotada, sem saber que a outra estava livre.
 */
export function EscolhaProfissional({
  profissionais, resumo, aoEscolher,
}: {
  profissionais: Profissional[]
  resumo?: string
  aoEscolher: (profissional: Profissional | null) => void
}) {
  return (
    <Passo titulo="Com quem você prefere?" resumo={resumo}>
      <button
        onClick={() => aoEscolher(null)}
        className="flex w-full items-center gap-3.5 rounded-2xl border border-marca/40 bg-marca/[0.06] p-4 text-left transition-all hover:border-marca hover:shadow-carta"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-marca">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-onix-800">Tanto faz</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-onix-400">
            Mostra todos os horários livres da equipe
          </span>
        </span>
      </button>

      {profissionais.length > 1 && (
        <p className="mb-2 mt-5 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-onix-300">
          <Users className="h-3 w-3" /> Ou escolha
        </p>
      )}

      <ul className="space-y-2">
        {profissionais.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => aoEscolher(item)}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-onix-100 bg-white p-4 text-left transition-all hover:border-marca hover:shadow-carta"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-[15px] font-medium"
                style={{ backgroundColor: `${item.cor}22`, color: item.cor }}
              >
                {item.nome.charAt(0)}
              </span>
              <span className="truncate text-[15px] font-medium text-onix-800">{item.nome}</span>
            </button>
          </li>
        ))}
      </ul>
    </Passo>
  )
}
