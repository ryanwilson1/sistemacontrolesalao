import { useCallback, useEffect, useRef, useState } from 'react'
import { cache } from './cache'
import { diagnostico } from '@/services/diagnostico'
import { mensagemDeErro } from '@/utils/erros'
import { comPrazo, PRAZO_PADRAO_MS } from '@/services/rede'

export interface Consulta<T> {
  dados: T | undefined
  carregando: boolean
  erro: string | null
  recarregar: () => void
}

/**
 * Busca assíncrona com cache e recarga automática.
 *
 * `chave` identifica o resultado no cache. `ativa` adia a busca até que
 * as dependências existam (evita consultar com id indefinido).
 *
 * ---------------------------------------------------------------
 * As duas correções deste arquivo
 * ---------------------------------------------------------------
 * **1. Resposta velha não sobrescreve resposta nova.**
 *
 * Não havia nada impedindo esta sequência:
 *
 *   busca A começa (agenda de hoje)
 *   algo muda → `cache.invalidar` solta a promessa de A
 *   busca B começa
 *   B termina  → grava o estado NOVO
 *   A termina  → grava o estado ANTIGO por cima
 *
 * O resultado é a tela mostrando o agendamento que acabou de ser
 * cancelado, sem erro nenhum e sem jeito de perceber. Recarregar a
 * página resolvia — e é exatamente o que a proprietária vinha fazendo.
 *
 * O contador abaixo fecha isso na raiz: cada execução leva um número, e
 * só a mais recente tem permissão de escrever. As anteriores terminam
 * em silêncio, que é o comportamento certo — o trabalho delas foi
 * superado, não perdido.
 *
 * **2. Nenhuma consulta pode carregar para sempre.**
 *
 * `setCarregando(false)` morava num `finally`, o que parece suficiente
 * e não é: um `fetch` que nunca resolve nem rejeita também nunca chega
 * ao `finally`. É o que acontece quando o Safari suspende a aba e o
 * socket morre sem avisar. A tela ficava girando até alguém recarregar.
 *
 * `comPrazo` garante que toda busca termine de um jeito ou de outro.
 */
