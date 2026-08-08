# Camada de armazenamento

## Como está hoje

O sistema guarda tudo no `localStorage` do navegador (`LocalStorageAdapter`).
Os dados ficam no aparelho, sobrevivem a recarregamentos e a fechar o
navegador. Nada trafega para servidor nenhum.

Limite prático: cerca de 5 MB por site. Suficiente para milhares de
agendamentos, mas apertado se houver muitas fotos — por isso a Central de
Backup permite excluí-las da cópia.

O `MemoriaAdapter` continua existindo e é usado automaticamente fora do
navegador (nos testes).

## Como trocar por IndexedDB

1. Crie `IndexedDBAdapter.ts` implementando `AdaptadorDeArmazenamento`.
2. Em `index.ts`, troque uma linha:

```ts
export const armazenamento: AdaptadorDeArmazenamento = new IndexedDBAdapter()
```

Pronto. Nenhum repositório, hook ou componente muda.

Esqueleto sugerido:

```ts
export class IndexedDBAdapter implements AdaptadorDeArmazenamento {
  readonly nome = 'IndexedDB'
  readonly persistente = true
  private bd: IDBDatabase | null = null

  async iniciar() {
    this.bd = await abrirBanco('studio', 1, (bd) => {
      for (const colecao of COLECOES) {
        if (!bd.objectStoreNames.contains(colecao)) bd.createObjectStore(colecao)
      }
    })
  }

  async listar<T>(colecao: Colecao): Promise<T[]> { /* ... */ }
  async gravar<T>(colecao: Colecao, registros: T[]): Promise<void> { /* ... */ }
  async limpar(): Promise<void> { /* ... */ }
}
```

## Como trocar por SQLite (WASM)

Mesmo caminho. A diferença é que `listar` e `gravar` viram consultas SQL.
Vale considerar granularidade fina (`inserir`, `atualizar`, `remover` por
registro) em vez de substituir a coleção inteira — a interface aceita
métodos adicionais sem quebrar quem já a usa.

## Por que os métodos são assíncronos

IndexedDB e SQLite/WASM são assíncronos. Se a interface fosse síncrona
agora, a migração obrigaria a reescrever todos os repositórios, hooks e
telas. Assinar como `Promise` desde o começo evita esse retrabalho.
