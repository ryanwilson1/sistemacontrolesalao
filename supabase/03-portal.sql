-- =====================================================================
-- System Studio · Portal público
-- Rode depois do 02-seguranca.sql.
-- =====================================================================
--
-- O portal precisa de seis coisas e de mais nada:
--
--   1. saber o nome e os horários do studio
--   2. listar os serviços liberados para o link
--   3. listar quem atende
--   4. saber quais faixas do dia estão ocupadas
--   5. prender um horário e confirmá-lo
--   6. consultar o próprio agendamento pelo protocolo
--
-- Repare no item 4. O portal precisa saber que das 14h às 16h está
-- ocupado. Ele NÃO precisa saber que é a Maria fazendo progressiva por
-- R$ 350. Dar acesso à tabela de agendamentos entregaria as três coisas
-- juntas — e é assim que a agenda de um salão vaza inteira.
--
-- Por isso cada função abaixo devolve exatamente o recorte necessário.
-- São `security definer`: rodam com os poderes do dono do banco, não de
-- quem chamou, o que permite manter `anon` sem acesso a tabela alguma.
--
-- `set search_path = public` em todas: sem isso, `security definer` é
-- uma porta conhecida de escalonamento de privilégio no Postgres.
--
-- ---------------------------------------------------------------------
-- O QUE MUDOU NESTA VERSÃO
-- ---------------------------------------------------------------------
--
-- A versão anterior validava a jornada, a antecedência e o horizonte só
-- no JavaScript. O banco aceitava qualquer `p_inicio`.
--
-- Isso importa porque estas funções são `grant execute to anon` — ou
-- seja, chamáveis por qualquer pessoa com a chave pública, direto pelo
-- terminal, sem passar pela tela:
--
--   curl -X POST '.../rest/v1/rpc/portal_reservar' \
--        -H "apikey: CHAVE_ANON" \
--        -d '{"p_inicio":"2020-01-01T03:00:00Z", ...}'
--
-- Domingo de madrugada, num dia em que o salão está fechado, num
-- horário já passado. As quatro checagens do React não estavam no
-- caminho — e o agendamento entrava.
--
-- Agora quem valida é `portal_conferir_horario`, e ela roda dentro da
-- mesma transação que grava. O React continua validando: ele dá a
-- mensagem boa e evita a viagem à rede. Mas deixou de ser a única
-- coisa entre a agenda do salão e a internet.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Ferramentas comuns
-- ---------------------------------------------------------------------

-- O relógio do studio, não o do celular de quem está marcando.
create or replace function portal_agora_local(p_quando timestamptz)
returns timestamp
language sql security definer set search_path = public stable as $fn$
  select p_quando at time zone coalesce(
    (select s.fuso from studio s limit 1), 'America/Sao_Paulo');
$fn$;

