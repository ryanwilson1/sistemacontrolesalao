import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, Clock, X } from 'lucide-react'
import { useSessao } from '@/contexts'
import { useRelogio } from '@/hooks/useTempoReal'
import { useChegadasDoPortal } from '@/hooks'
import { chegadasRecentes, nomeDaCliente } from '@/services'
import { ROTAS } from '@/constants'
import { dataRelativa, hora } from '@/utils/datas'
import type { AgendamentoDetalhado } from '@/types'

/**
 * Aviso de agendamento recém-chegado.
 *
 * Aparece sozinho quando uma cliente confirma pelo portal — sem
 * recarregar, sem clicar em nada. Dura o tempo de ser lido e sai.
 *
 * Fica separado do sino de propósito. O sino é a lista do que precisa de
 * atenção *em algum momento*; este cartão é o que está acontecendo
 * *agora*, e as duas coisas pedem tratamentos diferentes: uma se
 * consulta, a outra se anuncia.
 */

/**
 * De quanto em quanto tempo o painel olha se chegou algo.
 *
 * ---------------------------------------------------------------
 * Por que 8s virou 45s
 * ---------------------------------------------------------------
 * `chegadasRecentes()` chama `agendamentosRepo.listar()` — a tabela
 * **inteira**. Enquanto o espelho em memória está quente isso é de
 * graça, mas o tempo real derruba o espelho a cada gravação de
 * qualquer aparelho. Numa manhã movimentada, boa parte dos ciclos
 * caía numa releitura completa da agenda pela rede do celular.
 *
 * E o ganho de olhar a cada 8s é nenhum: o Realtime do Postgres já
 * avisa este aparelho no instante em que um agendamento entra. Este
 * relógio é a rede de segurança para quando o canal cai — e uma rede
 * de segurança não precisa correr.
 *
 * 45 segundos é o pior atraso possível para um aviso que, no caminho
 * normal, chega em menos de um segundo.
 */
const RITMO_MS = 45_000

/** Quanto tempo o cartão fica na tela antes de sair sozinho. */
const DURACAO_MS = 9_000

/**
 * Piso entre duas varreduras, qualquer que seja o motivo.
 *
 * ---------------------------------------------------------------
 * O que o intervalo sozinho não cobria
 * ---------------------------------------------------------------
 * `useRelogio` pausa com a aba escondida e **executa a tarefa na hora**
 * quando ela volta a aparecer. Faz sentido: voltar ao sistema é
 * exatamente quando se quer saber o que chegou.
 *
 * Só que no celular "voltar a aparecer" não é raro — é o gesto mais
 * comum do dia. A proprietária sai para o WhatsApp responder a cliente e
 * volta; desbloqueia o telefone para ver a hora e volta; troca de
 * aplicativo três vezes em um minuto. Cada uma dessas voltas disparava
 * `chegadasRecentes()`, que lê a tabela de agendamentos **inteira**.
 *
 * Cinco alternâncias em dois minutos eram cinco leituras completas da
 * agenda pela rede do celular, para responder uma pergunta que o
 * Realtime já respondeu.
 *
 * O piso mantém a resposta imediata da primeira volta e descarta as
 * repetições. Vinte segundos é curto o bastante para nunca ser sentido
 * como atraso — o caminho normal do aviso continua sendo o Realtime, que
 * chega em menos de um segundo.
 */
const PISO_ENTRE_VARREDURAS_MS = 20_000

