import { ErroDeConflito, ErroDeConfiguracao, ErroDeEspera, ErroDeRegra } from '@/utils/erros'

/**
 * Tempo limite e classificação de falhas.
 *
 * Dois problemas moravam juntos e se disfarçavam um do outro:
 *
 * 1. **Nenhuma operação tinha prazo.** Uma requisição que nunca resolve
 *    — celular que troca de antena, aba que volta do segundo plano com o
 *    socket morto, Safari que suspende o `fetch` — deixava `carregando`
 *    ligado para sempre. A tela não mostrava erro: ela simplesmente
 *    parava, e a única saída era recarregar a página.
 *
 * 2. **Todo erro virava "problema de conexão".** Uma coluna faltando no
 *    banco e o cabo arrancado da parede produziam a mesma faixa
 *    vermelha. Quem lê "verifique sua internet" com a internet
 *    funcionando conclui que o sistema está mentindo — e para de ler os
 *    avisos.
 *
 * Aqui ficam as duas respostas: um relógio para o primeiro, um
 * classificador para o segundo.
 */

/**
 * Prazo padrão de uma operação de rede.
 *
 * Doze segundos é longo para uma consulta e curto para uma pessoa
 * esperando. Abaixo disso, uma rede de loja lenta produziria falsos
 * negativos; acima, a tela fica parada tempo demais antes de admitir
 * que algo deu errado.
 */
export const PRAZO_PADRAO_MS = 12_000

/** Gravação tem mais folga: perder uma escrita custa mais que reler. */
export const PRAZO_GRAVACAO_MS = 20_000

/**
 * A frase certa para o tempo esgotado de uma GRAVAÇÃO.
 *
 * "Não foi salvo" seria mentira em metade dos casos: o prazo libera a
 * tela, não cancela a viagem — a gravação pode perfeitamente ter
 * chegado e a resposta é que se perdeu. Quem lê "não foi salvo" tenta
 * de novo sem conferir; com id estável a repetição é inofensiva, mas a
 * pessoa merece saber o estado real: INCERTO, confira antes.
 */
export const MENSAGEM_GRAVACAO_INCERTA =
  'Não conseguimos confirmar o salvamento. Verifique se o registro apareceu antes de tentar novamente.'

/**
 * A operação demorou demais.
 *
 * Separado de `ErroDeRede` porque a resposta certa é diferente: numa
 * queda de rede não adianta insistir agora, num tempo esgotado adianta.
 */
export class ErroDeTempo extends Error {
  constructor(mensagem?: string) {
    super(mensagem ?? 'A operação demorou mais que o esperado. Tente novamente.')
    this.name = 'ErroDeTempo'
  }
}

/** Não foi possível falar com o servidor. */
export class ErroDeRede extends Error {
  constructor(mensagem?: string) {
    super(mensagem ?? 'Não conseguimos acessar o servidor no momento.')
    this.name = 'ErroDeRede'
  }
}

/**
 * Impõe um prazo a uma promessa.
 *
 * ---------------------------------------------------------------
 * O que este relógio pode e o que não pode
 * ---------------------------------------------------------------
 * Ele **libera a interface**; não cancela a requisição no servidor. Uma
 * gravação que estourou o prazo pode muito bem chegar e ser aplicada —
 * é por isso que a mensagem diz "tente novamente" e não "não foi
 * salvo".
 *
 * Cancelar de verdade exigiria `AbortSignal` atravessando o cliente do
 * Supabase, que não o expõe em todas as chamadas. Entre uma tela presa
 * para sempre e uma gravação que talvez tenha passado, a segunda é
 * incomparavelmente melhor: a proprietária vê o resultado na tela
 * seguinte e decide.
 *
 * O `clearTimeout` no `finally` não é detalhe: sem ele, cada consulta
 * deixaria um relógio vivo até estourar, e num dia de navegação são
 * milhares segurando memória à toa.
 */
export function comPrazo<T>(
  operacao: () => Promise<T>,
  ms: number = PRAZO_PADRAO_MS,
  descricao?: string,
): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined

  const prazo = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      /*
        O terceiro argumento serve dois usos: uma DESCRIÇÃO curta
        ("A consulta") que vira a frase padrão, ou uma MENSAGEM
        completa — reconhecível pelo ponto final — usada como está.
        O segundo caso existe para a gravação, cujo tempo esgotado
        precisa dizer "não confirmado", nunca "não foi salvo".
      */
      rejeitar(
        new ErroDeTempo(
          descricao
            ? descricao.endsWith('.')
              ? descricao
              : `${descricao} demorou mais que o esperado. Tente novamente.`
            : undefined,
        ),
      )
    }, ms)
  })

  return Promise.race([operacao(), prazo]).finally(() => {
    if (relogio !== undefined) clearTimeout(relogio)
  })
}

/**
 * Isto é a rede falhando, ou o sistema recusando?
 *
 * ---------------------------------------------------------------
 * Por que a pergunta importa tanto
 * ---------------------------------------------------------------
 * `comAcompanhamento` marcava `sem_conexao` a cada gravação que
 * falhasse, qualquer que fosse o motivo. O caixa recusado por uma
 * coluna inexistente acendia a faixa "Não foi possível sincronizar com
 * o servidor" — e ela ficava acesa em todas as telas, porque só uma
 * gravação bem-sucedida a apagava.
 *
 * A proprietária então via, ao mesmo tempo, a agenda carregando
 * perfeitamente e um aviso dizendo que não havia conexão. As duas
 * coisas eram verdade sobre coisas diferentes, e o sistema não sabia
 * distingui-las.
 *
 * A regra aqui é conservadora de propósito: só conta como falha de rede
 * o que reconhecidamente é. Um erro desconhecido **não** acende a faixa
 * — ele aparece onde a pessoa clicou, que é onde ela pode fazer algo a
 * respeito.
 */
export function ehFalhaDeRede(falha: unknown): boolean {
  if (falha instanceof ErroDeTempo || falha instanceof ErroDeRede) return true

  // Erros que o sistema já classificou como "não é a rede".
  if (
    falha instanceof ErroDeRegra ||
    falha instanceof ErroDeConflito ||
    falha instanceof ErroDeEspera ||
    falha instanceof ErroDeConfiguracao
  ) {
    return false
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  if (!(falha instanceof Error)) return false

  /*
    `TypeError: Failed to fetch` é como o navegador relata rede
    inacessível, DNS morto e CORS recusado. O nome entra na conta
    porque a mensagem varia entre navegadores — o Firefox diz
    "NetworkError when attempting to fetch resource", o Safari diz
    "Load failed", e nenhuma das duas contém a palavra "fetch".
  */
  if (falha.name === 'TypeError' && /fetch|network|load failed/i.test(falha.message)) return true
  if (falha.name === 'AbortError') return true

  return /failed to fetch|networkerror|load failed|err_internet|err_network|connection refused|socket hang up/i.test(
    falha.message,
  )
}

/**
 * Códigos do PostgREST/Postgres que significam "a rede está bem, o
 * pedido é que estava errado". Usado para não acender a faixa de
 * conexão por um erro de esquema ou de permissão.
 */
export function ehErroDoServidor(falha: unknown): boolean {
  if (!(falha instanceof Error)) return false
  const codigo = (falha as { code?: string }).code
  return typeof codigo === 'string' && codigo.length > 0
}
