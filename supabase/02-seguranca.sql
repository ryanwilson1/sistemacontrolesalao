-- =====================================================================
-- System Studio · Segurança
-- Rode depois do 01-esquema.sql.
-- =====================================================================
--
-- A premissa que decide tudo aqui:
--
--   A chave `anon` é PÚBLICA. Ela viaja dentro do JavaScript que o
--   navegador baixa. Qualquer pessoa que abrir o link do agendamento
--   consegue extraí-la em segundos, e não existe forma de escondê-la.
--
-- Então a pergunta certa nunca é "como escondo a chave". É: **o que
-- alguém de posse dela consegue fazer?**
--
-- Sem RLS, a resposta é: tudo. Este comando, rodado por qualquer pessoa
-- do mundo, devolveria a lista inteira de clientes do studio —
-- telefone, aniversário e o campo de observações, que guarda coisas do
-- tipo "alérgica a amônia":
--
--   curl 'https://SEU-PROJETO.supabase.co/rest/v1/clientes?select=*' \
--        -H "apikey: CHAVE_ANON_PUBLICA"
--
-- Este arquivo fecha essa porta: `anon` não enxerga tabela nenhuma.
-- O portal público continua funcionando porque fala com o banco por
-- funções estreitas (03-portal.sql), que devolvem só o necessário.
--
-- ---------------------------------------------------------------------
-- O QUE MUDOU NESTA VERSÃO — e por que era grave
-- ---------------------------------------------------------------------
--
-- A versão anterior dizia: "quem fez login enxerga o studio inteiro".
-- A política era `for all to authenticated using (true)`.
--
-- O problema não está na frase, está no que a completa: **quem decide
-- se alguém consegue fazer login não é este arquivo — é uma caixinha
-- no painel do Supabase, e ela vem MARCADA por padrão.**
--
-- Com "Allow new users to sign up" ligado — o padrão — a sequência é:
--
--   1. qualquer pessoa abre o link público do salão;
--   2. extrai a chave anon do JavaScript (segundos);
--   3. chama /auth/v1/signup com um e-mail qualquer;
--   4. recebe um token de `authenticated`;
--   5. `using (true)` entrega a ficha de todas as clientes.
--
-- Toda a proteção dependia de um passo manual, feito uma vez, numa tela
-- que ninguém revisita. Isso não é segurança — é sorte com prazo.
--
-- Agora a fronteira mora no banco: existir em `auth.users` deixou de
-- bastar. É preciso estar em `contas_equipe`, e só quem já tem acesso
-- ao SQL Editor coloca alguém lá. Um cadastro espontâneo passa a
-- receber um token que não abre porta nenhuma.
--
-- Continua valendo desligar o cadastro aberto no painel. A diferença é
-- que agora isso é a segunda tranca, não a única.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem é da casa
-- ---------------------------------------------------------------------
create table if not exists contas_equipe (
  usuario_id      uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  profissional_id text references profissionais(id) on delete set null,
  papel           text not null default 'proprietaria'
                  check (papel in ('proprietaria','gerente','profissional','recepcao')),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  desativado_em   timestamptz
);

create index if not exists contas_equipe_ativas on contas_equipe (usuario_id) where ativo;

comment on table contas_equipe is
  'Contas autorizadas a usar o painel. Estar em auth.users nao basta.';

-- Autoriza uma conta pelo e-mail. É o comando que a administradora roda
-- no SQL Editor depois de criar o usuário em Authentication → Users.
create or replace function autorizar_conta(
  p_email text,
  p_papel text default 'proprietaria',
  p_profissional_id text default null
) returns contas_equipe
language plpgsql security definer set search_path = public, auth as $fn$
declare
  v_id    uuid;
  v_linha contas_equipe%rowtype;
begin
  select id into v_id from auth.users
  where lower(email) = lower(btrim(p_email)) limit 1;

  if v_id is null then
    raise exception
      'Nenhum usuario com o e-mail %. Crie primeiro em Authentication -> Users.', p_email;
  end if;

  insert into contas_equipe (usuario_id, email, papel, profissional_id, ativo, desativado_em)
  values (v_id, lower(btrim(p_email)), p_papel, p_profissional_id, true, null)
  on conflict (usuario_id) do update
    set email           = excluded.email,
        papel           = excluded.papel,
        profissional_id = coalesce(excluded.profissional_id, contas_equipe.profissional_id),
        ativo           = true,
        desativado_em   = null
  returning * into v_linha;

  return v_linha;
end $fn$;

-- Tira o acesso sem apagar o histórico de quem fez o quê.
create or replace function revogar_conta(p_email text)
returns void language sql security definer set search_path = public as $fn$
  update contas_equipe
     set ativo = false, desativado_em = now()
   where lower(email) = lower(btrim(p_email));
$fn$;

