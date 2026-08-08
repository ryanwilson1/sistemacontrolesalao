# Portal de Agendamento

O link que a cliente recebe:

```
systemstudio.com.br/agendar/emely-barbosa
systemstudio.com.br/agendar/emely-barbosa/meu-horario
```

O identificador sai de **Ajustes → Identidade**. Em *Portal → Configuração*
há o link pronto para copiar.

---

## A regra que sustenta tudo

**Não existe uma segunda agenda.**

O portal e o painel leem o mesmo `agendamentosRepo` e passam pelo mesmo
motor de horários, `services/agenda/horarios.ts`. Não há tabela paralela,
nem cópia sincronizada, nem "agenda pública".

Isso não é economia de código — é a única forma de a resposta ser sempre
a mesma. Duas agendas concordam no dia em que são escritas e divergem no
primeiro caso esquisito: um bloqueio criado enquanto a cliente escolhia,
uma remarcação feita no painel, um serviço que mudou de duração. O dia em
que divergissem seria o dia de duas clientes na mesma cadeira.

---

## O caminho da cliente

```
serviço → profissional (opcional) → data → horário → dados → pronto
                                       │
                                       └─ reserva de 5 minutos começa aqui
```

Cada etapa só mostra o que a etapa anterior permite:

- **Serviço** — só os marcados como *disponível no link público*.
- **Profissional** — só quem sabe fazer aquele serviço
  (`servico.profissionaisIds`; vazio = toda a equipe). A cliente pode
  responder "tanto faz", e nesse caso a escolha acontece só na
  confirmação, com a grade toda na mão.
- **Horário** — o que sobra depois de jornada, almoço, bloqueios,
  feriados, folgas, atendimentos já marcados, reservas de outras
  clientes, antecedência mínima e teto de atendimentos simultâneos.

A duração real do serviço é sempre respeitada. Uma progressiva de quatro
horas às 09:00 ocupa até as 13:00 — não é uma marcação às 09:00 com um
rótulo, são quatro horas de agenda tomadas de verdade.

---

## A reserva de cinco minutos

Quando a cliente toca num horário, ele fica dela por alguns minutos
(configurável). Um relógio regressivo aparece na tela. Ou ela conclui, ou
o horário volta sozinho para a grade.

Isso não substitui a regra de conflito — `garantirHorarioLivre` continua
sendo a última palavra, e é revalidada no momento de confirmar. A reserva
resolve outra coisa: sem ela, duas clientes escolhem as 14:00 ao mesmo
tempo e a segunda só descobre o problema **depois** de digitar nome e
telefone. A reserva move a frustração para antes do esforço.

Sem servidor não existe tarefa de fundo, então as reservas vencidas são
varridas pelas telas abertas (`varrerReservas`, a cada 12 segundos) e
também na leitura, porque `reservaValida` confere o prazo. Um horário
preso porque alguém fechou o navegador seria pior do que não ter reserva.

---

## Alterar e cancelar

A cliente **não muda nada sozinha**. Ela pede, pelo protocolo:

| Ela faz | O agendamento fica | A proprietária decide |
|---|---|---|
| Pede alteração | `solicitou_alteracao` | Aprovar num novo horário, ou recusar |
| Pede cancelamento | `solicitou_cancelamento` | Aprovar, ou recusar |

Enquanto o pedido está aberto, **o horário continua ocupado**. Liberar
antes da decisão seria entregá-lo a outra cliente enquanto a proprietária
ainda nem viu o pedido.

Recusar devolve o agendamento exatamente onde estava — é para isso que
existe `situacaoAnterior`. E o pedido não some depois de resolvido: sem
registro, "eu avisei que ia desmarcar" vira palavra contra palavra.

Aprovar uma alteração passa pelo mesmo `agendamentosRepo.remarcar` da
agenda interna, com as mesmas regras de conflito, bloqueio e capacidade.
Um caminho paralelo aqui seria a porta de entrada para o agendamento
sobreposto que o sistema inteiro existe para evitar.

---

## Lista de espera

Quem não encontra horário pode entrar na fila dizendo serviço, dia
desejado e período. A fila guarda a **intenção**, nunca um horário — se
guardasse horário, seria uma terceira agenda.

Quando um agendamento é cancelado, o sistema cruza a vaga com a fila e,
havendo gente esperando, pergunta:

> **3 clientes aguardam este horário.** Deseja avisar?

Perguntar em vez de disparar sozinho é deliberado. Um horário cancelado
às vezes é um horário que a proprietária quer para si — um atraso a
recuperar, um almoço que não aconteceu. Mandar mensagem para doze
clientes sem perguntar transformaria essa pausa em compromisso.

Ao confirmar, todas as interessadas são avisadas de uma vez e a primeira
que responder fica com a vaga. Avisar uma por vez seria mais justo no
papel e perderia a vaga na prática — ninguém responde WhatsApp em dez
minutos garantidos. Quem foi avisada e não respondeu em 3 horas volta
para a fila, na posição original.

---

## Lembretes

Entram na mesma fila do resto do sistema (`services/comunicacao`), com os
mesmos modelos editáveis:

