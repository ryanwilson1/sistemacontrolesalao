import { useMemo, useState } from 'react'
import { CalendarX2, Clock } from 'lucide-react'
import { EstadoVazio } from '@/components/feedback'
import { Retrato } from '@/components/ui'
import { useAtendentes, useRemarcar } from '@/hooks'
import { useAviso } from '@/contexts'
import { GRADE_AGENDA, SITUACAO, TIPO_BLOQUEIO } from '@/constants'
import { dt, hora, isSameDay, minutosDoDia, startOfDay } from '@/utils/datas'
import { dinheiro, duracao } from '@/utils/formato'
import { mensagemDeErro } from '@/utils/erros'
import { cn } from '@/utils/cn'
import type { AgendamentoDetalhado, Bloqueio } from '@/types'

const { horaInicio, horaFim, alturaHora, passoArrastoMinutos } = GRADE_AGENDA

interface Props {
  dia: Date
  agendamentos: AgendamentoDetalhado[]
  bloqueios: Bloqueio[]
  aoAbrir: (agendamento: AgendamentoDetalhado) => void
  aoCriar: (inicio: Date, profissionalId: string) => void
}

/**
 * Grade proporcional por profissional.
 *
 * A altura de cada bloco corresponde à duração real do serviço — bater o
 * olho já mostra quanto do dia está tomado. Arrastar move o horário.
 */
