-- ============================================================================
-- Financeiro — compartilhamento com pessoas que também têm conta no app
-- Rode este script inteiro no SQL Editor do Supabase (depois do schema.sql).
-- É idempotente: pode rodar mais de uma vez.
--
-- O que faz:
--  1. person_consents: pedido de permissão (o dono só compartilha com quem aceitou)
--  2. notifications: avisos para o usuário vinculado
--  3. Trigger em transactions: ao associar uma movimentação a uma pessoa vinculada,
--     pede permissão na primeira vez e avisa a cada movimentação depois disso
--  4. Política de leitura: a pessoa vinculada (que aceitou) enxerga as movimentações
--     em que foi associada
--  5. Coluna owedByPerson (caso ainda não exista)
-- ============================================================================

alter table public.transactions add column if not exists "owedByPerson" boolean;
-- Cor personalizada do card de cada pessoa (opcional)
alter table public.people add column if not exists color text;

-- ----------------------------------------------------------------------------
-- Permissões
-- ----------------------------------------------------------------------------

create table if not exists public.person_consents (
  id uuid primary key default gen_random_uuid(),
  "ownerId" uuid not null references auth.users(id) on delete cascade,
  "targetUserId" uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("ownerId", "targetUserId")
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,   -- quem recebe
  "fromUserId" uuid references auth.users(id) on delete set null,
  type text not null check (type in ('consent_request', 'assigned', 'consent_response')),
  title text not null,
  body text,
  "transactionId" uuid,
  "consentId" uuid references public.person_consents(id) on delete cascade,
  "groupKey" text,
  read boolean not null default false,
  "createdAt" timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications ("userId", "createdAt" desc);
create index if not exists notifications_group_idx on public.notifications ("userId", "groupKey", type);

alter table public.person_consents enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "consents_read" on public.person_consents;
create policy "consents_read" on public.person_consents
  for select using ("ownerId" = auth.uid() or "targetUserId" = auth.uid());

-- Só quem recebeu o pedido decide (aceitar / recusar / rever a decisão).
drop policy if exists "consents_target_update" on public.person_consents;
create policy "consents_target_update" on public.person_consents
  for update using ("targetUserId" = auth.uid()) with check ("targetUserId" = auth.uid());

drop policy if exists "notifications_owner" on public.notifications;
create policy "notifications_owner" on public.notifications
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

-- ----------------------------------------------------------------------------
-- Leitura das movimentações compartilhadas
-- ----------------------------------------------------------------------------

create or replace function public.tx_shared_with_me(owner uuid, payer text, assigns jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    join public.person_consents c
      on c."ownerId" = p."userId" and c."targetUserId" = p."linkedUserId" and c.status = 'accepted'
    where p."userId" = owner
      and p."linkedUserId" = auth.uid()
      and (
        p.id::text = payer
        or exists (
          select 1 from jsonb_array_elements(coalesce(assigns, '[]'::jsonb)) a
          where a->>'personId' = p.id::text
        )
      )
  );
$$;

drop policy if exists "transactions_shared_read" on public.transactions;
create policy "transactions_shared_read" on public.transactions
  for select using (public.tx_shared_with_me("userId", "payerPayee", assignments));

-- Ids das "pessoas" (no cadastro de outros usuários) que apontam para mim.
-- O app usa isso para saber qual parte de uma movimentação compartilhada é minha.
create or replace function public.my_shared_people()
returns table (id uuid, "userId" uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p."userId"
  from public.people p
  join public.person_consents c
    on c."ownerId" = p."userId" and c."targetUserId" = p."linkedUserId" and c.status = 'accepted'
  where p."linkedUserId" = auth.uid();
$$;

grant execute on function public.my_shared_people() to authenticated;

-- ----------------------------------------------------------------------------
-- Notificações ao associar uma movimentação
-- ----------------------------------------------------------------------------

create or replace function public.notify_person_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
  consent_row public.person_consents;
  owner_name text;
  person_amount numeric;
  group_key text;
  person_ids text[];
  created boolean;
begin
  -- A receita de reembolso automática não gera aviso próprio: a despesa que a originou já gerou.
  if new."linkedToCard" then
    return new;
  end if;

  -- Em edição, só avisa se algo relevante mudou.
  if tg_op = 'UPDATE' and
     new.amount is not distinct from old.amount and
     new.description is not distinct from old.description and
     new.date is not distinct from old.date and
     new."payerPayee" is not distinct from old."payerPayee" and
     new.assignments is not distinct from old.assignments then
    return new;
  end if;

  person_ids := array(
    select distinct x from (
      select new."payerPayee" as x
      union all
      select a->>'personId' from jsonb_array_elements(coalesce(new.assignments, '[]'::jsonb)) a
    ) s where x is not null and x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

  if coalesce(array_length(person_ids, 1), 0) = 0 then
    return new;
  end if;

  select coalesce(nullif(pr.nickname, ''), pr."firstName", 'Alguém') into owner_name
  from public.profiles pr where pr.id = new."userId";
  owner_name := coalesce(owner_name, 'Alguém');

  group_key := coalesce(new."seriesId"::text, new.id::text);

  for person in
    select p.id, p."linkedUserId"
    from public.people p
    where p."userId" = new."userId"
      and p."linkedUserId" is not null
      and p."linkedUserId" <> new."userId"
      and p.id::text = any (person_ids)
  loop
    created := false;
    consent_row := null;
    insert into public.person_consents ("ownerId", "targetUserId")
    values (new."userId", person."linkedUserId")
    on conflict ("ownerId", "targetUserId") do nothing
    returning * into consent_row;

    if consent_row.id is not null then
      created := true;
    else
      select * into consent_row from public.person_consents
      where "ownerId" = new."userId" and "targetUserId" = person."linkedUserId";
    end if;

    if created then
      insert into public.notifications ("userId", "fromUserId", type, title, body, "consentId", "groupKey")
      values (
        person."linkedUserId", new."userId", 'consent_request',
        owner_name || ' quer associar movimentações a você',
        'Aceitando, você passa a ver as despesas e receitas em que ' || owner_name || ' marcar você. Você pode mudar de ideia depois.',
        consent_row.id, 'consent:' || consent_row.id::text
      );
    end if;

    -- Toda movimentação vinculada avisa a pessoa (inclusive enquanto o pedido
    -- de compartilhamento está pendente). Só quem recusou não recebe.
    if consent_row.status <> 'declined' then
      -- Uma série (parcelas / recorrência) gera um único aviso.
      if tg_op = 'INSERT' and exists (
        select 1 from public.notifications n
        where n."userId" = person."linkedUserId" and n."groupKey" = group_key and n.type = 'assigned'
      ) then
        continue;
      end if;
      if tg_op = 'UPDATE' and exists (
        select 1 from public.notifications n
        where n."userId" = person."linkedUserId" and n."groupKey" = group_key and n.type = 'assigned'
          and n."createdAt" > now() - interval '1 minute'
      ) then
        continue;
      end if;

      person_amount := new.amount;
      select coalesce((a->>'amount')::numeric, new.amount) into person_amount
      from jsonb_array_elements(coalesce(new.assignments, '[]'::jsonb)) a
      where a->>'personId' = person.id::text
      limit 1;

      insert into public.notifications ("userId", "fromUserId", type, title, body, "transactionId", "groupKey")
      values (
        person."linkedUserId", new."userId", 'assigned',
        owner_name || ' associou uma movimentação a você',
        new.description || ' — R$ ' || translate(to_char(coalesce(person_amount, new.amount), 'FM999G999G990D00'), ',.', '.,')
          || case when consent_row.status = 'accepted' then '' else ' · Aceite o pedido de compartilhamento para ver no app.' end,
        new.id, group_key
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_person_assignment on public.transactions;
create trigger notify_person_assignment
  after insert or update on public.transactions
  for each row execute function public.notify_person_assignment();

-- Avisa o dono quando a pessoa aceita ou recusa.
create or replace function public.notify_consent_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    select coalesce(nullif(pr.nickname, ''), pr."firstName", 'Alguém') into target_name
    from public.profiles pr where pr.id = new."targetUserId";
    insert into public.notifications ("userId", "fromUserId", type, title, body, "consentId", "groupKey")
    values (
      new."ownerId", new."targetUserId", 'consent_response',
      coalesce(target_name, 'Alguém') || case when new.status = 'accepted' then ' aceitou' else ' recusou' end || ' o compartilhamento',
      case when new.status = 'accepted'
        then 'Agora as movimentações associadas a essa pessoa aparecem para ela.'
        else 'As movimentações associadas a essa pessoa não aparecem para ela.' end,
      new.id, 'response:' || new.id::text || ':' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_consent_response on public.person_consents;
create trigger notify_consent_response
  after update on public.person_consents
  for each row execute function public.notify_consent_response();

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array['notifications', 'person_consents']
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

-- Faz a API do Supabase enxergar as mudanças na hora.
notify pgrst, 'reload schema';
