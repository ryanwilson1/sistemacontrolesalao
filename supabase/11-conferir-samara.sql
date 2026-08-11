-- =====================================================================
-- System Studio · Conferir o acesso restrito
-- Rode no SQL Editor. Não altera nada — só mostra e testa.
-- =====================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------------------------------------------------
-- Duas armadilhas que só aparecem na hora de conferir de verdade:
--
-- 1. **O SQL Editor não é a Samara.**
--    Ali você roda como dono do banco: `auth.uid()` é nulo e as
--    políticas não valem. Um `select * from lancamentos` funciona no
--    editor e isso não prova absolutamente nada sobre o acesso dela.
--    A seção 3 resolve isso fingindo ser ela dentro de uma transação.
--
-- 2. **O bootstrap do 02-seguranca.sql promove todo mundo.**
--    Aquele arquivo insere em `contas_equipe` cada linha de
--    `auth.users` que já existia, e o padrão da coluna é
--    `'proprietaria'`. Se a conta da Samara foi criada ANTES de o 02
--    rodar, ela entrou na lista como dona do salão — sem ninguém
--    escrever isso em lugar nenhum.
--
--    O `on conflict do nothing` fecha a porta pelo lado errado: rodar
--    o 02 de novo não conserta, porque a linha dela já existe. Só
--    `conceder_acesso_agenda` corrige.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Quem está na casa, e como
-- ---------------------------------------------------------------------
-- Leia esta tabela com atenção. É a fonte da verdade: o RLS pergunta a
-- ela, e (desde a correção em `sessao.ts`) a tela também.
--
-- A Samara PRECISA aparecer com papel = 'agenda'.
-- Se aparecer 'proprietaria', é o bootstrap descrito acima. Vá para o 2.
select
  c.email,
  c.papel,
  c.ativo,
  c.profissional_id,
  p.nome as profissional,
  c.criado_em
from contas_equipe c
left join profissionais p on p.id = c.profissional_id
order by c.criado_em;


-- ---------------------------------------------------------------------
-- 2. Corrigir o papel da Samara
-- ---------------------------------------------------------------------
-- PRÉ-REQUISITO: ela precisa estar cadastrada em Ajustes → Equipe, com
-- a função "Profissional (só agenda)". Sem isso o comando recusa — de
-- propósito, porque um acesso sem cadastro na equipe é alguém que
-- entra no sistema e não aparece na agenda de ninguém.
--
-- Descubra o id dela:
--
--   select id, nome, papel from profissionais where nome ilike '%samara%';
--
-- Depois troque ID_DA_SAMARA abaixo e rode. O comando ajusta os DOIS
-- lugares onde o papel mora — `contas_equipe` (o que o banco obedece)
-- e `profissionais` (o que a tela lê) — e é por isso que ele existe em
-- vez de dois `update` soltos.

-- select conceder_acesso_agenda('samaranicaciodossantos@gmail.com', 'ID_DA_SAMARA');


-- ---------------------------------------------------------------------
-- 3. O teste que vale: fingir ser ela
-- ---------------------------------------------------------------------
-- Tudo dentro de `begin ... rollback`, então nada é gravado mesmo que
-- alguma linha passe.
--
-- Troque o UUID pelo `id` da conta dela em Authentication → Users.
-- É o valor da primeira coluna, algo como
-- b70fa2b8-4e05-4fc8-9223-222d3c3436d4.

begin;

  set local role authenticated;
  set local request.jwt.claims to
    '{"sub":"COLE-AQUI-O-UUID-DA-SAMARA","role":"authenticated"}';

  -- ---- O que ela DEVE conseguir --------------------------------
  -- As três precisam devolver linhas (ou zero linhas, se a agenda
  -- estiver vazia) SEM erro de permissão.
  select 'agendamentos: deve funcionar' as teste, count(*) from agendamentos;
  select 'servicos: deve funcionar'     as teste, count(*) from servicos;
  select 'bloqueios: deve funcionar'    as teste, count(*) from bloqueios;

  -- ---- O que ela NÃO deve conseguir ----------------------------
  -- Todas estas precisam devolver ZERO. Qualquer número maior que
  -- zero é uma porta aberta — pare e me diga qual.
  select 'lancamentos: deve dar 0'  as teste, count(*) from lancamentos;
  select 'caixas: deve dar 0'       as teste, count(*) from caixas;
  select 'produtos: deve dar 0'     as teste, count(*) from produtos;
  select 'cupons: deve dar 0'       as teste, count(*) from cupons;
  select 'procedimentos: deve dar 0' as teste, count(*) from procedimentos;

  -- A trilha de auditoria guarda cópia de tudo que já mudou no banco.
  -- É o vazamento mais silencioso do sistema e precisa dar zero.
  select 'auditoria: deve dar 0'    as teste, count(*) from auditoria;

  -- ---- As RPCs privilegiadas -----------------------------------
  -- Esta devolve as 26 tabelas do salão num JSON só. TEM que dar erro
  -- de permissão. Rode a linha sozinha, porque o erro aborta o resto.
  --
  --   select instantaneo_do_studio();
  --
  -- Esperado: ERROR: Sem permissao para ler os dados do studio.
  --
  -- Se em vez do erro vier um JSON gigante, o 09-concorrencia.sql
  -- ainda não foi aplicado.

rollback;


-- ---------------------------------------------------------------------
-- 4. Os arquivos foram todos aplicados?
-- ---------------------------------------------------------------------
-- `equipe_com_acesso_completo` vem do 02. As demais são o mapa do que
-- falta rodar: cada linha ausente é um arquivo pendente.
select
  p.proname as funcao,
  case p.proname
    when 'equipe_com_acesso_completo' then '02-seguranca.sql'
    when 'acesso_so_agenda'           then '10-acesso-agenda.sql'
    when 'conceder_acesso_agenda'     then '10-acesso-agenda.sql'
    when 'movimentar_estoque'         then '08-transacoes.sql'
    when 'instantaneo_do_studio'      then '09-concorrencia.sql'
    when 'limpar_auditoria'           then '05-integridade.sql'
    when 'portal_studio'              then '03 + 07 (o 07 prevalece)'
  end as vem_do_arquivo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'equipe_com_acesso_completo','acesso_so_agenda','conceder_acesso_agenda',
    'movimentar_estoque','instantaneo_do_studio','limpar_auditoria','portal_studio'
  )
order by p.proname;


-- ---------------------------------------------------------------------
-- 5. O teto diário chega ao link público?
-- ---------------------------------------------------------------------
-- `portal_studio` é definida em DOIS arquivos, e a do 07 apaga a do 03.
-- Se `limite_diario` não aparecer aqui, o 07 rodou com a versão antiga
-- e o link continua aceitando agendamento acima do teto — sem erro,
-- sem aviso, até uma cliente marcar o nono horário de um dia de oito.
select
  case when pg_get_function_result(p.oid) like '%limite_diario%'
       then 'OK — o teto diario chega ao link publico'
       else 'FALTA — rode o 07-identidade.sql atualizado'
  end as resultado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'portal_studio';
