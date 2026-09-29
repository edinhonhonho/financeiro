// Funcionamento offline: cópia local dos dados (para abrir o app sem internet)
// e fila de lançamentos novos criados sem conexão, enviados quando ela volta.
import type { User } from '@supabase/supabase-js';
import type { Transaction } from './types';

const PREFIX = 'financeiro:';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cópia local */
  }
}

// ----------------------------------------------------------------------------
// Cópia local dos dados de cada usuário
// ----------------------------------------------------------------------------

export type CacheName = 'transactions' | 'cards' | 'people' | 'categories' | 'profile' | 'notifications';

export const saveCache = (userId: string, name: CacheName, data: unknown) => write(`cache:${userId}:${name}`, data);
export const readCache = <T,>(userId: string, name: CacheName) => read<T>(`cache:${userId}:${name}`);

// Último usuário logado: sem internet, a sessão pode não conseguir se renovar,
// e o app ainda precisa saber quem está usando para mostrar os dados salvos.
export const rememberUser = (user: User) => write('lastUser', { id: user.id, email: user.email, user_metadata: user.user_metadata ?? {} });
export const readRememberedUser = () => read<User>('lastUser');
export const forgetUser = () => { try { localStorage.removeItem(PREFIX + 'lastUser'); } catch { /* nada */ } };

// ----------------------------------------------------------------------------
// Fila de lançamentos criados sem internet
// ----------------------------------------------------------------------------

type QueuedRow = Transaction & { userId: string };

export const getQueue = (userId: string) => read<QueuedRow[]>(`queue:${userId}`) ?? [];
export const setQueue = (userId: string, rows: QueuedRow[]) => write(`queue:${userId}`, rows);
export const enqueueRows = (userId: string, rows: QueuedRow[]) => setQueue(userId, [...getQueue(userId), ...rows]);

/** Falha de rede (sem internet, servidor inacessível), diferente de um erro de validação do banco. */
export function isNetworkError(err: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|err_internet/i.test(message);
}
