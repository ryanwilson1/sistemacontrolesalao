import { supabase, temSupabase } from './supabase/cliente'

/**
 * Estado da conexão com o banco.
 *
 * Existe para responder uma pergunta que o sistema não conseguia
 * responder: **o que eu acabei de fazer chegou no servidor?**
 *
 * Sem isto, uma queda de rede se manifesta como um aviso vermelho
 * genérico no meio de um formulário, e a proprietária não tem como
 * distinguir "errei o preenchimento" de "a internet caiu". Pior: ela
 * não sabe se pode fechar a tela.
 *
 * Três estados, e não mais:
 *
 *   conectado    o último diálogo com o banco deu certo
 *   sincronizando há uma gravação em andamento
 *   sem_conexao  a última tentativa falhou
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

  /** A gravação terminou bem. */
  deuCerto(): void {
    if (!temSupabase()) return
    gravacoesEmVoo = Math.max(0, gravacoesEmVoo - 1)
    ultimoErro = null
    if (gravacoesEmVoo === 0) anunciar('conectado')
  },

  /** A gravação falhou. */
  deuErrado(mensagem?: string): void {
    if (!temSupabase()) return
    gravacoesEmVoo = Math.max(0, gravacoesEmVoo - 1)
    ultimoErro = mensagem ?? null
    anunciar('sem_conexao')
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
   * Continua sendo uma função do portal, e não uma consulta de tabela,
   * porque precisa responder também para quem está sem sessão.
   */
  async conferir(): Promise<boolean> {
    if (!temSupabase()) {
      anunciar('sem_banco')
      return false
    }

    try {
      const { error } = await supabase().rpc('pulso')
      if (error) throw new Error(error.message)
      ultimoErro = null
      anunciar('conectado')
      return true
    } catch (falha) {
      ultimoErro = falha instanceof Error ? falha.message : null
      anunciar('sem_conexao')
      return false
    }
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
    conexao.deuErrado(falha instanceof Error ? falha.message : undefined)
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
 */
export function observarRede(): () => void {
  if (typeof window === 'undefined') return () => {}

  const caiu = () => anunciar('sem_conexao')
  const voltou = () => {
    void conexao.conferir()
  }

  window.addEventListener('offline', caiu)
  window.addEventListener('online', voltou)

  return () => {
    window.removeEventListener('offline', caiu)
    window.removeEventListener('online', voltou)
  }
}
