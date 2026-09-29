-- ============================================================================
-- Financeiro — categoria por id, orçamentos, preferências de aviso e lembretes
-- Rode no SQL Editor do Supabase (depois de sharing.sql, shared_payments.sql e
-- push_notifications.sql). Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lançamento ligado à categoria pelo id
--    O app continua enviando o nome; o banco descobre o id sozinho. Renomear a
--    categoria atualiza todos os lançamentos ligados a ela; excluir a
--    categoria só solta o vínculo (o nome antigo fica no lançamento).
-- ----------------------------------------------------------------------------

alter table public.transactions add column if not exists "categoryId" uuid references public.categories(id) on delete set null;
create index if not exists transactions_category_idx on public.transactions ("categoryId");

update public.transactions t
set "categoryId" = c.id
from public.categories c
where t."categoryId" is null and c."userId" = t."userId" and c.name = t.category;

create or replace function public.transactions_set_category_id()
returns trigger
language plpgsql
as $$
begin
  if new."categoryId" is null or (tg_op = 'UPDATE' and new.category is distinct from old.category) then
    select c.id into new."categoryId"
    from public.categories c
    where c."userId" = new."userId" and c.name = new.category
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_set_category_id on public.transactions;
create trigger transactions_set_category_id
  before insert or update on public.transactions
  for each row execute function public.transactions_set_category_id();

create or replace function public.categories_propagate_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.transactions set category = new.name where "categoryId" = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_propagate_rename on public.categories;
create trigger categories_propagate_rename
  after update on public.categories
  for each row execute function public.categories_propagate_rename();

-- ----------------------------------------------------------------------------
-- 2. Orçamento mensal por categoria
-- ----------------------------------------------------------------------------

alter table public.categories add column if not exists "monthlyBudget" numeric check ("monthlyBudget" is null or "monthlyBudget" >= 0);

-- ----------------------------------------------------------------------------
-- 3. Preferências de aviso (quais notificações a pessoa quer receber)
--    Chaves: shared, payments, due, cards, budget — ausente = ligado.
-- ----------------------------------------------------------------------------

alter table public.profiles add column if not exists "notificationPrefs" jsonb not null default '{}'::jsonb;

create or replace function public.wants_notification(uid uuid, pref text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select ("notificationPrefs"->>pref)::boolean from public.profiles where id = uid), true);
$$;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('consent_request', 'assigned', 'consent_response', 'payment_signal', 'payment_rejected',
                  'due_reminder', 'card_reminder', 'budget_alert'));

-- ----------------------------------------------------------------------------
-- 4. Lembretes diários (vencimentos, fatura, orçamento)
-- ----------------------------------------------------------------------------

-- Mês em que o lançamento "cai" (compra no cartão vai para o mês da fatura),
-- igual ao app.
create or replace function public.effective_month(t public.transactions)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case
    when t.type = 'card_purchase' and c.id is not null then
      (date_trunc('month', t.date)
        + make_interval(months =>
            (case when extract(day from t.date) > coalesce(c."closingDay", 31) then 1 else 0 end)
          + (case when coalesce(c."dueDay", coalesce(c."closingDay", 31)) <= coalesce(c."closingDay", 31) then 1 else 0 end)))::date
    else date_trunc('month', t.date)::date
  end
  from (select 1) x
  left join public.cards c on c.id = t."cardId";
$$;

create or replace function public.brl(v numeric)
returns text
language sql
immutable
as $$ select 'R$ ' || translate(to_char(v, 'FM999G999G990D00'), ',.', '.,'); $$;

create or replace function public.daily_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
  month_start date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  spent numeric;
  pct int;
  due_date date;
  bill numeric;
