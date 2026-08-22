-- ============================================================================
-- Financeiro — schema Supabase (Postgres)
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new).
--
-- Os nomes de coluna usam camelCase entre aspas para casar exatamente com os
-- tipos TypeScript do app (src/types.ts), evitando uma camada de mapeamento.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  email text,
  "photoURL" text,
  "firstName" text,
  "lastName" text,
  "username" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Colunas adicionadas depois da versão inicial do schema (idempotente para quem já rodou o script antes)
alter table public.profiles add column if not exists "firstName" text;
alter table public.profiles add column if not exists "lastName" text;
alter table public.profiles add column if not exists "username" text;
create unique index if not exists profiles_username_idx on public.profiles ("username") where "username" is not null;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default 'Tag',
  color text not null default '#8FB9A8',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  image text,
  visible boolean not null default true,
  "linkedUserId" uuid references auth.users(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table public.people add column if not exists "linkedUserId" uuid references auth.users(id) on delete set null;

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  name text not null,
  "limit" numeric not null default 0,
  "closingDay" int,
  "dueDay" int,
  color text not null default '#9BC4B4',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'card_purchase')),
  description text not null,
  amount numeric not null check (amount >= 0),
  date date not null,
  category text not null,
  recurrence text not null default 'none',
  "recurrenceEndDate" text,
  installments jsonb,
  status text not null check (status in ('planned', 'actual')),
  "cardId" uuid references public.cards(id) on delete set null,
  "payerPayee" text,
  assignments jsonb not null default '[]'::jsonb,
  "linkedToCard" boolean not null default false,
  "linkedTransactionId" uuid,
  "seriesId" uuid,
  "actualDate" date,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions ("userId");
create index if not exists transactions_series_idx on public.transactions ("seriesId");
create index if not exists transactions_linked_idx on public.transactions ("linkedTransactionId");
create index if not exists transactions_card_idx on public.transactions ("cardId");
create index if not exists cards_user_idx on public.cards ("userId");
create index if not exists people_user_idx on public.people ("userId");
create index if not exists categories_user_idx on public.categories ("userId");

-- ----------------------------------------------------------------------------
-- updatedAt automático
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.categories;
create trigger set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.people;
create trigger set_updated_at before update on public.people
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.cards;
create trigger set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.transactions;
create trigger set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: cada usuário só acessa seus próprios dados
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.people enable row level security;
alter table public.cards enable row level security;
alter table public.transactions enable row level security;

-- Leitura liberada para qualquer usuário autenticado (funciona como um
-- diretório simples, usado para vincular uma pessoa a um usuário existente
-- por nome de usuário). Escrita continua restrita ao próprio perfil.
drop policy if exists "profiles_owner" on public.profiles;
drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_read_all" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own" on public.profiles
  for delete using (id = auth.uid());

drop policy if exists "categories_owner" on public.categories;
create policy "categories_owner" on public.categories
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop policy if exists "people_owner" on public.people;
create policy "people_owner" on public.people
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop policy if exists "cards_owner" on public.cards;
create policy "cards_owner" on public.cards
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop policy if exists "transactions_owner" on public.transactions;
create policy "transactions_owner" on public.transactions
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

-- ----------------------------------------------------------------------------
-- Cria automaticamente um perfil quando um usuário se cadastra, usando os
-- dados (nome, sobrenome, usuário) enviados no signUp como user_metadata.
-- Necessário porque, se a confirmação de e-mail estiver habilitada, o
-- usuário ainda não tem sessão logo após o cadastro para inserir via RLS.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, "firstName", "lastName", "username", nickname)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'lastName',
    new.raw_user_meta_data->>'username',
    nullif(trim(coalesce(new.raw_user_meta_data->>'firstName', '') || ' ' || coalesce(new.raw_user_meta_data->>'lastName', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RPC: upsert atômico de várias transações de uma vez
-- (usado para séries recorrentes, parcelamentos, edição de "este e os
-- próximos" e sincronização de receitas vinculadas — substitui os
-- writeBatch do Firestore).
-- ----------------------------------------------------------------------------

create or replace function public.upsert_transactions(payload jsonb)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.transactions (
    id, "userId", type, description, amount, date, category, recurrence,
    "recurrenceEndDate", installments, status, "cardId", "payerPayee",
    assignments, "linkedToCard", "linkedTransactionId", "seriesId", "actualDate"
  )
  select
    coalesce((r->>'id')::uuid, gen_random_uuid()),
    auth.uid(),
    r->>'type',
    r->>'description',
    (r->>'amount')::numeric,
    (r->>'date')::date,
    r->>'category',
    coalesce(r->>'recurrence', 'none'),
    r->>'recurrenceEndDate',
    r->'installments',
    r->>'status',
    (r->>'cardId')::uuid,
    r->>'payerPayee',
    coalesce(r->'assignments', '[]'::jsonb),
    coalesce((r->>'linkedToCard')::boolean, false),
    (r->>'linkedTransactionId')::uuid,
    (r->>'seriesId')::uuid,
    (r->>'actualDate')::date
  from jsonb_array_elements(payload) as r
  on conflict (id) do update set
    type = excluded.type,
    description = excluded.description,
    amount = excluded.amount,
    date = excluded.date,
    category = excluded.category,
    recurrence = excluded.recurrence,
    "recurrenceEndDate" = excluded."recurrenceEndDate",
    installments = excluded.installments,
    status = excluded.status,
    "cardId" = excluded."cardId",
    "payerPayee" = excluded."payerPayee",
    assignments = excluded.assignments,
    "linkedToCard" = excluded."linkedToCard",
    "linkedTransactionId" = excluded."linkedTransactionId",
    "seriesId" = excluded."seriesId",
    "actualDate" = excluded."actualDate",
    "updatedAt" = now()
  where public.transactions."userId" = auth.uid()
  returning *;
end;
$$;

grant execute on function public.upsert_transactions(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime: publica as tabelas para os clientes assinarem mudanças
-- (idempotente — pode rodar o script mais de uma vez sem erro)
-- ----------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array['transactions', 'cards', 'people', 'categories', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;
