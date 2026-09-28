-- ============================================================================
-- Financeiro — "já paguei" em movimentações compartilhadas
-- Rode no SQL Editor do Supabase depois do sharing.sql. Idempotente.
--
-- Quem foi associado a uma movimentação (e aceitou) pode avisar que já pagou.
-- Isso grava "sharedPaidAt" na movimentação de quem criou e envia uma
-- notificação para essa pessoa confirmar o recebimento.
-- ============================================================================

alter table public.transactions add column if not exists "sharedPaidAt" timestamptz;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('consent_request', 'assigned', 'consent_response', 'payment_signal'));

create or replace function public.signal_shared_payment(tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.transactions;
  payer_name text;
begin
  select * into t from public.transactions where id = tx;
  if t.id is null or not public.tx_shared_with_me(t."userId", t."payerPayee", t.assignments) then
    raise exception 'Movimentação não encontrada';
  end if;

  update public.transactions set "sharedPaidAt" = now() where id = tx;

  select coalesce(nullif(pr.nickname, ''), pr."firstName", 'Alguém') into payer_name
  from public.profiles pr where pr.id = auth.uid();

  insert into public.notifications ("userId", "fromUserId", type, title, body, "transactionId", "groupKey")
  values (
    t."userId", auth.uid(), 'payment_signal',
    coalesce(payer_name, 'Alguém') || ' disse que já pagou',
    t.description
      || coalesce(' (parcela ' || (t.installments->>'current') || '/' || (t.installments->>'total') || ')', '')
      || ' — R$ ' || to_char(t.amount, 'FM999G999G990D00')
      || ' · referente a '
      || (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from t.date)::int]
      || ' de ' || extract(year from t.date)::int,
    t.id, 'paid:' || t.id::text
  );
end;
$$;

grant execute on function public.signal_shared_payment(uuid) to authenticated;

-- Faz a API do Supabase enxergar a função nova na hora.
notify pgrst, 'reload schema';