export function useConsulta<T>(
  chave: string,
  buscar: () => Promise<T>,
  opcoes: { ativa?: boolean } = {},
): Consulta<T> {
  const { ativa = true } = opcoes

  const [dados, setDados] = useState<T | undefined>(() => cache.ler<T>(chave))
  const [carregando, setCarregando] = useState(ativa && cache.ler<T>(chave) === undefined)
  const [erro, setErro] = useState<string | null>(null)

  // A função de busca muda a cada render; a referência evita reexecutar à toa.
  const buscarRef = useRef(buscar)
  buscarRef.current = buscar

  /**
   * O que esta tela tem na mão agora, legível de dentro do `executar`.
   *
   * Serve a uma decisão só: acender ou não o \"carregando\". Ver o
   * comentário sobre revalidação silenciosa abaixo.
   */
  const dadosRef = useRef(dados)
  dadosRef.current = dados

  /** A qual chave o `dados` acima pertence. */
  const chaveDosDados = useRef(chave)

  /**
   * Número da execução mais recente pedida por este componente.
   *
   * Vive num `ref` e não num estado porque mudá-lo não deve redesenhar
   * nada — ele existe para decidir quem pode escrever, não para
   * aparecer na tela.
   */
  const geracao = useRef(0)

  /** O componente ainda está montado? Evita escrever em tela que saiu. */
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const executar = useCallback(async () => {
    if (!ativa) return

    const minhaVez = ++geracao.current

    /*
      Revalidar em SILÊNCIO quando já há o que mostrar.

      `setCarregando(true)` incondicional era um custo escondido. Uma
      invalidação do tempo real acorda todas as consultas montadas, e
      cada uma acendia o \"carregando\" — a Agenda trocava a grade inteira
      por um esqueleto e voltava meio segundo depois. Duas montagens e
      duas medições de layout completas por evento, e a tela piscando a
      cada gravação de qualquer aparelho.

      Com dado em mãos, a releitura acontece por baixo e a tela só muda
      quando o resultado novo chega. Sem dado — primeira abertura, erro
      anterior, troca de dia — o esqueleto continua aparecendo, que é
      quando ele de fato informa algo.
    */
    setCarregando(dadosRef.current === undefined)
    setErro(null)

    diagnostico.contar('consultasIniciadas')

    /*
      A marca da chave neste instante.

      Guardada ANTES da busca começar. Se algo invalidar a chave no meio
      do caminho, a marca muda e esta resposta perde o direito de
      escrever — inclusive no cache, inclusive se este componente já
      tiver saído da tela. Ver o comentário longo em `cache.ts`.
    */
    const marca = cache.marcaDe(chave)

    try {
      /*
        Uma busca por chave, ainda que várias telas peçam a mesma.

        Uma invalidação acorda todos os inscritos ao mesmo tempo, e cada
        um chamava a própria busca. Quatro cartões do painel lendo o
        mesmo resumo viravam quatro leituras completas do banco para
        montar um número idêntico quatro vezes.

        O registro mora no `cache` — e não num `Map` local deste
        arquivo — porque `cache.invalidar` precisa poder soltá-lo. Uma
        busca iniciada antes da invalidação carrega o estado anterior;
        se ela continuasse valendo para quem chega depois, a grade do
        portal seria repovoada com o horário que acabou de ser ocupado.
      */
      const resultado = await (cache.emVoo<T>(chave) ??
        cache.registrarBusca(
          chave,
          comPrazo(() => buscarRef.current(), PRAZO_PADRAO_MS, 'A consulta'),
        ))

      /*
        Chegou atrasada? Sai sem tocar em nada.

        Vale para o cache também, e não só para o estado local: gravar
        no cache acorda TODOS os inscritos daquela chave, então uma
        resposta velha aterrissando ali contamina todas as telas
        abertas, não apenas esta.
      */
      if (minhaVez !== geracao.current) return

      /*
        Duas guardas, e as duas precisam existir.

        A geração acima protege ESTA tela de uma resposta que ela mesma
        superou. A marca abaixo protege o CACHE — e portanto todas as
        outras telas — de uma resposta que o mundo superou enquanto ela
        vinha. A segunda vale mesmo quando este componente já morreu.
      */
      if (!cache.gravarSe(chave, resultado, marca)) return
      if (montado.current) {
        dadosRef.current = resultado
        setDados(resultado)
      }
    } catch (falha) {
      if (minhaVez !== geracao.current) return
      if (montado.current) setErro(mensagemDeErro(falha))
    } finally {
      if (minhaVez === geracao.current && montado.current) setCarregando(false)
    }
  }, [chave, ativa])

  useEffect(() => {
    if (!ativa) {
      setCarregando(false)
      return
    }

    const guardado = cache.ler<T>(chave)
    const trocouDePergunta = chaveDosDados.current !== chave
    chaveDosDados.current = chave

    if (guardado !== undefined) {
      dadosRef.current = guardado
      setDados(guardado)
      setCarregando(false)
    } else {
      /*
        Chave nova sem valor guardado: o que está na tela responde a
        OUTRA pergunta.

        Sem esta limpeza, a revalidação silenciosa viraria mentira na
        troca de dia da Agenda — os agendamentos de ontem ficariam na
        tela, sem esqueleto e sem aviso, como se fossem os de hoje. A
        revalidação só pode ser silenciosa quando o dado velho ainda
        responde à mesma pergunta.
      */
      if (trocouDePergunta) {
        dadosRef.current = undefined
        setDados(undefined)
      }
      void executar()
    }

    // Recarrega quando alguém invalida esta chave.
    return cache.inscrever(chave, () => {
      const atual = cache.ler<T>(chave)

      /*
        Valor novo no cache? Aproveita em vez de reconsultar.

        Antes, o inscrito só reagia quando a chave ficava vazia — e
        ignorava a gravação de um valor. Duas telas lendo a mesma chave
        significavam que a segunda continuava com o dado velho na mão
        depois de a primeira já ter trazido o novo.
      */
      if (atual !== undefined) {
        if (montado.current) {
          dadosRef.current = atual
          setDados(atual)
          setCarregando(false)
        }
        return
      }

      void executar()
    })
  }, [chave, ativa, executar])

  return { dados, carregando, erro, recarregar: executar }
}

