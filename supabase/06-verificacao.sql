-- =====================================================================
-- System Studio · Verificação
-- Rode por último. Não altera nada — só confere.
-- =====================================================================
--
-- Rode este arquivo inteiro no SQL Editor e leia a coluna `veredito`.
-- Qualquer linha marcada com FALHA precisa ser resolvida ANTES de o
-- link do salão ir para o WhatsApp de alguém.
--
-- Vale repetir de tempos em tempos — depois de uma atualização do
-- sistema, depois de mexer no painel do Supabase, ou quando algo
-- parecer estranho.
-- =====================================================================

with checagens as (

  -- 1. RLS ligado em todas as tabelas
  select
    1 as ordem,
    'RLS em todas as tabelas' as verificacao,
    count(*) as valor,
    case when count(*) = 0 then 'OK' else 'FALHA' end as veredito,
    case when count(*) = 0
      then 'Nenhuma tabela aberta.'
      else 'Tabelas sem RLS: ' || string_agg(tablename, ', ')
    end as detalhe
  from pg_tables
  where schemaname = 'public' and rowsecurity = false

  union all

  -- 2. Nenhuma tabela concedida a `anon`
  select
    2,
    'Chave publica sem acesso a tabela',
    count(*),
    case when count(*) = 0 then 'OK' else 'FALHA' end,
    case when count(*) = 0
      then 'A chave anon nao le tabela alguma.'
      else 'Concessoes indevidas: ' || string_agg(distinct table_name, ', ')
    end
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'

  union all

  -- 3. Toda tabela tem política declarada
  select
    3,
    'Politica declarada por tabela',
    count(*),
    case when count(*) = 0 then 'OK' else 'ATENCAO' end,
    case when count(*) = 0
      then 'Todas as tabelas tem politica.'
      else 'Sem politica (ninguem le nem grava): ' || string_agg(t.tablename, ', ')
    end
  from pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tablename)

  union all

  -- 4. Contas autorizadas
  select
    4,
    'Contas autorizadas no painel',
    count(*),
    case when count(*) = 0 then 'FALHA'
         when count(*) > 10 then 'ATENCAO'
         else 'OK' end,
    case when count(*) = 0
      then 'Ninguem consegue entrar. Rode: select autorizar_conta(''email@dominio.com'');'
      else 'Confira se reconhece cada uma: ' || string_agg(email, ', ')
    end
  from contas_equipe where ativo

  union all

  -- 5. Contas em auth.users que NAO estao autorizadas
  --    Uma aqui significa cadastro aberto sendo usado por estranho.
  select
    5,
    'Cadastros nao autorizados',
    count(*),
    case when count(*) = 0 then 'OK' else 'ATENCAO' end,
    case when count(*) = 0
      then 'Nenhum cadastro solto.'
      else 'Contas criadas sem autorizacao (elas nao acessam dados, mas investigue): '
           || string_agg(coalesce(u.email, u.id::text), ', ')
    end
  from auth.users u
  where not exists (select 1 from contas_equipe c where c.usuario_id = u.id)

  union all

  -- 6. Funções `security definer` sem search_path fixo
  select
    6,
    'security definer com search_path',
    count(*),
    case when count(*) = 0 then 'OK' else 'FALHA' end,
    case when count(*) = 0
      then 'Todas as funcoes elevadas tem search_path fixo.'
      else 'Sem search_path (porta de escalonamento): ' || string_agg(p.proname, ', ')
    end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as c
      where c like 'search\_path=%')

  union all

  -- 7. Restrição contra dois atendimentos no mesmo horário
  select
    7,
    'Agenda sem sobreposicao',
    count(*),
    case when count(*) >= 1 then 'OK' else 'FALHA' end,
    case when count(*) >= 1
      then 'A restricao de exclusao esta ativa.'
      else 'AUSENTE. Duas clientes podem marcar o mesmo horario. Rode 01-esquema.sql.'
    end
  from pg_constraint
  where conname = 'agendamento_sem_sobreposicao'

  union all

  -- 8. Agendamentos que já se sobrepõem (dados antigos)
  select
    8,
    'Sobreposicoes existentes',
    count(*),
    case when count(*) = 0 then 'OK' else 'FALHA' end,
    case when count(*) = 0
      then 'Nenhum choque de horario na agenda.'
      else 'Ha ' || count(*) || ' par(es) de atendimentos sobrepostos. Resolva na agenda.'
    end
  from agendamentos a
  join agendamentos b
    on b.id > a.id
   and b.profissional_id = a.profissional_id
   and tstzrange(a.inicio, a.fim) && tstzrange(b.inicio, b.fim)
  where a.situacao in ('pendente','confirmado','em_atendimento','concluido')
    and b.situacao in ('pendente','confirmado','em_atendimento','concluido')

  union all

  -- 9. Clientes com telefone repetido
  select
    9,
    'Clientes duplicadas por telefone',
    count(*),
    case when count(*) = 0 then 'OK' else 'ATENCAO' end,
    case when count(*) = 0
      then 'Nenhum telefone repetido.'
      else count(*) || ' telefone(s) em mais de uma ficha. Historico partido ao meio.'
    end
  from (
    select telefone from clientes
    where telefone is not null group by telefone having count(*) > 1
  ) d

  union all

  -- 10. Reservas presas
  select
    10,
    'Reservas vencidas ainda ativas',
    count(*),
    case when count(*) = 0 then 'OK' else 'ATENCAO' end,
    case when count(*) = 0
      then 'Nenhum horario preso a toa.'
      else count(*) || ' reserva(s) vencida(s) segurando horario. Rode: select limpar_reservas();'
    end
  from reservas where situacao = 'ativa' and expira_em <= now()

  union all

  -- 11. Trilha de auditoria
  select
    11,
    'Trilha de auditoria ativa',
    count(*),
    case when count(*) >= 5 then 'OK' else 'FALHA' end,
    case when count(*) >= 5
      then count(*) || ' tabela(s) com trilha.'
      else 'Trilha incompleta. Rode 05-integridade.sql.'
    end
  from pg_trigger where tgname = 'trilha' and not tgisinternal

  union all

  -- 12. Studio configurado
  select
    12,
    'Studio configurado',
    count(*),
    case when count(*) = 1 then 'OK' else 'FALHA' end,
    case when count(*) = 1 then 'Um studio cadastrado.'
         when count(*) = 0 then 'Nenhum studio. O portal publico nao abre.'
         else 'Mais de um studio na tabela. O portal usa o primeiro e ignora o resto.'
    end
  from studio

  union all

  -- 13. Jornada preenchida
  select
    13,
    'Dias de funcionamento',
    count(*),
    case when count(*) >= 1 then 'OK' else 'FALHA' end,
    case when count(*) >= 1
      then count(*) || ' dia(s) aberto(s) na semana.'
      else 'Nenhum dia aberto. O portal nao mostra horario algum.'
    end
  from jornada where aberto

  union all

  -- 14. Serviços no link público
  select
    14,
    'Servicos no link publico',
    count(*),
    case when count(*) >= 1 then 'OK' else 'ATENCAO' end,
    case when count(*) >= 1
      then count(*) || ' servico(s) visivel(is) para a cliente.'
      else 'Nenhum servico liberado. A cliente abre o link e nao ve o que marcar.'
    end
  from servicos where ativo and no_link_publico

  union all

  -- 15. Quem atende
  select
    15,
    'Profissionais atendendo',
    count(*),
    case when count(*) >= 1 then 'OK' else 'ATENCAO' end,
    case when count(*) >= 1
      then count(*) || ' pessoa(s) recebendo agendamento.'
      else 'Ninguem marcado como atendente. O portal nao oferece horario.'
    end
  from profissionais where ativo and atende
)

select
  case veredito when 'FALHA' then '[!] FALHA'
                when 'ATENCAO' then '[~] ATENCAO'
                else '[ok]' end as veredito,
  verificacao,
  detalhe
from checagens
order by
  case veredito when 'FALHA' then 1 when 'ATENCAO' then 2 else 3 end,
  ordem;

-- ---------------------------------------------------------------------
-- Teste que precisa ser feito FORA daqui
-- ---------------------------------------------------------------------
-- Este arquivo roda como dono do banco e enxerga tudo. O teste que
-- importa é o oposto: o que uma pessoa de fora consegue ver.
--
-- No seu terminal, com a chave anon do projeto:
--
--   curl 'https://SEU-PROJETO.supabase.co/rest/v1/clientes?select=*' \
--        -H "apikey: SUA_CHAVE_ANON"
--
-- Resposta esperada: erro de permissão.
-- Se vier a lista de clientes, PARE e não publique o site.
--
-- Repita trocando `clientes` por `agendamentos`, `lancamentos` e
-- `auditoria`. Todas devem recusar.
