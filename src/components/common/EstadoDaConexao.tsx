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
    rotulo: 'Problema de conexão',
    descricao: 'Nada foi confirmado no servidor. Verifique a internet e tente de novo.',
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
      <span className="min-w-0 flex-1 leading-snug">
        Não foi possível sincronizar com o servidor.{' '}
        <strong className="font-medium">Nenhuma alteração recente foi confirmada.</strong>
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

export function useEstadoDaConexao(): EstadoConexao {
  const [estado, setEstado] = useState<EstadoConexao>(() => conexao.atual())

  useEffect(() => {
    const cancelar = conexao.inscrever(setEstado)
    const pararDeOuvirRede = observarRede()

    /*
      Uma conferência de verdade na abertura.

      Sem isto o indicador ficaria em "verificando" para sempre, porque
      nada mais dispara a checagem até a primeira gravação. E era esse
      buraco que a versão anterior tapava afirmando "conectado" de
      saída — trocando um indicador parado por um indicador mentiroso.
    */
    void conexao.conferir()

    return () => {
      cancelar()
      pararDeOuvirRede()
    }
  }, [])

  return estado
}
