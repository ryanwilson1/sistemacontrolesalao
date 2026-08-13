import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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

  /*
    Caminho só de ida: uma vez aberto, o formulário fica montado.

    O `ref` em vez de estado é deliberado — pedir um render só para
    anunciar "agora o formulário existe" seria um render a mais no
    instante em que a proprietária está esperando o modal aparecer. O
    render que monta o formulário é o mesmo que o `setCriando`/`setEditando`
    já provocou.
  */
  const precisouDoFormulario = useRef(false)
  const precisouDoBloqueio = useRef(false)

  const jaPrecisouDoFormulario =
    (precisouDoFormulario.current ||= !!criando || !!editando)
  const jaPrecisouDoBloqueio = (precisouDoBloqueio.current ||= bloqueando)

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
        /*
          Sem `AnimatePresence mode="wait"`.

          ---------------------------------------------------------------
          O que aquele modo fazia
          ---------------------------------------------------------------
          `mode="wait"` significa literalmente: **segure o conteúdo novo
          até o antigo terminar de sair**. A grade do dia é o elemento
          mais pesado do sistema — uma coluna por profissional, uma linha
          por hora, um bloco por agendamento. Trocar de dia obrigava a
          sequência:

            a grade inteira anima a saída (200ms)
            ↓
            só então a grade nova monta

          Duas grades vivas ao mesmo tempo durante a transição, e a
          resposta ao toque adiada por uma animação. Tocar rápido em três
          dias seguidos enfileirava três transições que precisavam
          acontecer em ordem — a definição de interface que "engasga".

          Sem `AnimatePresence`, a troca de `key` remonta na hora e o
          `initial → animate` toca por cima. A entrada continua igual; o
          que sumiu foi a espera.
        */
        <motion.div
          key={`${visao}-${faixa.de}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
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
      )}

      <button
        onClick={() => setCriando({})}
        className="fixed bottom-[76px] right-4 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-onix-800 text-white shadow-alta transition-transform active:scale-95 lg:hidden"
        aria-label="Novo agendamento"
      >
        <CalendarPlus className="h-5 w-5" />
      </button>

      {/*
        Os formulários só existem depois do primeiro uso.

        ---------------------------------------------------------------
        O que eles custavam montados e fechados
        ---------------------------------------------------------------
        `FormularioAgendamento` ficava na árvore desde que a Agenda
        abrisse, com `aberto={false}`. Fechado, ele não desenha nada — e
        mesmo assim `usarFormularioDeAgendamento` roda inteiro a cada
        render da Agenda: quinze `useState`, quatro `useAcao`, os
        `useMemo` do serviço e da lista de horários, e as consultas de
        serviços e de atendentes.

        Duas dessas consultas partem de verdade. Não é um custo enorme
        sozinho — é um custo pago **em toda entrada na Agenda**, que é a
        tela mais visitada do sistema e a que precisa abrir instantânea
        na volta de Clientes.

        `jaPrecisou` é um caminho só de ida: uma vez aberto, o formulário
        permanece montado para poder animar a saída e para o segundo uso
        ser imediato. O que deixou de existir é o custo de quem entra na
        Agenda para *olhar* — que é a maioria das vezes.
      */}
      {jaPrecisouDoFormulario && (
        <FormularioAgendamento
          aberto={!!criando || !!editando}
          aoFechar={fecharFormulario}
          agendamento={editando}
          inicioSugerido={criando?.inicio}
          profissionalSugerido={criando?.profissionalId}
        />
      )}
      {jaPrecisouDoBloqueio && (
        <FormularioBloqueio aberto={bloqueando} aoFechar={() => setBloqueando(false)} diaBase={dia} />
      )}
    </>
  )
}