-- Só pelo SQL Editor. Deixar isto ao alcance da chave pública seria
-- devolver a porta que acabamos de fechar.
revoke all on function autorizar_conta(text,text,text) from public, anon, authenticated;
revoke all on function revogar_conta(text)             from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Bootstrap: quem já usava o sistema continua entrando
-- ---------------------------------------------------------------------
-- Sem isto, aplicar este arquivo num studio em funcionamento trancaria
-- a proprietária para fora até alguém rodar `autorizar_conta`. Quem já
-- tinha conta antes da tranca existir entra na lista automaticamente;
-- a partir daqui, cada nova conta é uma decisão escrita.
insert into contas_equipe (usuario_id, email)
select u.id, coalesce(u.email, u.id::text)
from auth.users u
on conflict (usuario_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. A pergunta que toda política faz
-- ---------------------------------------------------------------------
-- `security definer` porque a própria `contas_equipe` está sob RLS: sem
-- isso a checagem precisaria de permissão para ler a tabela que decide
-- as permissões, e o argumento andaria em círculo.
--
-- `stable` para o Postgres avaliar uma vez por consulta em vez de uma
-- vez por linha. Numa agenda com trinta mil registros a diferença entre
-- as duas coisas é a tela abrir ou travar.
create or replace function equipe_autorizada() returns boolean
language sql security definer set search_path = public, auth stable as $fn$
  select exists (
    select 1 from contas_equipe c
    where c.usuario_id = auth.uid() and c.ativo
  );
$fn$;

-- O papel de quem está usando. As telas já sabem disto pelo React;
-- aqui serve para as políticas que dependem de cargo.
create or replace function papel_da_conta() returns text
language sql security definer set search_path = public, auth stable as $fn$
  select c.papel from contas_equipe c
  where c.usuario_id = auth.uid() and c.ativo
  limit 1;
$fn$;

revoke all on function equipe_autorizada() from public;
revoke all on function papel_da_conta()    from public;
grant execute on function equipe_autorizada() to authenticated;
grant execute on function papel_da_conta()    to authenticated;

-- ---------------------------------------------------------------------
-- 4. Liga o RLS em tudo
-- ---------------------------------------------------------------------
-- Sem política declarada, RLS ligado significa "ninguém vê nada". É o
-- padrão certo: cada permissão passa a ser uma decisão escrita, não um
-- esquecimento.
--
-- `force` fica de fora de propósito. Ele sujeitaria também o dono da
-- tabela ao RLS — e é justamente com os poderes do dono que as funções
-- `security definer` do portal leem a agenda para responder "das 14h às
-- 16h está ocupado". Com `force`, o portal público pararia de funcionar
-- de um jeito difícil de diagnosticar: sem erro, só uma grade vazia.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I no force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Tira o acesso direto de quem não fez login
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines  in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- O Postgres deixa qualquer papel executar função recém-criada. Sem
-- esta linha, uma função nova nasce aberta ao público e desfaz sozinha
-- o que este arquivo fez — sem ninguém notar.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- 6. Quem é da equipe enxerga o studio inteiro
-- ---------------------------------------------------------------------
-- O painel é ferramenta de trabalho de uma equipe pequena que já
-- compartilha tudo no dia a dia. Recortar por papel dentro do banco
-- daria uma falsa sensação de compartimento: a recepção precisa da
-- agenda completa para atender o telefone.
--
-- O que o papel controla é a interface — quais telas aparecem — e isso
-- vive em `constants/dominio.ts`. Aqui a fronteira é outra: **está na
-- lista da casa ou não está.**
grant usage on schema public to authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'contas_equipe'
  loop
    execute format('drop policy if exists "equipe autenticada" on public.%I', t);
    execute format('drop policy if exists "equipe da casa" on public.%I', t);
    execute format(
      'create policy "equipe da casa" on public.%I
       for all to authenticated
       using ((select equipe_autorizada()))
       with check ((select equipe_autorizada()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. A tabela que decide quem entra tem regra própria
-- ---------------------------------------------------------------------
-- Uma pessoa da equipe pode ler a própria linha — é assim que o painel
-- descobre o papel dela. Ninguém escreve aqui pela API: promover-se a
-- proprietária não pode ser uma requisição HTTP.
drop policy if exists "equipe da casa"      on public.contas_equipe;
drop policy if exists "equipe autenticada"  on public.contas_equipe;
drop policy if exists "ver a propria conta" on public.contas_equipe;

create policy "ver a propria conta" on public.contas_equipe
  for select to authenticated
  using (usuario_id = auth.uid());

revoke insert, update, delete on public.contas_equipe from authenticated, anon;

-- ---------------------------------------------------------------------
-- 8. Confira depois de rodar
-- ---------------------------------------------------------------------
-- O arquivo 06-verificacao.sql faz todas as conferências de uma vez.
-- As duas mais importantes, para quem quiser conferir na mão:
--
--   -- deve devolver zero linhas
--   select tablename from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
--
--   -- deve listar exatamente as contas que você reconhece
--   select email, papel, ativo from contas_equipe order by criado_em;
--
-- E este teste, com a chave anon, deve devolver erro de permissão:
--
--   curl 'https://SEU-PROJETO.supabase.co/rest/v1/clientes?select=*' \
--        -H "apikey: CHAVE_ANON"
--
-- Se devolver dados, pare e não publique o site.