/*
  A checagem que faltava.

  Reúne, num lugar só, tudo que decide se um horário pode existir. Fica
  numa função própria — e não copiada dentro de `portal_reservar` e
  `portal_agendar` — porque duas cópias divergem no primeiro conserto
  feito com pressa, e a que ficar para trás é justamente a última antes
  de gravar.

  Levanta exceção com a frase que a cliente lê. O Postgres devolve a
  mensagem de `raise exception` pronta para a tela.
*/
create or replace function portal_conferir_horario(
  p_servico_id      text,
  p_profissional_id text,
  p_inicio          timestamptz,
  p_fim             timestamptz
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_studio   studio%rowtype;
  v_servico  servicos%rowtype;
  v_prof     profissionais%rowtype;
  v_jornada  jornada%rowtype;
  v_local    timestamp;
  v_fim_loc  timestamp;
  v_dia      integer;
  v_hora_ini time;
  v_hora_fim time;
begin
  select * into v_studio from studio limit 1;
  if not found then raise exception 'Studio nao configurado.'; end if;

  if not v_studio.agendamento_ativo then
    raise exception 'O agendamento online esta pausado no momento.';
  end if;

  -- Serviço: existe, está ativo e foi liberado para o link.
  select * into v_servico from servicos
  where id = p_servico_id and ativo and no_link_publico;
  if not found then raise exception 'Servico indisponivel.'; end if;

  -- Profissional: existe, está ativo e atende.
  -- Sem isto, uma profissional desligada continua recebendo agendamento
  -- por quem tiver o id dela guardado numa aba antiga.
  select * into v_prof from profissionais
  where id = p_profissional_id and ativo and atende;
  if not found then raise exception 'Profissional indisponivel.'; end if;

  -- Profissional habilitada para ESTE serviço. Lista vazia significa
  -- "qualquer uma", que é como o cadastro se comporta hoje.
  if jsonb_array_length(coalesce(v_servico.profissionais_ids, '[]'::jsonb)) > 0
     and not (v_servico.profissionais_ids ? p_profissional_id) then
    raise exception 'Esta profissional nao atende este servico.';
  end if;

  -- Antecedência mínima. Também é o que impede marcar no passado.
  if p_inicio < now() + make_interval(mins => greatest(coalesce(v_studio.antecedencia_minutos, 0), 0)) then
    raise exception 'Este horario esta muito proximo. Escolha outro, por favor.';
  end if;

  -- Horizonte: não dá para marcar para daqui a dois anos.
  if p_inicio > now() + make_interval(days => greatest(coalesce(v_studio.horizonte_dias, 60), 1)) then
    raise exception 'Ainda nao abrimos a agenda para esta data.';
  end if;

  -- Funcionamento do studio, no fuso do studio.
  v_local   := portal_agora_local(p_inicio);
  v_fim_loc := portal_agora_local(p_fim);
  v_dia     := extract(dow from v_local)::integer;

  select * into v_jornada from jornada where dia_semana = v_dia;
  if not found or not v_jornada.aberto then
    raise exception 'O studio nao abre neste dia.';
  end if;

  v_hora_ini := v_local::time;
  v_hora_fim := v_fim_loc::time;

  -- Atendimento que atravessa a meia-noite não cabe na jornada de um
  -- dia só. Recusar é mais honesto do que aceitar e exibir errado.
  if v_fim_loc::date <> v_local::date then
    raise exception 'Este horario nao cabe no expediente do dia.';
  end if;

  if v_hora_ini < v_jornada.abre::time or v_hora_fim > v_jornada.fecha::time then
    raise exception 'Este horario esta fora do expediente.';
  end if;

  -- Intervalo de almoço.
  if v_jornada.almoco_inicio is not null and v_jornada.almoco_fim is not null
     and v_hora_ini < v_jornada.almoco_fim::time
     and v_hora_fim > v_jornada.almoco_inicio::time then
    raise exception 'Este horario cai no intervalo de almoco.';
  end if;

  -- Bloqueios: folga, férias, feriado, compromisso da profissional.
  if exists (
    select 1 from bloqueios b
    where (b.profissional_id is null or b.profissional_id = p_profissional_id)
      and tstzrange(b.inicio, b.fim) && tstzrange(p_inicio, p_fim)
  ) then
    raise exception 'Horario indisponivel.';
  end if;
end $fn$;

-- ---------------------------------------------------------------------
-- 1. O studio
-- ---------------------------------------------------------------------
-- `drop` antes do `create`, e não `create or replace`.
--
-- O 07-identidade.sql redefine esta função com dez colunas a mais
-- (logo, cores, slogan). O Postgres recusa trocar o tipo de retorno de
-- uma função existente:
--
--   ERROR: 42P13: cannot change return type of existing function
--
-- Sem o `drop`, rodar este arquivo de novo num banco que já recebeu o
-- 07 aborta aqui — e reexecutar os arquivos na ordem é justamente o que
-- se faz ao atualizar o sistema.
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
  -- Faltava. O teto diário existia na tabela, aparecia em Ajustes e
  -- nunca chegava ao portal — que é o único lugar onde ele precisa
  -- valer, porque é o único que agenda sem ninguém olhando.
  limite_diario integer
)
language sql security definer set search_path = public stable as $fn$
  -- Nenhuma coluna sensível existe nesta tabela, mas a lista é explícita
  -- de propósito: uma coluna nova no futuro não vaza sozinha para o
  -- portal só por ter sido criada.
  select s.id, s.nome, s.identificador, s.telefone, s.whatsapp,
         s.instagram, s.endereco, s.tema, s.agendamento_ativo,
         s.antecedencia_minutos, s.horizonte_dias, s.intervalo_minutos,
         s.confirmacao_manual, s.atendimentos_simultaneos,
         s.reserva_minutos, s.escolha_de_profissional,
         s.aceita_solicitacoes, s.lista_espera_ativa,
         s.checkin_ativo, s.recado_do_portal, s.fuso,
         s.limite_diario
  from studio s
  where p_identificador is null or s.identificador = p_identificador
  limit 1;
