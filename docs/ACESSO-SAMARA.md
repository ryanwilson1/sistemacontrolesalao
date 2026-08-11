# Acesso da Samara — só agenda

Passo a passo para liberar `samaranicaciodossantos@gmail.com` com acesso
restrito à agenda.

São **quatro passos**, nesta ordem. O terceiro é o que importa: sem ele,
o menu fica escondido mas os dados continuam alcançáveis por quem souber
pedir direto ao banco.

---

## 1. Publicar o sistema atualizado

O código desta entrega já traz o papel novo. Publique como de costume
(Vercel → Deployments → Redeploy, ou o `git push` que dispara a
publicação).

## 2. Cadastrar a Samara na Equipe

No sistema, **Ajustes → Equipe → Nova profissional**:

| Campo | Valor |
|---|---|
| Nome | Samara Nicácio dos Santos |
| Função | **Profissional (só agenda)** |
| Cor na agenda | a que preferir — distingue os atendimentos dela |
| Atende clientes | ligado |
| Cadastro ativo | ligado |

> A função é o campo que decide tudo. "Profissional" e "Profissional (só
> agenda)" ficam lado a lado na lista, e a diferença entre as duas é o
> salão inteiro. A dica embaixo do campo diz o que cada uma abre.

Depois de salvar, **anote o id da profissional**. Ele aparece no endereço
ao editar, ou pelo SQL Editor:

```sql
select id, nome, papel from profissionais where nome ilike '%samara%';
```

## 3. Aplicar a restrição no banco

No Supabase → **SQL Editor**, rode os arquivos **nesta ordem exata**:

```
supabase/02-seguranca.sql     (atualizado — cria o guarda de acesso completo)
supabase/03-portal.sql        (atualizado — o link público perdia o teto diário)
supabase/05-integridade.sql   (atualizado — a trilha de auditoria vazava tudo)
supabase/07-identidade.sql    (atualizado — bucket da marca)
supabase/08-transacoes.sql    (atualizado — RPCs de estoque e conferência)
supabase/09-concorrencia.sql  (atualizado — RPCs de snapshot, restauração e update)
supabase/10-acesso-agenda.sql (novo — a restrição de acesso)
```

Todos podem ser rodados mais de uma vez sem estragar nada.

> **A ordem importa.** O `02` recria as políticas de todas as tabelas;
> o `10` precisa vir depois para reaplicar as restrições por cima. Rodar
> o `10` antes do `02` desfaz a proteção sem avisar.

> A maioria desses arquivos não tem relação direta com a Samara. Eles
> entraram porque a segunda auditoria encontrou funções privilegiadas
> que passavam por cima do controle de acesso. Detalhes no relatório.

## 4. Criar a conta e conceder o acesso

**4a.** Supabase → **Authentication → Users → Add user**

- E-mail: `samaranicaciodossantos@gmail.com`
- Senha: uma inicial, que ela troca depois
- Marque *Auto Confirm User* (senão ela precisa confirmar por e-mail)

> ⚠️ **Se a conta em Authentication já existia quando você rodou o
> `02-seguranca.sql`, ela entrou em `contas_equipe` como
> `proprietaria`.** O bloco "Bootstrap" daquele arquivo insere todos os
> usuários existentes, e o padrão da coluna é proprietária. Rodar o
> `02` de novo **não corrige** — o `on conflict do nothing` pula a
> linha que já está lá. Só o comando 4b abaixo resolve.
>
> Confira antes e depois com `supabase/11-conferir-samara.sql`.

**4b.** SQL Editor — troque `ID_DA_SAMARA` pelo id do passo 2:

```sql
select conceder_acesso_agenda(
  'samaranicaciodossantos@gmail.com',
  'ID_DA_SAMARA'
);
```

Esse comando ajusta os **dois** lugares onde o papel mora: o que o banco
consulta para entregar dados e o que a tela consulta para montar o menu.
Fazer só um dos dois cria justamente o estado enganoso — menu fechado
com banco aberto, ou o contrário.

---

## Conferir que funcionou

O teste que vale mais que todos: **entre com a conta dela**.

Ela deve ver **um item só no menu — Agenda**. Sem Início, sem Clientes,
sem Caixa, sem Estoque.

E, com a sessão dela aberta, no **console do navegador** (F12 →
Console — não no SQL Editor, que só entende SQL):

```js
await supabase.from('lancamentos').select('*')
```

Tem que voltar **erro de permissão**. Se voltar dados, pare: o papel não
foi aplicado, e o menu escondido não protege nada.

Prefere conferir sem sair do Supabase? Rode
`supabase/11-conferir-samara.sql`. Ele finge ser a Samara dentro de uma
transação e testa cada tabela — sem gravar nada.

> **Atenção:** rodar `select * from lancamentos` direto no SQL Editor
> **não testa nada**. Ali você é o dono do banco, `auth.uid()` é nulo e
> as políticas não valem. Vai funcionar sempre, inclusive com tudo
> corretamente bloqueado.

---

## O que ela vê e o que não vê

**Vê:** a agenda nas três visões (dia, semana, mês), os horários livres,
nome e telefone das clientes agendadas, marcar e remarcar horários,
bloquear horário, avisar pelo WhatsApp, concluir atendimento.

**Não vê:** faturamento, caixa, estoque, cupons, fidelidade, relatórios,
backup, ajustes do salão, a lista completa de clientes, a ficha de
evolução e as fotos das clientes, nem os valores dos atendimentos — o
total do dia e da semana somem do rodapé da agenda, e a tabela de preços
some da lista de serviços.

**O limite honesto:** ela vê nome e telefone das clientes **que
aparecem na agenda dela e do salão**. A agenda sem nome de cliente não é
agenda, e o Postgres não sabe esconder colunas por pessoa quando todos
compartilham o mesmo papel de acesso. Fechar isso exigiria trocar as
tabelas por views — obra maior, viável, mas outra conversa.

---

## Para tirar o acesso depois

```sql
select revogar_conta('samaranicaciodossantos@gmail.com');
```

Tira o login sem apagar o histórico de atendimentos dela.
