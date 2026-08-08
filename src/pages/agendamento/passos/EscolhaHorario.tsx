import { CalendarOff, Loader2 } from 'lucide-react'
import { Botao } from '@/components/ui'
import { hora, isoData } from '@/utils/datas'
import { cn } from '@/utils/cn'
import { Passo } from '../componentes/Moldura'
import type { OpcaoDeHorario } from '@/types'

export function EscolhaHorario({
  resumo, datas, dataEscolhida, aoTrocarData, horarios, horarioEscolhido,
  aoEscolherHorario, carregando, reservando, aoContinuar, aoEntrarNaFila, ofereceEspera,
}: {
  resumo: string
  datas: Date[]
  dataEscolhida: string
  aoTrocarData: (data: string) => void
  horarios: OpcaoDeHorario[]
  horarioEscolhido: string | null
  aoEscolherHorario: (opcao: OpcaoDeHorario) => void
  carregando: boolean
  reservando: boolean
  aoContinuar: () => void
  aoEntrarNaFila: () => void
  ofereceEspera: boolean
}) {
  return (
    <Passo titulo="Quando fica melhor?" resumo={resumo}>
      <div className="scroll-fino -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {datas.map((dia) => {
          const chave = isoData(dia)
          const ativo = chave === dataEscolhida

          return (
            <button
              key={chave}
              onClick={() => aoTrocarData(chave)}
              className={cn(
                'flex w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-colors',
                ativo
                  ? 'border-transparent bg-onix-800 text-white'
                  : 'border-onix-100 bg-white text-onix-500',
              )}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-70">
                {dia.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="tabular font-display text-[18px] leading-none">{dia.getDate()}</span>
            </button>
          )
        })}
      </div>

      {carregando ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, indice) => (
            <div key={indice} className="h-11 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : horarios.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-onix-200 bg-white/60 px-5 py-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-quartzo-100 text-quartzo-600">
            <CalendarOff className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <p className="mt-3 text-[13.5px] leading-relaxed text-onix-400">
            Nenhum horário livre neste dia.
            <br />
            Escolha outra data acima.
          </p>

          {/*
            A lista de espera aparece exatamente aqui, no momento da
            frustração. Oferecê-la antes seria ruído; depois, tarde
            demais — a cliente já teria fechado o link.
          */}
          {ofereceEspera && (
            <Botao variante="secundario" tamanho="sm" className="mt-4" onClick={aoEntrarNaFila}>
              Me avise se abrir vaga
            </Botao>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horarios.map((opcao) => {
              const chave = opcao.inicio.toISOString()
              const escolhido = horarioEscolhido === chave

              return (
                <button
                  key={chave}
                  onClick={() => aoEscolherHorario(opcao)}
                  disabled={reservando}
                  className={cn(
                    'tabular relative h-11 rounded-xl border text-[14px] font-medium transition-colors',
                    escolhido
                      ? 'border-transparent bg-onix-800 text-white'
                      : 'border-onix-100 bg-white text-onix-600 hover:border-marca',
                    reservando && !escolhido && 'opacity-50',
                  )}
                >
                  {escolhido && reservando ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    hora(opcao.inicio)
                  )}
                </button>
              )
            })}
          </div>

          <Botao
            variante="ouro" tamanho="lg" bloco className="mt-5"
            disabled={!horarioEscolhido} carregando={reservando}
            onClick={aoContinuar}
          >
            Continuar
          </Botao>

          {ofereceEspera && (
            <button
              onClick={aoEntrarNaFila}
              className="mt-3 w-full text-center text-[12.5px] text-onix-400 underline decoration-onix-200 underline-offset-4 transition-colors hover:text-onix-700"
            >
              Nenhum destes serve? Entrar na lista de espera
            </button>
          )}
        </>
      )}
    </Passo>
  )
}
