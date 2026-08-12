# Ligando o Supabase

Nove arquivos, nesta ordem, no **SQL Editor** do seu projeto.
Rode um de cada vez e confira o resultado antes de seguir.

| Arquivo | O que faz |
|---|---|
| `01-esquema.sql` | Cria as tabelas e os índices |
| `02-seguranca.sql` | **Tranca tudo.** Sem ele, seus dados ficam públicos |
| `03-portal.sql` | Abre só o que o portal da cliente precisa |
| `04-tempo-real.sql` | Liga a sincronia entre aparelhos |
| `05-integridade.sql` | Regras de negócio no banco e trilha de auditoria |
| `06-verificacao.sql` | **Confere tudo.** Não altera nada |
| `07-identidade.sql` | Logo, cores e dados do salão + bucket de imagens |
| `08-transacoes.sql` | Conclusão de atendimento e estoque em transação única |
| `09-concorrencia.sql` | Versão dos registros, restauração transacional e check-in |

O `06` devolve uma linha por checagem. Nenhuma pode estar marcada
`[!] FALHA` antes de o link do salão ir para o WhatsApp de alguém.

Depois, na raiz do projeto, um `.env`:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

Sem essas duas variáveis o sistema continua no navegador. Isso serve
para desenvolver — **não** para um salão de verdade: sem banco, os dados
ficam num aparelho só e somem se o cache for limpo.

Na Vercel, as mesmas duas em **Settings → Environment variables**.

---

## A parte que não dá para pular

A chave `anon` é **pública**. Ela viaja dentro do JavaScript que o
navegador baixa, e qualquer pessoa que abrir o link do agendamento
consegue extraí-la em segundos. Não há como escondê-la — ela foi feita
assim.

Então a pergunta certa nunca é "como escondo a chave". É: **o que alguém
de posse dela consegue fazer?**

Sem o `02-seguranca.sql`, a resposta é *tudo*. Este comando, rodado por
qualquer pessoa do mundo, devolveria a lista inteira de clientes —
telefone, aniversário e o campo de observações, que no seu próprio
sistema guarda coisas como "alérgica a amônia":

```bash
curl 'https://SEU-PROJETO.supabase.co/rest/v1/clientes?select=*' \
     -H "apikey: SUA_CHAVE_ANON"
```

Depois do `02`, o mesmo comando devolve erro de permissão.

**Confira antes de publicar.** Rode o curl acima com a sua chave. Se
vierem dados, pare: alguma coisa não foi aplicada.

E este, que deve devolver zero linhas:

```sql
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

---

## Como o portal continua funcionando com tudo trancado

A visitante do link não faz login. Se ela não pode ler tabela alguma,
como vê os horários livres?

Por doze funções, criadas no `03-portal.sql`, que devolvem exatamente o
recorte necessário. A mais importante é `portal_ocupacao`: ela responde
*"das 14h às 16h está ocupado"* — e não *"a Maria faz progressiva por
R$ 350"*.

Dar acesso à tabela `agendamentos` entregaria as três informações
juntas. É assim que a agenda de um salão vaza inteira.

As funções são `security definer`: rodam com os poderes do dono do banco
em vez dos de quem chamou, o que permite manter `anon` sem acesso a nada.
Todas declaram `set search_path = public`, porque sem isso `security
definer` é uma porta conhecida de escalonamento de privilégio.

---

## O login do painel

Com banco, o painel passa a exigir e-mail e senha de verdade. A escolha
de perfil continua existindo para quando não há banco, onde ela é
honesta — mas ali ela nunca foi autenticação, e o sistema nunca disse
que era.

**Crie a conta** em Authentication → Users → *Add user*. A tela de
cadastro do sistema foi desligada de propósito: quem cria conta é você.

**Depois, autorize-a no banco** — e este passo não é opcional:

```sql
select autorizar_conta('proprietaria@gmail.com');
```

Existir em `auth.users` deixou de bastar. Antes bastava, e era o
problema: com o cadastro aberto ligado (o padrão do Supabase), qualquer
pessoa com o link público criava uma conta e recebia um token que a
política `using (true)` aceitava. A ficha de todas as clientes ficava a
quatro requisições de distância de quem soubesse procurar.

Agora um cadastro espontâneo recebe um token que não abre porta nenhuma.

Para ligar a conta a alguém da equipe:

```sql
select autorizar_conta('carol@gmail.com', 'profissional', 'id-da-carol');
```

Para tirar o acesso sem apagar o histórico do que a pessoa fez:

```sql
select revogar_conta('pessoa@gmail.com');
```

**E continue desligando o cadastro aberto**: Authentication → Providers →
Email → desmarque *Allow new users to sign up*. Virou a segunda tranca
em vez da única, mas duas trancas custam um clique.

---

## O que o banco passa a garantir sozinho

Três regras deixam de depender do JavaScript:

**Nenhuma sobreposição de horário.** A restrição de exclusão em
`agendamentos` recusa duas clientes na mesma profissional ao mesmo
tempo. A checagem em TypeScript continua valendo, porque dá a mensagem
boa; mas duas pessoas confirmando no mesmo segundo passam pelas duas
checagens antes de qualquer uma gravar. Só o banco fecha essa janela.

**Telefone único por cliente.** Um índice impede que a mesma pessoa
nasça duas vezes e tenha o histórico partido ao meio.

**Faxina das reservas.** Sem banco, quem varre é a tela aberta. Com
`pg_cron`, acontece de madrugada com todo navegador fechado:

```sql
select cron.schedule('faxina-reservas', '*/5 * * * *',
                     $$select limpar_reservas()$$);
