import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router-dom'

/**
 * Guarda contra perder o que foi digitado.
 *
 * O problema que resolve é pequeno de descrever e grande de viver: a
 * proprietária preenche a ficha de uma cliente nova, o telefone toca,
 * ela toca em "Agenda" para conferir um horário — e volta para um
 * formulário em branco.
 *
 * Duas saídas precisam ser cobertas, e elas são mecanismos diferentes:
 *
 *   1. **Sair do sistema** (fechar aba, recarregar, digitar outro
 *      endereço). Só o navegador pode barrar, e só com o diálogo padrão
 *      dele — `beforeunload`. Não dá para escolher o texto; navegadores
 *      passaram a ignorar mensagens personalizadas justamente porque
 *      sites as usavam para chantagear quem tentava sair.
 *
 *   2. **Navegar dentro do sistema** (clicar em outro item do menu).
 *      Aqui o React Router manda, e aí sim podemos mostrar um diálogo
 *      nosso, com as palavras certas.
 *
 * A regra que evita virar praga: **só avisa se houver alteração de
 * verdade.** Um aviso que aparece quando nada mudou ensina a clicar em
 * "sair" sem ler — e aí ele deixa de proteger no dia em que importa.
 */

export interface AlteracoesNaoSalvas {
  /** Há diferença entre o que está na tela e o que foi carregado? */
  sujo: boolean
  /** A navegação foi interrompida e espera decisão. */
  perguntando: boolean
  /** Sair mesmo assim. */
  confirmarSaida: () => void
  /** Ficar e continuar editando. */
  cancelarSaida: () => void
  /**
   * Marca o estado atual como salvo.
   *
   * Chamado depois que o banco confirma. Sem isto, a guarda continuaria
   * achando que há alteração pendente e reclamaria de um formulário
   * recém-salvo.
   */
  marcarComoSalvo: () => void
}

/**
 * @param valores  o estado atual do formulário
 * @param ativa    desliga a guarda (modal fechado, por exemplo)
 */
export function useAlteracoesNaoSalvas<T>(
  valores: T,
  ativa = true,
): AlteracoesNaoSalvas {
  /*
    A referência do que foi carregado. Comparar por JSON é grosseiro e
    é o certo aqui: os formulários deste sistema guardam texto, número
    e booleano, e uma comparação profunda de verdade custaria mais
    código do que o problema merece.
  */
  const [referencia, setReferencia] = useState(() => JSON.stringify(valores))
  const atual = useMemo(() => JSON.stringify(valores), [valores])

  const sujo = ativa && atual !== referencia

  const marcarComoSalvo = useCallback(() => {
    setReferencia(JSON.stringify(valores))
  }, [valores])

  /* ---- Saída do sistema: só o navegador consegue barrar ---- */
  useEffect(() => {
    if (!sujo) return

    const aoSair = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
      // Navegadores modernos ignoram o texto e mostram o próprio. Os
      // antigos leem `returnValue`; manter as duas linhas cobre os dois.
      evento.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', aoSair)
    return () => window.removeEventListener('beforeunload', aoSair)
  }, [sujo])

  /* ---- Navegação interna: aí o diálogo é nosso ---- */
  const deveBloquear = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      sujo && currentLocation.pathname !== nextLocation.pathname,
    [sujo],
  )

  const bloqueio = useBlocker(deveBloquear)

  return {
    sujo,
    perguntando: bloqueio.state === 'blocked',
    confirmarSaida: () => bloqueio.proceed?.(),
    cancelarSaida: () => bloqueio.reset?.(),
    marcarComoSalvo,
  }
}

/**
 * Versão para modais.
 *
 * Um modal não navega — ele fecha. `useBlocker` não ajuda, então a
 * pergunta acontece no próprio pedido de fechamento.
 *
 * Devolve a função que a tela deve chamar no lugar de `aoFechar`.
 */
export function useFecharComCuidado<T>(
  valores: T,
  aberto: boolean,
  fechar: () => void,
) {
  const referencia = useRef(JSON.stringify(valores))
  const [perguntando, setPerguntando] = useState(false)

  // Ao abrir, o que está na tela passa a ser o ponto de partida.
  useEffect(() => {
    if (aberto) {
      referencia.current = JSON.stringify(valores)
      setPerguntando(false)
    }
    // Só quando abre: incluir `valores` reporia a referência a cada
    // tecla digitada, e nada nunca pareceria alterado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const sujo = aberto && JSON.stringify(valores) !== referencia.current

  return {
    sujo,
    perguntando,
    /** Use no lugar de `aoFechar`. */
    pedirParaFechar: () => (sujo ? setPerguntando(true) : fechar()),
    confirmarSaida: () => {
      setPerguntando(false)
      fechar()
    },
    cancelarSaida: () => setPerguntando(false),
    marcarComoSalvo: () => {
      referencia.current = JSON.stringify(valores)
    },
  }
}
