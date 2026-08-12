-- =====================================================================
-- System Studio · Integridade e histórico
-- Rode depois do 04-tempo-real.sql.
-- =====================================================================
--
-- Os arquivos anteriores respondem "quem pode mexer". Este responde
-- "o que pode ser gravado" — e é a diferença entre um banco que aceita
-- qualquer coisa que o JavaScript mandar e um que tem opinião própria.
--
-- Três blocos:
--
--   1. Constraints     — preço negativo, situação inventada, duração
--                        zero. O que nunca deveria existir.
--   2. Regras          — profissional desativada não recebe agendamento
--                        novo; horário não some por acidente.
--   3. Auditoria       — quem mudou o quê, quando, e o que havia antes.
--                        É o caminho de volta quando algo some.
--
-- ---------------------------------------------------------------------
-- Sobre `not valid`
-- ---------------------------------------------------------------------
-- As constraints entram como `not valid` e são validadas em seguida.
-- Parece rodeio e não é: num studio que já roda há meses pode existir
-- uma linha antiga fora da regra, e uma constraint comum abortaria a
-- migração inteira por causa dela. Assim, o que entra a partir de agora
-- é sempre conferido, o que já estava lá é conferido *se puder ser* — e
-- se não puder, o script avisa em vez de travar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Constraints
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  regras constant text[][] := array[
    -- tabela,             nome,                          condição
    ['agendamentos', 'agendamento_situacao_valida',
     $c$situacao in ('pendente','confirmado','em_atendimento','concluido',
                     'cancelado','faltou','solicitou_alteracao','solicitou_cancelamento')$c$],
    ['agendamentos', 'agendamento_origem_valida',
     $c$origem in ('painel','link','whatsapp','telefone','importacao')$c$],
    ['agendamentos', 'agendamento_valores_sensatos',
     $c$preco >= 0 and desconto >= 0 and desconto <= preco$c$],
    ['agendamentos', 'agendamento_protocolo_preenchido',
     $c$length(btrim(protocolo)) between 4 and 12$c$],

    ['servicos', 'servico_preco_nao_negativo',   $c$preco >= 0$c$],
    ['servicos', 'servico_duracao_positiva',     $c$duracao_minutos > 0 and duracao_minutos <= 1440$c$],
    ['servicos', 'servico_intervalo_sensato',    $c$intervalo_minutos >= 0 and intervalo_minutos <= 240$c$],

    ['clientes', 'cliente_nome_preenchido',      $c$length(btrim(nome)) >= 2$c$],
    ['clientes', 'cliente_telefone_so_digitos',
     $c$telefone is null or telefone ~ '^[0-9]{10,13}$'$c$],

    -- 'agenda' entra aqui pelo mesmo motivo que entrou no `check` de
    -- `contas_equipe` (10-acesso-agenda.sql): o papel mora em DUAS
    -- tabelas, e `conceder_acesso_agenda` grava nas duas.
    --
    -- Atualizar só uma custou um erro em produção. A função gravava a
    -- conta, chegava no `update profissionais` e batia neste check —
    -- e, como ela é atômica, tudo voltava atrás. A mensagem falava de
    -- "profissional_papel_valido", que não parece ter relação nenhuma
    -- com conceder acesso a alguém.
    ['profissionais', 'profissional_papel_valido',
     $c$papel in ('proprietaria','gerente','profissional','recepcao','agenda')$c$],
    ['profissionais', 'profissional_nome_preenchido', $c$length(btrim(nome)) >= 2$c$],

    ['jornada', 'jornada_horario_coerente',
     $c$abre < fecha and (almoco_inicio is null or almoco_fim is null or almoco_inicio < almoco_fim)$c$],

    ['studio', 'studio_numeros_sensatos',
     $c$antecedencia_minutos >= 0 and horizonte_dias between 1 and 365
       and intervalo_minutos between 5 and 120 and reserva_minutos between 1 and 60
       and atendimentos_simultaneos >= 0$c$],
    ['studio', 'studio_identificador_valido',
     $c$identificador ~ '^[a-z0-9][a-z0-9-]{1,39}$'$c$],

    ['reservas',  'reserva_termina_depois',   $c$fim > inicio$c$],
    ['reservas',  'reserva_situacao_valida',
     $c$situacao in ('ativa','expirada','liberada','concluida')$c$],
    ['bloqueios', 'bloqueio_termina_depois',  $c$fim > inicio$c$],

    ['solicitacoes', 'solicitacao_tipo_valido',     $c$tipo in ('alteracao','cancelamento')$c$],
    ['solicitacoes', 'solicitacao_situacao_valida',
     $c$situacao in ('aberta','aprovada','recusada','cancelada')$c$],

    ['lista_espera', 'espera_periodo_valido',   $c$periodo in ('manha','tarde','qualquer')$c$],
    ['lista_espera', 'espera_situacao_valida',
     $c$situacao in ('aguardando','avisada','atendida','desistiu','expirada')$c$],

    ['produtos',    'produto_valores_nao_negativos',
     $c$quantidade >= 0 and quantidade_minima >= 0 and preco_custo >= 0
       and preco_medio >= 0 and preco_venda >= 0$c$],
    ['lancamentos', 'lancamento_tipo_valido',   $c$tipo in ('receita','despesa')$c$],
    ['lancamentos', 'lancamento_valor_nao_negativo', $c$valor >= 0$c$],
    ['caixas',      'caixa_situacao_valida',    $c$situacao in ('aberto','fechado')$c$],
    ['cupons',      'cupom_tipo_valido',        $c$tipo in ('percentual','valor')$c$],
    ['cupons',      'cupom_periodo_coerente',   $c$valido_ate >= valido_de$c$],
    ['cupons',      'cupom_valores_nao_negativos',
     $c$valor >= 0 and limite_usos >= 0 and usos >= 0 and valor_minimo >= 0$c$],
    ['metas',       'meta_valor_nao_negativo',  $c$valor >= 0$c$]
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
      -- Dados antigos fora da regra. A constraint continua valendo para
      -- tudo que entrar de agora em diante; o que já estava lá aparece
      -- no relatório de 06-verificacao.sql para ser corrigido à mão.
      raise notice 'Constraint % em % nao pôde ser validada nos dados existentes: %',
                   r.nome, r.tabela, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Chaves estrangeiras que protegem o histórico
-- ---------------------------------------------------------------------
/*
  `on delete set null` em `agendamentos.cliente_id` era uma armadilha
  silenciosa: apagar uma cliente não dava erro nenhum — só deixava para
  trás uma fileira de atendimentos sem dono, com o histórico dela
  desmontado e sem forma de remontar.

  `restrict` transforma isso num erro claro no momento do clique. Quem
  quiser tirar a cliente de circulação usa `ativo = false`, que é o
  caminho que o produto já oferece e que preserva tudo.
*/
do $$
begin
  alter table agendamentos drop constraint if exists agendamentos_cliente_id_fkey;
  alter table agendamentos add constraint agendamentos_cliente_id_fkey
    foreign key (cliente_id) references clientes(id) on delete restrict;
exception when others then
  raise notice 'Nao foi possivel endurecer agendamentos.cliente_id: %', sqlerrm;
end $$;

-- Impede que a reserva de um horário sobreponha outra viva. O `exists`
-- dentro de `portal_reservar` não fecha essa janela sozinho: duas
-- chamadas simultâneas passam pelas duas checagens antes de qualquer
-- uma gravar.
do $$
begin
  alter table reservas drop constraint if exists reserva_sem_sobreposicao;
  alter table reservas add constraint reserva_sem_sobreposicao
    exclude using gist (
      profissional_id with =,
      tstzrange(inicio, fim) with &&
    ) where (situacao = 'ativa');
exception when others then
  raise notice 'Nao foi possivel criar reserva_sem_sobreposicao: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 3. Regras de negócio que o banco passa a garantir
-- ---------------------------------------------------------------------

/*
  Agendamento novo não vai para profissional desativada.

  A checagem olha só o que é de fato *novo*: um atendimento futuro
  entrando na agenda, ou trocando de profissional. Um registro histórico
  sendo concluído, cancelado ou apenas reescrito passa sem incomodar —
  que é o que a regra 30 do escopo pede: desativar alguém não pode
  apagar nem travar o passado dela.
*/
create or replace function conferir_agendamento() returns trigger
language plpgsql set search_path = public as $fn$
declare v_ativo boolean;
begin
  if new.fim <= new.inicio then
    raise exception 'O fim do atendimento precisa vir depois do inicio.';
  end if;

  if (tg_op = 'INSERT' or new.profissional_id is distinct from old.profissional_id)
     and new.inicio > now()
     and new.situacao in ('pendente','confirmado') then

    select p.ativo and p.atende into v_ativo
    from profissionais p where p.id = new.profissional_id;

    if not coalesce(v_ativo, false) then
      raise exception
        'Esta profissional nao esta atendendo. Reative o cadastro ou escolha outra pessoa.';
    end if;
  end if;

  return new;
end $fn$;

drop trigger if exists conferir on agendamentos;
create trigger conferir before insert or update on agendamentos
  for each row execute function conferir_agendamento();

/*
  Serviço e profissional saem de circulação por interruptor, não por
  DELETE — mas nada impedia o DELETE. Agora impede, e a mensagem diz
  o caminho certo em vez de só recusar.
*/
create or replace function impedir_exclusao_com_historico() returns trigger
language plpgsql set search_path = public as $fn$
declare v_quantos integer;
begin
  if tg_table_name = 'servicos' then
    select count(*) into v_quantos from agendamentos where servico_id = old.id;
  elsif tg_table_name = 'profissionais' then
    select count(*) into v_quantos from agendamentos where profissional_id = old.id;
  elsif tg_table_name = 'clientes' then
    select count(*) into v_quantos from agendamentos where cliente_id = old.id;
  else
    v_quantos := 0;
  end if;

  if v_quantos > 0 then
    raise exception
      'Este cadastro tem % atendimento(s) no historico e nao pode ser apagado. Desative-o em vez disso.',
      v_quantos;
  end if;

  return old;
end $fn$;

do $$
declare t text;
begin
  foreach t in array array['servicos','profissionais','clientes'] loop
    execute format('drop trigger if exists preservar_historico on %I', t);
    execute format(
      'create trigger preservar_historico before delete on %I
       for each row execute function impedir_exclusao_com_historico()', t);
  end loop;
end $$;

-- Carimba a data de desativação sozinho. Sem isto, `desativado_em`
-- dependeria de toda tela lembrar de preenchê-lo — e uma delas não vai.
create or replace function carimbar_desativacao() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if old.ativo and not new.ativo then
    new.desativado_em := coalesce(new.desativado_em, now());
  elsif not old.ativo and new.ativo then
    new.desativado_em := null;
  end if;
  return new;
end $fn$;

do $$
declare t text;
begin
  foreach t in array array['clientes','profissionais','servicos','produtos','cupons'] loop
    execute format('drop trigger if exists carimbo_desativacao on %I', t);
    execute format(
      'create trigger carimbo_desativacao before update of ativo on %I
       for each row execute function carimbar_desativacao()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Auditoria
-- ---------------------------------------------------------------------
/*
  O que esta tabela responde, e nenhuma outra responde:

    "o horário da Maria sumiu — quem apagou, quando, e o que havia ali?"

  `dados_anteriores` guarda a linha inteira antes da mudança. É pesado
  de propósito: sem ela, a trilha diria que algo foi apagado sem dizer
  o quê, e uma trilha assim serve para atribuir culpa, não para
  recuperar dado. Com ela, um `insert ... select` traz o registro de
  volta.

  O que NÃO entra aqui: senha e token. Nenhuma das tabelas auditadas
  guarda qualquer um dos dois, e a lista de tabelas é explícita
  justamente para continuar assim quando alguém criar uma tabela nova.
*/
create table if not exists auditoria (
  id               bigserial primary key,
  em               timestamptz not null default now(),
  usuario_id       uuid,
  usuario_email    text,
  tabela           text not null,
  registro_id      text,
  operacao         text not null check (operacao in ('INSERT','UPDATE','DELETE')),
  dados_anteriores jsonb
);

create index if not exists auditoria_por_data     on auditoria (em desc);
create index if not exists auditoria_por_registro on auditoria (tabela, registro_id);

create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public, auth as $fn$
declare
  v_id    text;
  v_email text;
begin
  v_id := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
    null);

  begin
    v_email := coalesce(
      (select c.email from contas_equipe c where c.usuario_id = auth.uid()),
      nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''));
  exception when others then
    v_email := null;
  end;

  insert into auditoria (usuario_id, usuario_email, tabela, registro_id, operacao, dados_anteriores)
  values (auth.uid(), v_email, tg_table_name, v_id, tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end);

  return case when tg_op = 'DELETE' then old else new end;
end $fn$;

do $$
declare t text;
begin
  -- A lista é curta de propósito. Auditar `movimentos` de estoque a
  -- cada venda dobraria o tamanho do banco para responder uma pergunta
  -- que o próprio movimento já responde.
  foreach t in array array[
    'agendamentos','clientes','servicos','profissionais',
    'studio','jornada','lancamentos','caixas','cupons'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trilha on %I', t);
    execute format(
      'create trigger trilha after insert or update or delete on %I
       for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- A trilha é leitura, nunca escrita. Se alguém puder editá-la, ela
-- deixa de servir para o que existe.
alter table auditoria enable row level security;
drop policy if exists "equipe da casa" on public.auditoria;
drop policy if exists "ler a trilha"   on public.auditoria;

/*
  Acesso completo para ler a trilha.

  A segunda auditoria encontrou aqui o vazamento mais silencioso do
  sistema. `auditoria.dados_anteriores` guarda a linha INTEIRA anterior
  a cada alteração, e o gatilho `trilha` está em **todas** as tabelas.
  A trilha é, na prática, uma cópia sombra do banco — faturamento,
  caixa, estoque, fichas.

  Com `equipe_autorizada()`, uma conta de acesso restrito à agenda
  fazia:

    select * from auditoria where tabela = 'lancamentos'

  e recebia o histórico financeiro completo, contornando as políticas
  do 10-acesso-agenda.sql sem tocar em nenhuma delas. Fechar a porta da
  frente e deixar a trilha aberta é não ter fechado nada.
*/
create policy "ler a trilha" on public.auditoria
  for select to authenticated using ((select equipe_com_acesso_completo()));

revoke insert, update, delete on public.auditoria from authenticated, anon;
grant select on public.auditoria to authenticated;

-- Faxina da trilha. Um ano é mais do que qualquer dúvida operacional
-- de um salão pede, e evita que a tabela cresça para sempre.
create or replace function limpar_auditoria(p_dias integer default 365)
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_apagados integer;
begin
  -- Estava sem guarda. Apagar a trilha de auditoria é exatamente o que
  -- alguém faria para esconder o que fez — e era permitido a qualquer
  -- conta autenticada, inclusive à de acesso restrito.
  --
  -- A faxina diária chama isto ao abrir o sistema; a chamada de quem
  -- não tem acesso passa a devolver zero em vez de apagar. É por isso
  -- que ela devolve em vez de lançar: a faxina é rotina de fundo e não
  -- deve encher a tela de ninguém com erro.
  if not (select equipe_com_acesso_completo()) then
    return 0;
  end if;

  delete from auditoria where em < now() - make_interval(days => greatest(p_dias, 30));
  get diagnostics v_apagados = row_count;
  return v_apagados;
end $fn$;

revoke all on function limpar_auditoria(integer) from public, anon;
grant execute on function limpar_auditoria(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Desfazer uma exclusão
-- ---------------------------------------------------------------------
-- O caminho de volta, quando alguém apaga o que não devia. Devolve a
-- linha exatamente como estava antes do DELETE registrado na trilha.
--
--   select restaurar_da_trilha(1234);
--
-- Só do SQL Editor: restaurar registro não é botão de tela.
create or replace function restaurar_da_trilha(p_auditoria_id bigint)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_linha auditoria%rowtype;
  v_cols  text;
begin
  select * into v_linha from auditoria where id = p_auditoria_id;
  if not found then raise exception 'Registro % nao existe na trilha.', p_auditoria_id; end if;
  if v_linha.operacao <> 'DELETE' then
    raise exception 'A entrada % nao e uma exclusao.', p_auditoria_id;
  end if;

  select string_agg(quote_ident(chave), ', ') into v_cols
  from jsonb_object_keys(v_linha.dados_anteriores) as chave;

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
    v_linha.tabela, v_cols, v_cols, v_linha.tabela)
  using v_linha.dados_anteriores;

  return format('Registro %s restaurado em %s.', v_linha.registro_id, v_linha.tabela);
end $fn$;

revoke all on function restaurar_da_trilha(bigint) from public, anon, authenticated;