export interface Acao<E, S> {
  executar: (entrada: E) => Promise<S>
  salvando: boolean
}

/**
 * Operação de escrita.
 *
 * Cuida do estado "salvando" e invalida o cache ao terminar, para que as
 * telas abertas se atualizem sozinhas.
 */
export function useAcao<E, S>(
  operacao: (entrada: E) => Promise<S>,
  invalidar: string[] = [],
): Acao<E, S> {
  const [salvando, setSalvando] = useState(false)

  const operacaoRef = useRef(operacao)
  operacaoRef.current = operacao

  const invalidarRef = useRef(invalidar)
  invalidarRef.current = invalidar

  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  /**
   * Impede o clique duplo de virar duas gravações.
   *
   * `salvando` já desabilita o botão, mas o estado do React só chega à
   * tela no render seguinte. Dois toques rápidos no mesmo botão — o que
   * a proprietária vinha fazendo justamente porque o sistema parecia
   * não responder — passavam os dois pela verificação antes de o botão
   * escurecer. Dois agendamentos, duas movimentações de caixa.
   *
   * ---------------------------------------------------------------
   * Por que o segundo toque COMPARTILHA em vez de falhar
   * ---------------------------------------------------------------
   * A primeira versão desta guarda lançava um erro no segundo toque.
   * Tecnicamente correta, praticamente péssima: o `catch` da tela
   * mostrava "Não foi possível abrir — esta operação já está em
   * andamento" NO MESMO INSTANTE em que a operação estava dando certo.
   * A pessoa que tocou duas vezes por impaciência lia um erro falso.
   *
   * Devolver a mesma promessa resolve os dois lados: uma gravação só
   * chega ao banco, e os dois toques terminam no mesmo desfecho — o
   * verdadeiro. O `ref` é síncrono, então nem dois toques no mesmo
   * tick escapam.
   *
   * ---------------------------------------------------------------
   * Por que a guarda é POR ENTRADA, e não pelo hook inteiro
   * ---------------------------------------------------------------
   * O mesmo hook atende ações de lista: marcar DUAS notificações como
   * lidas em sequência rápida são duas chamadas com entradas
   * diferentes. Uma guarda única descartaria a segunda em silêncio — a
   * notificação continuaria não lida e ninguém saberia por quê.
   *
   * A chave é a entrada serializada: entrada igual compartilha (é o
   * toque duplo), entrada diferente corre em paralelo (são duas
   * intenções). Entrada que não serializa cai na chave única — o lado
   * conservador, que no pior caso descarta em vez de duplicar.
   */
  const emVoo = useRef(new Map<string, Promise<S>>())

  const executar = useCallback(async (entrada: E): Promise<S> => {
    let chave: string
    try {
      chave = JSON.stringify(entrada) ?? 'unica'
    } catch {
      chave = 'unica'
    }

    const andamento = emVoo.current.get(chave)
    if (andamento) return andamento

    setSalvando(true)

    const operacao = (async () => {
      try {
        const resultado = await operacaoRef.current(entrada)
        if (invalidarRef.current.length > 0) cache.invalidar(...invalidarRef.current)
        return resultado
      } finally {
        emVoo.current.delete(chave)
        if (montado.current && emVoo.current.size === 0) setSalvando(false)
      }
    })()

    emVoo.current.set(chave, operacao)
    return operacao
  }, [])

  return { executar, salvando }
}
