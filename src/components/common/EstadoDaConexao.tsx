import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { conexao, observarRede, type EstadoConexao } from '@/services'
import { cn } from '@/utils/cn'

/**
 * Estado da conexão, discreto.
 *
 * Um ponto colorido e, quando há problema, uma frase. Nada mais.
 *
 * O desenho segue uma regra: **enquanto está tudo bem, quase não
 * aparece**. Um indicador que chama atenção o tempo todo deixa de ser
 * lido em duas semanas — e aí, no dia em que a rede cai de verdade,
 * ele já virou parte do papel de parede.
 *
 * Por isso o estado bom é um ponto de 6px sem texto; o estado ruim
 * ganha fundo, palavra e permanência.
 */

const APARENCIA: Record<EstadoConexao, {
  cor: string
  rotulo: string
  descricao: string
  discreto: boolean
}> = {
  /*
    O estado inicial. Discreto de propósito: enquanto a primeira
    resposta não chega, o sistema não sabe nada — e afirmar "conectado"
    aqui seria a mentira que este indicador existe para não contar.
  */
  verificando: {
    cor: 'bg-onix-200',
    rotulo: 'Verificando conexão',
    descricao: 'Conferindo se o servidor responde.',
    discreto: true,
  },
  conectado: {
    cor: 'bg-sucesso',
    rotulo: 'Sistema conectado',
    descricao: 'Tudo que você salva vai para o servidor.',
    discreto: true,
  },
  sincronizando: {
    cor: 'bg-ouro-500',
    rotulo: 'Sincronizando',
    descricao: 'Salvando no servidor.',
    discreto: true,
  },
  sem_conexao: {
    cor: 'bg-perigo',
    rotulo: 'Sem conexão',
    descricao: 'Não estamos alcançando o servidor. O que você salvar agora não será gravado.',
    discreto: false,
  },
  sem_banco: {
    cor: 'bg-onix-300',
    rotulo: 'Somente neste aparelho',
    descricao: 'Sem banco configurado: os dados ficam só neste navegador.',
    discreto: true,
  },
}

export function EstadoDaConexao({ className }: { className?: string }) {
  const estado = useEstadoDaConexao()
  const aparencia = APARENCIA[estado]

  return (
    <div
      className={cn('flex min-w-0 items-center gap-2', className)}
      role="status"
      aria-live="polite"
      title={`${aparencia.rotulo} — ${aparencia.descricao}`}
    >
      <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center">
        <span className={cn('h-1.5 w-1.5 rounded-full', aparencia.cor)} />
        {estado === 'sincronizando' && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', aparencia.cor)}
            animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.9, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </span>

      <AnimatePresence initial={false}>
        {!aparencia.discreto && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="truncate whitespace-nowrap text-[11.5px] font-medium text-perigo"
          >
            {aparencia.rotulo}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A faixa que aparece quando o servidor não responde.
 *
 * Fica no topo do painel e não some sozinha, porque a informação que
 * ela carrega não é um aviso passageiro: é "pare de confiar no que a
 * tela está mostrando". Um toast de quatro segundos seria pior do que
 * nada — a proprietária continuaria salvando, veria os campos limparem
 * e concluiria que deu certo.
 */
export function FaixaDeConexao() {
  const estado = useEstadoDaConexao()
  const [conferindo, setConferindo] = useState(false)

  if (estado !== 'sem_conexao') return null

  const semInternet = typeof navigator !== 'undefined' && navigator.onLine === false

  const tentar = async () => {
    setConferindo(true)
    await conexao.conferir()
    setConferindo(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#E6C9CC] bg-[#F7E9EA] px-4 py-2.5 text-[12.5px] text-[#7A3B42]"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-perigo" />
      {/*
        A faixa diz qual dos dois problemas é.

        ---------------------------------------------------------------
        Por que o texto antigo era pior do que nenhum
        ---------------------------------------------------------------
        "Nenhuma alteração recente foi confirmada" era exibido para
        QUALQUER gravação que falhasse — inclusive um erro de esquema no
        Caixa, com a internet perfeita e a agenda carregando na mesma
        tela. A proprietária lia uma afirmação falsa sobre os dados
        dela, e a partir daí não confiava mais em nenhum aviso.

        Agora esta faixa só aparece por falha de transporte (ver
        `services/conexao.ts`), e distingue as duas causas — porque a
        ação é diferente: sem internet, ela olha o Wi-Fi; com o servidor
        fora, ela espera.
      */}
      <span className="min-w-0 flex-1 leading-snug">
        {semInternet ? (
          <>
            Você está sem conexão com a internet.{' '}
            <strong className="font-medium">O que você salvar agora não será gravado.</strong>
          </>
        ) : (
          <>
            Não conseguimos acessar o servidor no momento.{' '}
            <strong className="font-medium">O que você salvar agora não será gravado.</strong>
          </>
        )}
      </span>
      <button
        onClick={() => void tentar()}
        disabled={conferindo}
        className="shrink-0 rounded-lg border border-[#E6C9CC] bg-white px-2.5 py-1 font-medium transition-colors hover:bg-[#FDF6F7] disabled:opacity-60"
      >
        {conferindo ? 'Verificando…' : 'Tentar de novo'}
      </button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */

/** Marca de módulo: a abertura do sistema confere a conexão uma vez. */
let jaConferiuNaAbertura = false

export function useEstadoDaConexao(): EstadoConexao {
  const [estado, setEstado] = useState<EstadoConexao>(() => conexao.atual())

  useEffect(() => {
    const cancelar = conexao.inscrever(setEstado)
    const pararDeOuvirRede = observarRede()

    /*
      Uma conferência de verdade na abertura — e só na primeira.

      ---------------------------------------------------------------
      O que este `if` evita
      ---------------------------------------------------------------
      Dois componentes usam este hook (o pontinho e a faixa), e o
      layout inteiro remontava a cada navegação. Eram duas chamadas ao
      `pulso` por tela aberta, para responder uma pergunta cuja
      resposta os dois já compartilham — o estado é global.

      `conexao.conferir()` agora também deduplica por dentro, então
      isto é cinto e suspensório. Os dois valem: a deduplicação impede
      chamadas simultâneas, esta marca impede a sequência de chamadas
      espaçadas que a navegação produzia.

      Sem a conferência inicial o indicador ficaria em "verificando"
      para sempre, porque nada mais dispara a checagem até a primeira
      gravação — e era esse buraco que a versão original tapava
      afirmando "conectado" de saída, trocando um indicador parado por
      um indicador mentiroso.
    */
    if (!jaConferiuNaAbertura) {
      jaConferiuNaAbertura = true
      void conexao.conferir()
    }

    return () => {
      cancelar()
      pararDeOuvirRede()
    }
  }, [])

  return estado
}
