import { supabase, handleSupabaseError, OperationType } from './supabaseClient';
import { Transaction, Card, Person, Category, UserProfile, PublicProfile, AppNotification, PersonConsent } from './types';

// ----------------------------------------------------------------------------
// Realtime
// ----------------------------------------------------------------------------

/**
 * Assina mudanças em tempo real de uma tabela e chama `onChange` (debounced)
 * para recarregar os dados. O debounce evita que uma operação em lote (ex:
 * criar 24 parcelas de uma vez) dispare uma refetch completa para cada linha
 * alterada — sem isso a UI fica visivelmente mais lenta em séries longas.
 */
export function subscribeToTable(table: string, userId: string, onChange: () => void, debounceMs = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  const channel = supabase
    .channel(`${table}-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `userId=eq.${userId}` },
      debounced
    )
    .subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

// ----------------------------------------------------------------------------
// Profile
// ----------------------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) handleSupabaseError(error, OperationType.GET, 'profiles');
  return data as UserProfile | null;
}

export async function saveProfile(userId: string, patch: Partial<UserProfile>) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...patch });
  if (error) handleSupabaseError(error, OperationType.WRITE, 'profiles');
}

/** Busca usuários já cadastrados no app pelo nome de usuário (para vincular a uma pessoa). */
export async function searchProfilesByUsername(query: string, excludeUserId?: string): Promise<PublicProfile[]> {
  const cleaned = query.trim().replace(/^@+/, '');
  if (!cleaned) return [];
  let request = supabase
    .from('profiles')
    .select('id, nickname, firstName, lastName, username, "photoURL"')
    .ilike('username', `%${cleaned}%`)
    .limit(10);
  if (excludeUserId) request = request.neq('id', excludeUserId);
  const { data, error } = await request;
  if (error) handleSupabaseError(error, OperationType.LIST, 'profiles');
  return (data ?? []) as PublicProfile[];
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, firstName, lastName, username, "photoURL"')
    .eq('id', userId)
    .maybeSingle();
  if (error) handleSupabaseError(error, OperationType.GET, 'profiles');
  return data as PublicProfile | null;
}

// ----------------------------------------------------------------------------
// Categories
// ----------------------------------------------------------------------------

export async function fetchCategories(userId: string): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').eq('userId', userId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'categories');
  return (data ?? []) as Category[];
}

export async function seedDefaultCategories(userId: string, categories: Omit<Category, 'id'>[]) {
  const { error } = await supabase.from('categories').insert(categories.map(c => ({ ...c, userId })));
  if (error) handleSupabaseError(error, OperationType.CREATE, 'categories');
}

export async function createCategory(userId: string, data: Omit<Category, 'id'>) {
  const { error } = await supabase.from('categories').insert({ ...data, userId });
  if (error) handleSupabaseError(error, OperationType.CREATE, 'categories');
}

export async function updateCategory(id: string, data: Partial<Category>) {
  const { error } = await supabase.from('categories').update(data).eq('id', id);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'categories');
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) handleSupabaseError(error, OperationType.DELETE, 'categories');
}

// ----------------------------------------------------------------------------
// People
// ----------------------------------------------------------------------------

export async function fetchPeople(userId: string): Promise<Person[]> {
  const { data, error } = await supabase.from('people').select('*').eq('userId', userId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'people');
  return (data ?? []) as Person[];
}

export async function createPerson(userId: string, data: Omit<Person, 'id'>) {
  const { error } = await supabase.from('people').insert({ ...data, userId });
  if (error) handleSupabaseError(error, OperationType.CREATE, 'people');
}

export async function updatePerson(id: string, data: Partial<Person>) {
  const { error } = await supabase.from('people').update(data).eq('id', id);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'people');
}

export async function deletePerson(id: string) {
  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) handleSupabaseError(error, OperationType.DELETE, 'people');
}

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------

export async function fetchCards(userId: string): Promise<Card[]> {
  const { data, error } = await supabase.from('cards').select('*').eq('userId', userId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'cards');
  return (data ?? []) as Card[];
}

export async function createCard(userId: string, data: Omit<Card, 'id'>) {
  const { error } = await supabase.from('cards').insert({ ...data, userId });
  if (error) handleSupabaseError(error, OperationType.CREATE, 'cards');
}

export async function updateCard(id: string, data: Partial<Card>) {
  const { error } = await supabase.from('cards').update(data).eq('id', id);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'cards');
}

export async function deleteCard(id: string) {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) handleSupabaseError(error, OperationType.DELETE, 'cards');
}

// ----------------------------------------------------------------------------
// Transactions
// ----------------------------------------------------------------------------

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('userId', userId)
    .order('date', { ascending: false });
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Transaction[];
}

export function newTransactionId() {
  return crypto.randomUUID();
}

/** Insere várias transações novas (linhas com id já preenchido) em uma única chamada atômica. */
export async function insertTransactions(rows: Array<Transaction & { userId: string }>) {
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) handleSupabaseError(error, OperationType.CREATE, 'transactions');
}

export async function updateTransaction(id: string, data: Partial<Transaction>) {
  const { error } = await supabase.from('transactions').update(data).eq('id', id);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'transactions');
}

/** Renomeia a categoria em todos os lançamentos que a usam (a categoria é guardada pelo nome). */
export async function renameTransactionCategory(userId: string, oldName: string, newName: string) {
  const { error } = await supabase
    .from('transactions')
    .update({ category: newName })
    .eq('userId', userId)
    .eq('category', oldName);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'transactions');
}

export async function deleteTransactions(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('transactions').delete().in('id', ids);
  if (error) handleSupabaseError(error, OperationType.DELETE, 'transactions');
}

export async function deleteAllTransactions(userId: string) {
  const { error } = await supabase.from('transactions').delete().eq('userId', userId);
  if (error) handleSupabaseError(error, OperationType.DELETE, 'transactions');
}

/** Apaga TODOS os dados financeiros do usuário: lançamentos, cartões, categorias e pessoas. */
export async function deleteAllUserData(userId: string) {
  const { error: transactionsError } = await supabase.from('transactions').delete().eq('userId', userId);
  if (transactionsError) handleSupabaseError(transactionsError, OperationType.DELETE, 'transactions');

  const { error: cardsError } = await supabase.from('cards').delete().eq('userId', userId);
  if (cardsError) handleSupabaseError(cardsError, OperationType.DELETE, 'cards');

  const { error: categoriesError } = await supabase.from('categories').delete().eq('userId', userId);
  if (categoriesError) handleSupabaseError(categoriesError, OperationType.DELETE, 'categories');

  const { error: peopleError } = await supabase.from('people').delete().eq('userId', userId);
  if (peopleError) handleSupabaseError(peopleError, OperationType.DELETE, 'people');
}

export async function fetchSeriesSiblings(userId: string, seriesId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('userId', userId)
    .eq('seriesId', seriesId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Transaction[];
}

export async function fetchByDescriptionAndAmount(
  userId: string,
  description: string,
  amount: number
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('userId', userId)
    .eq('description', description)
    .eq('amount', amount);
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Transaction[];
}

export async function fetchLinkedToCard(userId: string, seriesId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('userId', userId)
    .eq('seriesId', seriesId)
    .eq('linkedToCard', true);
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Transaction[];
}

export async function fetchLinkedTransactions(userId: string, linkedTransactionId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('userId', userId)
    .eq('linkedTransactionId', linkedTransactionId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Transaction[];
}

// ----------------------------------------------------------------------------
// Compartilhamento com pessoas vinculadas (ver supabase/sharing.sql)
// ----------------------------------------------------------------------------

/** Movimentações de outros usuários em que fui associado (a RLS só devolve as compartilhadas comigo). */
export async function fetchSharedTransactions(userId: string): Promise<Array<Transaction & { userId: string }>> {
  const { data, error } = await supabase.from('transactions').select('*').neq('userId', userId);
  if (error) handleSupabaseError(error, OperationType.LIST, 'transactions');
  return (data ?? []) as Array<Transaction & { userId: string }>;
}

/** Ids das "pessoas" (nos cadastros de outros usuários) que apontam para mim. */
export async function fetchMySharedPeople(): Promise<Array<{ id: string; userId: string }>> {
  const { data, error } = await supabase.rpc('my_shared_people');
  if (error) handleSupabaseError(error, OperationType.LIST, 'people');
  return (data ?? []) as Array<{ id: string; userId: string }>;
}

export async function fetchPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, firstName, lastName, username, "photoURL"')
    .in('id', ids);
  if (error) handleSupabaseError(error, OperationType.LIST, 'profiles');
  return (data ?? []) as PublicProfile[];
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(50);
  if (error) handleSupabaseError(error, OperationType.LIST, 'notifications');
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'notifications');
}

export async function fetchConsent(consentId: string): Promise<PersonConsent | null> {
  const { data, error } = await supabase.from('person_consents').select('*').eq('id', consentId).maybeSingle();
  if (error) handleSupabaseError(error, OperationType.GET, 'person_consents');
  return data as PersonConsent | null;
}

export async function respondConsent(consentId: string, status: 'accepted' | 'declined') {
  const { error } = await supabase.from('person_consents').update({ status }).eq('id', consentId);
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'person_consents');
}

/** Aviso a quem criou a movimentação compartilhada que eu já paguei (ver supabase/shared_payments.sql). */
export async function signalSharedPayment(transactionId: string) {
  const { error } = await supabase.rpc('signal_shared_payment', { tx: transactionId });
  if (error) handleSupabaseError(error, OperationType.UPDATE, 'transactions');
}