$fn$;

create or replace function portal_jornada()
returns table (dia_semana integer, aberto boolean, abre text, fecha text,
               almoco_inicio text, almoco_fim text)
language sql security definer set search_path = public stable as $fn$
  select j.dia_semana, j.aberto, j.abre, j.fecha, j.almoco_inicio, j.almoco_fim
  from jornada j;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Serviços e equipe
-- ---------------------------------------------------------------------
create or replace function portal_servicos()
returns table (id text, nome text, descricao text, duracao_minutos integer,
               intervalo_minutos integer, preco numeric, cor text,
               ordem integer, profissionais_ids jsonb)
language sql security definer set search_path = public stable as $fn$
  select s.id, s.nome, s.descricao, s.duracao_minutos, s.intervalo_minutos,
         s.preco, s.cor, s.ordem, s.profissionais_ids
  from servicos s
  where s.ativo and s.no_link_publico
  order by s.ordem, s.nome;
$fn$;

create or replace function portal_profissionais()
returns table (id text, nome text, cor text)
language sql security definer set search_path = public stable as $fn$
  -- Sem `papel`: a cliente não precisa saber quem é gerente e quem é
  -- recepção, e essa é informação da casa.
  select p.id, p.nome, p.cor
  from profissionais p
  where p.ativo and p.atende
  order by p.nome;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Ocupação — o recorte que protege a agenda
-- ---------------------------------------------------------------------
create or replace function portal_ocupacao(p_de timestamptz, p_ate timestamptz)
returns table (profissional_id text, inicio timestamptz, fim timestamptz, tipo text)
language plpgsql security definer set search_path = public stable as $fn$
declare v_ate timestamptz;
begin
  -- Teto na janela consultada. Sem ele, uma chamada com dez anos de
  -- intervalo devolveria o mapa de ocupação do salão inteiro numa
  -- requisição — que é informação comercial, e de quebra derruba o
  -- banco. O portal pede um dia de cada vez; 62 dias é folga larga.
  if p_de is null or p_ate is null or p_ate <= p_de then
    raise exception 'Periodo invalido.';
  end if;
  v_ate := least(p_ate, p_de + interval '62 days');

  return query
  -- Três origens, um formato: para o portal, atendimento marcado,
  -- bloqueio e reserva em andamento são a mesma coisa — tempo que não
  -- está livre. Quem ocupa e por quê fica de fora.
  select a.profissional_id, a.inicio, a.fim, 'atendimento'::text
  from agendamentos a
  where a.inicio < v_ate and a.fim > p_de
    and a.situacao in ('pendente','confirmado','em_atendimento','concluido',
                       'solicitou_alteracao','solicitou_cancelamento')
  union all
  select coalesce(b.profissional_id, '*'), b.inicio, b.fim, 'bloqueio'::text
  from bloqueios b
  where b.inicio < v_ate and b.fim > p_de
  union all
  select r.profissional_id, r.inicio, r.fim, 'reserva'::text
  from reservas r
  where r.situacao = 'ativa' and r.expira_em > now()
    and r.inicio < v_ate and r.fim > p_de;
