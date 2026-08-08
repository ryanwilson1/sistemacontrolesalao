# System Studio

Sistema de gestão para studio de beleza. Agenda com durações reais, ficha de
clientes, serviços, estoque, financeiro, fidelização, relatórios e **Portal de
Agendamento** — o link que a cliente usa para marcar sozinha, sobre a mesma
agenda interna.

Roda **no navegador** por padrão — sem backend, sem banco, sem serviço
online. Com um `.env` apontando para o Supabase, os mesmos arquivos passam
a guardar tudo no servidor, com login de verdade e sincronia entre
aparelhos. Ver [`supabase/LEIA-ME.md`](supabase/LEIA-ME.md).

---

## Começando

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Escolha um perfil e o sistema abre com dados
de demonstração.

```bash
npm run build      # verifica os tipos e gera dist/
npm run preview    # serve o dist/ localmente
npm run verificar  # só a checagem de tipos
npm run testar     # verifica o motor de horários
```

O `testar` roda sem navegador e sem biblioteca de teste: `gradeDeHorarios`
recebe tudo por parâmetro e não busca nada, então dá para conferir almoço,
fechamento, horário ocupado, teto de simultâneos e reserva alheia em
segundos. A pureza que existe para o motor servir ao painel e ao portal ao
mesmo tempo é a mesma que o torna verificável.

---

## Publicando na Vercel

**Antes de tudo:** rode os nove arquivos de `supabase/` no SQL Editor,
do `01` ao `09`. O `06-verificacao.sql` não pode devolver nenhuma linha
`[!] FALHA`. Publicar sem o `02-seguranca.sql` deixa a ficha das
clientes acessível a qualquer pessoa com o link do agendamento.

1. Suba o projeto num repositório do GitHub.
2. Na Vercel: **Add New → Project → Import**.
3. As configurações vêm prontas do `vercel.json`:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
4. Em **Settings → Environment variables**, cadastre as duas:

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://seu-projeto.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | a chave **anon** do projeto |

   A `service_role` **nunca** entra aqui. Ela ignora o RLS: publicá-la
   equivale a deixar o banco aberto na internet.

5. **Deploy**.

O `vercel.json` cuida do redirecionamento das rotas — sem ele,
recarregar `/agenda` ou abrir um link de agendamento direto daria 404 —
e dos cabeçalhos de segurança, incluindo a política que autoriza o
navegador a falar com o Supabase.

Depois do deploy, em **Supabase → Authentication → URL Configuration**,
preencha a *Site URL* com o endereço da Vercel e adicione
`https://SEU-SITE.vercel.app/nova-senha` em *Redirect URLs*. Sem isso o
link de "esqueci minha senha" não volta para o sistema.

O `netlify.toml` continua no repositório para quem já publica lá. As
duas configurações convivem sem se atrapalhar.

---

## Como o projeto está organizado

```
src/
├── assets/           Imagens e arquivos estáticos
├── components/
│   ├── ui/           Botão, campos, cartas, modal, abas
│   ├── feedback/     Esqueletos, estados vazios, erros, confirmação
│   └── common/       Cabeçalho de página, indicadores, marca
├── constants/        Valores fixos: domínio, tema, rotas, ajustes
├── contexts/         Tema, avisos, sessão
├── hooks/
│   └── dados/        Um arquivo por domínio + cache de consultas
├── layouts/          Estrutura do painel e das telas de acesso
├── pages/            Uma pasta por tela, com seus subcomponentes
├── routes/           Árvore de rotas e guardas de acesso
├── services/         ◄ camada de dados (detalhada abaixo)
├── styles/           CSS global e tokens do Tailwind
├── types/            Entidades do domínio
└── utils/            Datas, formatação, sanitização, erros, ids
```

Nenhum arquivo passa de ~300 linhas. Telas grandes viram uma pasta com
subcomponentes.

---

## A camada de Services

É o coração da preparação para a próxima etapa.

