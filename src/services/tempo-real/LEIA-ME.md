# Tempo real

## O que existe hoje

`CanalLocal` sincroniza **abas e janelas do mesmo navegador**, na hora,
sem recarregar nada. A proprietária com a agenda aberta e o portal aberto
ao lado vê o horário sumir no instante em que a cliente confirma.

O que ele **não** faz é alcançar outro aparelho. Isso precisa de
servidor. O celular da cliente e o computador do studio só andam juntos
quando existir um lugar comum onde os dois escrevem — e é exatamente
esse o próximo passo.

## O que muda com o Supabase

Uma linha em `index.ts`:

```ts
export const tempoReal: CanalTempoReal = new CanalSupabase(cliente)
```

A classe inteira cabe em poucas linhas porque a interface já foi
desenhada em cima do formato que o Realtime usa:

```ts
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Colecao } from '../storage'
import type { CanalTempoReal, EventoTempoReal, OuvinteTempoReal } from './tipos'
import { IDENTIDADE_DESTA_ABA } from './CanalLocal'

export class CanalSupabase implements CanalTempoReal {
  readonly nome = 'Supabase Realtime'
  readonly remoto = true

  private canal: RealtimeChannel | null = null
  private ouvintes = new Set<OuvinteTempoReal>()

  constructor(private readonly cliente: SupabaseClient) {}

  iniciar(): void {
    if (this.canal) return

    this.canal = this.cliente
      .channel('studio')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (mudanca) => this.entregar({
          colecao: mudanca.table as Colecao,
          em: new Date().toISOString(),
          origem: 'servidor',
        }),
      )
      .subscribe()
  }

  publicar(): void {
    // Nada a fazer: o Postgres avisa sozinho quem estiver ouvindo.
    // A gravação já aconteceu no repositório.
  }

  inscrever(ouvinte: OuvinteTempoReal) {
    this.iniciar()
    this.ouvintes.add(ouvinte)
    return () => { this.ouvintes.delete(ouvinte) }
  }

  encerrar(): void {
    void this.canal?.unsubscribe()
    this.canal = null
    this.ouvintes.clear()
  }

  private entregar(evento: EventoTempoReal) {
    for (const ouvinte of [...this.ouvintes]) ouvinte(evento)
  }
}
```

Repare que `publicar` fica vazio. É o ponto da troca: hoje quem avisa é
o próprio código, porque não há ninguém mais para fazê-lo; com banco, o
Postgres avisa a partir da própria gravação. A diferença fica dentro
desta classe e não vaza para lugar nenhum.

Note também que `origem` passa a ser `'servidor'`. É o que faz o
`useTempoReal` tratar todo evento como remoto e descartar o espelho do
armazenamento antes de reconsultar — que é o comportamento correto
quando a mudança veio de fora.

## O que continua igual

- Os repositórios. `RepositorioBase` publica depois de gravar, e é o
  único lugar que chama `publicarMudanca`.
- O hook `useTempoReal`. Ele traduz coleção em chave de cache e manda
  invalidar; não sabe de onde o evento veio.
- As telas. Nenhuma delas escuta o canal diretamente.

## Uma decisão que parece detalhe

O evento carrega o **nome da coleção**, não o registro que mudou.

Mandar o registro pareceria mais rápido — a tela já teria o dado em
mãos. Só que criaria um segundo caminho de leitura, paralelo ao
repositório, e dois caminhos de leitura divergem no primeiro caso
esquisito: um agendamento que chega pelo canal sem passar pelas regras
de conflito, uma tela que recebe o registro cru e outra que recebe o
detalhado. O aviso magro obriga todo mundo a reler pelo mesmo lugar.

O custo é uma consulta a mais. Em troca, nunca existem duas versões da
verdade — que é a mesma razão de o portal usar a agenda interna em vez
de manter a sua.
