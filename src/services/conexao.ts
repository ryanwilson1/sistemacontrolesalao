import { supabase, temSupabase } from './supabase/cliente'
import { comPrazo, ehFalhaDeRede, ErroDeRede, PRAZO_PADRAO_MS } from './rede'

/**
 * Estado da conexão com o banco.
 *
 * Existe para responder uma pergunta que o sistema não conseguia
 * responder: **o que eu acabei de fazer chegou no servidor?**
 *
 * Três estados úteis, e não mais:
 *
 *   conectado    o último diálogo com o banco deu certo
 *   sincronizando há uma gravação em andamento
 *   sem_conexao  a última tentativa falhou POR CAUSA DA REDE
 *
 * ---------------------------------------------------------------
 * A correção que este arquivo carrega
 * ---------------------------------------------------------------
 * `deuErrado()` era chamado para **toda** gravação que falhasse,
 * qualquer que fosse o motivo. Uma coluna inexistente no banco, uma
 * regra de negócio recusada, um telefone duplicado — tudo acendia a
 * faixa "Não foi possível sincronizar com o servidor".
 *
 * E a faixa não apagava sozinha: só uma gravação bem-sucedida ou um
 * `conferir()` a limpava. Como o Caixa falhava em toda tentativa, a
 * proprietária via o aviso de rede caída em todas as telas — enquanto a
 * agenda carregava normalmente na mesma tela. O sistema afirmava duas
 * coisas contraditórias ao mesmo tempo, e a errada era a mais
 * chamativa.
 *
 * Agora a distinção é explícita: o indicador só reage ao que é
 * **transporte**. Erro de regra, de permissão ou de esquema pertence à
 * tela onde a pessoa clicou, que é onde ela pode fazer algo a respeito.
 *
 * O que este módulo NÃO faz é enfileirar gravação para reenviar
 * depois. Seria a coisa mais elegante de escrever e a mais perigosa de
 * ter: uma fila que reenvia sozinha marca horário que a cliente já
 * desistiu, e reabre agendamento que a proprietária cancelou. Numa
 * agenda, tentar de novo mais tarde é uma decisão de gente.
 */

export type EstadoConexao =
  | 'verificando'
  | 'conectado'
  | 'sincronizando'
  | 'sem_conexao'
  | 'sem_banco'

type Ouvinte = (estado: EstadoConexao) => void

const ouvintes = new Set<Ouvinte>()

/*
  Começa em `verificando`, não em `conectado`.

  Ter credenciais no `.env` não é o mesmo que alcançar o servidor. O
  estado anterior afirmava conexão antes de qualquer resposta — e com
  o banco fora do ar o indicador ficava verde até a primeira gravação
  falhar, que é tarde demais para ser útil.
*/
let estado: EstadoConexao = temSupabase() ? 'verificando' : 'sem_banco'
let gravacoesEmVoo = 0
let ultimoErro: string | null = null

function anunciar(novo: EstadoConexao): void {
  if (novo === estado) return
  estado = novo
  for (const ouvinte of [...ouvintes]) {
    try {
      ouvinte(estado)
    } catch {
      // Um ouvinte que quebra não pode calar os outros.
    }
  }
}

/** Uma conferência em andamento. Impede N chamadas simultâneas ao `pulso`. */
let conferindo: Promise<boolean> | null = null

