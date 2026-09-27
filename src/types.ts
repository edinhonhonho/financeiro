/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionType = 'income' | 'expense' | 'card_purchase';

export type RecurrenceType = 'none' | 'monthly' | 'weekly' | 'yearly';

export interface TransactionAssignment {
  personId: string;
  amount: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  date: string; // ISO format
  category: string;
  recurrence: RecurrenceType;
  recurrenceEndDate?: string | null; // ISO format
  installments?: {
    total: number;
    current: number;
  } | null;
  status: 'planned' | 'actual';
  cardId?: string | null;
  payerPayee: string; // Keep for simple cases/compatibility
  assignments?: TransactionAssignment[];
  linkedToCard?: boolean;
  linkedTransactionId?: string | null;
  seriesId?: string | null;
  actualDate?: string | null; // ISO format for when it was actually paid/received
  // Direção do vínculo com a pessoa em payerPayee/assignments: false = eu pago
  // pra ela (aparece em Pessoas como algo que eu devo); null/undefined/true =
  // ela me deve (comportamento padrão, receita vinculada é criada).
  owedByPerson?: boolean | null;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  image?: string;
  visible?: boolean;
  linkedUserId?: string | null;
}

export interface UserProfile {
  id: string;
  nickname: string;
  email: string;
  photoURL?: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

export interface PublicProfile {
  id: string;
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

export interface Card {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface PersonConsent {
  id: string;
  ownerId: string;
  targetUserId: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface AppNotification {
  id: string;
  userId: string;
  fromUserId?: string | null;
  type: 'consent_request' | 'assigned' | 'consent_response';
  title: string;
  body?: string | null;
  transactionId?: string | null;
  consentId?: string | null;
  read: boolean;
  createdAt: string;
}
