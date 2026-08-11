-- =====================================================================
-- System Studio · Concorrência e restauração transacional
-- Rode depois do 08-transacoes.sql.
-- =====================================================================
--
-- Dois problemas que sobraram, e os dois têm a mesma assinatura: o
-- sistema aceita em silêncio uma operação que deveria recusar.
--
--   1. Duas pessoas editando o mesmo registro. A última a salvar apaga
--      o trabalho da primeira, sem erro e sem aviso.
--
--   2. Restauração de backup. O rollback existe, mas é feito pela
--      aplicação — e uma aplicação que cai no meio não desfaz nada.
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Versão dos registros críticos
-- ---------------------------------------------------------------------
/*
  O cenário, com números:

    10:02  recepção abre a ficha da Maria (versão 7)
    10:03  proprietária abre a mesma ficha  (versão 7)
    10:04  recepção corrige o telefone      → versão 8
    10:06  proprietária salva a observação  → grava por cima da versão 7

  O telefone corrigido às 10:04 desaparece. Ninguém vê erro. A recepção
  só descobre quando liga para a cliente semanas depois.

  Enviar só as colunas alteradas — o que já fazemos — resolve o caso em
  que as duas mexem em campos diferentes. Não resolve quando mexem no
  MESMO campo, e é aí que a perda dói mais.

  `versao` fecha isso: quem salva declara em cima de qual versão estava
  editando. Se o banco já avançou, a gravação é recusada e a pessoa
  decide o que fazer com a informação. Nunca em silêncio.
*/
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','agendamentos','servicos','profissionais',
    'produtos','studio','lancamentos','cupons'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists versao integer not null default 1', t);
  end loop;
end $$;

-- A versão sobe sozinha a cada UPDATE. Deixar isso para a aplicação
-- seria garantir que uma tela esquecesse — e uma tela que esquece
-- desliga a proteção sem ninguém perceber.
create or replace function subir_versao() returns trigger
language plpgsql set search_path = public as $fn$
begin
  new.versao := coalesce(old.versao, 0) + 1;
  return new;
end $fn$;