end $fn$;

-- ---------------------------------------------------------------------
-- 4. Prender e soltar horário
-- ---------------------------------------------------------------------
create or replace function portal_reservar(
  p_servico_id text, p_profissional_id text,
  p_inicio timestamptz, p_visitante_id text
) returns reservas
language plpgsql security definer set search_path = public as $fn$
declare
  v_servico servicos%rowtype;
  v_studio  studio%rowtype;
  v_fim     timestamptz;
  v_nova    reservas%rowtype;
  v_vivas   integer;
begin
  if p_visitante_id is null or length(btrim(p_visitante_id)) < 8 then
    raise exception 'Sessao invalida. Recarregue a pagina, por favor.';
  end if;

  select * into v_servico from servicos where id = p_servico_id and ativo and no_link_publico;
  if not found then raise exception 'Servico indisponivel.'; end if;

  select * into v_studio from studio limit 1;

  v_fim := p_inicio + make_interval(
    mins => v_servico.duracao_minutos + v_servico.intervalo_minutos);

  -- Expediente, antecedência, horizonte, bloqueio, profissional ativa.
  -- Antes isto só existia no React.
  perform portal_conferir_horario(p_servico_id, p_profissional_id, p_inicio, v_fim);

  /*
    Trava contra travamento de agenda.

    Uma reserva custa um clique e prende um horário por cinco minutos.
    Sem teto, um script gera mil identidades de visitante e prende a
    agenda inteira indefinidamente — sem marcar nada, sem deixar rastro
    e sem que a proprietária entenda por que o link parou de mostrar
    horário livre.

    O teto é por janela de tempo e generoso para quem está marcando de
    verdade: ninguém escolhe vinte horários em cinco minutos.
  */
  select count(*) into v_vivas from reservas r
  where r.situacao = 'ativa' and r.expira_em > now();
  if v_vivas > 200 then
    raise exception 'O sistema esta com muitos agendamentos em andamento. Tente em instantes.';
  end if;

  -- Uma reserva viva por visitante: clicar pela grade não pode travar
  -- a agenda inteira sem marcar nada.
  update reservas set situacao = 'liberada'
  where visitante_id = p_visitante_id and situacao = 'ativa';

  -- Devolve à grade o que já venceu neste horário. Sem isto, a restrição
  -- de exclusão criada em 05-integridade.sql recusaria a reserva nova
  -- por causa de uma vencida que ninguém varreu ainda.
  update reservas set situacao = 'expirada'
  where situacao = 'ativa' and expira_em <= now();

  if exists (
    select 1 from agendamentos a
    where a.profissional_id = p_profissional_id
      and a.situacao in ('pendente','confirmado','em_atendimento','concluido',
                         'solicitou_alteracao','solicitou_cancelamento')
      and tstzrange(a.inicio, a.fim) && tstzrange(p_inicio, v_fim)
  ) then raise exception 'Este horario ja esta ocupado.'; end if;

  if exists (
    select 1 from reservas r
    where r.profissional_id = p_profissional_id
      and r.situacao = 'ativa' and r.expira_em > now()
      and r.visitante_id <> p_visitante_id
      and tstzrange(r.inicio, r.fim) && tstzrange(p_inicio, v_fim)
  ) then
    raise exception 'Alguem esta finalizando um agendamento neste horario agora.';
  end if;

  insert into reservas (id, servico_id, profissional_id, inicio, fim,
                        expira_em, visitante_id, situacao, agendamento_id)
  values (gen_random_uuid()::text, p_servico_id, p_profissional_id, p_inicio, v_fim,
          now() + make_interval(mins => greatest(v_studio.reserva_minutos, 1)),
          p_visitante_id, 'ativa', null)
  returning * into v_nova;

  return v_nova;
