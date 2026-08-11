import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/cliente'
import type { Colecao } from '../storage'
import type { CanalTempoReal, EventoTempoReal, OuvinteTempoReal } from './tipos'

/**
 * Tempo real pelo Postgres.
 *
 * Aqui está a diferença que o servidor faz: o celular da cliente e o
 * computador do studio finalmente andam juntos. O canal local só cruzava
 * abas do mesmo navegador; este cruza aparelhos, cidades e horários.
 *
 * Repare que `publicar` está vazio, e isso é o ponto da troca. Sem
 * servidor, quem avisava era o próprio código, porque não havia mais
 * ninguém para fazê-lo. Com banco, o Postgres avisa a partir da própria
 * gravação — e um aviso disparado pelo código seria pior que redundante:
 * chegaria antes da transação fechar, e as telas releriam o estado
 * anterior.
 *
 * O Realtime respeita o RLS. Como `anon` não enxerga tabela alguma
 * (02-seguranca.sql), só a equipe autenticada recebe eventos. Uma
 * curiosa com a chave pública fica sem nada — que é exatamente o que
 * queremos.
 */

/** Tabela do Postgres → coleção que o sistema conhece. */
const COLECAO_DA_TABELA: Record<string, Colecao> = {
  studio: 'studio',
  profissionais: 'profissionais',
  jornada: 'jornada',
  clientes: 'clientes',
  categorias: 'categorias',
  servicos: 'servicos',
  agendamentos: 'agendamentos',
  bloqueios: 'bloqueios',
  procedimentos: 'procedimentos',
  fotos: 'fotos',
  reservas: 'reservas',
  solicitacoes: 'solicitacoes',
  lista_espera: 'listaEspera',
  fornecedores: 'fornecedores',
  produtos: 'produtos',
  movimentos: 'movimentos',
  lancamentos: 'lancamentos',
  metas: 'metas',
  caixas: 'caixas',
  movimentos_caixa: 'movimentosCaixa',
  cupons: 'cupons',
  usos_cupom: 'usosCupom',
  fidelidade: 'fidelidade',
  pontos: 'pontos',
  lembretes: 'lembretes',
  notificacoes: 'notificacoes',
  modelos_mensagem: 'modelosMensagem',
}

export class CanalSupabase implements CanalTempoReal {
  readonly nome = 'Supabase Realtime'
  readonly remoto = true

  private canal: RealtimeChannel | null = null
  private ouvintes = new Set<OuvinteTempoReal>()
  private tentativas = 0
  private reconexao: number | null = null