begin
  -- a) Despesas que vencem amanhã (não pagas, fora do cartão)
  for r in
    select t.* from public.transactions t
    where t.type = 'expense' and t.status = 'planned' and t.date = today + 1
      and coalesce(t.category, '') not in ('Fatura Cartão', 'Fatura cartão')
      and public.wants_notification(t."userId", 'due')
      and not exists (select 1 from public.notifications n where n."userId" = t."userId" and n."groupKey" = 'due:' || t.id::text)
  loop
    insert into public.notifications ("userId", type, title, body, "transactionId", "groupKey")
    values (r."userId", 'due_reminder', 'Vence amanhã: ' || r.description, public.brl(r.amount), r.id, 'due:' || r.id::text);
  end loop;

  -- b) Fatura do cartão vencendo em 3 dias (e ainda não paga)
  for r in select * from public.cards where "dueDay" is not null loop
    due_date := today + 3;
    if extract(day from due_date)::int = least(r."dueDay", extract(day from (date_trunc('month', due_date) + interval '1 month - 1 day'))::int)
       and public.wants_notification(r."userId", 'cards') then
      select coalesce(sum(t.amount), 0) into bill
      from public.transactions t
      where t."cardId" = r.id and t.type = 'card_purchase'
        and public.effective_month(t) = date_trunc('month', due_date)::date;
      if bill > 0
         and not exists (
           select 1 from public.transactions p
           where p."cardId" = r.id and p.type = 'expense' and p.status = 'actual'
             and p.category in ('Fatura Cartão', 'Fatura cartão')
             and date_trunc('month', p.date) = date_trunc('month', due_date))
         and not exists (
           select 1 from public.notifications n
           where n."userId" = r."userId" and n."groupKey" = 'card:' || r.id::text || ':' || to_char(due_date, 'YYYY-MM')) then
        insert into public.notifications ("userId", type, title, body, "groupKey")
        values (r."userId", 'card_reminder', 'Fatura do ' || r.name || ' vence em 3 dias',
                public.brl(bill) || ' · vencimento ' || to_char(due_date, 'DD/MM'),
                'card:' || r.id::text || ':' || to_char(due_date, 'YYYY-MM'));
      end if;
    end if;
  end loop;

  -- c) Orçamento: avisa ao passar de 80% e de 100% no mês
  for r in select * from public.categories where coalesce("monthlyBudget", 0) > 0 loop
    if not public.wants_notification(r."userId", 'budget') then continue; end if;
    select coalesce(sum(t.amount), 0) into spent
    from public.transactions t
    where t."userId" = r."userId" and t.type in ('expense', 'card_purchase')
      and coalesce(t.category, '') not in ('Fatura Cartão', 'Fatura cartão')
      and (t."categoryId" = r.id or (t."categoryId" is null and t.category = r.name))
      and public.effective_month(t) = month_start;
    pct := case when spent >= r."monthlyBudget" then 100 when spent >= r."monthlyBudget" * 0.8 then 80 else 0 end;
    if pct > 0 and not exists (
      select 1 from public.notifications n
      where n."userId" = r."userId" and n."groupKey" = 'budget:' || r.id::text || ':' || to_char(month_start, 'YYYY-MM') || ':' || pct
    ) then
      insert into public.notifications ("userId", type, title, body, "groupKey")
      values (r."userId", 'budget_alert',
              case when pct = 100 then 'Orçamento de ' || r.name || ' estourado' else 'Orçamento de ' || r.name || ' em 80%' end,
              public.brl(spent) || ' de ' || public.brl(r."monthlyBudget") || ' neste mês',
              'budget:' || r.id::text || ':' || to_char(month_start, 'YYYY-MM') || ':' || pct);
    end if;
  end loop;
end;
$$;

-- Respeita as preferências também nos avisos de compartilhamento e pagamento:
-- a notificação continua no app, mas o celular só apita se a pessoa quiser.
-- (O filtro fica na Edge Function send-push.)

-- Todo dia às 8h (horário de Brasília = 11h UTC).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'financeiro-daily-reminders';
select cron.schedule('financeiro-daily-reminders', '0 11 * * *', 'select public.daily_reminders()');

notify pgrst, 'reload schema';