| Quando | Modelo |
|---|---|
| Ao confirmar | `confirmacao` |
| 24 horas antes | `lembrete_24h` |
| 2 horas antes | `lembrete_2h` |
| Alteração aprovada | `alteracao_aprovada` |
| Cancelamento aprovado | `cancelamento_aprovado` |
| Vaga liberada | `vaga_disponivel` |

**Uma ressalva honesta:** o canal de saída de hoje é o `CanalPorLink` —
ele abre o WhatsApp com a mensagem digitada, faltando apertar enviar.
A fila é montada e processada sozinha; o envio ainda pede um toque
humano. Chamar isso de "envio automático" seria enganar. Quando a API
oficial entrar, muda uma linha em `services/comunicacao/canal.ts`.

---

## Tempo real

Qualquer gravação — do portal, do painel, de outra aba — avisa as telas
abertas, que reconsultam sozinhas. Ninguém recarrega nada.

O caminho é: `RepositorioBase.persistir` → `publicarMudanca` →
`CanalTempoReal` → `useTempoReal` → invalidação do cache → as telas
inscritas reconsultam.

**O alcance de hoje são as abas do mesmo navegador.** Alcançar outro
aparelho depende de servidor — o celular da cliente e o computador do
studio só andam juntos quando existir um lugar comum onde os dois
escrevem. A porta está pronta e a classe `CanalSupabase` está escrita
inteira em `services/tempo-real/LEIA-ME.md`; a troca é uma linha.

---

## O que a proprietária controla

Em **Portal → Configuração**:

| Ajuste | O que muda |
|---|---|
| Agendamento online ativo | Liga e desliga o link |
| Confirmar manualmente | Marcações chegam como *aguardando* |
| Escolha de profissional | A cliente escolhe, ou o sistema distribui |
| Minutos de reserva | Quanto tempo o horário fica preso |
| Atendimentos simultâneos | Teto do espaço (0 = só o limite da equipe) |
| Aceita solicitações | Liga os pedidos de alteração e cancelamento |
| Lista de espera | Oferece a fila quando o dia está cheio |
| Recado do portal | Texto no topo da página da cliente |

Em **Ajustes → Horários**: dias de funcionamento, abertura, fechamento,
almoço, antecedência mínima, horizonte de agendamento e intervalo da
grade. Em **Agenda → Bloquear**: folgas, férias, feriados e horários
indisponíveis. Em **Serviços**: duração, intervalo, preço, descrição e
quem sabe fazer.

---

## Onde cada coisa mora

```
types/portal.ts                  as três formas novas
constants/portal.ts              prazos e limites

services/
├── tempo-real/                  a porta do tempo real
│   ├── tipos.ts                 CanalTempoReal
│   ├── CanalLocal.ts            implementação de hoje
│   └── LEIA-ME.md               como plugar o Supabase
├── portal/
│   ├── visitante.ts             quem está do outro lado, sem login
│   ├── reservas.ts              o horário preso
│   ├── agendamento.ts           abrir, ver a grade, confirmar, consultar
│   ├── solicitacoes.ts          pedidos de mudança
│   └── listaEspera.ts           a fila e o aviso de vaga
├── repositorios/portal.ts       reservas, solicitações, lista de espera
└── agenda/horarios.ts           gradeDeHorarios — o motor, um só

hooks/
├── useTempoReal.ts              traduz evento em invalidação de cache
└── dados/usePortal.ts           tudo que as telas do portal consomem

pages/
├── agendamento/                 lado da cliente (sem sessão)
│   ├── Agendamento.tsx          o fluxo
│   ├── MeuHorario.tsx           consulta por protocolo, pedidos
│   ├── usarFluxoDoPortal.ts     o estado do fluxo, fora da tela
│   ├── componentes/Moldura.tsx  a casca visual
│   └── passos/                  serviço, horário, dados, lista de espera
└── portal/                      lado da proprietária
    ├── Portal.tsx
    └── secoes/                  pedidos, fila, histórico, configuração
```

A direção de dependência não mudou:

```
pages → hooks → services → storage
```

Nenhuma tela conversa com o armazenamento. Nenhum repositório sabe que
existe React. O portal não é exceção a nada.

---

## Quando o Supabase entrar

Três linhas, em três arquivos:

```ts
// services/storage/index.ts
export const armazenamento: AdaptadorDeArmazenamento = new SupabaseAdapter(cliente)

// services/tempo-real/index.ts
export const tempoReal: CanalTempoReal = new CanalSupabase(cliente)

// services/comunicacao/canal.ts
export const canal: CanalDeEnvio = new CanalApiOficial(credenciais)
```

Nenhum repositório, serviço, hook ou tela precisa ser tocado. Os métodos
da porta de armazenamento já são todos assíncronos justamente por isso.

Duas coisas passam a ser obrigatórias do lado do banco, e não podem ficar
só no código:

1. **Uma constraint de exclusão** (`EXCLUDE USING gist`) sobre
   profissional e faixa de horário. A checagem em `garantirHorarioLivre`
   é boa para a mensagem que a cliente lê, mas duas confirmações no mesmo
   milissegundo só são impedidas de verdade pelo banco.
2. **RLS** no portal. Hoje a tela pública lê o que precisa porque tudo
   roda no navegador da própria pessoa. Com banco, a cliente não pode
   enxergar a agenda inteira para descobrir horários livres.