  iniciar(): void {
    if (this.canal) return

    /*
      Sem sessão, não abre canal.

      O portal da cliente monta a mesma árvore de componentes do painel,
      então esta classe era instanciada para toda visitante do link. Cada
      uma abria um WebSocket que o RLS mantinha mudo — `anon` não enxerga
      tabela alguma, então nenhum evento chegava. Um canal aberto para
      não receber nada é bateria de celular gasta e conexão ocupada no
      projeto sem nada em troca.

      A verificação é síncrona de propósito: `getSession()` é assíncrono
      e adiaria a inscrição para depois da primeira renderização. O que
      interessa aqui é se existe token guardado, e isso o armazenamento
      responde na hora.
    */
    /*
      Quem autoriza abrir o canal é quem chama `iniciar()`.

      A verificação anterior lia uma chave do `localStorage` e a tratava
      como prova de sessão. Duas coisas erradas nisso: a chave existe
      logo após um logout mal terminado (canal aberto sem token válido)
      e some antes de o token ser renovado (canal recusado com sessão
      viva). Uma cópia do estado nunca é o estado.

      A autoridade é o `onAuthStateChange` do Supabase, e é dele que
      `SessaoContext` chama `iniciar()` e `encerrar()`. Aqui só resta
      garantir idempotência — o `if (this.canal) return` acima.
    */

    this.canal = supabase()
      .channel('studio')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (mudanca) => {
          const colecao = COLECAO_DA_TABELA[mudanca.table]
          if (!colecao) return

          this.entregar({
            colecao,
            em: new Date().toISOString(),
            // Sempre remoto: a mudança veio do banco, então o espelho
            // desta aba está velho mesmo que tenha sido ela a gravar.
            origem: 'servidor',
          })
        },
      )
      .subscribe((situacao) => {
        /*
          A versão anterior chamava `.subscribe()` sem ouvir o resultado.
          Um canal que morre — troca de rede, celular que dormiu, token
          renovado — ficava morto para sempre, em silêncio: a agenda
          simplesmente parava de se atualizar e ninguém tinha como saber.
          É a pior forma de falhar, porque parece que está funcionando.
        */
        if (situacao === 'SUBSCRIBED') {
          this.tentativas = 0
          return
        }
        if (situacao === 'CHANNEL_ERROR' || situacao === 'TIMED_OUT' || situacao === 'CLOSED') {
          this.reconectar()
        }
      })
  }

  /**
   * Vazio de propósito. Ver o comentário no topo do arquivo.
   */
  publicar(): void {}

  inscrever(ouvinte: OuvinteTempoReal): () => void {
    /*
      Inscrever NÃO abre o canal.

      Abria — `this.iniciar()` ficava nesta linha — e o efeito era pior
      do lado de fora do painel: `useTempoReal` é montado na raiz de
      TODAS as rotas, inclusive `/agendar/:identificador`. Ou seja, cada
      visitante do link do Instagram abria um WebSocket com o Supabase.

      Aquele canal não recebia nada: o RLS não entrega evento para
      `anon`. Era conexão aberta, bateria de celular gasta e uma vaga
      ocupada no projeto, em troca de zero.

      Quem manda abrir e fechar é o `SessaoContext`, seguindo o estado
      real da autenticação. É o que o comentário de `iniciar()` já
      dizia; esta linha o contradizia em silêncio.
    */
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  encerrar(): void {
    if (this.reconexao !== null) {
      window.clearTimeout(this.reconexao)
      this.reconexao = null
    }
    this.descartarCanal()
    this.ouvintes.clear()
    this.tentativas = 0
  }

  /* ---------------------------------------------------------------- */

  /**
   * Desfaz o canal de verdade.
   *
   * ---------------------------------------------------------------
   * O vazamento que isto corrige
   * ---------------------------------------------------------------
   * `unsubscribe()` encerra a escuta, mas o canal **continua na lista
   * interna do cliente Supabase**. Só `removeChannel()` o tira de lá.
   *
   * Enquanto era só `unsubscribe`, cada reconexão deixava um canal
   * órfão para trás — e reconexão não é evento raro num celular:
   * acontece ao trocar de Wi-Fi para 4G, ao sair da área de cobertura,
   * e **toda vez que a tela apaga e acende**, porque o navegador
   * suspende o WebSocket.
   *
   * Num dia de trabalho com o aplicativo aberto, são dezenas. Cada um
   * guardando referência ao callback, que segura o resto. O aplicativo
   * ia ficando pesado ao longo do dia e voltava ao normal ao ser
   * fechado — exatamente o que a proprietária relatou.
   */
  private descartarCanal(): void {
    if (!this.canal) return

    const anterior = this.canal
    this.canal = null

    // Ordem importa: `removeChannel` já faz o unsubscribe por dentro,
    // e chamar os dois em sequência inverte o estado interno.
    void supabase().removeChannel(anterior)
  }

  /**
   * Volta a tentar, com espera crescente.
   *
   * O teto de trinta segundos existe para o caso do salão sem internet:
   * sem ele, um celular na área de sombra tentaria reconectar em laço
   * fechado até a bateria acabar.
   */
  private reconectar(): void {
    if (this.reconexao !== null) return

    /*
      O canal morto sai AGORA, não na hora de criar o novo.

      Guardá-lo durante a espera — que pode chegar a trinta segundos —
      mantinha um canal defunto registrado no cliente todo esse tempo.
      Com reconexões seguidas (celular oscilando entre antenas), a fila
      de defuntos crescia mais rápido do que a reconexão dava conta.
    */
    this.descartarCanal()

    this.tentativas += 1
    const espera = Math.min(1000 * 2 ** Math.min(this.tentativas, 5), 30_000)

    this.reconexao = window.setTimeout(() => {
      this.reconexao = null
      this.iniciar()
    }, espera)
  }


  private entregar(evento: EventoTempoReal): void {
    // Cópia da lista: um ouvinte que se cancela durante a entrega não
    // pode alterar o conjunto que estamos percorrendo.
    for (const ouvinte of [...this.ouvintes]) {
      try {
        ouvinte(evento)
      } catch {
        // Um ouvinte que quebra não pode calar os outros.
      }
    }
  }
}
