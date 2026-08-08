# Operação do System Studio

Este arquivo responde às perguntas que aparecem depois que o sistema já
está no ar. Ele é para quem administra — não para a cliente que agenda.

---

## 1. Instalar do zero

### 1.1 Banco

No **SQL Editor** do seu projeto Supabase, rode os arquivos de
`supabase/` **nesta ordem**, um de cada vez, conferindo o resultado
antes de seguir:

| Arquivo | O que faz |
|---|---|
| `01-esquema.sql` | Cria as tabelas, os índices e a restrição contra horário duplicado |
| `02-seguranca.sql` | **Tranca tudo.** Sem ele, seus dados ficam públicos |
| `03-portal.sql` | Abre só o que o portal da cliente precisa |
| `04-tempo-real.sql` | Liga a sincronia entre aparelhos |
| `05-integridade.sql` | Regras de negócio no banco e trilha de auditoria |
| `06-verificacao.sql` | **Confere tudo.** Não altera nada |
| `07-identidade.sql` | Logo, cores e dados do salão + bucket de imagens |
| `08-transacoes.sql` | Conclusão de atendimento e estoque em transação única |
| `09-concorrencia.sql` | Versão dos registros, restauração transacional e check-in |

O `06` devolve uma tabela com uma linha por checagem. **Nenhuma pode
estar marcada `[!] FALHA`** antes de o link ir para o WhatsApp de
alguém.

### 1.2 Primeira conta

Em **Authentication → Users → Add user**, crie o e-mail da proprietária
com uma senha inicial. Depois, no SQL Editor:

```sql
select autorizar_conta('proprietaria@gmail.com');
```

**Este segundo passo não é opcional.** Sem ele a pessoa consegue fazer
login e não enxerga nada — é assim de propósito: criar conta e ter
acesso passaram a ser duas decisões separadas.

Para ligar a conta a alguém da equipe (o nome aparece no painel):

```sql
select autorizar_conta('carol@gmail.com', 'profissional', 'id-da-carol');
```

Papéis aceitos: `proprietaria`, `gerente`, `profissional`, `recepcao`.

### 1.3 Fechar o cadastro aberto

**Authentication → Providers → Email → desmarque _Allow new users to
sign up_.**

Depois do `02-seguranca.sql` isto virou a segunda tranca em vez da
única — mas continue fazendo. Duas trancas custam um clique.

### 1.4 Vercel

Em **Settings → Environment Variables**, para Production e Preview:

```
VITE_SUPABASE_URL       = https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY  = a chave anon do projeto
```

A `service_role` **nunca** entra aqui. Ela ignora o RLS.

O `vercel.json` já cuida do resto: rotas que não dão 404 ao recarregar,
cabeçalhos de segurança e cache.

### 1.5 URLs de autenticação

Em **Authentication → URL Configuration** do Supabase:

- **Site URL**: `https://seu-dominio.vercel.app`
- **Redirect URLs**: acrescente `https://seu-dominio.vercel.app/nova-senha`

Sem a segunda, o link de "Esqueci minha senha" chega no e-mail e não
abre a tela de trocar senha.

---

## 2. Backup

### 2.1 Quem faz o quê

| O quê | Quem faz | Onde fica |
|---|---|---|
| Cópia diária do banco inteiro | **Supabase**, sozinho | Painel → Database → Backups |
| Arquivo `.json` do studio | **Você**, quando clicar | O download que você baixar |
| Histórico dentro do sistema | Ninguém — é só da aba aberta | Some ao recarregar |

A terceira linha é a que costuma confundir. A lista de backups dentro do
sistema **não é um cofre**: com banco ligado, ela vive na memória da
aba. O que protege de verdade são as duas primeiras linhas.

### 2.2 Rotina recomendada

- **Toda semana**: Backup → Exportar. Salve o arquivo fora do
  computador do salão (e-mail para você mesma, Google Drive, pen drive).
