-- =====================================================================
-- System Studio · Esquema
-- Rode este arquivo primeiro, no SQL Editor do Supabase.
-- =====================================================================
--
-- As tabelas espelham as entidades de src/types/. Os nomes das colunas
-- estão em snake_case porque é a convenção do Postgres; o adaptador faz
-- a tradução, e as telas continuam vendo camelCase.
--
-- Todo id é texto, não uuid nativo: o sistema já gera identificadores no
-- navegador (crypto.randomUUID) antes de haver rede, e é isso que
-- permite marcar um horário e sincronizar depois.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Studio e equipe
-- ---------------------------------------------------------------------
create table if not exists studio (
  id                       text primary key,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  nome                     text not null,
  identificador            text not null unique,
  telefone                 text,
  whatsapp                 text,
  instagram                text,
  endereco                 text,
  tema                     text not null default 'quartzo-ouro',
  agendamento_ativo        boolean not null default true,
  antecedencia_minutos     integer not null default 120,
  horizonte_dias           integer not null default 60,
  intervalo_minutos        integer not null default 15,
  confirmacao_manual       boolean not null default false,
  atendimentos_simultaneos integer not null default 0,

  /*
    Teto de atendimentos por dia. Zero significa sem teto.

    Estava faltando. O tipo `Studio` do TypeScript declarava
    `limiteDiario` e o motor de horários já o consultava, mas a coluna
    nunca chegou ao banco. O efeito foi um 400 em toda gravação do
    studio:

      POST /rest/v1/studio?on_conflict=id&columns=...,"limite_diario"
      → 400 Bad Request

    Nenhuma configuração do salão salvava, e a mensagem não dizia qual
    coluna estava sobrando.
  */
  limite_diario  integer not null default 0,
  reserva_minutos          integer not null default 5,
  escolha_de_profissional  boolean not null default true,
  aceita_solicitacoes      boolean not null default true,
  lista_espera_ativa       boolean not null default true,
  checkin_ativo            boolean not null default false,
  recado_do_portal         text
);

create table if not exists profissionais (
  id            text primary key,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  nome          text not null,
  papel         text not null,
  cor           text not null,
  atende        boolean not null default true,
  ativo         boolean not null default true
);

create table if not exists jornada (
  dia_semana     integer primary key check (dia_semana between 0 and 6),
  aberto         boolean not null default false,
  abre           text not null default '09:00',
  fecha          text not null default '19:00',
  almoco_inicio  text,
  almoco_fim     text
);

-- ---------------------------------------------------------------------
-- Clientes e serviços
-- ---------------------------------------------------------------------
create table if not exists clientes (
  id             text primary key,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  nome           text not null,
  telefone       text,
  whatsapp       text,
  instagram      text,
  nascimento     date,
  observacoes    text,
  preferencias   text,
  etiquetas      jsonb not null default '[]'::jsonb,
  aceita_contato boolean not null default true,
  ativo          boolean not null default true
);

-- O telefone é a chave única da cliente. O índice existe para a regra
-- valer no banco também: sem ele, duas abas criam a mesma pessoa duas
-- vezes e o histórico dela nasce partido em dois.
create unique index if not exists clientes_telefone_unico
  on clientes (telefone) where telefone is not null;

create table if not exists categorias (
  id            text primary key,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  nome          text not null,
  ordem         integer not null default 0
);

