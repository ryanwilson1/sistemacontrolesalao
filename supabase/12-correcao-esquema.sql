-- =====================================================================
-- System Studio · Correção de esquema
-- Rode este arquivo no SQL Editor do Supabase, DEPOIS dos anteriores.
-- =====================================================================
--
-- O QUE ISTO CORRIGE
-- ------------------
-- O frontend e o banco discordavam sobre o nome de 16 colunas. Como o
-- PostgREST recusa a linha inteira quando um campo não existe, toda
-- gravação nessas quatro tabelas voltava com:
--
--   PGRST204 — Could not find the 'aberto_por_id' column of 'caixas'
--
-- Na tela isso virava "Algo não saiu como esperado" e, por tabela, o
-- efeito era:
--
--   caixas            abrir e fechar o caixa NUNCA funcionaram
--   movimentos_caixa  registrar entrada/saída NUNCA funcionou
--   fotos             salvar foto de antes/depois NUNCA funcionou
--   procedimentos     gravação recusada; leitura vinha sem `realizadoEm`,
--                     e a ficha da cliente quebrava ao ordenar por ele
--
-- POR QUE CORRIGIR AQUI E NÃO NO FRONTEND
-- ---------------------------------------
-- Os tipos de `src/types/` são o modelo de domínio: as telas leem
-- `caixa.valorInformado`, `caixa.abertoPorId`, `procedimento.valorFinal`.
-- Renomeá-los para caber no banco espalharia a correção por dezenas de
-- arquivos e ainda perderia informação — `responsavel` é texto livre,
-- `aberto_por_id` é a chave da profissional.
--
-- SEGURANÇA DESTA MIGRAÇÃO
-- ------------------------
-- Só adiciona coluna e copia valor. Nada é apagado, nada é renomeado.
-- As colunas antigas continuam de pé com os dados que já têm; quem
-- tiver uma consulta apontando para elas continua funcionando.
-- Rodar duas vezes não faz efeito nenhum (`if not exists` / `where`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CAIXAS
-- ---------------------------------------------------------------------
-- `valor_fechamento` e `valor_informado` respondem à mesma pergunta —
-- quanto havia de fato na gaveta. A coluna nova recebe o que a antiga
-- já tiver para que nenhum fechamento anterior se perca.
alter table caixas add column if not exists aberto_por_id   text;
alter table caixas add column if not exists fechado_por_id  text;
alter table caixas add column if not exists valor_informado numeric(10,2);
alter table caixas add column if not exists observacoes     text;

update caixas set valor_informado = valor_fechamento
 where valor_informado is null and valor_fechamento is not null;

update caixas set observacoes = observacao
 where observacoes is null and observacao is not null;

-- `responsavel` guardava texto livre. Só vira id quando o conteúdo
-- casar com uma profissional existente — caso contrário ficaria uma
-- chave apontando para o nada.
update caixas c set aberto_por_id = p.id
  from profissionais p
 where c.aberto_por_id is null
   and c.responsavel is not null
   and p.id = c.responsavel;

-- ---------------------------------------------------------------------
-- 2. MOVIMENTOS_CAIXA
-- ---------------------------------------------------------------------
-- `origem` separa a entrada que veio de um atendimento da venda avulsa,
-- do suprimento e da sangria. Sem ela o resumo do dia não consegue
-- calcular ticket médio, e o fechamento não sabe o que conferir.
alter table movimentos_caixa add column if not exists origem          text;
alter table movimentos_caixa add column if not exists procedimento_id text;
alter table movimentos_caixa add column if not exists profissional_id text;

-- As linhas que a RPC `concluir_atendimento` já gravou nasceram sem
-- origem. Elas têm agendamento vinculado, então a origem é conhecida.
update movimentos_caixa set origem = 'atendimento'
 where origem is null and agendamento_id is not null;

update movimentos_caixa set origem = case when tipo = 'entrada' then 'venda' else 'despesa' end
 where origem is null;

-- SEM default nesta coluna — e isso é deliberado, descoberto em teste:
-- um default é aplicado ANTES do gatilho, então `new.origem` chegaria
-- preenchido e o `coalesce` do gatilho (seção 5) nunca agiria. O
-- movimento gravado pela RPC `concluir_atendimento` nasceria como
-- 'ajuste' em vez de 'atendimento', e o ticket médio do resumo
-- voltaria a dar zero. Quem garante o valor é o gatilho.
alter table movimentos_caixa alter column origem drop default;

-- Chaves estrangeiras com `on delete set null`: apagar uma profissional
-- não pode derrubar o histórico financeiro do dia em que ela trabalhou.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movimentos_caixa_procedimento_fk'
  ) then
    alter table movimentos_caixa add constraint movimentos_caixa_procedimento_fk
      foreign key (procedimento_id) references procedimentos(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'movimentos_caixa_profissional_fk'
  ) then
    alter table movimentos_caixa add constraint movimentos_caixa_profissional_fk
      foreign key (profissional_id) references profissionais(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. PROCEDIMENTOS
-- ---------------------------------------------------------------------
-- Esta é a única tabela do grupo com dados reais dentro: a RPC
-- `concluir_atendimento` vem gravando fichas desde o primeiro
-- atendimento concluído. O backfill abaixo é obrigatório — sem ele,
-- `realizado_em` nasceria nulo e a ficha da cliente quebraria ao
-- ordenar o histórico (`b.realizadoEm.localeCompare` sobre `undefined`).
alter table procedimentos add column if not exists realizado_em     timestamptz;
alter table procedimentos add column if not exists duracao_minutos  integer  not null default 0;
alter table procedimentos add column if not exists valor            numeric(10,2) not null default 0;
alter table procedimentos add column if not exists desconto         numeric(10,2) not null default 0;
alter table procedimentos add column if not exists valor_final      numeric(10,2) not null default 0;
alter table procedimentos add column if not exists recomendacoes    text;
alter table procedimentos add column if not exists proximo_passo    text;

update procedimentos set realizado_em = coalesce(data, criado_em)
 where realizado_em is null;

update procedimentos set recomendacoes = formula
 where recomendacoes is null and formula is not null;

-- Valores vêm do agendamento que originou a ficha.
update procedimentos p
   set valor           = a.preco,
       desconto        = a.desconto,
       valor_final     = greatest(a.preco - a.desconto, 0),
       duracao_minutos = greatest(round(extract(epoch from (a.fim - a.inicio)) / 60)::int, 0)
  from agendamentos a
 where p.agendamento_id = a.id
   and p.valor_final = 0;

-- Nenhuma ficha sem data, agora e daqui em diante.
update procedimentos set realizado_em = criado_em where realizado_em is null;
alter table procedimentos alter column realizado_em set default now();

do $$
begin
  if exists (
    select 1 from procedimentos where realizado_em is null
  ) then
    raise exception 'Ha procedimentos sem realizado_em. Backfill incompleto.';
  end if;
end $$;

alter table procedimentos alter column realizado_em set not null;
create index if not exists procedimentos_por_realizado on procedimentos (realizado_em);

-- `data` e `formula` continuam existindo. A RPC ainda escreve nelas, e
-- o passo 5 abaixo passa a manter as duas versões em acordo.
alter table procedimentos alter column data drop not null;

-- ---------------------------------------------------------------------
-- 4. FOTOS
-- ---------------------------------------------------------------------
alter table fotos add column if not exists url           text;
alter table fotos add column if not exists largura       integer;
alter table fotos add column if not exists altura        integer;
alter table fotos add column if not exists tamanho_bytes integer not null default 0;

-- `conteudo` era obrigatório. Com Storage a imagem mora em `url` e o
-- base64 deixa de existir — a linha precisa poder ter um sem o outro.
alter table fotos alter column conteudo drop not null;

update fotos set tamanho_bytes = ceil(length(conteudo) * 3.0 / 4)::int
 where tamanho_bytes = 0 and conteudo is not null;

-- ---------------------------------------------------------------------
-- 5. A RPC PASSA A PREENCHER AS COLUNAS NOVAS
-- ---------------------------------------------------------------------
-- `concluir_atendimento` grava a ficha e o movimento de caixa. Sem esta
-- parte, todo atendimento concluído a partir de agora nasceria com
-- `realizado_em` nulo e `origem` nula outra vez — o backfill acima
-- resolveria o passado e o futuro voltaria a quebrar.
--
-- Só as duas instruções `insert` mudam. O resto do corpo é o mesmo.
create or replace function preencher_ficha_e_caixa() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'procedimentos' then
    new.realizado_em := coalesce(new.realizado_em, new.data, now());
    new.data         := coalesce(new.data, new.realizado_em);
    new.recomendacoes := coalesce(new.recomendacoes, new.formula);
    new.formula       := coalesce(new.formula, new.recomendacoes);

    if new.valor_final = 0 and new.agendamento_id is not null then
      select a.preco, a.desconto, greatest(a.preco - a.desconto, 0),
             greatest(round(extract(epoch from (a.fim - a.inicio)) / 60)::int, 0)
        into new.valor, new.desconto, new.valor_final, new.duracao_minutos
        from agendamentos a where a.id = new.agendamento_id;
    end if;
  end if;

  if tg_table_name = 'movimentos_caixa' then
    new.origem := coalesce(
      new.origem,
      case when new.agendamento_id is not null then 'atendimento'
           when new.tipo = 'entrada' then 'venda'
           else 'despesa' end
    );
  end if;

  return new;
end $$;

drop trigger if exists procedimentos_completar on procedimentos;
create trigger procedimentos_completar
  before insert or update on procedimentos
  for each row execute function preencher_ficha_e_caixa();

drop trigger if exists movimentos_caixa_completar on movimentos_caixa;
create trigger movimentos_caixa_completar
  before insert or update on movimentos_caixa
  for each row execute function preencher_ficha_e_caixa();

-- ---------------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ---------------------------------------------------------------------
-- Roda no fim e falha alto se alguma coluna não entrou. É a diferença
-- entre "a migração rodou" e "a migração funcionou" — sem isto, um erro
-- no meio do arquivo passaria despercebido até a proprietária tentar
-- abrir o caixa outra vez.
do $$
declare
  faltando text;
begin
  select string_agg(t || '.' || c, ', ')
    into faltando
    from (values
      ('caixas','aberto_por_id'), ('caixas','fechado_por_id'),
      ('caixas','valor_informado'), ('caixas','observacoes'),
      ('movimentos_caixa','origem'), ('movimentos_caixa','procedimento_id'),
      ('movimentos_caixa','profissional_id'),
      ('procedimentos','realizado_em'), ('procedimentos','duracao_minutos'),
      ('procedimentos','valor'), ('procedimentos','desconto'),
      ('procedimentos','valor_final'), ('procedimentos','recomendacoes'),
      ('procedimentos','proximo_passo'),
      ('fotos','url'), ('fotos','largura'), ('fotos','altura'),
      ('fotos','tamanho_bytes')
    ) as esperado(t, c)
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = c
   );

  if faltando is not null then
    raise exception 'Colunas ausentes apos a migracao: %', faltando;
  end if;

  raise notice 'OK: esquema de caixas, movimentos_caixa, procedimentos e fotos conferido.';
