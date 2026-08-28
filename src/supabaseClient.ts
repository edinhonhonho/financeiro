import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local (veja .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SignUpProfileData {
  firstName: string;
  lastName: string;
  username: string;
}

export const signUpWithPassword = (email: string, password: string, profile: SignUpProfileData) =>
  supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        username: profile.username
      }
    }
  });

export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const resetPasswordForEmail = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

export const updatePassword = (newPassword: string) =>
  supabase.auth.updateUser({ password: newPassword });

export const logout = () => supabase.auth.signOut();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const anyError = error as Record<string, unknown>;
    if (typeof anyError.message === 'string' && anyError.message) return anyError.message;
    try { return JSON.stringify(error); } catch { /* fall through */ }
  }
  return String(error);
}

export function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null) {
  // Erros do Supabase (PostgrestError) são objetos simples com `.message`,
  // não instâncias de `Error` — `String(error)` neles vira "[object Object]".
  const message = extractErrorMessage(error);
  console.error('Supabase Error:', { message, operationType, path, raw: error });
  throw new Error(message);
}

const AUTH_ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha inválidos.'],
  [/password should be at least (\d+) characters/i, 'A senha deve ter pelo menos $1 caracteres.'],
  [/user already registered/i, 'Este e-mail já está cadastrado.'],
  [/already registered/i, 'Este e-mail já está cadastrado.'],
  [/email not confirmed/i, 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'],
  [/unable to validate email address.*invalid/i, 'E-mail inválido.'],
  [/email.*invalid/i, 'E-mail inválido.'],
  [/for security purposes, you can only request this after (\d+) seconds/i, 'Por segurança, aguarde $1 segundos antes de tentar novamente.'],
  [/rate limit/i, 'Muitas tentativas. Aguarde um instante e tente novamente.'],
  [/network error/i, 'Falha de conexão. Verifique sua internet e tente novamente.'],
  [/user not found/i, 'Usuário não encontrado.'],
  [/duplicate key value violates unique constraint.*username/i, 'Esse nome de usuário já está em uso.'],
  [/signup(s)? (is|are) disabled/i, 'Novos cadastros estão desabilitados no momento.'],
];

export function translateAuthError(message: string): string {
  for (const [pattern, translation] of AUTH_ERROR_TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) {
      return translation.replace(/\$(\d+)/g, (_, i) => match[Number(i)] ?? '');
    }
  }
  return message;
}
