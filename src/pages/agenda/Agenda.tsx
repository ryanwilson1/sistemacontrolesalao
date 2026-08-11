import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarPlus, Lock, Plus } from 'lucide-react'
import { CabecalhoPagina, NavegadorDePeriodo } from '@/components/common'
import { Abas, Botao } from '@/components/ui'
import { EstadoErro, EsqueletoLista } from '@/components/feedback'
import { useAgendamentos, useBloqueios } from '@/hooks'
import {
  addDays, dataRelativa, diaDaSemanaMini, diaEMes, diasDaSemana, diasDoMes,
  faixaDeDias, faixaDoDia, format, isSameDay, mesAno, semanaDe, startOfMonth,
} from '@/utils/datas'
import { cn } from '@/utils/cn'
import { VisaoDia } from './VisaoDia'
import { VisaoSemana } from './VisaoSemana'
import { VisaoMes } from './VisaoMes'
import { FormularioAgendamento } from './FormularioAgendamento'
import { FormularioBloqueio } from './FormularioBloqueio'
import type { AgendamentoDetalhado } from '@/types'

type Visao = 'dia' | 'semana' | 'mes'

export default function Agenda() {
  const [visao, setVisao] = useState<Visao>('dia')
  const [dia, setDia] = useState(() => new Date())
  const [editando, setEditando] = useState<AgendamentoDetalhado | null>(null)
  const [criando, setCriando] = useState<{ inicio?: Date; profissionalId?: string } | null>(null)
  const [bloqueando, setBloqueando] = useState(false)

  /* A faixa consultada acompanha a visão: nunca buscamos além da tela. */
  const faixa = useMemo(() => {
    if (visao === 'dia') return faixaDoDia(dia)

    if (visao === 'semana') {
      const { inicio, fim } = semanaDe(dia)
      return faixaDeDias(inicio, fim)
    }

    const dias = diasDoMes(dia)
    return faixaDeDias(dias[0]!, dias[dias.length - 1]!)
  }, [visao, dia])

  const { dados: agendamentos, carregando, erro, recarregar } = useAgendamentos(faixa.de, faixa.ate)
  const { dados: bloqueios } = useBloqueios(faixa.de, faixa.ate)

  const navegar = (direcao: -1 | 1) => {
    setDia((atual) => {
      if (visao === 'dia') return addDays(atual, direcao)
      if (visao === 'semana') return addDays(atual, direcao * 7)
      return startOfMonth(new Date(atual.getFullYear(), atual.getMonth() + direcao, 1))
    })
  }

  const titulo =
    visao === 'dia'
      ? dataRelativa(dia)
      : visao === 'semana'
        ? `${diaEMes(semanaDe(dia).inicio)} — ${diaEMes(semanaDe(dia).fim)}`
        : mesAno(dia)

  const abrirDia = (novoDia: Date) => {
    setDia(novoDia)
    setVisao('dia')
  }

  const fecharFormulario = () => {
    setCriando(null)
    setEditando(null)
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Agenda"
        titulo={titulo}
        acoes={
          <>
            <Botao variante="secundario" tamanho="sm" onClick={() => setBloqueando(true)}>
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bloquear</span>
            </Botao>
            <Botao variante="ouro" tamanho="sm" onClick={() => setCriando({})}>
              <Plus className="h-4 w-4" />
              Agendar
            </Botao>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NavegadorDePeriodo
          aoVoltar={() => navegar(-1)}
          aoAvancar={() => navegar(1)}
          aoIrParaHoje={() => setDia(new Date())}
          mostrarAtalho={!isSameDay(dia, new Date())}
        />

        <Abas
          idAnimacao="agenda"
          abas={[
            { valor: 'dia', rotulo: 'Dia' },
            { valor: 'semana', rotulo: 'Semana' },
            { valor: 'mes', rotulo: 'Mês' },
          ]}
          ativa={visao}
          aoTrocar={setVisao}
        />
      </div>

      {/* Tira de dias — atalho rápido no celular */}
      {visao === 'dia' && (
        <div className="scroll-fino -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:hidden">
          {diasDaSemana(dia).map((data) => {
            const ativo = isSameDay(data, dia)
            const ehHoje = isSameDay(data, new Date())

            return (
              <button
                key={data.toISOString()}
                onClick={() => setDia(data)}
                className={cn(
                  'flex w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors',
                  ativo
                    ? 'border-transparent bg-onix-800 text-white'
                    : 'border-onix-100 bg-white text-onix-500',
                )}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {diaDaSemanaMini(data)}
                </span>
                <span className="tabular font-display text-[17px] leading-none">
                  {format(data, 'd')}
                </span>
                {ehHoje && (
                  <span className={cn('mt-0.5 h-1 w-1 rounded-full', ativo ? 'bg-ouro-300' : 'bg-marca')} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {erro ? (
        <EstadoErro descricao={erro} aoTentarNovamente={recarregar} />
      ) : carregando ? (
        <EsqueletoLista linhas={6} />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${visao}-${faixa.de}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {visao === 'dia' && (
              <VisaoDia
                dia={dia}
                agendamentos={agendamentos ?? []}
                bloqueios={bloqueios ?? []}
                aoAbrir={setEditando}
                aoCriar={(inicio, profissionalId) => setCriando({ inicio, profissionalId })}
              />
            )}
            {visao === 'semana' && (
              <VisaoSemana
                dia={dia}
                agendamentos={agendamentos ?? []}
                aoAbrir={setEditando}
                aoTrocarDia={abrirDia}
              />
            )}
            {visao === 'mes' && (
              <VisaoMes dia={dia} agendamentos={agendamentos ?? []} aoTrocarDia={abrirDia} />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <button
        onClick={() => setCriando({})}
        className="fixed bottom-[76px] right-4 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-onix-800 text-white shadow-alta transition-transform active:scale-95 lg:hidden"
        aria-label="Novo agendamento"
      >
        <CalendarPlus className="h-5 w-5" />
      </button>

      <FormularioAgendamento
        aberto={!!criando || !!editando}
        aoFechar={fecharFormulario}
        agendamento={editando}
        inicioSugerido={criando?.inicio}
        profissionalSugerido={criando?.profissionalId}
      />
      <FormularioBloqueio aberto={bloqueando} aoFechar={() => setBloqueando(false)} diaBase={dia} />
    </>
  )
}
