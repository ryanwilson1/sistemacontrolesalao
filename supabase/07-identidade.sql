-- =====================================================================
-- System Studio · Identidade do salão
-- Rode depois do 06-verificacao.sql.
-- =====================================================================
--
-- Esta etapa responde a uma pergunta de produto, não de infraestrutura:
-- **o portal parece pertencer ao salão, ou parece uma página do System
-- Studio?**
--
-- Até aqui, o studio tinha nome, telefone e Instagram. O suficiente para
-- funcionar e insuficiente para a cliente reconhecer de quem é o link
-- que chegou no WhatsApp dela.
--
-- As colunas abaixo existem para um lugar só guardar essa informação.
-- É a regra 19 do escopo, e ela é mais importante do que parece: se o
-- WhatsApp do salão morar em dois lugares, um dia eles divergem — e o
-- que a cliente vê é o errado, porque ninguém lembra de atualizar os
-- dois.
--
-- Nada aqui é obrigatório. Um salão sem logo, sem slogan e sem CNPJ
-- continua funcionando exatamente como antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------
alter table studio add column if not exists nome_fantasia   text;
alter table studio add column if not exists razao_social    text;
alter table studio add column if not exists cnpj            text;
alter table studio add column if not exists descricao       text;
alter table studio add column if not exists slogan          text;
alter table studio add column if not exists email           text;
alter table studio add column if not exists facebook        text;
alter table studio add column if not exists site            text;

-- Imagens. Guardamos a URL pública, não o arquivo: um `bytea` de logo
-- dentro da linha do studio faria toda leitura da configuração carregar
-- a imagem junto, inclusive nas telas que só querem o nome.
alter table studio add column if not exists logo_url        text;
alter table studio add column if not exists capa_url        text;

-- Cores próprias. Ficam separadas de `tema` de propósito: `tema` é uma
-- das paletas prontas, e estas duas são a escolha livre da proprietária.
-- Vazio significa "use a paleta", que é o padrão e continua valendo.
alter table studio add column if not exists cor_principal   text;
alter table studio add column if not exists cor_secundaria  text;

-- ---------------------------------------------------------------------
-- 2. O que pode entrar nesses campos
-- ---------------------------------------------------------------------
-- Cor precisa ser cor. Sem esta checagem, um valor colado errado vira
-- `background: undefined` e a marca some da tela sem erro nenhum.
do $$
declare
  r record;
  regras constant text[][] := array[
    ['studio','studio_cores_hex',
     $c$(cor_principal is null or cor_principal ~ '^#[0-9A-Fa-f]{6}$')
       and (cor_secundaria is null or cor_secundaria ~ '^#[0-9A-Fa-f]{6}$')$c$],
    ['studio','studio_email_plausivel',
     $c$email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$'$c$],
    ['studio','studio_cnpj_so_digitos',
     $c$cnpj is null or cnpj ~ '^[0-9]{14}$'$c$],
    -- As URLs de imagem vêm do nosso próprio Storage. Aceitar qualquer
    -- endereço deixaria a proprietária apontar a logo para um site de
    -- terceiro — que some, muda ou passa a servir outra coisa.
    ['studio','studio_imagens_https',
     $c$(logo_url is null or logo_url ~ '^https://')
       and (capa_url is null or capa_url ~ '^https://')$c$]
  ];
begin
  for r in select regras[i][1] as tabela, regras[i][2] as nome, regras[i][3] as cond
           from generate_subscripts(regras, 1) as i
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tabela, r.nome);
    execute format('alter table public.%I add constraint %I check (%s) not valid',
                   r.tabela, r.nome, r.cond);
    begin
      execute format('alter table public.%I validate constraint %I', r.tabela, r.nome);
    exception when others then
      raise notice 'Constraint % nao validada nos dados existentes: %', r.nome, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. O portal passa a conhecer a identidade
-- ---------------------------------------------------------------------
-- A lista de colunas continua explícita. É a mesma razão de antes: uma
-- coluna nova no futuro não vaza para o portal só por ter sido criada.
--
-- Repare no que NÃO entra: `razao_social` e `cnpj`. São dados de
-- contrato, úteis para a proprietária emitir nota — e nenhum assunto da
-- cliente que só quer marcar uma escova.
-- `drop` antes do `create`, e não `create or replace`.
--
-- O Postgres recusa trocar o tipo de retorno de uma função existente:
--
--   ERROR: cannot change return type of existing function
--
-- Como estamos acrescentando dez colunas à tabela devolvida, `create or
-- replace` aborta o arquivo inteiro na primeira execução — num projeto
-- que já rodou o 03-portal.sql, que é justamente o caso de todo mundo.
drop function if exists portal_studio(text);