exception
  when exclusion_violation then
    -- Duas visitantes no mesmo milissegundo: o banco recusa a segunda.
    raise exception 'Alguem escolheu este horario neste instante. Escolha outro, por favor.';
end $fn$;

create or replace function portal_liberar(p_visitante_id text)
returns void language sql security definer set search_path = public as $fn$
  update reservas set situacao = 'liberada'
  where visitante_id = p_visitante_id and situacao = 'ativa';
$fn$;

-- ---------------------------------------------------------------------
-- 5. Confirmar
-- ---------------------------------------------------------------------
create or replace function portal_agendar(
  p_reserva_id text, p_visitante_id text,
  p_nome text, p_telefone text, p_observacao text
) returns table (id text, protocolo text, inicio timestamptz, fim timestamptz,
                 profissional_id text, servico_id text, situacao text)
language plpgsql security definer set search_path = public as $fn$
/*
  `#variable_conflict use_column` e os apelidos de tabela abaixo
  consertam um defeito que impedia o portal de funcionar.

  `returns table (id text, ...)` declara `id`, `situacao`, `inicio` e
  companhia como variáveis de saída da função. A partir daí, um
  `where id = ...` no corpo é ambíguo — o Postgres não sabe se você
  quis a coluna da tabela ou a variável — e a resposta padrão dele é
  abortar:

    ERROR: column reference "id" is ambiguous

  Não era um caso de borda: acontecia em toda confirmação. A cliente
  escolhia o horário, preenchia nome e telefone, tocava em confirmar e
  recebia um erro genérico. Nenhum agendamento pelo link chegava a
  existir.

  A diretiva resolve o empate a favor da coluna; os apelidos deixam a
  intenção explícita para quem ler depois.
*/
#variable_conflict use_column
declare
  v_reserva  reservas%rowtype;
  v_servico  servicos%rowtype;
  v_studio   studio%rowtype;
  v_cliente  text;
  v_fone     text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_nome     text := btrim(coalesce(p_nome,''));
  v_protocolo text;
  v_id       text := gen_random_uuid()::text;
  v_ocupados integer;
