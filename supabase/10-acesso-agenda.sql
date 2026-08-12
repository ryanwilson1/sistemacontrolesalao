-- =====================================================================
-- System Studio · Acesso restrito à agenda
-- Rode depois do 02-seguranca.sql. Pode rodar de novo sem estragar nada.
-- =====================================================================
--
-- O QUE ESTE ARQUIVO RESOLVE
-- ---------------------------------------------------------------------
-- O 02-seguranca.sql fez uma escolha e a escreveu em voz alta: quem
-- está na lista da casa enxerga o studio inteiro. A frase dele era
-- "recortar por papel dentro do banco daria uma falsa sensação de
-- compartimento", e para a equipe interna aquilo continua verdadeiro —
-- a recepção precisa da agenda completa para atender o telefone.
--
-- O caso desta mudança é outro, e é por isso que ele merece arquivo
-- próprio: **uma profissional parceira**. Ela divide o espaço, atende
-- as próprias clientes e precisa da agenda. Não é da equipe do salão.
-- Faturamento, caixa, estoque, fidelidade e a ficha de evolução das
-- clientes da casa não são assunto dela — e aqui \"não são assunto\"
-- precisa significar que o banco recusa, não que a tela esconde.
--
-- A distinção que sustenta o arquivo inteiro:
--
--   O React decide o que APARECE. O Postgres decide o que EXISTE.
--
-- Sem esta segunda metade, o acesso restrito seria decoração: bastaria
-- a chave pública, o token dela e um `curl` para ler a tabela de
-- lançamentos inteira. O menu escondido não atrapalharia em nada.
--
-- ---------------------------------------------------------------------
-- O QUE FICA DE FORA — leia antes de confiar
-- ---------------------------------------------------------------------
--
-- 1. **Ela vê nome e telefone das clientes que aparecem na agenda.**
--    Não é descuido: a agenda sem nome de cliente não é agenda. Todo
--    mundo da equipe compartilha o mesmo papel `authenticated` no
--    Postgres, então esconder colunas por pessoa exigiria trocar as
--    tabelas por views — outra obra, com outro risco. Se isso não for
--    aceitável, é a próxima conversa, não um detalhe.
--
-- 2. **Funções `security definer` continuam passando por cima do RLS.**
--    É como elas funcionam, e é o que mantém \"Concluir atendimento\"
--    operando para ela: a receita é lançada pela função, não pela
--    conta. O outro lado da moeda é que `movimentar_estoque` e
--    `conferir_atendimentos` seguem executáveis por qualquer conta
--    autenticada que as chame direto pela API. A interface não oferece
--    esse caminho; o banco também não o fecha.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O papel novo passa a ser aceito
-- ---------------------------------------------------------------------
-- Sem isto, `autorizar_conta(..., 'agenda', ...)` bate no `check` da
-- tabela e falha com uma mensagem que não explica nada.
alter table contas_equipe drop constraint if exists contas_equipe_papel_check;

alter table contas_equipe add constraint contas_equipe_papel_check
  check (papel in ('proprietaria','gerente','profissional','recepcao','agenda'));

-- O MESMO check existe em `profissionais`, criado pelo 05-integridade.sql.
--
-- Está repetido aqui de propósito: quem roda só este arquivo — para
-- conceder acesso a mais alguém, meses depois — não deveria precisar
-- reaplicar o 05 inteiro para descobrir que o papel novo é recusado do
-- outro lado.
alter table profissionais drop constraint if exists profissional_papel_valido;

alter table profissionais add constraint profissional_papel_valido
  check (papel in ('proprietaria','gerente','profissional','recepcao','agenda'));


-- ---------------------------------------------------------------------
-- 2. A pergunta que as políticas fazem
-- ---------------------------------------------------------------------
-- `stable` pelo mesmo motivo de `equipe_autorizada()`: o Postgres passa
-- a avaliar uma vez por consulta em vez de uma vez por linha. Numa
-- agenda grande, é a diferença entre a tela abrir e a tela travar.
create or replace function acesso_so_agenda() returns boolean
language sql security definer set search_path = public, auth stable as $fn$
  select exists (
    select 1 from contas_equipe c
    where c.usuario_id = auth.uid() and c.ativo and c.papel = 'agenda'
  );
$fn$;

comment on function acesso_so_agenda() is
  'Conta de profissional parceira: enxerga a agenda e mais nada.';

revoke all on function acesso_so_agenda() from public;
grant execute on function acesso_so_agenda() to authenticated;

-- O par desta, `equipe_com_acesso_completo()`, mora no 02-seguranca.sql.
-- Não é organização: os arquivos 04 a 09 a usam nas próprias funções
-- privilegiadas, e todos rodam antes deste. Definida aqui, metade do
-- sistema apontaria para uma função inexistente.