do $$
declare t text;
begin
  foreach t in array array[
    'clientes','agendamentos','servicos','profissionais',
    'produtos','studio','lancamentos','cupons'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists versionar on public.%I', t);
    execute format(
      'create trigger versionar before update on public.%I
       for each row execute function subir_versao()', t);
  end loop;
end $$;

/*
  Gravação com checagem de versão.

  `p_mudancas` traz só as colunas alteradas, em jsonb. `p_versao` é a
  versão que a tela tinha em mãos quando começou a editar.

  Devolve a linha nova em caso de sucesso. Levanta exceção com uma
  mensagem escrita para a proprietária quando a versão não bate — ela
  não precisa saber o que é controle otimista, precisa saber que
  alguém mexeu e que ela deve conferir antes de salvar de novo.
*/
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

  -- Lista fixa: sem ela, o nome da tabela viria do navegador e esta
  -- função viraria um `update` em qualquer tabela do banco.
  if p_tabela not in (
    'clientes','agendamentos','servicos','profissionais',
    'produtos','studio','lancamentos','cupons'
  ) then
    raise exception 'Tabela nao permitida: %', p_tabela;
  end if;

  /*
    Segunda lista, mais curta, para o acesso restrito à agenda.

    Bloquear a função inteira não serve: é por ela que a remarcação de
    um agendamento passa, e remarcar é justamente o que a conta
    restrita precisa fazer.

    O que ela não pode é o resto da lista acima. `lancamentos` deixaria
    a receita editável; `produtos`, o estoque; `studio`, os próprios
    limites da agenda — incluindo desligar o teto diário. E, como a
    função devolve `to_jsonb` da linha alterada, ela servia também de
    leitura: mudar um campo inofensivo e ler o registro financeiro
    completo na resposta.
  */
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
  select string_agg(format('%I = $1->>%L', chave, chave), ', ')
    into v_colunas
  from jsonb_object_keys(p_mudancas - 'versao' - 'id') as chave;

  if v_colunas is null then
    raise exception 'Nenhuma alteracao informada.';
  end if;

  v_sql := format(
    'update public.%I set %s where id = $2 returning to_jsonb(public.%I.*)',
    p_tabela, v_colunas, p_tabela);

  execute v_sql into v_linha using p_mudancas, p_id;
  return v_linha;
end $fn$;

revoke all on function atualizar_com_versao(text,text,jsonb,integer) from public, anon;
grant execute on function atualizar_com_versao(text,text,jsonb,integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Restauração transacional
-- ---------------------------------------------------------------------
/*
  A restauração pela aplicação — apagar coleção, gravar coleção,
  repetir — tinha rollback escrito em TypeScript. Funciona quando a
  gravação falha; não funciona quando o navegador fecha, o celular
  dorme ou a aba morre no meio. E é justamente aí que o studio fica
  com metade dos dados de um arquivo e metade de outro.

  Aqui a coisa toda é uma transação do Postgres. Ou o studio inteiro
  vira o do arquivo, ou continua exatamente como estava. Não existe
  meio-termo, nem se a energia acabar.

  `p_conteudo` é o mesmo JSON que a exportação gera:

    { "clientes": [...], "servicos": [...], ... }

  A ordem de gravação respeita as chaves estrangeiras. As tabelas
  filhas saem primeiro e entram por último — o contrário derrubaria a
  restauração no primeiro `references`.
*/
create or replace function restaurar_backup(p_conteudo jsonb)
returns table (colecao text, registros integer)
language plpgsql security definer set search_path = public as $fn$
declare
  /*
    Ordem de exclusão: das folhas para a raiz.

    `reservas` aparece aqui mesmo sem entrar no backup — e essa é a
    razão de ela existir nesta lista. Uma reserva viva referencia
    `servicos` e `profissionais`; apagar o serviço com a reserva de pé
    derruba a restauração inteira por chave estrangeira. Como reserva
    dura cinco minutos e nunca é exportada, limpá-la é a resposta
    certa: o horário volta para a grade e nada de valor se perde.
  */
  v_ordem constant text[] := array[
    'fotos','procedimentos','pontos','usos_cupom','movimentos_caixa',
    'movimentos','lembretes','notificacoes','lancamentos','solicitacoes',
    'reservas','lista_espera','agendamentos','bloqueios','caixas','metas',
    'cupons','produtos','fornecedores','servicos','categorias','clientes',
    'modelos_mensagem','jornada','profissionais','studio','fidelidade'
  ];
  v_tabela  text;
  v_dados   jsonb;
  v_qtd     integer;
begin
  -- Restaurar APAGA e substitui 27 tabelas. É a operação mais
  -- destrutiva do sistema, e estava ao alcance de qualquer conta
  -- autenticada — inclusive a de acesso restrito à agenda.
  if not (select equipe_com_acesso_completo()) then
    raise exception 'Sem permissao para restaurar backup.';
  end if;

  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' then
    raise exception 'Arquivo de backup invalido.';
  end if;

  -- Nada de restaurar um arquivo vazio por engano: seria o mesmo que
  -- apagar o studio inteiro, e com a aparência de uma operação normal.
  if not (p_conteudo ? 'studio') or
     jsonb_array_length(coalesce(p_conteudo -> 'studio', '[]'::jsonb)) = 0 then
    raise exception 'O arquivo nao contem os dados do studio. Restauracao cancelada.';
  end if;

  -- As restrições de chave estrangeira só são conferidas no COMMIT.
  -- Sem isto, apagar `clientes` antes de `agendamentos` falharia mesmo
  -- que o arquivo traga os dois de volta em seguida.
  set constraints all deferred;

  /* ---- 1. Limpa, das folhas para a raiz ---- */
  foreach v_tabela in array v_ordem loop
    if to_regclass('public.' || v_tabela) is null then continue; end if;

    -- `reservas` é limpa sempre, mesmo fora do arquivo: ver o comentário
    -- da lista acima.
    if v_tabela <> 'reservas' and not (p_conteudo ? v_tabela) then continue; end if;

    execute format('delete from public.%I', v_tabela);
  end loop;

  /* ---- 2. Preenche, da raiz para as folhas ---- */
  for i in reverse array_length(v_ordem, 1) .. 1 loop
    v_tabela := v_ordem[i];

    if to_regclass('public.' || v_tabela) is null then continue; end if;
    v_dados := p_conteudo -> v_tabela;
    if v_dados is null or jsonb_typeof(v_dados) <> 'array' then continue; end if;

    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
      v_tabela, v_tabela) using v_dados;

    get diagnostics v_qtd = row_count;

    colecao := v_tabela;
    registros := v_qtd;
    return next;
  end loop;

  /* ---- 3. Confere antes de deixar fechar ---- */
  if not exists (select 1 from studio) then
    raise exception 'Restauracao resultou em studio vazio. Desfeita.';
  end if;
end $fn$;

revoke all on function restaurar_backup(jsonb) from public, anon;
grant execute on function restaurar_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Instantâneo sem cache, para a cópia de segurança
-- ---------------------------------------------------------------------
/*
  A cópia de segurança feita antes de uma restauração não pode sair do
  espelho em memória do navegador. Aquele espelho pode estar velho —
  outra aba gravou, o tempo real ainda não avisou — e uma cópia de
  segurança velha é pior do que nenhuma: ela dá confiança para restaurar
  e não devolve o estado certo se der errado.

  Esta função lê direto das tabelas, no mesmo instante, dentro da mesma
  consulta. Não há janela entre uma coleção e outra.
*/
create or replace function instantaneo_do_studio()
returns jsonb
language plpgsql security definer set search_path = public stable as $fn$
declare
  v_tabelas constant text[] := array[
    'studio','profissionais','jornada','clientes','categorias','servicos',
    'agendamentos','bloqueios','procedimentos','fotos','solicitacoes',
    'lista_espera','fornecedores','produtos','movimentos','lancamentos',
    'metas','caixas','movimentos_caixa','cupons','usos_cupom','fidelidade',
    'pontos','lembretes','notificacoes','modelos_mensagem'
  ];
  v_saida jsonb := '{}'::jsonb;
  v_tab   text;
  v_dados jsonb;
begin
  -- Acesso completo, não apenas "está na casa".
  --
  -- Esta função devolve 26 tabelas inteiras num JSON — faturamento,
  -- caixa, estoque, fichas de evolução e fotos das clientes. Com
  -- `equipe_autorizada()`, uma conta de acesso restrito à agenda
  -- chamava `rpc('instantaneo_do_studio')` e recebia o salão inteiro,
  -- passando por cima de todas as políticas do 10-acesso-agenda.sql.
  -- `security definer` ignora RLS por definição; a checagem do papel
  -- precisa estar aqui dentro.
  if not (select equipe_com_acesso_completo()) then
    raise exception 'Sem permissao para ler os dados do studio.';
  end if;

  foreach v_tab in array v_tabelas loop
    if to_regclass('public.' || v_tab) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t.*)), ''[]''::jsonb) from public.%I t', v_tab)
      into v_dados;
    v_saida := v_saida || jsonb_build_object(v_tab, v_dados);
  end loop;

  return v_saida;