create function portal_studio(p_identificador text)
returns table (
  id text, nome text, identificador text, telefone text, whatsapp text,
  instagram text, endereco text, tema text, agendamento_ativo boolean,
  antecedencia_minutos integer, horizonte_dias integer, intervalo_minutos integer,
  confirmacao_manual boolean, atendimentos_simultaneos integer,
  reserva_minutos integer, escolha_de_profissional boolean,
  aceita_solicitacoes boolean, lista_espera_ativa boolean,
  checkin_ativo boolean, recado_do_portal text, fuso text,
  nome_fantasia text, descricao text, slogan text, email text,
  facebook text, site text, logo_url text, capa_url text,
  cor_principal text, cor_secundaria text,
  /*
    `limite_diario` também aqui — e é este arquivo que decide.

    A correção do teto diário entrou no 03-portal.sql, mas ESTA função
    roda depois e faz `drop function` antes de recriar. O resultado era
    a correção ser desfeita em silêncio: o 03 devolvia o limite, o 07
    apagava a função e criava outra sem ele, e o link público voltava a
    aceitar agendamento acima do teto.

    Duas definições da mesma função em arquivos diferentes é uma
    armadilha, e esta foi a primeira vez que ela disparou. Enquanto as
    duas existirem, TODA coluna nova precisa entrar nas duas — e a que
    vale é sempre a do arquivo de número maior.
  */
  limite_diario integer
)
language sql security definer set search_path = public stable as $fn$
  select s.id, s.nome, s.identificador, s.telefone, s.whatsapp,
         s.instagram, s.endereco, s.tema, s.agendamento_ativo,
         s.antecedencia_minutos, s.horizonte_dias, s.intervalo_minutos,
         s.confirmacao_manual, s.atendimentos_simultaneos,
         s.reserva_minutos, s.escolha_de_profissional,
         s.aceita_solicitacoes, s.lista_espera_ativa,
         s.checkin_ativo, s.recado_do_portal, s.fuso,
         s.nome_fantasia, s.descricao, s.slogan, s.email,
         s.facebook, s.site, s.logo_url, s.capa_url,
         s.cor_principal, s.cor_secundaria,
         s.limite_diario
  from studio s
  where p_identificador is null or s.identificador = p_identificador
  limit 1;
$fn$;

revoke all on function portal_studio(text) from public;
grant execute on function portal_studio(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Onde as imagens ficam
-- ---------------------------------------------------------------------
/*
  Um bucket público chamado `identidade`.

  Público na leitura porque a logo aparece no link que a cliente abre
  sem login — é o mesmo caso do favicon de um site. Fechado na escrita
  porque só a equipe da casa troca a marca do salão.

  O bloco tolera a ausência do schema `storage`: quem estiver rodando
  estes arquivos num Postgres comum, para testar, não tem a extensão de
  Storage do Supabase e não deveria travar por causa disso.
*/
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Schema storage ausente — pulei o bucket. Normal fora do Supabase.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'identidade', 'identidade', true,
    2 * 1024 * 1024,                       -- 2 MB: logo de salão não precisa de mais
    array['image/png','image/jpeg','image/webp']
  )
  on conflict (id) do update
    set public             = true,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- SVG fica de fora da lista, e não por descuido: um SVG é um documento
  -- XML que pode carregar <script>. Servido do nosso próprio domínio,
  -- ele executaria com as permissões do sistema. Aceitar SVG exigiria
  -- higienizar o arquivo no servidor, e não temos servidor.

  execute $pol$drop policy if exists "identidade visivel para todos" on storage.objects$pol$;
  execute $pol$create policy "identidade visivel para todos" on storage.objects
            for select using (bucket_id = 'identidade')$pol$;

  execute $pol$drop policy if exists "so a equipe troca a marca" on storage.objects$pol$;
  execute $pol$create policy "so a equipe troca a marca" on storage.objects
            for all to authenticated
            -- Trocar a marca do salão é ajuste de identidade, não de
            -- agenda. Acesso restrito não mexe no logo de ninguém.
            using (bucket_id = 'identidade' and (select equipe_com_acesso_completo()))
            with check (bucket_id = 'identidade' and (select equipe_com_acesso_completo()))$pol$;

  raise notice 'Bucket identidade pronto.';
end $$;

-- ---------------------------------------------------------------------
-- 5. Preenche o que dá para deduzir
-- ---------------------------------------------------------------------
-- Nome fantasia vazio é o nome do studio. Deixar nulo obrigaria toda
-- tela a escrever `coalesce` — e uma delas esqueceria.
update studio set nome_fantasia = nome where nome_fantasia is null;

-- ---------------------------------------------------------------------
-- 6. Pulso: o health check sem efeito colateral
-- ---------------------------------------------------------------------
-- O indicador de conexão precisa perguntar "o banco responde?" a cada
-- poucos segundos. Ele fazia isso chamando `portal_faxina()`, que marca
-- reservas vencidas — ou seja, **verificar a rede alterava a agenda**.
--
-- Um teste de conexão tem de ser observação pura. Esta função não lê
-- tabela nenhuma, não escreve nada e não revela informação: devolve o
-- horário do servidor, que é o suficiente para saber que ele está de pé
-- e de quebra denuncia relógio de aparelho fora de hora.
create or replace function pulso()
returns timestamptz
language sql security definer set search_path = public stable as $fn$
  select now();
$fn$;

revoke all on function pulso() from public;
grant execute on function pulso() to anon, authenticated;