export function VisaoDia({ dia, agendamentos, bloqueios, aoAbrir, aoCriar }: Props) {
  const { dados: atendentes } = useAtendentes()
  const remarcar = useRemarcar()
  const aviso = useAviso()
  const [arrastando, setArrastando] = useState<string | null>(null)

  const doDia = useMemo(
    () => agendamentos.filter((a) => isSameDay(dt(a.inicio), dia)),
    [agendamentos, dia],
  )

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaInicio + 1 }, (_, i) => horaInicio + i),
    [],
  )

  const totalDoDia = useMemo(
    () =>
      doDia
        .filter((a) => !['cancelado', 'faltou'].includes(a.situacao))
        .reduce((soma, a) => soma + a.preco - a.desconto, 0),
    [doDia],
  )

  const minutosOcupados = useMemo(
    () =>
      doDia
        .filter((a) => a.situacao !== 'cancelado')
        .reduce((soma, a) => soma + (minutosDoDia(a.fim) - minutosDoDia(a.inicio)), 0),
    [doDia],
  )

  /** Converte a posição da solta em horário, arredondando ao passo. */
  const horarioDaSolta = (evento: React.DragEvent<HTMLDivElement>): Date => {
    const caixa = evento.currentTarget.getBoundingClientRect()
    const minutosBrutos = ((evento.clientY - caixa.top) / alturaHora) * 60 + horaInicio * 60
    const arredondado = Math.round(minutosBrutos / passoArrastoMinutos) * passoArrastoMinutos
    return new Date(startOfDay(dia).getTime() + arredondado * 60_000)
  }

  const mover = async (id: string, novoInicio: Date, profissionalId: string) => {
    const alvo = doDia.find((a) => a.id === id)
    if (!alvo) return

    try {
      await remarcar.executar({
        id,
        mudancas: { inicio: novoInicio.toISOString(), profissionalId },
      })
      aviso.sucesso('Horário alterado', `${alvo.cliente?.nome ?? alvo.nomeAvulso} às ${hora(novoInicio)}`)
    } catch (falha) {
      aviso.erro('Não foi possível mover', mensagemDeErro(falha))
    }
  }

  if (!atendentes?.length) {
    return (
      <EstadoVazio
        icone={CalendarX2}
        titulo="Nenhuma profissional cadastrada"
        descricao="Marque alguém como quem atende, em Ajustes, para montar a grade."
      />
    )
  }

  const colunas = `52px repeat(${atendentes.length}, minmax(148px, 1fr))`

  return (
    <div className="overflow-hidden rounded-2xl border border-onix-100 bg-white shadow-carta">
      <div className="scroll-fino overflow-x-auto">
        <div style={{ minWidth: `${52 + atendentes.length * 148}px` }}>
          {/* Cabeçalho de profissionais */}
          <div
            className="sticky top-0 z-10 grid border-b border-onix-100 bg-white/95 backdrop-blur"
            style={{ gridTemplateColumns: colunas }}
          >
            <span />
            {atendentes.map((profissional) => (
              <div
                key={profissional.id}
                className="flex items-center gap-2.5 border-l border-onix-50 px-3 py-3"
              >
                <Retrato nome={profissional.nome} cor={profissional.cor} tamanho="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-onix-800">
                    {profissional.nome}
                  </span>
                  <span className="block text-[11px] text-onix-300">
                    {doDia.filter((a) => a.profissionalId === profissional.id && a.situacao !== 'cancelado').length}{' '}
                    atendimentos
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Grade */}
          <div className="grid" style={{ gridTemplateColumns: colunas }}>
            <div className="relative" style={{ height: horas.length * alturaHora }}>
              {horas.map((h, indice) => (
                <span
                  key={h}
                  className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-onix-300"
                  style={{ top: indice * alturaHora }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {atendentes.map((profissional) => {
              const daPessoa = doDia.filter((a) => a.profissionalId === profissional.id)
              const impedimentos = bloqueios.filter(
                (b) =>
                  (!b.profissionalId || b.profissionalId === profissional.id) &&
                  isSameDay(dt(b.inicio), dia),
              )

              return (
                <div
                  key={profissional.id}
                  className="relative border-l border-onix-50"
                  style={{ height: horas.length * alturaHora }}
                  onDragOver={(evento) => evento.preventDefault()}
                  onDrop={(evento) => {
                    evento.preventDefault()
                    const id = evento.dataTransfer.getData('text/plain')
                    setArrastando(null)
                    if (id) void mover(id, horarioDaSolta(evento), profissional.id)
                  }}
                  onClick={(evento) => {
                    if (evento.target !== evento.currentTarget) return
                    const caixa = evento.currentTarget.getBoundingClientRect()
                    const minutos =
                      Math.round(
                        (((evento.clientY - caixa.top) / alturaHora) * 60 + horaInicio * 60) / 30,
                      ) * 30
                    aoCriar(new Date(startOfDay(dia).getTime() + minutos * 60_000), profissional.id)
                  }}
                >
                  {horas.map((h, indice) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-onix-50"
                      style={{ top: indice * alturaHora }}
                    />
                  ))}

                  {impedimentos.map((bloqueio) => {
                    const topo = ((minutosDoDia(bloqueio.inicio) - horaInicio * 60) / 60) * alturaHora
                    const altura =
                      ((minutosDoDia(bloqueio.fim) - minutosDoDia(bloqueio.inicio)) / 60) * alturaHora

                    return (
                      <div
                        key={bloqueio.id}
                        className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg border border-dashed border-onix-200 bg-[repeating-linear-gradient(135deg,#F8F1F1_0_6px,#FDFAFA_6px_12px)] px-2 py-1"
                        style={{ top: Math.max(topo, 0), height: Math.max(altura, 20) }}
                      >
                        <p className="truncate text-[11px] font-medium text-onix-400">
                          {bloqueio.motivo || TIPO_BLOQUEIO[bloqueio.tipo].rotulo}
                        </p>
                      </div>
                    )
                  })}

                  {daPessoa.map((agendamento) => {
                    const topo = ((minutosDoDia(agendamento.inicio) - horaInicio * 60) / 60) * alturaHora
                    const altura =
                      ((minutosDoDia(agendamento.fim) - minutosDoDia(agendamento.inicio)) / 60) * alturaHora
                    const situacao = SITUACAO[agendamento.situacao]
                    const encerrado = ['cancelado', 'faltou'].includes(agendamento.situacao)

                    return (
                      <button
                        key={agendamento.id}
                        draggable={!encerrado}
                        onDragStart={(evento) => {
                          evento.dataTransfer.setData('text/plain', agendamento.id)
                          setArrastando(agendamento.id)
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={(evento) => {
                          evento.stopPropagation()
                          aoAbrir(agendamento)
                        }}
                        title={`${agendamento.cliente?.nome ?? agendamento.nomeAvulso} · ${agendamento.servico?.nome}`}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-shadow',
                          'hover:z-10 hover:shadow-carta focus-visible:z-10',
                          encerrado ? 'opacity-45' : 'cursor-grab active:cursor-grabbing',
                          arrastando === agendamento.id && 'opacity-40',
                          situacao.classe,
                        )}
                        style={{ top: Math.max(topo, 0), height: Math.max(altura, 26) }}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', situacao.ponto)} />
                          <span className="tabular truncate text-[11px] font-medium">
                            {hora(agendamento.inicio)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] font-medium leading-tight">
                          {agendamento.cliente?.nome ?? agendamento.nomeAvulso ?? 'Sem nome'}
                        </span>
                        {altura > 44 && (
                          <span className="block truncate text-[11.5px] leading-tight opacity-75">
                            {agendamento.servico?.nome}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {isSameDay(dia, new Date()) && <LinhaDoAgora />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-onix-100 bg-quartzo-50 px-4 py-3 text-[12.5px] text-onix-500">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-onix-300" />
          {doDia.filter((a) => a.situacao !== 'cancelado').length} atendimentos
        </span>
        <span className="tabular">{duracao(minutosOcupados)} ocupados</span>
        <span className="tabular ml-auto font-medium text-onix-700">{dinheiro(totalDoDia)}</span>
      </div>
    </div>
  )
}

/** Marcador do horário atual. Some fora do expediente. */
function LinhaDoAgora() {
  const agora = new Date()
  const minutos = agora.getHours() * 60 + agora.getMinutes()
  if (minutos < horaInicio * 60 || minutos > horaFim * 60) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[5]"
      style={{ top: ((minutos - horaInicio * 60) / 60) * alturaHora }}
    >
      <div className="relative h-px bg-marca/70">
        <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-marca" />
      </div>
    </div>
  )
}
