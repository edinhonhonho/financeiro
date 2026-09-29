// Web Push: pede permissão, inscreve este aparelho e devolve os dados da inscrição.
// A chave pública VAPID não é secreta (vai para o navegador de qualquer forma).
export const VAPID_PUBLIC_KEY = 'BHRkYz8KKYZ1Oc52_kwImLHH3K1RWQ9ZaPZghThz6Mg1GOckQHW63mwl_s2CETwcXlFZpNYnFjI14RbahprMWLo';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // No iPhone, só funciona com o app instalado na tela inicial (iOS 16.4+).
  if (isIOS && !standalone) return 'needs-install';
  return hasApis ? 'supported' : 'unsupported';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (getPushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações negada. Libere nas configurações do navegador.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
}
