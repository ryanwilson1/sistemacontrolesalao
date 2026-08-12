-- =====================================================================
-- System Studio · Estorno de atendimento concluído
-- Rode no SQL Editor DEPOIS do 13-blindagem-e-verificacao.sql.
-- =====================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------
-- Um atendimento concluído não podia ser desfeito por caminho nenhum.
-- A regra era deliberada — concluir gera receita, movimento de caixa,
-- pontos de fidelidade, baixa de estoque e a ficha de evolução da
-- cliente; apagar o agendamento sozinho deixaria tudo isso órfão e o
-- fechamento do dia pararia de bater.
--
-- Mas a regra criou um beco sem saída real: um atendimento concluído
-- POR ENGANO — ou um cadastro de teste feito no primeiro dia de uso —
-- ficava na agenda para sempre, inflando o faturamento e a ficha da
-- cliente. Não havia botão, não havia caminho, não havia conversa.
--
-- A resposta certa não é afrouxar a regra: é oferecer o inverso
-- completo. `concluir_atendimento` faz seis coisas numa transação;
-- esta função desfaz as seis na mesma transação, na ordem inversa.
--
-- O QUE ELA DESFAZ
-- ----------------
--   6. movimento de caixa      (a entrada volta a não existir)
--   5. pontos de fidelidade    (a cliente perde os pontos daquele dia)
--   4. lançamento de receita   (o faturamento volta ao que era)
--   3. baixa de estoque        (o produto consumido volta à prateleira)
--   2. ficha de evolução       (e as fotos ligadas a ela)
--   1. situação do agendamento (volta para 'confirmado')
--
-- `p_excluir = true` vai além e apaga o próprio agendamento — é o caso
-- do cadastro de teste, que não deve sobrar nem como histórico.
-- =====================================================================

create or replace function estornar_atendimento(
  p_agendamento_id text,
  p_excluir        boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_ag        agendamentos%rowtype;
  v_caixa     caixas%rowtype;
  v_mov       record;
  v_desfeito  jsonb := '{}'::jsonb;
  v_n         integer;
begin
  if not (select equipe_com_acesso_completo()) then
    raise exception 'Voce nao tem permissao para estornar um atendimento.';
  end if;

  -- `for update` segura a linha até o fim da transação: dois aparelhos
  -- estornando o mesmo atendimento não viram dois estornos.
  select * into v_ag from agendamentos where id = p_agendamento_id for update;
  if not found then
    raise exception 'Agendamento nao encontrado.';
  end if;

  /* ---- 6. Caixa ----
     A entrada só pode sair de um caixa AINDA ABERTO. Mexer num caixa
     fechado reescreveria uma conferência que já foi assinada — o valor
     contado naquele dia deixaria de bater com o sistema, e ninguém
     saberia por quê meses depois. Caixa fechado exige uma saída
     manual, feita por gente que entende o que está corrigindo. */
  for v_mov in
    select m.id, m.caixa_id, m.valor
      from movimentos_caixa m
     where m.agendamento_id = v_ag.id
  loop
    select * into v_caixa from caixas where id = v_mov.caixa_id;

    if v_caixa.situacao = 'fechado' then
      raise exception
        'O caixa do dia % ja foi fechado com esta entrada de R$ %. '
        'Registre uma saida manual no caixa atual em vez de estornar.',
        to_char(v_caixa.data, 'DD/MM/YYYY'), to_char(v_mov.valor, 'FM999999990.00')
        using errcode = 'P0001';
    end if;

    delete from movimentos_caixa where id = v_mov.id;
  end loop;

  /* ---- 5. Pontos de fidelidade ---- */
  delete from pontos where agendamento_id = v_ag.id and motivo = 'atendimento';
  get diagnostics v_n = row_count;
  v_desfeito := v_desfeito || jsonb_build_object('pontos', v_n);

  /* ---- 4. Receita ---- */
  delete from lancamentos where agendamento_id = v_ag.id and tipo = 'receita';
  get diagnostics v_n = row_count;
  v_desfeito := v_desfeito || jsonb_build_object('lancamentos', v_n);

  /* ---- 3. Estoque ----
     O produto consumido volta para a prateleira. `movimentar_estoque`
     não é reaproveitada aqui de propósito: ela recalcula preço médio,
     e devolver um consumo não é uma compra — o preço médio precisa
     ficar exatamente onde estava. Só a quantidade volta. */
  for v_mov in
    select m.id, m.produto_id, m.quantidade
      from movimentos m
     where m.agendamento_id = v_ag.id and m.tipo = 'consumo'
  loop
    update produtos
       set quantidade = quantidade + v_mov.quantidade
     where id = v_mov.produto_id;

    delete from movimentos where id = v_mov.id;
  end loop;

  /* ---- 2. Ficha de evolução ----
     As fotos saem junto pelo `on delete cascade` da própria tabela. */
  delete from procedimentos where agendamento_id = v_ag.id;
  get diagnostics v_n = row_count;
  v_desfeito := v_desfeito || jsonb_build_object('procedimentos', v_n);

  /* ---- 1. O agendamento ---- */
  if p_excluir then
    delete from agendamentos where id = v_ag.id;
    v_desfeito := v_desfeito || jsonb_build_object('excluido', true);
  else
    update agendamentos
       set situacao       = 'confirmado',
           finalizado_em  = null,
           atualizado_em  = now()
     where id = v_ag.id
    returning * into v_ag;

    v_desfeito := v_desfeito || jsonb_build_object('excluido', false)
                             || jsonb_build_object('agendamento', to_jsonb(v_ag));
  end if;

  return v_desfeito;
end $fn$;

revoke all on function estornar_atendimento(text, boolean) from public, anon;
grant execute on function estornar_atendimento(text, boolean) to authenticated;

comment on function estornar_atendimento(text, boolean) is
  'Desfaz por completo uma conclusao de atendimento: caixa, pontos, receita, estoque e ficha. '
  'Com p_excluir = true, apaga tambem o agendamento. Recusa se o caixa do dia ja foi fechado.';

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'estornar_atendimento'
  ) then
    raise exception 'estornar_atendimento nao foi criada.';
  end if;

  raise notice 'OK: estornar_atendimento disponivel.';
end $$;