export const conexao = {
  atual: (): EstadoConexao => estado,
  ultimaFalha: (): string | null => ultimoErro,

  inscrever(ouvinte: Ouvinte): () => void {
    ouvintes.add(ouvinte)
    return () => {
      ouvintes.delete(ouvinte)
    }
  },

  /** Uma gravação começou. */
  comecouAGravar(): void {
    if (!temSupabase()) return
    gravacoesEmVoo += 1
    anunciar('sincronizando')
  },

  /** A gravação terminou bem. Prova de que o servidor responde. */
  deuCerto(): void {
    if (!temSupabase()) return
    gravacoesEmVoo = Math.max(0, gravacoesEmVoo - 1)
    ultimoErro = null
    if (gravacoesEmVoo === 0) anunciar('conectado')
  },

  /**
   * A gravação falhou.
   *
   * `falhaDeRede` decide se o indicador muda. Vem de quem chamou
   * porque só lá existe o erro original — aqui chegaria uma string, e
   * classificar por texto é exatamente o tipo de heurística que
   * confunde "coluna não encontrada" com "servidor não encontrado".
   */
  deuErrado(mensagem?: string, falhaDeRede = false): void {
    if (!temSupabase()) return
    gravacoesEmVoo = Math.max(0, gravacoesEmVoo - 1)
    ultimoErro = mensagem ?? null

    if (falhaDeRede) {
      anunciar('sem_conexao')
      return
    }

    /*
      O servidor respondeu — respondeu "não", mas respondeu. Do ponto
      de vista do transporte, isto é uma conexão saudável, e insistir
      no contrário é o que fazia a faixa vermelha morar na tela.
    */
    if (gravacoesEmVoo === 0 && estado !== 'sem_conexao') anunciar('conectado')
  },

  /**
   * Confere se o banco responde.
   *
   * `pulso()` não escreve nada. A versão anterior chamava
   * `portal_faxina`, que marca reservas vencidas — usar uma função que
   * altera dados como teste de conexão significa que verificar a rede
   * a cada trinta segundos mexe na agenda. Um health check precisa ser
   * observação pura.
   *
   * ---------------------------------------------------------------
   * Duas correções aqui
   * ---------------------------------------------------------------
   * 1. **Prazo.** Sem ele, um `fetch` pendurado deixava o indicador em
   *    "verificando" para sempre — e como o botão "Tentar de novo"
   *    espera esta promessa, ele ficava desabilitado sem fim.
   *
   * 2. **Uma por vez.** Dois componentes montavam e cada um disparava
   *    a própria conferência. Com a remontagem do layout a cada
   *    navegação, eram duas chamadas por tela aberta.
   */
  async conferir(): Promise<boolean> {
    if (!temSupabase()) {
      anunciar('sem_banco')
      return false
    }

    if (conferindo) return conferindo

    conferindo = (async () => {
      try {
        const { error } = await comPrazo(
          async () => supabase().rpc('pulso'),
          PRAZO_PADRAO_MS,
          'A verificação de conexão',
        )
        if (error) throw new ErroDeRede(error.message)

        ultimoErro = null
        anunciar('conectado')
        return true
      } catch (falha) {
        ultimoErro = falha instanceof Error ? falha.message : null

        /*
          Mesmo aqui a classificação vale.

          `pulso` é uma função do banco: ela pode falhar por não existir
          (migração não rodada) tanto quanto por rede inacessível. A
          primeira não é problema de conexão — e anunciá-la como tal
          mandaria a proprietária conferir o Wi-Fi por causa de um
          arquivo SQL que ninguém executou.
        */
        if (ehFalhaDeRede(falha)) {
          anunciar('sem_conexao')
          return false
        }

        anunciar('conectado')
        return true
      } finally {
        conferindo = null
      }
    })()

    return conferindo
  },
}

/**
 * Envolve uma gravação para que o indicador saiba o que está
 * acontecendo.
 *
 * O erro é relançado sempre. Engolir aqui transformaria uma falha de
 * rede em sucesso silencioso — exatamente o que não pode acontecer com
 * um agendamento.
 */
export async function comAcompanhamento<T>(operacao: () => Promise<T>): Promise<T> {
  conexao.comecouAGravar()
  try {
    const resultado = await operacao()
    conexao.deuCerto()
    return resultado
  } catch (falha) {
    conexao.deuErrado(
      falha instanceof Error ? falha.message : undefined,
      ehFalhaDeRede(falha),
    )
    throw falha
  }
}

/**
 * Liga o estado do navegador ao indicador.
 *
 * `offline` do navegador é confiável para o caso ruim (não há rede) e
 * otimista demais para o caso bom (estar numa rede não significa
 * alcançar o Supabase). Por isso `online` não declara vitória: pede
 * uma conferência de verdade.
 *
 * ---------------------------------------------------------------
 * Uma inscrição só, para o sistema inteiro
 * ---------------------------------------------------------------
 * Cada chamada registrava um par de listeners no `window`. Com dois
 * componentes usando o hook e o layout remontando a cada navegação, os
 * pares se acumulavam — e cada evento `online` disparava tantas
 * conferências quantos pares houvesse.
 *
 * O contador aqui garante que exista no máximo um par vivo, não
 * importa quantos componentes peçam.
 */
let assinantesDeRede = 0
let desligarRede: (() => void) | null = null

export function observarRede(): () => void {
  if (typeof window === 'undefined') return () => {}

  assinantesDeRede += 1

  if (!desligarRede) {
    const caiu = () => anunciar('sem_conexao')
    const voltou = () => {
      void conexao.conferir()
    }

    window.addEventListener('offline', caiu)
    window.addEventListener('online', voltou)

    /*
      A volta do segundo plano também conta.

      No iPhone, trocar de aplicativo e voltar suspende o `fetch` e o
      WebSocket. O navegador não dispara `online` porque, para ele,
      nada mudou — a rede continua lá. Mas o socket morreu, e a tela
      volta mostrando dados velhos sem que nada os atualize.

      `visibilitychange` é o único aviso que existe nesse caso.
    */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void conexao.conferir()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    desligarRede = () => {
      window.removeEventListener('offline', caiu)
      window.removeEventListener('online', voltou)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }

  return () => {
    assinantesDeRede = Math.max(0, assinantesDeRede - 1)
    if (assinantesDeRede === 0 && desligarRede) {
      desligarRede()
      desligarRede = null
    }
  }
}