-- ---------------------------------------------------------------------
-- 3. O que ela NÃO alcança
-- ---------------------------------------------------------------------
-- A lista é escrita, não deduzida, e isso é deliberado.
--
-- A alternativa seria \"tudo menos a agenda\", que se mantém sozinha —
-- e é justamente o problema: a tabela nova de amanhã entraria na
-- restrição por acidente, e alguém descobriria meses depois que uma
-- tela parou de funcionar para ela sem ninguém ter decidido isso.
--
-- Aqui é o contrário: tabela nova nasce acessível, e fechá-la é uma
-- linha que alguém escreve de propósito. Prefiro o esquecimento que
-- aparece na hora ao esquecimento que aparece em produção.
do $$
declare
  t text;
  fechadas text[] := array[
    -- Dinheiro
    'lancamentos', 'metas', 'caixas', 'movimentos_caixa',
    -- Estoque
    'produtos', 'movimentos', 'fornecedores',
    -- Comercial
    'cupons', 'usos_cupom', 'fidelidade', 'pontos',
    -- Histórico clínico das clientes da casa
    'procedimentos', 'fotos',
    -- Cópias de segurança
    'backups', 'registros_backup', 'configuracao_backup'
  ];
  -- `auditoria` NÃO entra nesta lista de propósito: a política dela
  -- chama-se "ler a trilha" e vive no 05-integridade.sql, onde já foi
  -- fechada. Repetir aqui criaria uma segunda política sobre a mesma
  -- tabela — e no Postgres políticas se somam por OU, então a mais
  -- frouxa venceria. Duas travas na mesma porta abrem a porta.
begin
  foreach t in array fechadas loop
    -- `to_regclass` em vez de assumir que a tabela existe: um projeto
    -- montado sem o módulo de fidelidade, por exemplo, não deve falhar
    -- ao rodar este arquivo.
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Tabela % nao existe neste projeto — ignorada.', t;
      continue;
    end if;

    execute format('drop policy if exists "equipe da casa" on public.%I', t);
    execute format('drop policy if exists "equipe da casa, sem acesso restrito" on public.%I', t);

    execute format(
      'create policy "equipe da casa, sem acesso restrito" on public.%I
       for all to authenticated
       using ((select equipe_autorizada()) and not (select acesso_so_agenda()))
       with check ((select equipe_autorizada()) and not (select acesso_so_agenda()))', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. O que ela alcança
-- ---------------------------------------------------------------------
-- Nada a fazer: a política "equipe da casa" do 02-seguranca.sql segue
-- valendo nas demais tabelas, e é ela que mantém a agenda funcionando.
--
-- Para o registro, o que a agenda precisa ler para existir:
--
--   agendamentos, bloqueios       — os horários e as ausências
--   servicos, categorias          — nome e duração do que é feito
--   profissionais, jornada        — quem atende e em que expediente
--   studio                        — intervalo da grade, teto simultâneo
--   clientes                      — o nome em cima do horário (ver ponto 1
--                                   do cabeçalho: é aqui que a restrição
--                                   encontra o seu limite)
--   reservas, solicitacoes,
--   lista_espera                  — o que chega pelo link público
--   lembretes, modelos_mensagem   — marcar um horário programa o aviso da
--                                   véspera; sem escrita aqui, agendar
--                                   falharia pela metade
--   notificacoes                  — o sininho


-- ---------------------------------------------------------------------
-- 5. Cadastrar a conta — o comando que a administradora roda
-- ---------------------------------------------------------------------
-- Existe porque o papel mora em DOIS lugares e eles precisam concordar:
--
--   contas_equipe.papel   → decide o que o BANCO entrega
--   profissionais.papel   → decide o que a TELA mostra
--
-- Ajustar só o primeiro deixaria o menu completo aberto para ela, com
-- todas as telas dando erro de permissão — parece defeito do sistema.
-- Ajustar só o segundo esconderia o menu com o banco inteiro aberto —
-- que é pior, porque parece seguro.
--
-- Um comando só, então, e a divergência deixa de ser possível.
create or replace function conceder_acesso_agenda(
  p_email           text,
  p_profissional_id text
) returns contas_equipe
language plpgsql security definer set search_path = public, auth as $fn$
declare
  v_linha contas_equipe%rowtype;
  v_nome  text;
begin
  select nome into v_nome from profissionais where id = p_profissional_id;

  if v_nome is null then
    raise exception
      'Nenhuma profissional com o id %. Cadastre primeiro em Ajustes -> Equipe.',
      p_profissional_id;
  end if;

  -- Vale a viagem: `autorizar_conta` já sabe exigir que o usuário
  -- exista em auth.users e devolve a mensagem certa quando não existe.
  v_linha := autorizar_conta(p_email, 'agenda', p_profissional_id);

  update profissionais
     set papel = 'agenda', atualizado_em = now()
   where id = p_profissional_id;

  raise notice 'Acesso restrito concedido a % (%).', v_nome, p_email;
  return v_linha;
end $fn$;

revoke all on function conceder_acesso_agenda(text,text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Confira depois de rodar
-- ---------------------------------------------------------------------
-- Quem está na casa e com qual acesso:
--
--   select c.email, c.papel, c.ativo, p.nome
--     from contas_equipe c
--     left join profissionais p on p.id = c.profissional_id
--    order by c.criado_em;
--
-- As tabelas fechadas devem aparecer com a política nova, e só ela:
--
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and tablename in ('lancamentos','caixas','produtos')
--    order by tablename;
--
-- E o teste que vale mais que os dois: entre no sistema COM A CONTA
-- DELA e rode, no console do navegador,
--
--   await supabase.from('lancamentos').select('*')
--
-- Tem que voltar erro de permissão. Se voltar dados, pare — a conta
-- não está com o papel 'agenda', e o menu escondido não protege nada.
