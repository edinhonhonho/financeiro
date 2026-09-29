const CACHE_NAME = 'financeiro-shell-v5';
const SHELL_URLS = ['/', '/manifest.json', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first for navigations/API calls, falling back to the cached shell when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      // Sem rede: usa a cópia salva. Só páginas caem na tela inicial; chamadas
      // de dados sem cópia falham normalmente (o app usa os dados do aparelho).
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});

// Notificações no celular (Web Push), enviadas pela Edge Function send-push.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Financeiro', body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Financeiro', {
      body: data.body || '',
      // Só o ícone pequeno (silhueta branca): o Android já mostra o do app,
      // e um "icon" grande aparecia repetido à direita.
      badge: '/badge-96.png',
      tag: data.tag,
      data: { url: data.url || '/' }
    })
  );
});

// Tocar na notificação abre o app (ou traz a janela aberta para frente) já nas notificações.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-notifications' });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
