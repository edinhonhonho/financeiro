/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, Card, Category } from './types';

export const mockCards: Card[] = [
  { id: 'c1', name: 'Nubank', limit: 5000, closingDay: 28, dueDay: 5, color: '#8a05be' },
  { id: 'c2', name: 'Inter', limit: 3000, closingDay: 15, dueDay: 22, color: '#ff7a00' },
];

export const mockCategories: Category[] = [
  { id: 'cat1', name: 'Alimentação', icon: 'Utensils', color: '#ef4444' },
  { id: 'cat2', name: 'Moradia', icon: 'Home', color: '#3b82f6' },
  { id: 'cat3', name: 'Transporte', icon: 'Car', color: '#10b981' },
  { id: 'cat4', name: 'Lazer', icon: 'Gamepad', color: '#f59e0b' },
  { id: 'cat5', name: 'Saúde', icon: 'HeartPulse', color: '#ec4899' },
  { id: 'cat6', name: 'Salário', icon: 'Wallet', color: '#8b5cf6' },
];

export const mockTransactions: Transaction[] = [
  {
    id: 't1',
    type: 'income',
    description: 'Salário mensal',
    amount: 5000,
    date: '2026-04-05',
    category: 'Salário',
    recurrence: 'monthly',
    status: 'actual',
    payerPayee: 'Empresa XYZ'
  },
  {
    id: 't2',
    type: 'income',
    description: 'Freelance design',
    amount: 1200,
    date: '2026-04-15',
    category: 'Salário',
    recurrence: 'none',
    status: 'planned',
    payerPayee: 'Cliente A'
  },
  {
    id: 't2-1',
    type: 'income',
    description: 'Venda de produtos',
    amount: 350,
    date: '2026-04-18',
    category: 'Salário',
    recurrence: 'none',
    status: 'planned',
    payerPayee: 'Vários'
  },
  {
    id: 't3',
    type: 'expense',
    description: 'Aluguel',
    amount: 1500,
    date: '2026-04-10',
    category: 'Moradia',
    recurrence: 'monthly',
    status: 'actual',
    payerPayee: 'Imobiliária'
  },
  {
    id: 't3-1',
    type: 'expense',
    description: 'Energia elétrica',
    amount: 230.45,
    date: '2026-04-12',
    category: 'Moradia',
    recurrence: 'monthly',
    status: 'planned',
    payerPayee: 'Enel'
  },
  {
    id: 't3-2',
    type: 'expense',
    description: 'Condomínio',
    amount: 450,
    date: '2026-04-05',
    category: 'Moradia',
    recurrence: 'monthly',
    status: 'actual',
    payerPayee: 'Administradora'
  },
  {
    id: 't4',
    type: 'card_purchase',
    description: 'Supermercado',
    amount: 450.50,
    date: '2026-04-12',
    category: 'Alimentação',
    recurrence: 'none',
    status: 'actual',
    cardId: 'c1',
    payerPayee: 'Carrefour'
  },
  {
    id: 't4-1',
    type: 'card_purchase',
    description: 'Jantar romântico',
    amount: 180,
    date: '2026-04-14',
    category: 'Alimentação',
    recurrence: 'none',
    status: 'actual',
    cardId: 'c2',
    payerPayee: 'Restaurante Fino'
  },
  {
    id: 't5',
    type: 'card_purchase',
    description: 'Novo monitor',
    amount: 1200,
    date: '2026-04-01',
    category: 'Lazer',
    recurrence: 'none',
    status: 'actual',
    cardId: 'c1',
    installments: { total: 10, current: 1 },
    payerPayee: 'Amazon'
  },
  {
    id: 't5-1',
    type: 'card_purchase',
    description: 'Cinema',
    amount: 65,
    date: '2026-04-10',
    category: 'Lazer',
    recurrence: 'none',
    status: 'actual',
    cardId: 'c1',
    payerPayee: 'Cinemark'
  },
  {
    id: 't6',
    type: 'expense',
    description: 'Internet',
    amount: 120,
    date: '2026-04-08',
    category: 'Moradia',
    recurrence: 'monthly',
    status: 'actual',
    payerPayee: 'Vivo'
  },
  {
    id: 't7',
    type: 'expense',
    description: 'Curso de inglês',
    amount: 350,
    date: '2026-04-20',
    category: 'Lazer',
    recurrence: 'monthly',
    status: 'planned',
    payerPayee: 'Wise Up'
  }
];