```
services/
├── storage/
│   ├── tipos.ts            A interface que todo o sistema usa
│   ├── MemoriaAdapter.ts   Implementação atual (temporária)
│   ├── index.ts            Escolhe o adaptador ativo
│   └── LEIA-ME.md          Como plugar IndexedDB ou SQLite
├── repositorios/           CRUD e consultas por domínio
├── agenda/                 Regras e motor de horários livres
├── atendimento.ts          Fechamento: receita + pontos
├── painel.ts               Consolidação do resumo do dia
├── sessao.ts               Identificação de quem está usando
└── seed.ts                 Dados de demonstração
```

### Trocar o armazenamento é mudar uma linha

```ts
// services/storage/index.ts
export const armazenamento: AdaptadorDeArmazenamento = new IndexedDBAdapter()
```

Nenhum repositório, hook, componente ou tela precisa ser tocado. Todos os
métodos da interface já são assíncronos justamente por isso: IndexedDB e
SQLite são assíncronos, e uma assinatura síncrona obrigaria a reescrever o
sistema inteiro na migração.

### Regras de negócio ficam nos serviços

Nunca dentro dos componentes. As principais:

| Regra | Onde vive |
|---|---|
| Dois atendimentos não se sobrepõem | `agenda/regras.ts` |
| Fim do atendimento vem da duração do serviço | `agenda/regras.ts` |
| Horários livres (jornada, almoço, bloqueios, antecedência) | `agenda/horarios.ts` |
| Concluir lança receita e credita pontos | `atendimento.ts` |
| Saldo do estoque nunca é digitado, só movimentado | `repositorios/estoque.ts` |
| Telefone é chave única da cliente | `repositorios/clientes.ts` |
| Horário preso enquanto a cliente preenche | `portal/reservas.ts` |
| Teto de atendimentos ao mesmo tempo | `agenda/regras.ts` |
| Cliente pede, proprietária decide | `portal/solicitacoes.ts` |
| A fila guarda intenção, nunca horário | `portal/listaEspera.ts` |

O Portal de Agendamento tem documentação própria em
[`docs/PORTAL.md`](docs/PORTAL.md).

---

## Ligando o servidor

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Com as duas variáveis, o sistema troca sozinho de armazenamento, de canal
de tempo real e de forma de entrar. Sem elas, continua no navegador. Não
há linha para editar à mão: uma constante trocada manualmente vira, mais
cedo ou mais tarde, um deploy apontando para o lugar errado.

**Antes de publicar com banco, leia
[`supabase/LEIA-ME.md`](supabase/LEIA-ME.md).** A chave `anon` é pública
por natureza e quem protege os dados é o Row Level Security — sem rodar
`02-seguranca.sql`, qualquer pessoa com o link do agendamento lê a ficha
de todas as clientes.

## Sobre os dados desta versão

Os dados ficam no **localStorage do aparelho**. Sobrevivem a recarregamentos e
a fechar o navegador, e nunca saem do dispositivo.

Duas consequências importantes:

- Cada aparelho tem seus próprios dados. Não há sincronia entre o computador
  do studio e o celular — isso chega com o servidor.
- O navegador reserva cerca de 5 MB por site. Dá para milhares de
  agendamentos; fotos consomem rápido.

Em **Ajustes → Link público** há um diagnóstico com o adaptador ativo e o
espaço ocupado.

O tempo real acompanha essa mesma limitação: hoje ele sincroniza abas e
janelas do mesmo navegador, na hora, sem recarregar nada. Alcançar outro
aparelho depende de servidor — a porta está pronta em
`services/tempo-real/`, com a classe do Supabase escrita inteira no
LEIA-ME de lá.

## Sobre a tela de acesso

A escolha de perfil identifica quem está usando para o sistema saber que telas
mostrar. **Não é autenticação.** Sem servidor não existe segredo que o
navegador consiga guardar — uma senha aqui daria falsa sensação de segurança.
Autenticação real entra junto com o backend, e a troca acontece dentro de
`services/sessao.ts`, sem tocar em tela nenhuma.

---

## Stack

React 18 · TypeScript · Vite 5 · Tailwind 3 · React Router 6 · Framer Motion ·
Recharts · date-fns · Lucide

Sete dependências de produção. Sem cliente de banco, sem biblioteca de
requisições, sem biblioteca de formulário.