create table if not exists servicos (
  id                text primary key,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  categoria_id      text references categorias(id) on delete set null,
  nome              text not null,
  descricao         text,
  duracao_minutos   integer not null check (duracao_minutos > 0),
  intervalo_minutos integer not null default 0,
  preco             numeric(10,2) not null default 0,
  cor               text not null default '#C98F98',
  no_link_publico   boolean not null default true,
  ativo             boolean not null default true,
  ordem             integer not null default 0,
  profissionais_ids jsonb not null default '[]'::jsonb,
  produtos          jsonb not null default '[]'::jsonb
);

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table if not exists agendamentos (
  id                text primary key,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  cliente_id        text references clientes(id) on delete set null,
  profissional_id   text not null references profissionais(id),
  servico_id        text not null references servicos(id),
  inicio            timestamptz not null,
  fim               timestamptz not null,
  situacao          text not null default 'confirmado',
  preco             numeric(10,2) not null default 0,
  desconto          numeric(10,2) not null default 0,
  observacao        text,
  origem            text not null default 'painel',
  nome_avulso       text,
  telefone_avulso   text,
  cupom_id          text,
  protocolo         text not null,
  situacao_anterior text,
  iniciado_em       timestamptz,
  finalizado_em     timestamptz,
  chegou_em         timestamptz,
  remarcacoes       jsonb not null default '[]'::jsonb,
  constraint agendamento_termina_depois check (fim > inicio)
);

create unique index if not exists agendamentos_protocolo_unico on agendamentos (protocolo);
create index if not exists agendamentos_por_inicio on agendamentos (inicio);
create index if not exists agendamentos_por_profissional on agendamentos (profissional_id, inicio);

/*
  A regra que o sistema inteiro existe para garantir, agora também no banco.

  A checagem em TypeScript continua valendo — ela dá a mensagem boa para
  a cliente. Mas duas pessoas confirmando no mesmo segundo passam pelas
  duas checagens antes de qualquer uma gravar; só o banco consegue
  recusar a segunda. Sem esta linha, o portal simultâneo tem uma janela
  de corrida que nenhum código de aplicação fecha.
*/
create extension if not exists btree_gist;

alter table agendamentos drop constraint if exists agendamento_sem_sobreposicao;
alter table agendamentos add constraint agendamento_sem_sobreposicao
  exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (situacao in (
    'pendente','confirmado','em_atendimento','concluido',
    'solicitou_alteracao','solicitou_cancelamento'
  ));

create table if not exists bloqueios (
  id              text primary key,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  profissional_id text references profissionais(id) on delete cascade,
  tipo            text not null,
  motivo          text,
  inicio          timestamptz not null,
  fim             timestamptz not null
);
create index if not exists bloqueios_por_inicio on bloqueios (inicio);

-- ---------------------------------------------------------------------
-- Portal de agendamento
-- ---------------------------------------------------------------------
create table if not exists reservas (
  id              text primary key,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  servico_id      text not null references servicos(id),
  profissional_id text not null references profissionais(id),
  inicio          timestamptz not null,
  fim             timestamptz not null,
  expira_em       timestamptz not null,
  visitante_id    text not null,
  situacao        text not null default 'ativa',
  agendamento_id  text references agendamentos(id) on delete set null
);
create index if not exists reservas_ativas on reservas (expira_em) where situacao = 'ativa';

create table if not exists solicitacoes (
  id                 text primary key,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  agendamento_id     text not null references agendamentos(id) on delete cascade,
  tipo               text not null,
  situacao           text not null default 'aberta',
  mensagem           text,
  preferencia_inicio timestamptz,
  respondida_em      timestamptz,
  respondida_por     text,
  resposta           text
);

create table if not exists lista_espera (
  id              text primary key,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  cliente_id      text references clientes(id) on delete set null,
  nome            text not null,
  telefone        text not null,
  servico_id      text not null references servicos(id),
  profissional_id text references profissionais(id) on delete set null,
  data            date,
  periodo         text not null default 'qualquer',
  observacao      text,
  situacao        text not null default 'aguardando',
  avisada_em      timestamptz,
  vaga_inicio     timestamptz
);

-- ---------------------------------------------------------------------
-- Estoque, financeiro, comercial, comunicação
-- ---------------------------------------------------------------------
create table if not exists fornecedores (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  nome text not null, telefone text, observacoes text
);