export function AvisoDeChegada() {
  const { ehGestor } = useSessao()
  const navegar = useNavigate()
  const { chegadas, anunciar, dispensar } = useChegadasDoPortal(DURACAO_MS)

  // A referência evita recriar o relógio a cada render.
  const anunciarRef = useRef(anunciar)
  anunciarRef.current = anunciar

  /** Uma varredura em andamento. Ver o comentário abaixo. */
  const emVoo = useRef(false)
  const ultimaVarredura = useRef(0)

  const verificar = useCallback(() => {
    /*
      Uma varredura por vez.

      `chegadasRecentes()` lê a agenda inteira e a detalha. Numa rede de
      loja isso pode passar dos 45 segundos do intervalo — e aí a
      segunda partia com a primeira ainda no ar. Duas leituras completas
      concorrentes, e as duas mexendo na mesma marca d'água de
      `chegadas.ts`: a segunda podia consumir os anúncios da primeira e
      um agendamento novo passar despercebido.

      A guarda é síncrona (`ref`, não estado) porque as duas chamadas
      podem acontecer no mesmo instante — o relógio e a volta ao
      primeiro plano disparam juntos com frequência.
    */
    if (emVoo.current) return
    if (Date.now() - ultimaVarredura.current < PISO_ENTRE_VARREDURAS_MS) return

    emVoo.current = true
    ultimaVarredura.current = Date.now()

    void chegadasRecentes()
      .then((novos) => {
        if (novos.length > 0) anunciarRef.current(novos)
      })
      .catch(() => {
        /*
          A varredura roda sozinha a cada 45s. Sem este catch, cada
          ciclo com a rede fora do ar virava uma rejeição não tratada
          no console — e em alguns navegadores, um aviso na tela.
          O aviso de chegada é conveniência: falhar em silêncio e
          tentar no próximo ciclo é o comportamento certo.
        */
      })
      .finally(() => {
        emVoo.current = false
      })
  }, [])

  /*
    O relógio só corre para quem vê o aviso.

    A varredura ficava acima do `if (!ehGestor) return null`, e as
    regras dos hooks obrigam a chamada a acontecer sempre — mas obrigam
    a *chamar*, não a *trabalhar*. O resultado era uma leitura da agenda
    inteira a cada oito segundos no aparelho de toda a equipe, para
    alimentar um cartão que aquela pessoa nunca veria.

    No celular, oito segundos é ininterrupto: a bateria some e a tela
    engasga em cada ciclo. Passar `0` desliga o relógio sem quebrar a
    ordem dos hooks.
  */
  useRelogio(verificar, ehGestor ? RITMO_MS : 0)

  if (!ehGestor) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 p-4 pt-safe sm:inset-x-auto sm:right-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {chegadas.map((agendamento) => (
          <Cartao
            key={agendamento.id}
            agendamento={agendamento}
            aoAbrir={() => {
              dispensar(agendamento.id)
              navegar(ROTAS.agenda)
            }}
            aoFechar={() => dispensar(agendamento.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Cartao({
  agendamento, aoAbrir, aoFechar,
}: {
  agendamento: AgendamentoDetalhado
  aoAbrir: () => void
  aoFechar: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-ouro-200 bg-white shadow-alta"
    >
      <span className="filete-ouro block h-[3px] w-full" />

      <button onClick={aoAbrir} className="flex w-full items-start gap-3 p-3.5 text-left">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ouro-100 text-ouro-600">
          <BellRing className="h-4 w-4" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-ouro-600">Novo agendamento</span>

          <span className="mt-1 block truncate text-[15px] font-medium leading-snug text-onix-900">
            {nomeDaCliente(agendamento)}
          </span>

          <span className="mt-0.5 block truncate text-[13px] leading-snug text-onix-400">
            {agendamento.servico?.nome ?? 'Atendimento'}
            {agendamento.profissional && ` · ${agendamento.profissional.nome}`}
          </span>

          <span className="tabular mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-onix-600">
            <Clock className="h-3 w-3" />
            {hora(agendamento.inicio)} · {dataRelativa(agendamento.inicio)}
          </span>
        </span>
      </button>

      <button
        onClick={aoFechar}
        className="absolute right-2.5 top-4 rounded-lg p-1 text-onix-300 transition-colors hover:text-onix-600"
        aria-label="Dispensar aviso"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
