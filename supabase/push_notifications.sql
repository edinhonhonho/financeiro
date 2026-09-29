-- ============================================================================
-- Financeiro — notificações no celular (Web Push)
-- Rode no SQL Editor do Supabase DEPOIS de criar a Edge Function "send-push"
-- (supabase/functions/send-push/index.ts). Idempotente.
--
-- 1. push_subscriptions: cada celular/navegador que aceitou receber avisos.
-- 2. Trigger em notifications: a cada notificação nova, chama a Edge Function,
--    que envia o aviso para os aparelhos da pessoa.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  "userAgent" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions ("userId");

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner" on public.push_subscriptions;
create policy "push_subscriptions_owner" on public.push_subscriptions
  for all using ("userId" = auth.uid()) with check ("userId" = auth.uid());

-- Chamada HTTP de dentro do banco (extensão nativa do Supabase).
create extension if not exists pg_net;

create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só manda o id: a função confere a notificação no banco antes de enviar.
  perform net.http_post(
    url := 'https://yibueczlwfomjzhwsbby.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notificationId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists push_on_notification on public.notifications;
create trigger push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification();

notify pgrst, 'reload schema';