create table if not exists produtos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  fornecedor_id text references fornecedores(id) on delete set null,
  codigo text, nome text not null, marca text, categoria text,
  unidade text not null default 'un',
  quantidade numeric(12,3) not null default 0,
  quantidade_minima numeric(12,3) not null default 0,
  preco_custo numeric(10,2) not null default 0,
  preco_medio numeric(10,2) not null default 0,
  preco_venda numeric(10,2) not null default 0,
  validade date, ativo boolean not null default true
);

create table if not exists movimentos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  produto_id text not null references produtos(id) on delete cascade,
  agendamento_id text references agendamentos(id) on delete set null,
  tipo text not null, quantidade numeric(12,3) not null, motivo text
);

create table if not exists lancamentos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  agendamento_id text references agendamentos(id) on delete set null,
  cliente_id text references clientes(id) on delete set null,
  tipo text not null, situacao text not null, categoria text,
  descricao text not null, valor numeric(10,2) not null default 0,
  forma text, vencimento date not null, pago_em timestamptz
);
create index if not exists lancamentos_por_vencimento on lancamentos (vencimento);

create table if not exists metas (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  mes date not null, valor numeric(10,2) not null default 0
);

create table if not exists caixas (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  data date not null, aberto_em timestamptz, fechado_em timestamptz,
  valor_abertura numeric(10,2) not null default 0,
  valor_fechamento numeric(10,2), valor_esperado numeric(10,2),
  diferenca numeric(10,2), situacao text not null default 'aberto',
  responsavel text, observacao text
);

create table if not exists movimentos_caixa (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  caixa_id text not null references caixas(id) on delete cascade,
  tipo text not null, forma text, descricao text not null,
  valor numeric(10,2) not null default 0,
  agendamento_id text references agendamentos(id) on delete set null
);

create table if not exists cupons (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  codigo text not null unique, descricao text, tipo text not null,
  valor numeric(10,2) not null default 0,
  valido_de date not null, valido_ate date not null,
  limite_usos integer not null default 0, usos integer not null default 0,
  servicos_ids jsonb not null default '[]'::jsonb,
  valor_minimo numeric(10,2) not null default 0,
  desconto_maximo numeric(10,2) not null default 0,
  ativo boolean not null default true
);

create table if not exists usos_cupom (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cupom_id text not null references cupons(id) on delete cascade,
  agendamento_id text references agendamentos(id) on delete set null,
  cliente_id text references clientes(id) on delete set null,
  desconto numeric(10,2) not null default 0
);

create table if not exists fidelidade (
  id text primary key, ativo boolean not null default true,
  pontos_por_real numeric(6,2) not null default 1,
  valor_do_ponto numeric(6,4) not null default 0.05,
  validade_dias integer
);

create table if not exists pontos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cliente_id text not null references clientes(id) on delete cascade,
  agendamento_id text references agendamentos(id) on delete set null,
  pontos integer not null default 0, motivo text not null
);

create table if not exists procedimentos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cliente_id text not null references clientes(id) on delete cascade,
  agendamento_id text references agendamentos(id) on delete set null,
  servico_id text references servicos(id) on delete set null,
  profissional_id text references profissionais(id) on delete set null,
  data timestamptz not null, formula text, observacoes text,
  produtos jsonb not null default '[]'::jsonb
);

create table if not exists fotos (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cliente_id text not null references clientes(id) on delete cascade,
  procedimento_id text references procedimentos(id) on delete cascade,
  momento text not null, legenda text, conteudo text not null
);

create table if not exists lembretes (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  tipo text not null, canal text not null, situacao text not null default 'agendado',
  agendamento_id text references agendamentos(id) on delete cascade,
  cliente_id text references clientes(id) on delete set null,
  destinatario text not null, nome_destinatario text not null,
  agendado_para timestamptz not null, enviado_em timestamptz,
  tentativas integer not null default 0, ultimo_erro text, mensagem text not null
);
create index if not exists lembretes_da_fila on lembretes (agendado_para) where situacao = 'agendado';

create table if not exists notificacoes (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  tipo text not null, titulo text not null, detalhe text,
  lida boolean not null default false, destino text
);