begin
  if length(v_nome) < 2 then raise exception 'Informe seu nome completo.'; end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone com DDD.';
  end if;

  /*
    `reservas.id`, e não `id`.

    Sem a qualificação, o Postgres recusa a consulta inteira: a função
    declara `returns table (id text, ...)`, e esse `id` é uma variável
    de PL/pgSQL com o mesmo nome da coluna. O erro é
    "column reference id is ambiguous" — e ele derrubava **toda**
    confirmação vinda do link público, sempre, desde o primeiro dia.

    Vale registrar o que isso significava na prática: com o banco
    ligado, o portal mostrava a grade, prendia o horário, aceitava nome
    e telefone — e falhava exatamente no clique final. O painel não
    recebia nada. Como o caminho sem banco (localStorage) não passa por
    esta função, o defeito só aparecia em produção.
  */
  select * into v_reserva from reservas
  where reservas.id = p_reserva_id and reservas.visitante_id = p_visitante_id
    and reservas.situacao = 'ativa' and reservas.expira_em > now()
  for update;
  if not found then
    raise exception 'Seu horario expirou. Escolha outro, por favor.';
  end if;

  select sv.* into v_servico from servicos sv where sv.id = v_reserva.servico_id;
  select st.* into v_studio  from studio st limit 1;

  /*
    Confere de novo, agora.

    Não é paranoia: entre prender e confirmar passam minutos, e neles a
    proprietária pode ter bloqueado a tarde, desativado a profissional
    ou pausado o portal. A reserva não sabe disso — ela é uma linha
    gravada antes de tudo acontecer.
  */
  perform portal_conferir_horario(
    v_reserva.servico_id, v_reserva.profissional_id,
    v_reserva.inicio, v_reserva.fim);

  -- Teto de atendimentos ao mesmo tempo: é do espaço, não de cada
  -- profissional. Três pessoas livres não adiantam com duas cadeiras.
  if coalesce(v_studio.atendimentos_simultaneos, 0) > 0 then
    select count(*) into v_ocupados from agendamentos a
    where a.situacao in ('pendente','confirmado','em_atendimento','concluido',
                         'solicitou_alteracao','solicitou_cancelamento')
      and tstzrange(a.inicio, a.fim) && tstzrange(v_reserva.inicio, v_reserva.fim);
    if v_ocupados >= v_studio.atendimentos_simultaneos then
      raise exception 'Este horario ja esta no limite de atendimentos.';
    end if;
  end if;

  -- Telefone é a chave da cliente: reaproveitar a ficha mantém o
  -- histórico dela inteiro em vez de criar uma segunda pessoa.
  select c.id into v_cliente from clientes c where c.telefone = v_fone limit 1;

  if v_cliente is null then
    v_cliente := gen_random_uuid()::text;
    insert into clientes (id, nome, telefone, whatsapp, aceita_contato, ativo)
    values (v_cliente, v_nome, v_fone, v_fone, true, true);
  end if;

  loop
    v_protocolo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from agendamentos a where a.protocolo = v_protocolo);
  end loop;

  -- A restrição de exclusão da tabela é a última palavra: se duas
  -- pessoas passarem por todas as checagens no mesmo instante, aqui uma
  -- delas é recusada pelo banco. Nenhum código de aplicação fecha essa
  -- janela sozinho.
  insert into agendamentos (
    id, cliente_id, profissional_id, servico_id, inicio, fim, situacao,
    preco, desconto, observacao, origem, nome_avulso, telefone_avulso,
    protocolo, remarcacoes
  ) values (
    v_id, v_cliente, v_reserva.profissional_id, v_reserva.servico_id,
    v_reserva.inicio, v_reserva.fim,
    case when v_studio.confirmacao_manual then 'pendente' else 'confirmado' end,
    v_servico.preco, 0,
    left(nullif(btrim(coalesce(p_observacao,'')), ''), 500),
    'link', v_nome, v_fone, v_protocolo, '[]'::jsonb
  );

  update reservas set situacao = 'concluida', agendamento_id = v_id
  where reservas.id = p_reserva_id;

  return query
    select a.id, a.protocolo, a.inicio, a.fim, a.profissional_id, a.servico_id, a.situacao
    from agendamentos a where a.id = v_id;
exception
  when exclusion_violation then
    raise exception 'Este horario acabou de ser ocupado. Escolha outro, por favor.';
end $fn$;

-- ---------------------------------------------------------------------
-- 6. Consultar o próprio horário
-- ---------------------------------------------------------------------
create or replace function portal_consultar(p_protocolo text, p_telefone text)
returns table (id text, protocolo text, inicio timestamptz, fim timestamptz,
               situacao text, preco numeric, desconto numeric, observacao text,
               chegou_em timestamptz, servico text, profissional text, cliente text)