end $fn$;

revoke all on function instantaneo_do_studio() from public, anon;
grant execute on function instantaneo_do_studio() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Check-in devolve o instante que o BANCO gravou
-- ---------------------------------------------------------------------
/*
  `returns void` obrigava a tela a inventar o horário com `new Date()`
  do próprio aparelho. Um celular com o relógio adiantado registrava a
  cliente chegando às 15h20 enquanto o banco anotava 15h05 — e a
  recepção, olhando a agenda, via a hora do banco. Duas telas, dois
  horários, e nenhuma forma de saber qual era o certo.

  Devolvendo `chegou_em`, existe uma resposta só. As validações
  continuam todas no servidor: protocolo, telefone, janela de horário e
  situação do agendamento.
*/
drop function if exists portal_cheguei(text, text);

create function portal_cheguei(p_protocolo text, p_telefone text)
returns timestamptz
language plpgsql security definer set search_path = public as $fn$
declare
  v_id       text;
  v_inicio   timestamptz;
  v_fim      timestamptz;
  v_situacao text;
  v_chegou   timestamptz;
begin
  if not (select coalesce(checkin_ativo, false) from studio limit 1) then
    raise exception 'O check-in esta desativado no momento.';
  end if;

  select c.id, c.inicio, c.fim, c.situacao, c.chegou_em
    into v_id, v_inicio, v_fim, v_situacao, v_chegou
  from portal_consultar(p_protocolo, p_telefone) c;

  if v_id is null then raise exception 'Horario nao encontrado.'; end if;

  if v_situacao in ('cancelado','concluido','faltou') then
    raise exception 'Este horario ja foi encerrado.';
  end if;

  -- Já avisou: devolve o instante original em vez de gravar outro.
  -- É o que torna o clique duplo inofensivo.
  if v_chegou is not null then return v_chegou; end if;

  if now() < v_inicio - interval '1 hour' then
    raise exception 'Ainda e cedo para avisar que chegou.';
  end if;
  if now() > v_fim then
    raise exception 'Este horario ja passou.';
  end if;

  update agendamentos set chegou_em = now()
   where id = v_id and chegou_em is null
  returning chegou_em into v_chegou;

  return v_chegou;
