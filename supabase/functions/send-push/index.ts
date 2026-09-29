// Edge Function "send-push": envia uma notificação do app para os celulares
// da pessoa (Web Push). É chamada pelo trigger de supabase/push_notifications.sql
// com { notificationId }.
//
// Secrets necessários (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: mailto:voce@email.com)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
//
// "Verify JWT" deve ficar DESLIGADO: quem chama é o próprio banco. A função só
// reenvia notificações que existem de verdade na tabela, então uma chamada de
// fora não consegue criar avisos novos.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@financeiro.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

Deno.serve(async (req) => {
  try {
    const { notificationId } = await req.json();
    if (!notificationId) return new Response('missing notificationId', { status: 400 });

    const { data: notification, error } = await supabase
      .from('notifications')
      .select('id, "userId", title, body, type')
      .eq('id', notificationId)
      .maybeSingle();
    if (error || !notification) return new Response('not found', { status: 404 });

    // Preferências da pessoa (Minha conta → Notificações): ausente = ligado.
    const prefKey: Record<string, string> = {
      assigned: 'shared', consent_request: 'shared', consent_response: 'shared',
      payment_signal: 'payments', payment_rejected: 'payments',
      due_reminder: 'due', card_reminder: 'cards', budget_alert: 'budget'
    };
    const { data: profile } = await supabase
      .from('profiles')
      .select('"notificationPrefs"')
      .eq('id', notification.userId)
      .maybeSingle();
    const prefs = (profile?.notificationPrefs ?? {}) as Record<string, boolean>;
    const key = prefKey[notification.type];
    if (key && prefs[key] === false) return new Response(JSON.stringify({ sent: 0, skipped: key }), { headers: { 'Content-Type': 'application/json' } });

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('userId', notification.userId);

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body ?? '',
      tag: notification.id,
      url: '/?notificacoes'
    });

    let sent = 0;
    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (err) {
        // Aparelho que desinstalou o app ou revogou a permissão: remove.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('push error', status, err);
        }
      }
    }
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500 });
  }
});
