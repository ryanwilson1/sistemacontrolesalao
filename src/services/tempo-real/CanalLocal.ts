import type { Colecao } from '../storage'
import type { CanalTempoReal, EventoTempoReal, OuvinteTempoReal } from './tipos'

/**
 * Tempo real dentro deste aparelho.
 *
 * Funciona em três camadas, da melhor para a que sempre existe:
 *
 * 1. **Ouvintes locais** — a própria aba. Uma tela grava, outra tela
 *    aberta ao lado se atualiza no mesmo instante.
 * 2. **BroadcastChannel** — outras abas e janelas do mesmo navegador.
 *    A proprietária deixa a agenda aberta no computador e o portal
 *    aberto no celular *do mesmo navegador*; os dois andam juntos.
 * 3. **Evento `storage`** — o plano B, para navegadores sem
 *    BroadcastChannel. Dispara só em outras abas, que é exatamente o
 *    que precisamos.
 *
 * O que este canal NÃO faz: alcançar outro aparelho. Isso depende de
 * servidor, e chamar de "tempo real entre usuárias" o que só cruza abas
 * seria enganar. A troca está documentada em LEIA-ME.md — a interface
 * já é a mesma que o Supabase Realtime pede.
 */

const NOME_CANAL = 'system-studio:tempo-real'
const CHAVE_SINAL = 'studio:sinal'

/** Identidade desta aba. Nasce e morre com ela. */
export const IDENTIDADE_DESTA_ABA =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `aba-${Math.random().toString(36).slice(2, 10)}`

export class CanalLocal implements CanalTempoReal {
  readonly nome = 'Local (abas deste navegador)'
  readonly remoto = false

  private ouvintes = new Set<OuvinteTempoReal>()
  private transmissor: BroadcastChannel | null = null
  private ligado = false

  iniciar(): void {
    if (this.ligado || typeof window === 'undefined') return
    this.ligado = true

    if ('BroadcastChannel' in window) {
      this.transmissor = new BroadcastChannel(NOME_CANAL)
      this.transmissor.onmessage = (mensagem) => {
        this.entregar(mensagem.data as EventoTempoReal)
      }
    }

    window.addEventListener('storage', this.aoMudarArmazenamento)
  }

  publicar(colecao: Colecao): void {
    const evento: EventoTempoReal = {
      colecao,
      em: new Date().toISOString(),
      origem: IDENTIDADE_DESTA_ABA,
    }

    // Primeiro a própria aba: o retorno visual não pode esperar o
    // caminho de fora, que pode nem existir.
    this.entregar(evento)

    this.transmissor?.postMessage(evento)

    // Plano B. Só as outras abas recebem — é assim que o evento funciona.
    if (!this.transmissor) {
      try {
        window.localStorage.setItem(CHAVE_SINAL, JSON.stringify(evento))
      } catch {
        // Cota cheia não pode derrubar uma gravação que já deu certo.
      }
    }
  }

  inscrever(ouvinte: OuvinteTempoReal): () => void {
    this.iniciar()
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  encerrar(): void {
    this.transmissor?.close()
    this.transmissor = null
    this.ouvintes.clear()

    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.aoMudarArmazenamento)
    }
    this.ligado = false
  }

  /* ---------------------------------------------------------------- */

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

  private aoMudarArmazenamento = (evento: StorageEvent) => {
    if (evento.key !== CHAVE_SINAL || !evento.newValue) return

    try {
      this.entregar(JSON.parse(evento.newValue) as EventoTempoReal)
    } catch {
      // Sinal ilegível: ignora.
    }
  }
}

/**
 * Canal desligado.
 *
 * Para testes e para o servidor: sem `window` não há nada para
 * transmitir, e falhar seria pior do que ficar em silêncio.
 */
export class CanalSilencioso implements CanalTempoReal {
  readonly nome = 'Desligado'
  readonly remoto = false

  iniciar(): void {}
  publicar(): void {}
  inscrever(): () => void {
    return () => {}
  }
  encerrar(): void {}
}
