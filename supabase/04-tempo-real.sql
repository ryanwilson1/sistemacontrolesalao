-- =====================================================================
-- System Studio · Tempo real
-- Rode depois do 03-portal.sql.
-- =====================================================================
--
-- O que muda com esta publicação: o Postgres passa a avisar sozinho
-- quem estiver ouvindo, e o `publicar` do canal fica vazio. Hoje quem
-- avisa é o próprio código, porque não há mais ninguém para fazê-lo.
--
-- Duas coisas importantes sobre segurança do Realtime:
--
-- 1. O Realtime **respeita o RLS**. Como `anon` não enxerga tabela
--    alguma, um curioso com a chave pública não recebe eventos de
--    agendamento. Só a equipe autenticada recebe.
--
-- 2. Por isso o portal da cliente NÃO usa tempo real, e não é
--    limitação: ela está preenchendo um formulário de dois minutos.
--    O que a protege de perder o horário é a reserva temporária, não
--    a grade se mexendo embaixo do dedo dela.
-- =====================================================================

drop publication if exists supabase_realtime;

create publication supabase_realtime for table
  agendamentos, bloqueios, reservas, solicitacoes, lista_espera,
  clientes, servicos, profissionais, jornada, studio,
  lancamentos, produtos, movimentos, caixas, movimentos_caixa,
  lembretes, notificacoes;

-- `replica identity full` faz o evento carregar a linha inteira, não só
-- a chave. Custa um pouco de banda e evita uma consulta extra a cada
-- mudança — mas o motivo principal é outro: sem isso, o evento de
-- exclusão chega sem os dados e não dá para saber o que sumiu da tela.
do $$
declare t text;
begin
  foreach t in array array[
    'agendamentos','bloqueios','reservas','solicitacoes','lista_espera',
    'clientes','servicos','profissionais','jornada','studio',
    'lancamentos','produtos','movimentos','caixas','movimentos_caixa',
    'lembretes','notificacoes'
  ]
  loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Faxina das reservas vencidas
-- ---------------------------------------------------------------------
-- Hoje quem varre é a tela aberta, porque não há servidor. Com banco,
-- isto passa a acontecer sozinho — inclusive de madrugada, com o
-- navegador de todo mundo fechado.
--
-- Se a extensão pg_cron estiver disponível no seu plano:
--
--   select cron.schedule('faxina-reservas', '*/5 * * * *',
--                        $$select limpar_reservas()$$);
--
-- Sem pg_cron, `portal_faxina()` roda a partir das telas abertas e dá
-- conta do dia a dia; o acúmulo de linhas antigas passa a depender de
-- alguém autenticado abrir o painel de vez em quando.

create or replace function limpar_reservas() returns integer
language plpgsql security definer set search_path = public as $fn$
declare v_expiradas integer;
begin
  update reservas set situacao = 'expirada'
  where situacao = 'ativa' and expira_em <= now();
  get diagnostics v_expiradas = row_count;

  -- Reservas são registros de cinco minutos criados a cada clique de
  -- cada visitante. Sem faxina, a tabela vira lixo em uma semana boa.
  --
  -- A linha protege o que importa: só sai reserva que já foi resolvida
  -- — vencida, solta ou virada agendamento. Uma reserva ainda ativa
  -- nunca é apagada por idade, porque apagá-la devolveria à grade um
  -- horário que alguém está preenchendo neste momento.
  delete from reservas
  where situacao in ('expirada','liberada','concluida')
    and atualizado_em < now() - interval '2 days';

  return v_expiradas;
end $fn$;

-- ---------------------------------------------------------------------
-- Quem pode chamar
-- ---------------------------------------------------------------------
-- `anon` fica de fora. A função apaga linhas, e função que apaga não
-- pertence a quem só tem a chave pública — mesmo que o alvo pareça
-- inofensivo hoje. O portal usa `portal_faxina()`, que só marca o que
-- venceu e não remove nada.
revoke all on function limpar_reservas() from public, anon;
grant execute on function limpar_reservas() to authenticated;
