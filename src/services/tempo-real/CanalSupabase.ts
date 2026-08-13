import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/cliente'
import { diagnostico } from '../diagnostico'
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

  /**
   * `encerrar()` foi chamado e ninguém pediu para voltar.
   *
   * ---------------------------------------------------------------
   * O canal que ressuscitava sozinho depois do logout
   * ---------------------------------------------------------------
   * `descartarCanal()` chama `removeChannel`, e o Supabase responde
   * avisando a própria assinatura: `CLOSED`. Esse aviso caía no
   * `subscribe(...)` abaixo, que tratava `CLOSED` como queda de rede e
   * chamava `reconectar()`.
   *
   * A sequência real era:
   *
   *   a proprietária sai
   *   ↓
   *   `encerrar()` → `descartarCanal()` → `removeChannel`
   *   ↓
   *   o Supabase devolve `CLOSED`
   *   ↓
   *   `reconectar()` agenda uma volta em 2 segundos
   *   ↓
   *   `iniciar()` abre um canal NOVO — sem sessão, com token revogado
   *   ↓
   *   o servidor recusa → `CHANNEL_ERROR` → reconecta de novo
   *
   * Um laço de reconexão que só parava quando a aba fechava, e que
   * segurava callbacks vivos o tempo todo. Era isto que fazia o
   * aparelho ficar mais pesado quanto mais o dia passava.
   *
   * A marca é a autorização explícita: quem manda abrir é o
   * `SessaoContext`, e nada mais reabre por conta própria.
   */
  private desligado = false

  iniciar(): void {
    this.desligado = false
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

    const meuCanal = supabase()
      .channel('studio')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (mudanca) => {
          const colecao = COLECAO_DA_TABELA[mudanca.table]
          if (!colecao) return

          /*
            Evento de um canal que já foi descartado não vale.

            Durante uma reconexão os dois existem por um instante, e o
            velho ainda entrega o que estava na fila. Deixá-lo passar
            significaria invalidar o cache duas vezes pelo mesmo fato.
          */
          if (this.canal !== meuCanal) return

          diagnostico.contar('eventosTempoReal')

          this.entregar({
            colecao,
            em: new Date().toISOString(),
            /*
              Sempre 'servidor' — e isso é uma DECISÃO, revertendo uma
              otimização anterior.

              Houve aqui um mecanismo de "eco": a gravação local
              registrava uma marca e o evento correspondente era
              assinado como desta aba, preservando o espelho. O
              problema é estrutural: `postgres_changes` não diz quem
              gravou, então o pareamento era por COLEÇÃO — e uma
              mudança de outro aparelho, chegando dentro da janela,
              podia consumir a marca e ser tratada como local. Dado
              velho na tela, sem erro e sem rastro.

              Entre uma releitura a mais por gravação e a possibilidade
              de um aparelho não ver o que o outro fez, fica a
              releitura. O custo real caiu junto: o espelho agora é
              atualizado com a LINHA CONFIRMADA pelo banco a cada
              escrita, então a releitura pós-evento devolve o mesmo
              estado — é redundância barata, não retrabalho.
            */
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

        /*
          Duas recusas antes de qualquer decisão.

          `desligado` — o aviso é o eco do próprio `removeChannel` que o
          logout disparou. Reagir a ele reabriria o canal que acabamos
          de fechar.

          `this.canal !== meuCanal` — o aviso vem de um canal que já foi
          substituído. Reagir a ele derrubaria o canal NOVO, e a cada
          oscilação de rede o sistema trocaria de canal duas vezes em vez
          de uma.
        */
        if (this.desligado || this.canal !== meuCanal) return

        if (situacao === 'SUBSCRIBED') {
          this.tentativas = 0
          return
        }
        if (situacao === 'CHANNEL_ERROR' || situacao === 'TIMED_OUT' || situacao === 'CLOSED') {
          this.reconectar()
        }
      })

    this.canal = meuCanal
    diagnostico.contar('canaisAbertos')
    this.observarRetomada()
  }

  /**
   * Não anuncia nada — quem anuncia é o Postgres, a partir da própria
   * gravação (ver o topo do arquivo). O que ele NÃO sabe dizer é de
   * quem foi a gravação, então aqui fica registrado o eco esperado:
   * quando o evento correspondente voltar, o canal o reconhece como
   * desta aba e o espelho local é preservado.
   */
  publicar(): void {
    // Nada a anunciar: quem anuncia é o Postgres, a partir da própria
    // gravação. Ver o comentário em `entregar` sobre a decisão de
    // tratar todo evento como remoto.
  }

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
    // A marca vem PRIMEIRO: `descartarCanal` provoca o `CLOSED` que a
    // marca existe para ignorar.
    this.desligado = true

    if (this.reconexao !== null) {
      window.clearTimeout(this.reconexao)
      this.reconexao = null
    }
    this.pararDeObservarRetomada()
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
    diagnostico.contar('canaisFechados')

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
    if (this.desligado) return
    if (this.reconexao !== null) return

    diagnostico.contar('reconexoes')

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

  /* ---------------------------------------------------------------- */

  private pararRetomada: (() => void) | null = null

  /**
   * Encurta a espera quando o aparelho volta a ter chance de conectar.
   *
   * ---------------------------------------------------------------
   * Os trinta segundos de agenda parada
   * ---------------------------------------------------------------
   * A espera cresce até trinta segundos, e está certo — um celular em
   * área de sombra não pode martelar o servidor. O problema é o desfecho
   * comum no iPhone:
   *
   *   a tela apaga → o WebSocket morre → primeira falha, espera 2s
   *   ↓ (o celular fica no bolso; as tentativas seguem falhando)
   *   a espera chega ao teto
   *   ↓
   *   a proprietária desbloqueia e abre a Agenda
   *   ↓
   *   e espera até trinta segundos por um canal que já poderia estar de pé
   *
   * Nesse intervalo a agenda dela simplesmente não recebe o horário que
   * a cliente acabou de marcar. `visibilitychange` e `online` são
   * exatamente o aviso de \"agora vale a pena tentar de novo\": a espera é
   * cancelada, o contador zera e a conexão acontece na hora.
   *
   * Só age quando NÃO há canal de pé. Com o canal vivo, voltar do
   * segundo plano não mexe em nada — é o requisito de que trocar de tela
   * ou de aplicativo nunca recrie o canal.
   */
  private observarRetomada(): void {
    if (this.pararRetomada || typeof window === 'undefined') return

    const retomar = () => {
      if (this.desligado) return
      if (this.canal) return
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return

      if (this.reconexao !== null) {
        window.clearTimeout(this.reconexao)
        this.reconexao = null
      }
      this.tentativas = 0
      this.iniciar()
    }

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') retomar()
    }

    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', retomar)

    this.pararRetomada = () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', retomar)
    }
  }

  private pararDeObservarRetomada(): void {
    this.pararRetomada?.()
    this.pararRetomada = null
  }


  /** Ver `CanalTempoReal.medir`. Não participa do funcionamento. */
  medir(): unknown {
    return {
      canalAberto: this.canal ? 1 : 0,
      ouvintes: this.ouvintes.size,
      reconexaoAgendada: this.reconexao !== null,
      tentativas: this.tentativas,
      desligado: this.desligado,
    }
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
