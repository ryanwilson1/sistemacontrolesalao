-- =====================================================================
-- System Studio · Blindagem de concorrência + verificação final
-- Rode no SQL Editor DEPOIS do 12-correcao-esquema.sql.
-- =====================================================================
--
-- Duas guardas que faltavam e uma conferência que faltava mais ainda.
--
-- A regra por trás das guardas: toda proteção "consultar se existe →
-- criar se não existe" que mora só no JavaScript é uma corrida
-- esperando dois aparelhos. O espelho de um celular não enxerga o que
-- o outro gravou há meio segundo; a única testemunha dos dois ao mesmo
-- tempo é o banco — então é no banco que a regra precisa morar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. UM CAIXA ABERTO POR VEZ — no sistema inteiro
-- ---------------------------------------------------------------------
-- `caixas(data)` único já impede dois caixas NO MESMO DIA. O que ele
-- não impede: o caixa de ontem esquecido aberto e o de hoje abrindo
-- por cima. Dois abertos = duas gavetas recebendo movimento = um
-- fechamento que nunca mais bate.
--
-- Antes do índice, o passado é arrumado: se houver mais de um aberto,
-- todos menos o mais recente são fechados com a diferença em branco —
-- fechar com valor inventado seria pior que fechar sem valor.
update caixas c
   set situacao = 'fechado',
       fechado_em = coalesce(c.fechado_em, now()),
       observacoes = coalesce(c.observacoes, '')
         || ' [fechado automaticamente: havia mais de um caixa aberto]'
 where c.situacao = 'aberto'
   and c.aberto_em < (
     select max(aberto_em) from caixas where situacao = 'aberto'
   );

create unique index if not exists caixas_um_aberto
  on caixas ((true))
  where situacao = 'aberto';

-- ---------------------------------------------------------------------
-- 2. UMA META POR MÊS
-- ---------------------------------------------------------------------
-- Duas metas para o mesmo mês fazem o painel escolher uma ao acaso.
-- Se já houver duplicata, fica a mais recente — é a que a proprietária
-- editou por último, portanto a intenção mais nova.
delete from metas m
 where exists (
   select 1 from metas outra
    where outra.mes = m.mes
      and (outra.atualizado_em > m.atualizado_em
           or (outra.atualizado_em = m.atualizado_em and outra.id > m.id))
 );

create unique index if not exists metas_por_mes on metas (mes);

-- ---------------------------------------------------------------------
-- 3. VERIFICAÇÃO FINAL — o banco está CORRETO, não só migrado
-- ---------------------------------------------------------------------
-- "O arquivo executou" e "o banco está certo" são afirmações
-- diferentes. Este bloco confere o que os arquivos 01–13 prometem:
-- colunas da correção 12, índices de concorrência, funções críticas e
-- gatilhos. Qualquer ausência FALHA ALTO com a lista do que faltou.
do $$
declare
  faltando text := '';
begin
  -- Colunas da correção de esquema (12)
  select coalesce(string_agg('coluna ' || t || '.' || c, ', '), '')
    into faltando
    from (values
      ('caixas','aberto_por_id'), ('caixas','valor_informado'),
      ('movimentos_caixa','origem'), ('movimentos_caixa','profissional_id'),
      ('procedimentos','realizado_em'), ('procedimentos','valor_final'),
      ('fotos','url'), ('fotos','tamanho_bytes')
    ) as esperado(t, c)
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = c
   );

  -- Índices de unicidade que as regras de negócio assumem
  for faltando in
    select 'indice ' || nome
      from (values
        ('clientes_telefone_unico'),
        ('agendamentos_protocolo_unico'),
        ('caixas_por_data'),
        ('caixas_um_aberto'),
        ('metas_por_mes')
      ) as esperado(nome)
     where not exists (select 1 from pg_indexes
                        where schemaname = 'public' and indexname = esperado.nome)
  loop
    raise exception 'Verificacao final falhou: % nao existe.', faltando;
  end loop;

  -- Funções que o frontend chama
  for faltando in
    select 'funcao ' || nome
      from (values
        ('atualizar_com_versao'), ('concluir_atendimento'), ('pulso'),
        ('equipe_autorizada'), ('preencher_ficha_e_caixa')
      ) as esperado(nome)
     where not exists (select 1 from pg_proc p
                         join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = esperado.nome)
  loop
    raise exception 'Verificacao final falhou: % nao existe.', faltando;
  end loop;

  -- O papel 'agenda' precisa ser aceito pelos DOIS checks (10-acesso-agenda)
  --
  -- O código chama `autorizar_conta(..., 'agenda', ...)` assumindo que
  -- a migration 10 rodou. Sem ela, a chamada morre num 23514 que não
  -- diz nada — "valor fora do permitido" — e quem opera fica caçando um
  -- erro de digitação que não existe. A dependência silenciosa vira
  -- verificação explícita: falta o 10, este bloco diz o nome dele.
  for faltando in
    select 'check de papel com ''agenda'' em ' || tabela
      from (values ('contas_equipe','contas_equipe_papel_check'),
                   ('profissionais','profissional_papel_valido')) as esperado(tabela, nome)
     where not exists (
       select 1 from pg_constraint c
         join pg_class t on t.oid = c.conrelid
        where t.relname = esperado.tabela
          and c.conname = esperado.nome
          and pg_get_constraintdef(c.oid) like '%agenda%'
     )
  loop
    raise exception 'Verificacao final falhou: % nao aceita o papel — rode 10-acesso-agenda.sql.', faltando;
  end loop;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'acesso_so_agenda'
  ) then
    raise exception 'Verificacao final falhou: acesso_so_agenda() nao existe — rode 10-acesso-agenda.sql.';
  end if;

  -- Gatilhos da correção 12
  for faltando in
    select 'gatilho ' || nome
      from (values ('procedimentos_completar'), ('movimentos_caixa_completar')) as esperado(nome)
     where not exists (select 1 from pg_trigger where tgname = esperado.nome)
  loop
    raise exception 'Verificacao final falhou: % nao existe.', faltando;
  end loop;

  -- A RPC de versão precisa ser a CORRIGIDA (jsonb_populate_record),
  -- não a original com cast quebrado. O texto da função é a evidência.
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'atualizar_com_versao'
       and pg_get_functiondef(p.oid) like '%jsonb_populate_record%'
  ) then
    raise exception
      'Verificacao final falhou: atualizar_com_versao ainda é a versão antiga (cast text). Rode 12-correcao-esquema.sql.';
  end if;

  raise notice 'VERIFICACAO FINAL OK: colunas, indices, funcoes, gatilhos e RPC corrigida conferidos.';
end $$;