- **Antes de qualquer mexida grande**: exporte de novo.
- **Confira uma vez por mês** que o Supabase está mesmo guardando
  cópias: Painel → Database → Backups.

Planos gratuitos do Supabase costumam ter retenção curta ou nenhuma.
Confira o seu — se não houver cópia automática, o arquivo exportado
passa a ser sua única rede.

### 2.3 Restaurar

**Do arquivo `.json`**: Backup → Importar. O sistema cria uma cópia de
segurança antes de sobrescrever.

**Do banco inteiro**: Painel do Supabase → Database → Backups →
Restore. Isto devolve o banco a um momento anterior e **desfaz tudo que
veio depois**, inclusive agendamentos que entraram nesse meio-tempo.

**De uma exclusão específica** — sem desfazer o resto:

```sql
-- 1. ache o que sumiu
select id, em, usuario_email, tabela, registro_id,
       dados_anteriores->>'nome' as nome
from auditoria
where operacao = 'DELETE' and tabela = 'clientes'
order by em desc limit 20;

-- 2. traga de volta
select restaurar_da_trilha(1234);
```

---

## 3. Perguntas do dia a dia

### "Esqueci minha senha"

Na tela de entrada, clique em **Esqueci minha senha**. O link chega no
e-mail e abre a tela de senha nova. Vale por pouco tempo e só uma vez.

Se o e-mail não chegar: confira spam, e confira em Authentication →
Logs se o Supabase tentou enviar. Projetos novos têm limite baixo de
e-mails por hora.

### "Preciso tirar o acesso de alguém"

```sql
select revogar_conta('pessoa@gmail.com');
```

O histórico do que ela fez continua na trilha de auditoria. Para
reativar, `autorizar_conta` de novo.

### "Uma profissional saiu do salão"

**Desative** o cadastro dela (interruptor na tela de Equipe). Não
apague: o banco recusa a exclusão de quem tem atendimentos no
histórico, e é isso que mantém a agenda antiga com sentido.

Depois de desativada, ela não recebe agendamento novo — nem pelo painel,
nem pelo link.

### "Uma cliente pediu para apagar os dados dela"

Desative a ficha primeiro. Se a exclusão for mesmo obrigatória (a LGPD
permite reter o que é necessário para obrigação legal e fiscal),
converse com sua contabilidade antes: os lançamentos financeiros
ligados aos atendimentos dela costumam precisar ficar.

### "O sistema está mostrando o ponto vermelho"

🔴 significa que a última conversa com o servidor falhou. **Nada do que
você digitou depois disso foi salvo.** Confira a internet, clique em
"Tentar de novo" na faixa vermelha, e refaça a última ação.

### "Como sei se está tudo bem?"

Rode `06-verificacao.sql` no SQL Editor. Leva dois segundos e responde
em quinze linhas.

### "Dois agendamentos no mesmo horário"

Não deveria acontecer: o banco tem uma restrição de exclusão que recusa
o segundo. Se acontecer, é sinal de que o `01-esquema.sql` não foi
aplicado por inteiro. Rode o `06-verificacao.sql` — a linha "Agenda sem
sobreposição" vai apontar.

### "Horários presos sem ninguém"

```sql
select limpar_reservas();
```

Acontece sozinho a cada uso do portal. Se quiser que aconteça também de
madrugada, com todo navegador fechado, e o seu plano tiver `pg_cron`:

```sql
select cron.schedule('faxina-reservas', '*/5 * * * *',
                     $$select limpar_reservas()$$);
```

---

## 4. Configurar um salão novo

1. Crie um projeto no Supabase e rode os seis arquivos SQL.
2. Publique na Vercel com as duas variáveis de ambiente.
3. Crie a conta da proprietária e rode `autorizar_conta`.
4. Entre no sistema e preencha, nesta ordem:
   - **Configurações → Identidade**: nome, telefone, endereço, tema
   - **Configurações → Horários**: dias e horas de funcionamento
   - **Configurações → Equipe**: quem atende
   - **Serviços**: nome, preço, duração, quem faz
   - **Portal**: recado, escolha de profissional, confirmação manual
