-- =====================================================================
-- System Studio · Operações atômicas
-- Rode depois do 07-identidade.sql.
-- =====================================================================
--
-- Duas operações do sistema mexem em várias tabelas de uma vez, e as
-- duas faziam isso com gravações independentes disparadas do
-- navegador. Entre uma e outra cabe uma queda de rede, um token
-- expirado, um F5 — e o que sobra é um banco pela metade.
--
--   Concluir atendimento  → agendamento + procedimento + receita +
--                           pontos + caixa + baixa de estoque
--   Movimentar estoque    → movimento + saldo do produto
--
-- O que podia acontecer, e não é hipótese remota — é o celular perdendo
-- sinal no meio de um atendimento:
--
--   * atendimento concluído sem receita lançada (o dia fecha com menos
--     dinheiro do que entrou);
--   * receita lançada sem atendimento concluído (o dia fecha com mais);
--   * pontos creditados para um atendimento que não existe;
--   * movimento de estoque gravado e saldo do produto intacto — a
--     contagem física deixa de bater com o sistema para sempre, porque
--     o saldo é derivado e ninguém sabe qual movimento não foi aplicado.
--
-- Uma função do Postgres roda inteira ou não roda. É a única forma de
-- fechar essa janela: nenhum código de aplicação consegue, porque o
-- problema é justamente o código de aplicação parar no meio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Movimentar estoque
-- ---------------------------------------------------------------------
/*
  `for update` na primeira linha, e é o ponto da função.

  Sem o lock, duas baixas simultâneas do mesmo produto leem o mesmo
  saldo — digamos 10 —, cada uma calcula 10 menos 6 e as duas gravam 4.
  Saíram 12 unidades e o sistema registra 6. O produto acaba na
  prateleira antes de acabar na tela, que é como se descobre o defeito.

  Com o lock, a segunda espera a primeira terminar, lê 4 e recusa por
  saldo insuficiente — que é a resposta correta.
*/
create or replace function movimentar_estoque(
  p_produto_id     text,
  p_tipo           text,
  p_quantidade     numeric,
  p_motivo         text default null,
  p_agendamento_id text default null,
  p_custo_unitario numeric default null
) returns produtos
language plpgsql security definer set search_path = public as $fn$
declare
  v_produto  produtos%rowtype;
  v_delta    numeric;
  v_saldo    numeric;
  v_medio    numeric;
  v_custo    numeric;
begin
  -- Estoque é uma das áreas fechadas para o acesso restrito
  -- (10-acesso-agenda.sql). Sem esta troca, a política de tabela era
  -- contornável por uma chamada direta a esta RPC.
  if not (select equipe_com_acesso_completo()) then
    raise exception 'Sem permissao para movimentar o estoque.';
  end if;

  if p_tipo not in ('entrada','saida','ajuste','consumo','perda') then
    raise exception 'Tipo de movimento invalido.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.';
  end if;

  -- A linha fica travada até o fim da transação.
  select * into v_produto from produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto nao encontrado.'; end if;

  v_delta := case when p_tipo in ('entrada','ajuste') then p_quantidade else -p_quantidade end;
  v_saldo := round(v_produto.quantidade + v_delta, 3);

  if v_saldo < 0 then
    raise exception 'Saldo insuficiente: restam % % de %.',
      v_produto.quantidade, v_produto.unidade, v_produto.nome;
  end if;

  insert into movimentos (id, produto_id, agendamento_id, tipo, quantidade, motivo)
  values (gen_random_uuid()::text, p_produto_id, p_agendamento_id, p_tipo,
          p_quantidade, nullif(btrim(coalesce(p_motivo,'')), ''));

  /*
    Custo médio ponderado, não o preço da última compra.

    O preço da última nota distorce a margem sempre que o fornecedor
    varia — e ele varia. A média move o custo na proporção do que
    entrou, que é o número que responde "quanto me custou o que está na
    prateleira agora".
  */
  v_medio := v_produto.preco_medio;
  v_custo := v_produto.preco_custo;

  if p_tipo = 'entrada' and coalesce(p_custo_unitario, 0) > 0 and v_saldo > 0 then
    v_medio := round(
      ((v_produto.quantidade * v_produto.preco_medio) + (p_quantidade * p_custo_unitario))
      / v_saldo, 4);
    v_custo := p_custo_unitario;
  end if;

  update produtos
     set quantidade = v_saldo, preco_medio = v_medio, preco_custo = v_custo
   where id = p_produto_id
  returning * into v_produto;

  return v_produto;
end $fn$;