```

---

## Migrando os dados que já existem

Se você já usou o sistema no navegador, exporte antes: **Backup →
Exportar**. Depois de ligar o banco, importe pelo mesmo lugar. Os
identificadores são preservados, então nada se perde nem se duplica.


---

## O que o banco passa a recusar

Além do que já estava aqui, o `03-portal.sql` e o `05-integridade.sql`
moveram para o Postgres regras que só existiam no JavaScript.

Isso importa porque as funções do portal são `grant execute to anon` —
chamáveis por qualquer pessoa com a chave pública, direto pelo terminal,
sem passar por tela nenhuma:

```bash
curl -X POST 'https://SEU-PROJETO.supabase.co/rest/v1/rpc/portal_reservar' \
     -H "apikey: CHAVE_ANON" -H "Content-Type: application/json" \
     -d '{"p_inicio":"2020-01-01T03:00:00Z", ...}'
```

Domingo de madrugada, num dia fechado, numa data já passada. As quatro
checagens do React não estavam no caminho.

O banco agora recusa, sozinho:

- horário fora do expediente do dia, **no fuso do studio** e não no do
  celular de quem está marcando;
- horário dentro do intervalo de almoço;
- data no passado, ou dentro da antecedência mínima;
- data além do horizonte configurado;
- profissional desativada, ou que não atende aquele serviço;
- serviço fora do link público;
- horário sobre um bloqueio — inclusive um criado *depois* de a cliente
  prender o horário e antes de ela confirmar;
- preço negativo, desconto maior que o preço, duração zero, situação
  inventada;
- exclusão de cliente, serviço ou profissional que tenha histórico.

A checagem em TypeScript continua valendo — ela dá a mensagem boa e
evita a viagem à rede. Só deixou de ser a única coisa entre a agenda do
salão e a internet.

---

## A trilha

`05-integridade.sql` cria a tabela `auditoria`. Ela guarda, para as
tabelas que importam, quem mudou o quê e **o que havia antes**.

O "o que havia antes" é o ponto. Uma trilha que só registra que algo foi
apagado serve para atribuir culpa; uma que guarda a linha inteira serve
para trazer de volta:

```sql
select id, em, usuario_email, tabela, dados_anteriores->>'nome'
from auditoria where operacao = 'DELETE' order by em desc limit 20;

select restaurar_da_trilha(1234);
```

Ninguém escreve nessa tabela pela API — nem apaga. Se pudesse ser
editada, deixaria de servir para o que existe.

## 12-correcao-esquema.sql — OBRIGATÓRIO para o Caixa funcionar

O frontend e o banco discordavam sobre o nome de 18 colunas em quatro
tabelas (`caixas`, `movimentos_caixa`, `procedimentos`, `fotos`). O
efeito em produção: abrir/fechar caixa e registrar movimentações NUNCA
funcionaram — toda gravação voltava com PGRST204 e a tela mostrava
"Algo não saiu como esperado".

Este arquivo adiciona as colunas, copia os dados que já existem nas
antigas e ensina a RPC `concluir_atendimento` a preencher as novas.
Nada é apagado nem renomeado; rodar duas vezes não tem efeito.

Rode no SQL Editor, depois dos anteriores. O bloco final confere o
resultado e FALHA ALTO se alguma coluna não entrou — a última linha da
saída deve ser o `NOTICE` de OK.

Para conferir do lado do código: `npx tsx testes/esquema-caixa.ts`
valida o fluxo inteiro do caixa contra as colunas destes arquivos.

---

## SEQUÊNCIA OFICIAL DE EXECUÇÃO — 13 arquivos

Rode no SQL Editor, nesta ordem, cada um até o fim:

01-esquema.sql → 02-seguranca.sql → 03-portal.sql → 04-tempo-real.sql →
05-integridade.sql → 06-verificacao.sql → 07-identidade.sql →
08-transacoes.sql → 09-concorrencia.sql → 10-acesso-agenda.sql →
11-conferir-samara.sql → 12-correcao-esquema.sql →
13-blindagem-e-verificacao.sql

Num projeto que já rodou 01–11: basta rodar 12 e 13.

O 13 termina com uma VERIFICAÇÃO FINAL que confere colunas, índices de
unicidade, funções, gatilhos e se a RPC `atualizar_com_versao` é a
versão corrigida. Ela FALHA ALTO com a lista do que faltou — a última
linha da saída precisa ser:

  NOTICE: VERIFICACAO FINAL OK

"O arquivo executou" não é o critério. O critério é este NOTICE.

## Idempotência das gravações críticas

Agendamento, abertura de caixa e movimentação geram o id NO FORMULÁRIO
e o repetem na nova tentativa. Se uma gravação chegou mas a resposta se
perdeu (timeout), o retry bate na chave primária e o sistema o trata
como confirmação — uma linha no banco, nunca duas. As guardas de
concorrência (um caixa aberto, uma meta por mês, protocolo único,
sobreposição de horário) moram no banco e estão testadas em
`testes/concorrencia-postgres-real.ts` contra um Postgres real.
