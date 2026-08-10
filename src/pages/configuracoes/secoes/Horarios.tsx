import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Botao, Campo, Carta, CartaTitulo, Entrada, Selecao } from '@/components/ui'
import { useAviso } from '@/contexts'
import { useJornada, useSalvarJornada, useSalvarStudio } from '@/hooks'
import { ErroDeRegra } from '@/utils/erros'
import { DIAS_SEMANA } from '@/constants'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { JornadaDia, Studio } from '@/types'

/** Funcionamento do studio e regras do agendamento online. */
export function Horarios({ studio, aoSalvar }: { studio: Studio; aoSalvar: () => Promise<void> }) {
  const { dados: jornadaSalva, carregando } = useJornada()
  const salvarJornada = useSalvarJornada()
  const salvarStudio = useSalvarStudio()
  const aviso = useAviso()

  const [jornada, setJornada] = useState<JornadaDia[]>([])
  const [antecedencia, setAntecedencia] = useState(String(studio.antecedenciaMinutos))
  const [horizonte, setHorizonte] = useState(String(studio.horizonteDias))
  const [intervalo, setIntervalo] = useState(String(studio.intervaloMinutos))

  useEffect(() => {
    if (jornadaSalva) setJornada(jornadaSalva)
  }, [jornadaSalva])

  const alterarDia = (diaSemana: number, mudancas: Partial<JornadaDia>) => {
    setJornada((atual) =>
      atual.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...mudancas } : dia)),
    )
  }

  const enviar = async () => {
    try {
      /*
        Em sequência, com desfazer — não em paralelo.

        `Promise.all` dispara as duas gravações ao mesmo tempo e uma
        pode falhar sozinha. O resultado é a configuração pela metade:
        a jornada nova gravada e a antecedência velha, ou o contrário.
        E o pior é que a tela mostrava sucesso ou erro para o conjunto,
        sem dizer qual metade entrou.

        O estado anterior fica guardado antes de qualquer escrita. Se a
        segunda falhar, a primeira é desfeita e a proprietária recebe a
        configuração exatamente como estava — nada pela metade.
      */
      const jornadaAnterior = [...(jornadaSalva ?? [])]

      await salvarJornada.executar(jornada)

      try {
        await salvarStudio.executar({
          antecedenciaMinutos: Number(antecedencia) || 0,
          horizonteDias: Number(horizonte) || 30,
          intervaloMinutos: Number(intervalo) || 15,
        })
      } catch (falha) {
        try {
          await salvarJornada.executar(jornadaAnterior)
        } catch {
          // O desfazer também falhou — quase sempre a mesma queda de
          // rede. A mensagem abaixo diz a verdade: pode ter sobrado
          // metade, e recarregar mostra o que de fato está gravado.
          throw new ErroDeRegra(
            'A conexão caiu no meio do salvamento e não foi possível desfazer. ' +
            'Recarregue a página para ver o que está gravado antes de mexer de novo.',
          )
        }
        throw falha
      }

      await aoSalvar()
      aviso.sucesso('Horários atualizados')
    } catch (falha) {
      aviso.erro('Não foi possível salvar', mensagemDeErro(falha))
    }
  }

  return (
    <div className="space-y-4">
      <Carta>
        <CartaTitulo titulo="Funcionamento" descricao="Só existem horários livres dentro da jornada" />

        {carregando ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, indice) => (
              <div key={indice} className="h-14 animate-pulse rounded-xl bg-quartzo-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {jornada
              .slice()
              .sort((a, b) => a.diaSemana - b.diaSemana)
              .map((dia) => (
                <div
                  key={dia.diaSemana}
                  className={cn(
                    'rounded-xl border border-onix-100 p-3 transition-colors',
                    dia.aberto ? 'bg-white' : 'bg-quartzo-50',
                  )}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span
                      className={cn(
                        'w-[68px] shrink-0 text-[13px] font-medium sm:w-20 sm:text-[13.5px]',
                        dia.aberto ? 'text-onix-800' : 'text-onix-300',
                      )}
                    >
                      {DIAS_SEMANA[dia.diaSemana]}
                    </span>

                    {dia.aberto && (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Entrada
                          type="time" value={dia.abre}
                          onChange={(e) => alterarDia(dia.diaSemana, { abre: e.target.value })}
                          className="h-9 min-w-0 px-2 text-[13px]"
                        />
                        <span className="shrink-0 text-onix-300">—</span>
                        <Entrada
                          type="time" value={dia.fecha}
                          onChange={(e) => alterarDia(dia.diaSemana, { fecha: e.target.value })}
                          className="h-9 min-w-0 px-2 text-[13px]"
                        />
                      </div>
                    )}

                    <button
                      role="switch"
                      aria-checked={dia.aberto}
                      aria-label={`${DIAS_SEMANA[dia.diaSemana]}: ${dia.aberto ? 'aberto' : 'fechado'}`}
                      onClick={() => alterarDia(dia.diaSemana, { aberto: !dia.aberto })}
                      className={cn(
                        'relative ml-auto h-6 w-11 shrink-0 rounded-full transition-colors',
                        dia.aberto ? 'bg-marca' : 'bg-onix-200',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                          dia.aberto ? 'translate-x-[22px]' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                  </div>

                  {dia.aberto && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-onix-50 pt-2.5">
                      <span className="text-[12px] text-onix-400">Almoço</span>
                      <Entrada
                        type="time" value={dia.almocoInicio ?? ''}
                        onChange={(e) => alterarDia(dia.diaSemana, { almocoInicio: e.target.value || null })}
                        /*
                          44px no celular, compacto a partir de `sm`.

                          32px de altura com fonte de 12,5px num campo
                          `type="time"` é um alvo de toque abaixo do
                          mínimo recomendado — e a fonte pequena ainda
                          fazia o Safari dar zoom ao focar. Definir o
                          horário do almoço no celular virava briga.
                        */
                        className="h-11 w-[104px] px-2 text-base sm:h-8 sm:text-[12.5px]"
                      />
                      <span className="text-onix-300">—</span>
                      <Entrada
                        type="time" value={dia.almocoFim ?? ''}
                        onChange={(e) => alterarDia(dia.diaSemana, { almocoFim: e.target.value || null })}
                        /*
                          44px no celular, compacto a partir de `sm`.

                          32px de altura com fonte de 12,5px num campo
                          `type="time"` é um alvo de toque abaixo do
                          mínimo recomendado — e a fonte pequena ainda
                          fazia o Safari dar zoom ao focar. Definir o
                          horário do almoço no celular virava briga.
                        */
                        className="h-11 w-[104px] px-2 text-base sm:h-8 sm:text-[12.5px]"
                      />
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </Carta>

      <Carta>
        <CartaTitulo titulo="Regras do agendamento" descricao="Valem para o link público" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Antecedência mínima" dica="Em minutos">
            <Entrada
              type="number" min="0" step="30" inputMode="numeric"
              value={antecedencia} onChange={(e) => setAntecedencia(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Agendar até" dica="Dias à frente">
            <Entrada
              type="number" min="1" max="365" inputMode="numeric"
              value={horizonte} onChange={(e) => setHorizonte(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Intervalo entre horários">
            <Selecao value={intervalo} onChange={(e) => setIntervalo(e.target.value)}>
              {[10, 15, 20, 30, 60].map((minutos) => (
                <option key={minutos} value={minutos}>{minutos} minutos</option>
              ))}
            </Selecao>
          </Campo>
        </div>
      </Carta>

      <div className="flex justify-end">
        <Botao
          variante="ouro"
          onClick={() => void enviar()}
          carregando={salvarJornada.salvando || salvarStudio.salvando}
        >
          <Save className="h-4 w-4" /> Salvar horários
        </Botao>
      </div>
    </div>
  )
}