revoke all on function movimentar_estoque(text,text,numeric,text,text,numeric) from public, anon;
grant execute on function movimentar_estoque(text,text,numeric,text,text,numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Concluir atendimento
-- ---------------------------------------------------------------------
/*
  Tudo ou nada.

  `p_produtos` chega como jsonb no formato que a tela já monta:

    [{ "produtoId": "...", "quantidade": 2 }, ...]

  A conclusão duplicada é barrada pelo `for update` mais a checagem de
  situação: duas telas concluindo o mesmo atendimento no mesmo instante
  não geram duas receitas, porque a segunda espera e encontra o
  atendimento já concluído.
*/
create or replace function concluir_atendimento(
  p_agendamento_id text,
  p_produtos       jsonb default '[]'::jsonb,
  p_observacoes    text default null,
  p_recomendacoes  text default null,
  p_proximo_passo  text default null,
  p_forma          text default 'pix'
) returns agendamentos
language plpgsql security definer set search_path = public as $fn$
declare
  v_ag        agendamentos%rowtype;
  v_servico   servicos%rowtype;
  v_cliente   clientes%rowtype;
  v_fidel     fidelidade%rowtype;
  v_caixa     caixas%rowtype;
  v_liquido   numeric;
  v_minutos   integer;
  v_proc_id   text;
  v_item      jsonb;
  v_descricao text;
begin
  if not (select equipe_autorizada()) then
    raise exception 'Sem permissao para concluir atendimentos.';
  end if;

  if p_forma not in ('dinheiro','pix','debito','credito','transferencia','cortesia') then
    raise exception 'Forma de pagamento invalida.';
  end if;

  select * into v_ag from agendamentos where id = p_agendamento_id for update;
  if not found then raise exception 'Agendamento nao encontrado.'; end if;

  -- Já concluído: devolve como está, sem duplicar consequência alguma.
  if v_ag.situacao = 'concluido' then return v_ag; end if;

  if v_ag.situacao in ('cancelado','faltou') then
    raise exception 'Este atendimento esta % e nao pode ser concluido.', v_ag.situacao;
  end if;

  select * into v_servico from servicos where id = v_ag.servico_id;
  if v_ag.cliente_id is not null then
    select * into v_cliente from clientes where id = v_ag.cliente_id;
  end if;

  v_liquido := greatest(v_ag.preco - v_ag.desconto, 0);

  /* ---- 1. O atendimento ---- */
  update agendamentos
     set situacao      = 'concluido',
         finalizado_em = now(),
         iniciado_em   = coalesce(iniciado_em, inicio)
   where id = p_agendamento_id
  returning * into v_ag;

  /* ---- 2. O procedimento (ficha de evolução da cliente) ---- */
  if v_ag.cliente_id is not null
     and not exists (select 1 from procedimentos p where p.agendamento_id = v_ag.id) then

    v_minutos := round(extract(epoch from (v_ag.fim - v_ag.inicio)) / 60);
    v_proc_id := gen_random_uuid()::text;

    insert into procedimentos (
      id, cliente_id, agendamento_id, servico_id, profissional_id,
      data, formula, observacoes, produtos
    ) values (
      v_proc_id, v_ag.cliente_id, v_ag.id, v_ag.servico_id, v_ag.profissional_id,
      v_ag.inicio, nullif(btrim(coalesce(p_recomendacoes,'')), ''),
      coalesce(nullif(btrim(coalesce(p_observacoes,'')), ''), v_ag.observacao),
      coalesce(p_produtos, '[]'::jsonb)
    );
  end if;

  /* ---- 3. Baixa dos produtos consumidos ----
     Dentro da mesma transação: se um produto não tiver saldo, o
     atendimento inteiro é desfeito. É a resposta certa — um
     atendimento que consumiu o que não existia precisa ser corrigido
     antes de ser fechado, não depois. */
  for v_item in select * from jsonb_array_elements(coalesce(p_produtos, '[]'::jsonb))
  loop
    if (v_item ->> 'produtoId') is not null
       and coalesce((v_item ->> 'quantidade')::numeric, 0) > 0 then
      perform movimentar_estoque(
        v_item ->> 'produtoId', 'consumo', (v_item ->> 'quantidade')::numeric,
        'Consumo em atendimento', v_ag.id, null);
    end if;
  end loop;

  if v_liquido > 0 then
    /* ---- 4. Receita ---- */
    if not exists (select 1 from lancamentos l where l.agendamento_id = v_ag.id) then
      v_descricao := concat_ws(' · ',
        coalesce(v_servico.nome, 'Atendimento'), v_cliente.nome);

      insert into lancamentos (
        id, agendamento_id, cliente_id, tipo, situacao, categoria,
        descricao, valor, forma, vencimento, pago_em
      ) values (
        gen_random_uuid()::text, v_ag.id, v_ag.cliente_id, 'receita', 'recebido',
        'Serviços', v_descricao, v_liquido, p_forma,
        (v_ag.inicio at time zone coalesce((select fuso from studio limit 1),
                                           'America/Sao_Paulo'))::date,
        now()
      );
    end if;

    /* ---- 5. Pontos de fidelidade ---- */
    select * into v_fidel from fidelidade limit 1;

    if v_ag.cliente_id is not null and coalesce(v_fidel.ativo, false)
       and not exists (select 1 from pontos p
                       where p.agendamento_id = v_ag.id and p.motivo = 'atendimento') then
      insert into pontos (id, cliente_id, agendamento_id, pontos, motivo)
      values (gen_random_uuid()::text, v_ag.cliente_id, v_ag.id,
              floor(v_liquido * coalesce(v_fidel.pontos_por_real, 1))::integer,
              'atendimento');
    end if;

    /* ---- 6. Caixa, quando houver um aberto ----
       Não abrimos caixa automaticamente: abrir é um ato consciente,
       com valor de troco conferido. Sem caixa aberto, a receita entra
       só no financeiro. */
    select * into v_caixa from caixas where situacao = 'aberto' order by data desc limit 1;

    if found and not exists (
      select 1 from movimentos_caixa m where m.agendamento_id = v_ag.id
    ) then
      insert into movimentos_caixa (id, caixa_id, tipo, forma, descricao, valor, agendamento_id)
      values (gen_random_uuid()::text, v_caixa.id, 'entrada', p_forma,
              coalesce(v_servico.nome, 'Atendimento'), v_liquido, v_ag.id);
    end if;
  end if;

  return v_ag;
end $fn$;

revoke all on function concluir_atendimento(text,jsonb,text,text,text,text) from public, anon;
grant execute on function concluir_atendimento(text,jsonb,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Conferência de coerência
-- ---------------------------------------------------------------------
-- Responde à pergunta que motivou este arquivo: sobrou algum estado
-- pela metade de antes da correção? Roda sem alterar nada.
/*
  Conferência de integridade.

  A auditoria encontrou esta função **sem guarda nenhuma** — só o
  `grant execute to authenticated`. Sendo `security definer`, ela lia
  `lancamentos`, `movimentos_caixa`, `pontos` e `produtos` por cima do
  RLS e devolvia `min(descricao)` e `min(nome)` de cada um. Não é a
  tabela inteira, mas é vazamento: descrição de lançamento e nome de
  produto saindo para quem não pode abrir nem uma tela nem outra.

  A checagem entra em cada ramo em vez de num `raise` porque a função
  é `language sql`. O efeito para quem não tem acesso é o mesmo de não
  haver problema algum a relatar — que é a resposta certa para quem não
  responde por essa área.
*/
create or replace function conferir_atendimentos()
returns table (problema text, quantidade bigint, exemplo text)
language sql security definer set search_path = public stable as $fn$
  select 'Atendimento concluido sem receita'::text, count(*), min(a.protocolo)
  from agendamentos a
  where (select equipe_com_acesso_completo())
    and a.situacao = 'concluido' and a.preco - a.desconto > 0
    and not exists (select 1 from lancamentos l where l.agendamento_id = a.id)
  having count(*) > 0

  union all
  select 'Receita sem atendimento concluido', count(*), min(l.descricao)
  from lancamentos l
  join agendamentos a on a.id = l.agendamento_id
  where (select equipe_com_acesso_completo())
    and l.tipo = 'receita' and a.situacao <> 'concluido'
  having count(*) > 0

  union all
  select 'Pontos sem atendimento concluido', count(*), min(p.id)
  from pontos p
  join agendamentos a on a.id = p.agendamento_id
  where (select equipe_com_acesso_completo())
    and a.situacao <> 'concluido'
  having count(*) > 0

  union all
  select 'Movimento de caixa sem atendimento concluido', count(*), min(m.descricao)
  from movimentos_caixa m
  join agendamentos a on a.id = m.agendamento_id
  where (select equipe_com_acesso_completo())
    and a.situacao <> 'concluido'
  having count(*) > 0

  union all
  select 'Produto com saldo negativo', count(*), min(nome)
  from produtos
  where (select equipe_com_acesso_completo()) and quantidade < 0
  having count(*) > 0;
$fn$;

revoke all on function conferir_atendimentos() from public, anon;
grant execute on function conferir_atendimentos() to authenticated;