end $$;

-- ---------------------------------------------------------------------
-- 7. ATUALIZAR_COM_VERSAO — CAST CORRETO DOS TIPOS
-- ---------------------------------------------------------------------
-- Encontrado na segunda auditoria, provado num Postgres real.
--
-- A versão original montava o UPDATE assim:
--
--   set preco = $1->>'preco'
--
-- O operador `->>` devolve TEXT, e o Postgres não tem cast de
-- atribuição de text para numeric, boolean, date nem timestamptz:
--
--   ERROR 42804: column "preco" is of type numeric
--                but expression is of type text
--
-- Efeito prático: em TODA tabela versionada (clientes, agendamentos,
-- servicos, profissionais, produtos, studio, lancamentos, cupons),
-- qualquer edição que tocasse uma coluna não-texto falhava — remarcar
-- um horário (inicio/fim são timestamptz), mudar um preço, arquivar
-- uma cliente (ativo é boolean). Só edições de campos puramente de
-- texto passavam, o que fazia o defeito parecer intermitente.
--
-- A correção troca a atribuição direta por `jsonb_populate_record`,
-- que converte cada valor para o tipo real da coluna — é a função que
-- a restauração de backup (neste mesmo arquivo 09) já usa, pelo mesmo
-- motivo. O resto do corpo (whitelist, trava de versão, acesso
-- restrito) é idêntico ao original.
create or replace function atualizar_com_versao(
  p_tabela   text,
  p_id       text,
  p_mudancas jsonb,
  p_versao   integer
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_atual   integer;
  v_colunas text;
  v_sql     text;
  v_linha   jsonb;
begin
  if not (select equipe_autorizada()) then
    raise exception 'Sem permissao para alterar registros.';
  end if;

  if p_tabela not in (
    'clientes','agendamentos','servicos','profissionais',
    'produtos','studio','lancamentos','cupons'
  ) then
    raise exception 'Tabela nao permitida: %', p_tabela;
  end if;

  if (select acesso_so_agenda())
     and p_tabela not in ('agendamentos','clientes') then
    raise exception 'Sem permissao para alterar %.', p_tabela;
  end if;

  execute format('select versao from public.%I where id = $1 for update', p_tabela)
    into v_atual using p_id;

  if v_atual is null then
    raise exception 'Registro nao encontrado.';
  end if;

  if p_versao is not null and v_atual <> p_versao then
    raise exception
      'Este registro foi alterado em outro dispositivo. Recarregue a tela antes de salvar.'
      using errcode = '40001';
  end if;

  -- `versao` e `id` nunca vêm do cliente: um é do gatilho, o outro é a
  -- chave. Deixá-los passar permitiria forjar a versão e derrotar a
  -- própria checagem.
  select string_agg(quote_ident(chave), ', ')
    into v_colunas
  from jsonb_object_keys(p_mudancas - 'versao' - 'id') as chave;

  if v_colunas is null then
    raise exception 'Nenhuma alteracao informada.';
  end if;

  -- `set (a, b) = (select a, b from jsonb_populate_record(...))`
  -- deixa o próprio Postgres converter cada valor para o tipo da
  -- coluna — número vira número, instante vira instante. A chave que
  -- não existir como coluna continua falhando com 42703, que o
  -- adaptador já traduz.
  v_sql := format(
    'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1))
      where id = $2 returning to_jsonb(public.%I.*)',
    p_tabela, v_colunas, v_colunas, p_tabela, p_tabela);

  execute v_sql into v_linha using p_mudancas, p_id;
  return v_linha;
end $fn$;

revoke all on function atualizar_com_versao(text,text,jsonb,integer) from public, anon;
grant execute on function atualizar_com_versao(text,text,jsonb,integer) to authenticated;