end $fn$;

revoke all on function portal_cheguei(text,text) from public;
grant execute on function portal_cheguei(text,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Coluna que faltava em `studio`
-- ---------------------------------------------------------------------
-- O tipo `Studio` do TypeScript declara `limiteDiario` e o motor de
-- horários já o consulta — mas a coluna nunca chegou ao banco. Como o
-- sistema grava o studio por upsert com a lista de colunas explícita,
-- toda gravação virava:
--
--   POST /rest/v1/studio?on_conflict=id&columns=...,"limite_diario"
--   → 400 Bad Request
--
-- Nenhuma configuração do salão salvava, e a resposta não dizia qual
-- coluna estava sobrando. Aqui para quem já rodou o 01-esquema.sql
-- antes da correção.
alter table studio add column if not exists limite_diario integer not null default 0;

-- ---------------------------------------------------------------------
-- 6. Tetos que faltavam
-- ---------------------------------------------------------------------
-- O `05-integridade.sql` já barra duração zero e preço negativo. O que
-- faltava era o outro lado: valores absurdamente ALTOS.
--
-- Um serviço de 900 minutos passou pela tela num teste real. Quinze
-- horas — mais do que o salão fica aberto. O efeito não é um erro
-- visível: a agenda simplesmente para de oferecer horário para aquele
-- serviço, e ninguém liga uma coisa à outra.
--
-- Errar para baixo salta aos olhos no primeiro agendamento. Errar para
-- cima só aparece quando a cliente diz que não achou vaga.
do $$
declare
  r record;
  regras constant text[][] := array[
    ['servicos', 'servico_duracao_com_teto',   $c$duracao_minutos between 5 and 720$c$],
    ['servicos', 'servico_intervalo_com_teto', $c$intervalo_minutos between 0 and 120$c$],
    ['servicos', 'servico_preco_com_teto',     $c$preco >= 0 and preco <= 100000$c$],
    ['produtos', 'produto_precos_com_teto',
     $c$preco_custo <= 1000000 and preco_venda <= 1000000 and quantidade <= 1000000$c$],
    ['studio',   'studio_antecedencia_com_teto',
     $c$antecedencia_minutos between 0 and 10080$c$],
    ['studio',   'studio_limite_diario_sensato', $c$limite_diario between 0 and 200$c$],
    ['agendamentos', 'agendamento_duracao_sensata',
     $c$fim > inicio and fim <= inicio + interval '12 hours'$c$]
  ];
begin
  for r in select regras[i][1] as tabela, regras[i][2] as nome, regras[i][3] as cond
           from generate_subscripts(regras, 1) as i
  loop
    if to_regclass('public.' || r.tabela) is null then continue; end if;
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
