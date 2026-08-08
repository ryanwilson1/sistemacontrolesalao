import { BellRing, CheckCircle2 } from 'lucide-react'
import { Botao, Campo, Entrada, AreaTexto } from '@/components/ui'
import { mascaraTelefone } from '@/utils/formato'
import { dataRelativa } from '@/utils/datas'
import { cn } from '@/utils/cn'
import { Passo } from '../componentes/Moldura'
import { ROTULO_PERIODO, type PeriodoDoDia } from '@/types'

const PERIODOS: PeriodoDoDia[] = ['manha', 'tarde', 'qualquer']

/**
 * Entrar na lista de espera.
 *
 * Pede o mínimo: nome, telefone e a faixa do dia que serve. Não pede
 * horário — quem escolhe o horário é a vaga que aparecer, e prometer
 * escolha aqui seria prometer o que não se pode cumprir.
 */
export function EntrarNaEspera({
  servico, data, periodo, aoMudarPeriodo, nome, aoMudarNome,
  telefone, aoMudarTelefone, observacao, aoMudarObservacao,
  erro, enviando, aoEnviar, aoVoltar,
}: {
  servico: string
  data: Date | null
  periodo: PeriodoDoDia
  aoMudarPeriodo: (valor: PeriodoDoDia) => void
  nome: string
  aoMudarNome: (valor: string) => void
  telefone: string
  aoMudarTelefone: (valor: string) => void
  observacao: string
  aoMudarObservacao: (valor: string) => void
  erro: string
  enviando: boolean
  aoEnviar: () => void
  aoVoltar: () => void
}) {
  return (
    <Passo
      titulo="Lista de espera"
      resumo={`${servico}${data ? ` · ${dataRelativa(data)}` : ''}`}
    >
      <p className="rounded-2xl border border-onix-100 bg-white p-4 text-[13.5px] leading-relaxed text-onix-500">
        Se alguém desmarcar, avisamos você pelo WhatsApp. A vaga fica com
        quem confirmar primeiro.
      </p>

      <div className="mt-4 space-y-4">
        <Campo rotulo="Qual parte do dia serve para você?">
          <div className="flex gap-2">
            {PERIODOS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => aoMudarPeriodo(opcao)}
                aria-pressed={periodo === opcao}
                className={cn(
                  'flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition-colors',
                  periodo === opcao
                    ? 'border-transparent bg-onix-800 text-white'
                    : 'border-onix-100 bg-white text-onix-500 hover:border-marca',
                )}
              >
                {ROTULO_PERIODO[opcao]}
              </button>
            ))}
          </div>
        </Campo>

        <Campo rotulo="Seu nome" obrigatorio>
          <Entrada
            value={nome} onChange={(e) => aoMudarNome(e.target.value)}
            placeholder="Nome completo" maxLength={120}
          />
        </Campo>

        <Campo rotulo="Telefone com DDD" obrigatorio dica="É por aqui que avisamos da vaga.">
          <Entrada
            value={telefone} onChange={(e) => aoMudarTelefone(mascaraTelefone(e.target.value))}
            placeholder="(11) 98765-4321" inputMode="tel"
          />
        </Campo>

        <Campo rotulo="Alguma observação">
          <AreaTexto
            value={observacao} onChange={(e) => aoMudarObservacao(e.target.value)}
            placeholder="Opcional" maxLength={500} rows={2}
          />
        </Campo>

        {erro && (
          <p className="rounded-xl border border-[#EBD2D4] bg-[#FBF3F4] px-3.5 py-2.5 text-[13px] text-perigo">
            {erro}
          </p>
        )}

        <Botao variante="ouro" tamanho="lg" bloco onClick={aoEnviar} carregando={enviando}>
          <BellRing className="h-4 w-4" /> Entrar na lista
        </Botao>

        <button
          onClick={aoVoltar}
          className="w-full text-center text-[12.5px] text-onix-400 transition-colors hover:text-onix-700"
        >
          Voltar e ver outros dias
        </button>
      </div>
    </Passo>
  )
}

export function NaEspera({ nome, servico }: { nome: string; servico: string }) {
  return (
    <div className="rounded-3xl bg-white p-7 text-center shadow-carta">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ouro-100 text-ouro-600">
        <CheckCircle2 className="h-8 w-8" strokeWidth={1.5} />
      </span>

      <h2 className="mt-5 font-display text-[22px] font-light tracking-tight text-onix-900">
        Você está na lista
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-onix-400">
        {nome.split(' ')[0]}, avisamos assim que abrir uma vaga de {servico}.
      </p>
      <p className="mt-5 text-[13px] leading-relaxed text-onix-400">
        Pode fechar esta página — a gente chama você no WhatsApp 💛
      </p>
    </div>
  )
}