5. Copie o link em Portal → Configuração e mande no WhatsApp.

O QR Code é gerado no próprio navegador e sai em SVG — dá para imprimir
em qualquer tamanho sem perder qualidade.

---

## 5. O que ainda depende de gente

Coisas que o sistema **não** faz sozinho, ditas aqui para não virarem
surpresa:

- **Não envia WhatsApp automaticamente.** Os lembretes ficam numa fila e
  alguém precisa disparar. Integrar exige API oficial, que é paga.
- **Não cobra nem emite nota.**
- **Não faz backup do banco.** Isso é do Supabase.
- **Não avisa a lista de espera sozinha** — por decisão de produto: às
  vezes um cancelamento é o respiro do dia.

---

## Imagens do salão (logo e capa)

O `07-identidade.sql` cria um bucket chamado `identidade` no Supabase
Storage e as políticas dele. Não há nada a configurar no painel — o
arquivo faz tudo.

**Como funciona a permissão:** leitura pública, escrita só para quem
está em `contas_equipe`. Público na leitura porque a logo aparece no
link que a cliente abre sem login, igual ao favicon de um site.

**O que o sistema aceita:** PNG, JPG e WEBP, até 2 MB.

**Por que SVG não entra:** um SVG é um documento XML e pode conter
`<script>`. Servido do nosso próprio domínio, ele executaria com as
permissões de quem estivesse olhando a página. Aceitar SVG com
segurança exigiria higienizar o arquivo no servidor, e não há servidor.

**O tipo do arquivo é conferido pelos bytes, não pela extensão.**
Renomear `programa.exe` para `logo.png` engana o navegador e não engana
a checagem: todo PNG começa com a mesma assinatura de oito bytes, e
nenhum executável começa com ela.

### Se o envio falhar

| Mensagem na tela | O que fazer |
|---|---|
| "A área de imagens não está configurada" | Rode `07-identidade.sql` |
| "Sua sessão expirou" | Saia e entre de novo |
| "A imagem é grande demais" | Reduza para menos de 2 MB |
| "Este arquivo não é uma imagem PNG, JPG ou WEBP" | O arquivo não é o que a extensão diz |

### Imagens antigas

Trocar a logo envia um arquivo novo com nome novo e apaga o anterior.
Se a remoção falhar, sobra um arquivo órfão no bucket — inofensivo, e
visível em **Storage → identidade** para limpeza manual.

---

## Conferir se algum atendimento ficou pela metade

Antes da correção, concluir um atendimento eram seis gravações
independentes disparadas do navegador. Uma queda de sinal no meio
deixava o banco inconsistente — e o mais comum era o atendimento fechar
sem a receita entrar, fazendo o dia terminar com menos dinheiro do que
realmente entrou.

Para saber se sobrou algo de antes, rode no SQL Editor:

```sql
select * from conferir_atendimentos();
```

**Zero linhas é o resultado esperado.** Cada linha que aparecer aponta
um estado pela metade:

| Problema | O que significa | Como resolver |
|---|---|---|
| Atendimento concluído sem receita | O dinheiro não entrou no financeiro | Lance a receita à mão em Financeiro |
| Receita sem atendimento concluído | O financeiro tem dinheiro a mais | Confira o atendimento na agenda |
| Pontos sem atendimento concluído | A cliente ganhou pontos por algo que não aconteceu | Ajuste em Fidelidade |
| Movimento de caixa sem atendimento | O caixa do dia não vai fechar | Confira o movimento em Caixa |
| Produto com saldo negativo | Baixa aplicada sem saldo | Faça um ajuste de entrada em Estoque |

A partir do `08-transacoes.sql`, novos casos não aparecem: as seis
gravações passaram a acontecer dentro de uma função do Postgres, que
roda inteira ou não roda.
