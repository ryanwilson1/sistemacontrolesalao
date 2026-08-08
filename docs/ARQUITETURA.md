# Arquitetura

## O princípio

Uma direção só de dependência:

```
pages → hooks → services → storage
  │       │        │
  └───────┴────────┴──► types, utils, constants
```

Uma tela nunca conversa com o armazenamento. Um repositório nunca sabe que
existe React. Isso é o que permite trocar o armazenamento sem mexer na
interface, e redesenhar a interface sem mexer nas regras.

---

## Camadas

### `types/`
As formas do domínio. Não dependem de nada.

### `utils/`
Funções puras: datas, formatação, sanitização, geração de id, tradução de
erros. Não dependem de React nem de dados.

### `constants/`
Valores fixos: rótulos de situação, papéis, cores da paleta, rotas. Mudou
aqui, mudou no sistema inteiro.

### `services/`
Onde as regras vivem.

- **`storage/`** — a porta. Uma interface (`AdaptadorDeArmazenamento`) e a
  implementação ativa. É o único lugar que sabe *onde* os dados moram.
- **`repositorios/`** — o *que* se pode fazer com cada entidade. Herdam de
  `RepositorioBase<T>`, que resolve o CRUD genérico; cada um adiciona só as
  consultas do seu domínio.
- **`agenda/`** — regras puras da agenda, separadas dos repositórios porque
  valem tanto para o painel quanto para o portal da cliente. `horarios.ts`
  é o motor único: se existissem dois, um dia divergiriam.
- **`tempo-real/`** — a segunda porta. Uma interface (`CanalTempoReal`) e a
  implementação ativa. `RepositorioBase` publica depois de gravar, de um
  lugar só; as telas nunca escutam o canal diretamente.
- **`portal/`** — o que existe em volta da marcação: reserva temporária,
  pedidos da cliente e lista de espera. Nenhum deles guarda horário
  próprio; tudo desemboca no repositório de agenda.
- **`atendimento.ts`, `painel.ts`** — fluxos que atravessam vários
  repositórios.

### `hooks/dados/`
A ponte entre serviços e React. `useConsulta` cuida de buscar, guardar em
cache e recarregar; `useAcao` cuida de escrever e invalidar. Cada domínio tem
seu arquivo.

### `components/`, `layouts/`, `pages/`
Só interface. Recebem dados prontos e devolvem JSX.

---

## Por que não React Query

Sem servidor não há requisição de rede para coordenar — nem repetição
automática, nem revalidação em foco, nem cache entre abas. O que sobrava do
React Query era guardar resultado e invalidar. São 40 linhas em
`hooks/dados/cache.ts`, contra ~40 KB de biblioteca.

`useConsulta` tem a mesma forma de `useQuery` de propósito: se um dia entrar
sincronia com servidor, a volta é direta.

## Por que não React Hook Form nem Zod

Os formulários daqui são diretos: campos controlados, validação no salvar. As
regras que realmente importam (conflito de horário, saldo de estoque, telefone
único) não pertencem ao formulário — pertencem aos serviços, onde valem
também para o link público, que não usa formulário nenhum.

---

## Adicionando uma funcionalidade

1. A forma do dado entra em `types/entidades.ts`.
2. A coleção entra na união `Colecao` em `services/storage/tipos.ts`.
3. Crie o repositório herdando `RepositorioBase<T>`.
4. Regras que atravessam entidades viram um serviço próprio.
5. Exponha por hooks em `hooks/dados/`.
6. A tela consome os hooks.

O passo 6 nunca sabe do passo 2.