create table if not exists modelos_mensagem (
  id text primary key, criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  chave text not null, nome text not null, canal text not null,
  corpo text not null, ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- Fuso do studio
-- ---------------------------------------------------------------------
-- O banco guarda instantes (`timestamptz`), que não têm fuso — mas
-- "abre às 9h" tem. Sem uma resposta fixa para "9h de onde", a mesma
-- reserva é válida ou inválida conforme o relógio do celular de quem
-- está marcando: um aparelho configurado em UTC enxerga a grade
-- deslocada três horas e consegue pedir um horário de madrugada.
--
-- Com a coluna, quem responde é o studio, não o aparelho da visitante.
alter table studio add column if not exists fuso text not null default 'America/Sao_Paulo';

-- ---------------------------------------------------------------------
-- Exclusão lógica
-- ---------------------------------------------------------------------
-- Registro importante não some: fica marcado com a data em que saiu de
-- circulação. É o que permite responder "quem atendeu a Maria em março"
-- depois de a profissional ter saído do studio.
--
-- `ativo` continua sendo o interruptor do dia a dia. `desativado_em`
-- guarda *quando* — sem ele, a agenda antiga fica sem explicação.
alter table clientes       add column if not exists desativado_em timestamptz;
alter table profissionais  add column if not exists desativado_em timestamptz;
alter table servicos       add column if not exists desativado_em timestamptz;
alter table produtos       add column if not exists desativado_em timestamptz;
alter table cupons         add column if not exists desativado_em timestamptz;

-- ---------------------------------------------------------------------
-- Índices que faltavam
-- ---------------------------------------------------------------------
-- Cada um responde a uma consulta que a tela faz todo dia. Sem eles o
-- Postgres varre a tabela inteira — imperceptível com cem linhas,
-- pesado com trinta mil.
create index if not exists agendamentos_por_cliente    on agendamentos (cliente_id, inicio desc);
create index if not exists agendamentos_por_situacao   on agendamentos (situacao, inicio);
create index if not exists agendamentos_por_servico    on agendamentos (servico_id);
create index if not exists bloqueios_por_profissional  on bloqueios (profissional_id, inicio);
create index if not exists reservas_por_visitante      on reservas (visitante_id) where situacao = 'ativa';
create index if not exists reservas_por_profissional   on reservas (profissional_id, inicio) where situacao = 'ativa';
create index if not exists solicitacoes_abertas        on solicitacoes (agendamento_id) where situacao = 'aberta';
create index if not exists lista_espera_aguardando     on lista_espera (situacao, data);
create index if not exists procedimentos_por_cliente   on procedimentos (cliente_id, data desc);
create index if not exists pontos_por_cliente          on pontos (cliente_id);
create index if not exists movimentos_por_produto      on movimentos (produto_id, criado_em desc);
create index if not exists movimentos_caixa_por_caixa  on movimentos_caixa (caixa_id);
create index if not exists lancamentos_por_agendamento on lancamentos (agendamento_id);
create index if not exists usos_cupom_por_cupom        on usos_cupom (cupom_id);
create index if not exists fotos_por_cliente           on fotos (cliente_id);
create index if not exists clientes_por_nome           on clientes (lower(nome));
create unique index if not exists caixas_por_data      on caixas (data);

-- ---------------------------------------------------------------------
-- Carimbo de atualização
-- ---------------------------------------------------------------------
create or replace function tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'studio','profissionais','clientes','categorias','servicos','agendamentos',
    'bloqueios','reservas','solicitacoes','lista_espera','fornecedores','produtos',
    'movimentos','lancamentos','metas','caixas','movimentos_caixa','cupons',
    'usos_cupom','pontos','procedimentos','fotos','lembretes','notificacoes',
    'modelos_mensagem'
  ]
  loop
    execute format('drop trigger if exists carimbo on %I', t);
    execute format(
      'create trigger carimbo before update on %I
       for each row execute function tocar_atualizado_em()', t);
  end loop;
end $$;