language sql security definer set search_path = public stable as $fn$
  -- Protocolo E telefone, sempre os dois. Protocolo sozinho tem seis
  -- caracteres e sai por força bruta; telefone sozinho abriria a agenda
  -- de qualquer pessoa para quem souber o número dela.
  select a.id, a.protocolo, a.inicio, a.fim, a.situacao, a.preco, a.desconto,
         a.observacao, a.chegou_em, s.nome, p.nome,
         coalesce(c.nome, a.nome_avulso)
  from agendamentos a
  left join servicos s on s.id = a.servico_id
  left join profissionais p on p.id = a.profissional_id
  left join clientes c on c.id = a.cliente_id
  where upper(btrim(a.protocolo)) = upper(btrim(p_protocolo))
    and length(btrim(coalesce(p_protocolo,''))) between 4 and 12
    and regexp_replace(coalesce(a.telefone_avulso, c.telefone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_telefone,''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g')) >= 10
  limit 1;
$fn$;

-- ---------------------------------------------------------------------
-- 7. Pedir alteração ou cancelamento
-- ---------------------------------------------------------------------
create or replace function portal_solicitar(
  p_protocolo text, p_telefone text, p_tipo text, p_mensagem text
) returns solicitacoes
language plpgsql security definer set search_path = public as $fn$
declare
  v_agendamento text;
  v_situacao text;
  v_nova solicitacoes%rowtype;
begin
  if p_tipo not in ('alteracao','cancelamento') then
    raise exception 'Tipo de pedido invalido.';
  end if;

  if not (select coalesce(aceita_solicitacoes, true) from studio limit 1) then
    raise exception 'Os pedidos pelo link estao desativados no momento.';
  end if;

  select c.id, c.situacao into v_agendamento, v_situacao
  from portal_consultar(p_protocolo, p_telefone) c;

  if v_agendamento is null then raise exception 'Horario nao encontrado.'; end if;

  if v_situacao in ('cancelado','concluido','faltou') then
    raise exception 'Este horario ja foi encerrado.';
  end if;

  if exists (select 1 from solicitacoes s
             where s.agendamento_id = v_agendamento and s.situacao = 'aberta') then
    raise exception 'Ja existe um pedido em analise para este horario.';
  end if;

  -- O horário continua ocupado. Liberar agora seria entregá-lo a outra
  -- cliente enquanto a proprietária ainda nem viu o pedido.
  update agendamentos set
    situacao_anterior = situacao,
    situacao = case when p_tipo = 'alteracao'
                    then 'solicitou_alteracao' else 'solicitou_cancelamento' end
  where id = v_agendamento;

  insert into solicitacoes (id, agendamento_id, tipo, situacao, mensagem)
  values (gen_random_uuid()::text, v_agendamento, p_tipo, 'aberta',
          left(nullif(btrim(coalesce(p_mensagem,'')), ''), 500))
  returning * into v_nova;

  return v_nova;
end $fn$;

-- ---------------------------------------------------------------------
-- 8. Lista de espera
-- ---------------------------------------------------------------------
create or replace function portal_entrar_na_fila(
  p_nome text, p_telefone text, p_servico_id text,
  p_profissional_id text, p_data date, p_periodo text, p_observacao text
) returns lista_espera
language plpgsql security definer set search_path = public as $fn$
declare
  v_fone text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_nova lista_espera%rowtype;
begin
  if not (select lista_espera_ativa from studio limit 1) then
    raise exception 'A lista de espera esta desativada no momento.';
  end if;
  if length(btrim(coalesce(p_nome,''))) < 2 then
    raise exception 'Informe seu nome completo.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone com DDD.';
  end if;
  if p_periodo is not null and p_periodo not in ('manha','tarde','qualquer') then
    raise exception 'Periodo invalido.';
  end if;
  if not exists (select 1 from servicos where id = p_servico_id and ativo and no_link_publico) then
    raise exception 'Servico indisponivel.';
  end if;
  if p_data is not null and p_data < (now() at time zone
       coalesce((select fuso from studio limit 1), 'America/Sao_Paulo'))::date then
    raise exception 'Escolha uma data futura.';
  end if;

  if exists (
    select 1 from lista_espera e
    where e.telefone = v_fone and e.servico_id = p_servico_id
      and e.data is not distinct from p_data and e.situacao = 'aguardando'
  ) then
    raise exception 'Voce ja esta na lista de espera para este dia.';
  end if;

  -- Teto por telefone: a fila não pode virar caixa de entrada de robô.
  if (select count(*) from lista_espera e
      where e.telefone = v_fone and e.situacao = 'aguardando') >= 10 then
    raise exception 'Voce ja tem muitos pedidos na lista de espera.';
  end if;

  insert into lista_espera (id, nome, telefone, servico_id, profissional_id,
                            data, periodo, observacao, situacao)
  values (gen_random_uuid()::text, left(btrim(p_nome), 120), v_fone, p_servico_id,
          p_profissional_id, p_data, coalesce(p_periodo,'qualquer'),
          left(nullif(btrim(coalesce(p_observacao,'')), ''), 500), 'aguardando')
  returning * into v_nova;

  return v_nova;
end $fn$;

-- ---------------------------------------------------------------------
-- 9. Check-in
-- ---------------------------------------------------------------------
-- Mesmo caso do `portal_studio` acima: o 09-concorrencia.sql troca o
-- retorno de `void` para `timestamptz`, para a tela usar a hora que o
-- BANCO gravou em vez do relógio do aparelho.
drop function if exists portal_cheguei(text,text);

create function portal_cheguei(p_protocolo text, p_telefone text)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_id text; v_inicio timestamptz; v_fim timestamptz;
begin
  if not (select coalesce(checkin_ativo, false) from studio limit 1) then
    raise exception 'O check-in esta desativado no momento.';
  end if;

  select c.id, c.inicio, c.fim into v_id, v_inicio, v_fim
  from portal_consultar(p_protocolo, p_telefone) c;

  if v_id is null then raise exception 'Horario nao encontrado.'; end if;

  -- Só na janela em que faz sentido: uma hora antes até o fim.
  if now() < v_inicio - interval '1 hour' then
    raise exception 'Ainda e cedo para avisar que chegou.';
  end if;
  if now() > v_fim then
    raise exception 'Este horario ja passou.';
  end if;

  update agendamentos set chegou_em = now() where id = v_id and chegou_em is null;
end $fn$;

-- ---------------------------------------------------------------------
-- 10. Faxina que o portal pode chamar
-- ---------------------------------------------------------------------
-- Separada de `limpar_reservas` de propósito. A faxina completa também
-- APAGA linhas antigas, e uma função que apaga não fica ao alcance da
-- chave pública. Esta só marca como vencido o que já venceu — se
-- alguém a chamar mil vezes, mil vezes nada acontece.
create or replace function portal_faxina() returns integer
language plpgsql security definer set search_path = public as $fn$
declare v_expiradas integer;
begin
  update reservas set situacao = 'expirada'
  where situacao = 'ativa' and expira_em <= now();
  get diagnostics v_expiradas = row_count;
  return v_expiradas;
end $fn$;

-- ---------------------------------------------------------------------
-- 11. Só estas funções ficam abertas ao público
-- ---------------------------------------------------------------------
-- `revoke ... from public` antes de cada grant: por padrão o Postgres
-- deixa qualquer papel executar função nova, e um esquecimento aqui
-- abriria de novo o que o 02-seguranca.sql fechou.
do $$
declare f text;
begin
  foreach f in array array[
    'portal_studio(text)', 'portal_jornada()', 'portal_servicos()',
    'portal_profissionais()', 'portal_ocupacao(timestamptz,timestamptz)',
    'portal_reservar(text,text,timestamptz,text)', 'portal_liberar(text)',
    'portal_agendar(text,text,text,text,text)',
    'portal_consultar(text,text)', 'portal_solicitar(text,text,text,text)',
    'portal_entrar_na_fila(text,text,text,text,date,text,text)',
    'portal_cheguei(text,text)', 'portal_faxina()'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- Estas são engrenagem interna das funções acima. Ficam fora do alcance
-- de quem só tem a chave pública.
revoke all on function portal_conferir_horario(text,text,timestamptz,timestamptz) from public, anon;
revoke all on function portal_agora_local(timestamptz) from public, anon;
