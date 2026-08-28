/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  ChevronRight,
  ChevronDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar as CalendarIcon,
  CreditCard,
  CheckCircle2,
  PieChart as PieChartIcon,
  LogOut,
  Settings,
  ChevronLeft,
  Wallet,
  MessageCircle,
  Mail,
  ArrowUpDown,
  Info,
  Users,
  Trash2,
  Download,
  LayoutDashboard,
  Database,
  Repeat,
  Eye,
  EyeOff,
  UserCheck,
  Palette,
  LogIn,
  Moon,
  Sun,
  Smartphone,
  KeyRound,
  AtSign,
  UserCog,
  Pencil,
  Sparkles,
  Home,
  Bell,
  ArrowUp,
  ArrowDown,
  Camera,
  Clock,
  Check,
  Search
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  Card as ShadcnCard,
  CardContent
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths, isAfter, addDays, differenceInCalendarDays, differenceInMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Papa from 'papaparse';

import { Transaction, Card, TransactionType, RecurrenceType, Person, UserProfile, Category, PublicProfile } from './types';
import { mockCategories } from './mockData';
import { cn } from '@/lib/utils';
import { supabase, signInWithPassword, signUpWithPassword, resetPasswordForEmail, updatePassword, logout, OperationType, handleSupabaseError, translateAuthError } from './supabaseClient';
import * as api from './api';
import type { User } from '@supabase/supabase-js';

// Currency Helpers
const maskCurrency = (value: string) => {
  const cleanValue = value.replace(/\D/g, '');
  if (!cleanValue) return '0,00';
  const cents = parseInt(cleanValue, 10);
  return (cents / 100).toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const maskPercentage = (value: string) => {
  const cleanValue = value.replace(/\D/g, '');
  if (!cleanValue) return '0,00';
  const cents = parseInt(cleanValue, 10);
  return (cents / 100).toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const parseCurrency = (value: string) => {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
};

// Nth business day (Mon-Fri) of a given month — does not account for holidays.
const getNthBusinessDay = (year: number, monthIndex: number, n: number): Date => {
  let date = new Date(year, monthIndex, 1);
  let count = 0;
  while (count < n) {
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) return date;
    }
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
};

const months = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 4 }, (_, i) => ({
  value: String(currentYear + i),
  label: String(currentYear + i),
}));
// Faixa mais ampla (passado e futuro) para o navegador de meses, que precisa
// alcançar lançamentos de anos anteriores — diferente de `years`, usado só
// para datas-limite de recorrência (sempre no futuro).
const monthPickerYears = Array.from({ length: 9 }, (_, i) => ({
  value: String(currentYear - 6 + i),
  label: String(currentYear - 6 + i),
}));

const DEFAULT_CATEGORY_ICON = '🏷️';

const CARD_COLOR_PRESETS = [
  '#8A7FF5', '#37D6A3', '#FDB8D7', '#FF6F61',
  '#FFC168', '#6FA8FF', '#B6ADFF', '#5FC9A8',
  '#F797C0', '#FF9D91', '#8D89AC', '#4B4570',
];

/** Cor determinística por pessoa (não editável — Person não tem campo `color`). */
function getPersonColor(personId: string): string {
  let hash = 0;
  for (let i = 0; i < personId.length; i++) hash = (hash * 31 + personId.charCodeAt(i)) >>> 0;
  return CARD_COLOR_PRESETS[hash % CARD_COLOR_PRESETS.length];
}

/**
 * Erros do Supabase (PostgrestError) são objetos simples com `.message`, não
 * instâncias de `Error` — `String(err)` neles vira "[object Object]". Extrai
 * a mensagem de forma robusta para os dois casos.
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;
    try { return JSON.stringify(err); } catch { /* fall through */ }
  }
  return String(err);
}

function DateField({
  value,
  onChange,
  className,
  placeholder = 'Selecionar data'
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <button
          type="button"
          className={cn(
            "h-11 rounded-lg border-none bg-slate-50 dark:bg-[#16133F] focus:bg-white dark:focus:bg-[#100E3D] font-normal text-sm px-4 flex items-center gap-2 text-left w-full transition-all",
            className
          )}
        >
          <CalendarIcon size={15} className="text-slate-400 dark:text-[#8D89AC] shrink-0" />
          <span className={cn(!selected && "text-slate-400 dark:text-[#8D89AC] font-medium")}>
            {selected ? format(selected, 'dd/MM/yyyy') : placeholder}
          </span>
        </button>
      } />
      <PopoverContent className="w-auto p-2 rounded-2xl border-none shadow-deep bg-white dark:bg-[#100E3D] z-[80]">
        <Calendar
          mode="single"
          selected={selected}
          locale={ptBR}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("w-12 h-7 rounded-full transition-colors relative shrink-0", checked ? "bg-primary" : "bg-slate-200 dark:bg-[#2A2566]")}
    >
      <span className={cn("absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-5")} />
    </button>
  );
}

function AccountRow({
  icon,
  title,
  description,
  onClick,
  danger,
  right,
  disabled
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  const content = (
    <>
      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", danger ? "bg-rose-50 text-rose-400" : "bg-primary/10 text-primary")}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium text-sm", danger ? "text-rose-500" : "text-slate-800 dark:text-[#EDE9E3]")}>{title}</p>
        {description && (
          <p className={cn("text-[11px] font-normal mt-0.5 leading-relaxed", danger ? "text-rose-400/70" : "text-slate-400 dark:text-[#8D89AC]")}>{description}</p>
        )}
      </div>
      {right !== undefined ? right : (onClick && !disabled && <ChevronRight size={16} className="text-slate-300 dark:text-[#6B679C] shrink-0" />)}
    </>
  );

  // Quando `right` traz seu próprio elemento interativo (ex: ToggleSwitch), a
  // linha não pode ser um <button> — um <button> dentro de outro é HTML inválido
  // e quebra a hidratação.
  if (right !== undefined) {
    return (
      <div className="w-full flex items-center gap-4 p-5 text-left">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-4 p-5 text-left transition-colors",
        disabled ? "opacity-50 cursor-default" : "hover:bg-slate-50 dark:hover:bg-[#16133F]"
      )}
    >
      {content}
    </button>
  );
}

function AccountSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      {label && <p className="text-[10px] font-medium tracking-widest text-slate-400 dark:text-[#8D89AC] ml-1">{label}</p>}
      <div className="bg-white dark:bg-[#100E3D] rounded-[2rem] shadow-soft divide-y divide-slate-100 dark:divide-[#201C56] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
    // Mantém a cor da barra de status do PWA/navegador igual ao fundo do app,
    // já que o modo escuro aqui é uma preferência manual (não só do SO).
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', darkMode ? '#0B0A2E' : '#F6F4FD');
    });
  }, [darkMode]);

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [showIOSInstallHelp, setShowIOSInstallHelp] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
    setIsIOSDevice(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } else if (isIOSDevice) {
      setShowIOSInstallHelp(true);
    } else {
      showAlert('Instalação não disponível', 'Seu navegador não oferece instalação direta. No menu do navegador, procure por "Instalar aplicativo" ou "Adicionar à tela inicial".');
    }
  };

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [transactionFilter, setTransactionFilter] = useState<'pending' | 'all'>('all');
  const [movTab, setMovTab] = useState<'movimentacoes' | 'apagar' | 'areceber'>('movimentacoes');
  const [movStatusFilter, setMovStatusFilter] = useState<'all' | 'planned' | 'actual'>('all');
  const [movSearchQuery, setMovSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(format(new Date(), 'MM'));
  const [pickerYear, setPickerYear] = useState(format(new Date(), 'yyyy'));
  const [isRegistrarOpen, setIsRegistrarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPessoasOpen, setIsPessoasOpen] = useState(false);
  const [isCategoriasOpen, setIsCategoriasOpen] = useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [isAccountEditOpen, setIsAccountEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [isPessoasSummaryOpen, setIsPessoasSummaryOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<'date' | 'category' | 'person'>('date');
  const [sortMode, setSortMode] = useState<'date' | 'min' | 'max'>('date');
  const [alertConfig, setAlertConfig] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: '', message: '' });
  const [tempNickname, setTempNickname] = useState('');
  const [createLinkedIncome, setCreateLinkedIncome] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);
  const [deleteLinked, setDeleteLinked] = useState(false);
  const [linkedIncomeDate, setLinkedIncomeDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ open: true, title, message });
  };

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Preencha e-mail e senha.');
      return;
    }
    if (authMode === 'signup' && (!authFirstName.trim() || !authLastName.trim() || !authUsername.trim())) {
      setAuthError('Preencha nome, sobrenome e usuário.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError('');
    setAuthInfo('');
    try {
      const { error } = authMode === 'signin'
        ? await signInWithPassword(authEmail.trim(), authPassword)
        : await signUpWithPassword(authEmail.trim(), authPassword, {
            firstName: authFirstName.trim(),
            lastName: authLastName.trim(),
            username: authUsername.trim()
          });
      if (error) {
        setAuthError(translateAuthError(error.message));
      } else if (authMode === 'signup') {
        setAuthInfo('Conta criada com sucesso! Se a confirmação por e-mail estiver ativada, clique no link que enviamos para o seu e-mail antes de entrar. Caso contrário, é só entrar com sua senha agora.');
      }
    } catch (err) {
      setAuthError(translateAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Informe seu e-mail.');
      return;
    }
    setForgotSubmitting(true);
    setForgotError('');
    try {
      const { error } = await resetPasswordForEmail(forgotEmail.trim());
      if (error) {
        setForgotError(translateAuthError(error.message));
      } else {
        setForgotSent(true);
      }
    } catch (err) {
      setForgotError(translateAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleRecoveryPasswordSubmit = async () => {
    if (!recoveryPassword || recoveryPassword !== recoveryConfirmPassword) {
      setRecoveryError('As senhas precisam ser preenchidas e coincidir.');
      return;
    }
    setRecoverySubmitting(true);
    setRecoveryError('');
    try {
      const { error } = await updatePassword(recoveryPassword);
      if (error) {
        setRecoveryError(translateAuthError(error.message));
      } else {
        setIsPasswordRecovery(false);
        setRecoveryPassword('');
        setRecoveryConfirmPassword('');
        showAlert('Senha atualizada', 'Sua senha foi redefinida com sucesso.');
      }
    } catch (err) {
      setRecoveryError(translateAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const generateChargeMessage = (person: Person, charges: ReturnType<typeof getPersonMonthlyCharges>, month: Date) => {
    const monthName = format(month, 'MMMM/yyyy', { locale: ptBR });
    const firstName = person.name.split(' ')[0];

    if (charges.items.length === 0) {
      return `Oi ${firstName}! Fechando as contas de ${monthName}, não ficou nada pendente por aqui. 🙌`;
    }

    let message = `Oi ${firstName}! 👋\n`;
    message += `Fechando as contas de *${monthName}*, aqui está o que ficou por sua conta:\n\n`;

    charges.items.forEach(t => {
      const isCard = t.type === 'card_purchase';
      message += `• ${t.description}${isCard ? ' (cartão)' : ''} — R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${t.status === 'planned' ? ' _(pendente)_' : ''}\n`;
    });

    message += `\n💰 *Total: R$ ${charges.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n\n`;
    message += `Pode me mandar quando puder, valeu! 🙏`;
    return message;
  };

  const shareChargeOnWhatsApp = (person: Person, charges: ReturnType<typeof getPersonMonthlyCharges>) => {
    const text = generateChargeMessage(person, charges, currentDate);
    const phone = person.phone ? person.phone.replace(/\D/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [cardToDelete, setCardToDelete] = useState<Card | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [amountInput, setAmountInput] = useState('0,00');
  const [showPersonSelector, setShowPersonSelector] = useState(false);
  const [globalSplitType, setGlobalSplitType] = useState<'parts' | 'percentage' | 'value'>('parts');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const handleExportGlobalCSV = () => {
    if (transactions.length === 0) {
      showAlert("Sem dados", "Não há lançamentos para exportar.");
      return;
    }
    const data = transactions.map(t => ({
      Data: t.date,
      Descrição: t.description,
      Categoria: t.category,
      Valor: t.amount,
      Tipo: t.type === 'income' ? 'Receita' : (t.type === 'card_purchase' ? 'Despesa Cartão' : 'Despesa'),
      Status: t.status === 'actual' ? 'Confirmado' : 'Planejado',
      Pessoa: people.find(p => p.id === t.payerPayee)?.name || t.payerPayee,
      Cartão: cards.find(c => c.id === t.cardId)?.name || ''
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `financeiro_completo_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /** Cria cartões, pessoas e um punhado de lançamentos de exemplo (mês atual e anterior) para testar o app. */
  const handleSeedTestData = async () => {
    if (!user) return;
    setIsDataModalOpen(false);
    try {
      let seedCards = cards;
      if (seedCards.length === 0) {
        await api.createCard(user.id, { name: 'Nubank', limit: 5000, closingDay: 20, dueDay: 27, color: '#8A7FF5' });
        await api.createCard(user.id, { name: 'Inter', limit: 3000, closingDay: 5, dueDay: 12, color: '#f59e0b' });
        seedCards = await api.fetchCards(user.id);
      }

      let seedPeople = people;
      if (seedPeople.length < 2) {
        await api.createPerson(user.id, { name: 'Ana Souza', email: 'ana@exemplo.com', phone: '11987654321', image: 'https://picsum.photos/seed/ana-teste/200/200', visible: true });
        await api.createPerson(user.id, { name: 'Bruno Lima', email: 'bruno@exemplo.com', phone: '11976543210', image: 'https://picsum.photos/seed/bruno-teste/200/200', visible: true });
        seedPeople = await api.fetchPeople(user.id);
      }

      const catName = (name: string) => categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()))?.name || categories[0]?.name || 'Outros';
      const cardA = seedCards[0]?.id ?? null;
      const cardB = seedCards[1]?.id ?? null;
      const personA = seedPeople[0]?.id || 'geral';
      const personB = seedPeople[1]?.id || 'geral';
      const personAName = seedPeople[0]?.name.split(' ')[0] || 'Ana';
      const personBName = seedPeople[1]?.name.split(' ')[0] || 'Bruno';

      const rows: Array<Transaction & { userId: string }> = [];
      [subMonths(currentDate, 1), currentDate].forEach((month, mi) => {
        const y = month.getFullYear();
        const m = month.getMonth();
        const isPastMonth = mi === 0;
        const mk = (day: number) => format(new Date(y, m, day), 'yyyy-MM-dd');

        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'income', description: 'Salário', amount: 5200, date: mk(5), category: catName('Salário'), status: 'actual', recurrence: 'none', payerPayee: 'geral', assignments: [], linkedToCard: false } as Transaction & { userId: string });
        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'income', description: 'Freelance de design', amount: 850, date: mk(16), category: catName('Salário'), status: isPastMonth ? 'actual' : 'planned', recurrence: 'none', payerPayee: 'geral', assignments: [], linkedToCard: false } as Transaction & { userId: string });
        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'expense', description: 'Aluguel', amount: 1800, date: mk(10), category: catName('Moradia'), status: 'actual', recurrence: 'none', payerPayee: 'geral', assignments: [], linkedToCard: false } as Transaction & { userId: string });
        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'expense', description: 'Internet', amount: 119.9, date: mk(8), category: catName('Moradia'), status: 'actual', recurrence: 'none', payerPayee: 'geral', assignments: [], linkedToCard: false } as Transaction & { userId: string });
        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'expense', description: `Conta de luz dividida com ${personAName}`, amount: 240, date: mk(12), category: catName('Moradia'), status: isPastMonth ? 'actual' : 'planned', recurrence: 'none', payerPayee: personA, assignments: [], linkedToCard: false } as Transaction & { userId: string });
        rows.push({ id: api.newTransactionId(), userId: user.id, type: 'expense', description: 'Curso de inglês', amount: 350, date: mk(20), category: catName('Lazer'), status: 'planned', recurrence: 'none', payerPayee: 'geral', assignments: [], linkedToCard: false } as Transaction & { userId: string });
        if (cardA) {
          rows.push({ id: api.newTransactionId(), userId: user.id, type: 'card_purchase', description: 'Supermercado', amount: 430.5, date: mk(7), category: catName('Alimentação'), status: 'actual', recurrence: 'none', payerPayee: 'geral', assignments: [], cardId: cardA, linkedToCard: false } as Transaction & { userId: string });
          rows.push({ id: api.newTransactionId(), userId: user.id, type: 'card_purchase', description: `Cinema com ${personBName}`, amount: 90, date: mk(18), category: catName('Lazer'), status: 'actual', recurrence: 'none', payerPayee: personB, assignments: [], cardId: cardA, linkedToCard: false } as Transaction & { userId: string });
        }
        if (cardB) {
          rows.push({ id: api.newTransactionId(), userId: user.id, type: 'card_purchase', description: 'Assinatura streaming', amount: 39.9, date: mk(3), category: catName('Lazer'), status: 'actual', recurrence: 'none', payerPayee: 'geral', assignments: [], cardId: cardB, linkedToCard: false } as Transaction & { userId: string });
        }
      });

      await api.insertTransactions(rows);
      await Promise.all([loadCards(), loadPeople(), loadTransactions()]);
      showAlert('Dados de teste criados!', `${rows.length} lançamentos, ${seedPeople.length >= 2 ? 'pessoas' : 'sem pessoas novas'} e cartões de exemplo foram adicionados.`);
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'transactions');
      showAlert('Erro', 'Não foi possível gerar os dados de teste.');
    }
  };

  // Auth Listener
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setIsAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Carregam cada lista do Supabase e atualizam o estado local. Ficam no escopo
  // do componente (não só dentro do efeito de sync) para que os handlers de
  // criar/editar/excluir possam chamá-las diretamente após a escrita, em vez de
  // depender só do Realtime — assim a UI atualiza na hora mesmo se a assinatura
  // em tempo real demorar, cair ou não estar habilitada no projeto Supabase.
  const loadProfile = React.useCallback(async () => {
    if (!user) return;
    try {
      const profile = await api.fetchProfile(user.id);
      setUserProfile(profile);
      if (!profile?.nickname) setIsNicknameModalOpen(true);
    } catch (err) {
      handleSupabaseError(err, OperationType.GET, 'profiles');
    }
  }, [user]);

  const loadTransactions = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.fetchTransactions(user.id);
      setTransactions(data);
    } catch (err) {
      handleSupabaseError(err, OperationType.LIST, 'transactions');
    }
  }, [user]);

  const loadCards = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.fetchCards(user.id);
      setCards(data);
    } catch (err) {
      handleSupabaseError(err, OperationType.LIST, 'cards');
    }
  }, [user]);

  const loadPeople = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.fetchPeople(user.id);
      setPeople(data);
    } catch (err) {
      handleSupabaseError(err, OperationType.LIST, 'people');
    }
  }, [user]);

  const loadCategories = React.useCallback(async () => {
    if (!user) return;
    try {
      let data = await api.fetchCategories(user.id);
      if (data.length === 0) {
        await api.seedDefaultCategories(user.id, mockCategories.map(({ id, ...rest }) => rest));
        data = await api.fetchCategories(user.id);
      }
      setCategories(data);
    } catch (err) {
      handleSupabaseError(err, OperationType.LIST, 'categories');
    }
  }, [user]);

  // Supabase Data Sync
  React.useEffect(() => {
    if (!user) {
      setTransactions([]);
      setCards([]);
      setPeople([]);
      setUserProfile(null);
      return;
    }

    loadProfile();
    loadTransactions();
    loadCards();
    loadPeople();
    loadCategories();

    const unsubscribeProfile = api.subscribeToTable('profiles', user.id, loadProfile);
    const unsubscribeTransactions = api.subscribeToTable('transactions', user.id, loadTransactions);
    const unsubscribeCards = api.subscribeToTable('cards', user.id, loadCards);
    const unsubscribePeople = api.subscribeToTable('people', user.id, loadPeople);
    const unsubscribeCategories = api.subscribeToTable('categories', user.id, loadCategories);

    return () => {
      unsubscribeProfile();
      unsubscribeTransactions();
      unsubscribeCards();
      unsubscribePeople();
      unsubscribeCategories();
    };
  }, [user, loadProfile, loadTransactions, loadCards, loadPeople, loadCategories]);

  const getTransactionEffectiveMonth = (t: Transaction) => {
    if (t.category === 'Fatura cartão' || t.category === 'Fatura Cartão') {
      return startOfMonth(parseISO(t.date));
    }
    
    if (t.cardId) {
      const card = cards.find(c => c.id === t.cardId);
      if (card) {
        const tDate = parseISO(t.date);
        const tDay = tDate.getDate();
        // Sem fechamento cadastrado, não há corte: a compra fica no próprio mês.
        const closingDay = card.closingDay ? Number(card.closingDay) : 31;

        if (tDay > closingDay) {
          return addMonths(startOfMonth(tDate), 1);
        } else {
          return startOfMonth(tDate);
        }
      }
    }
    return startOfMonth(parseISO(t.date));
  };

  /** Fatura sintética de um cartão num mês (soma das compras cuja competência cai nesse mês). */
  const computeCardBill = (card: Card, month: Date): Transaction => {
    const amount = transactions
      .filter(t => t.type === 'card_purchase' && t.cardId === card.id && format(getTransactionEffectiveMonth(t), 'yyyy-MM') === format(month, 'yyyy-MM'))
      .reduce((acc, t) => acc + t.amount, 0);

    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const dueDay = card.dueDay ? Math.min(Number(card.dueDay), daysInMonth) : daysInMonth;
    const billDate = new Date(month.getFullYear(), month.getMonth(), dueDay);

    return {
      id: `bill-${card.id}`,
      type: 'expense',
      description: `Fatura ${card.name}`,
      amount,
      date: format(billDate, 'yyyy-MM-dd'),
      category: 'Fatura cartão',
      status: 'planned',
      cardId: card.id,
      payerPayee: 'geral',
      recurrence: 'none',
      assignments: []
    };
  };

  /** Verifica se a fatura de um cartão num mês já foi paga (existe um lançamento "Pagamento Fatura"). */
  const isCardBillPaid = (cardId: string, month: Date) => transactions.some(t =>
    t.type === 'expense' &&
    t.status === 'actual' &&
    t.cardId === cardId &&
    (t.category === 'Fatura Cartão' || t.category === 'Fatura cartão') &&
    format(parseISO(t.date), 'yyyy-MM') === format(month, 'yyyy-MM')
  );

  // Grouping logic
  const groupedTransactions = useMemo(() => {
    let list = [...transactions];

    // Calculate card bills for 'despesas' tab if grouped by date or category
    if (activeTab === 'despesas') {
      const cardBills: Transaction[] = cards
        .map(card => computeCardBill(card, currentDate))
        .filter(bill => bill.amount > 0);
      
      list = [...list, ...cardBills];
    }

    if (activeTab === 'visao-geral') {
      const recent = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
      const groups: Record<string, Transaction[]> = { 'Lançamentos Recentes': recent };
      return groups;
    }

    if (activeTab === 'receitas') {
      let income = transactions.filter(t => {
        const effectiveMonth = getTransactionEffectiveMonth(t);
        const isThisMonth = format(effectiveMonth, 'yyyy-MM') === format(currentDate, 'yyyy-MM');
        const matchesType = t.type === 'income';
        const matchesFilter = transactionFilter === 'all' ? true : (t.status === 'planned');
        return matchesType && isThisMonth && matchesFilter;
      });

      if (sortMode === 'min') income.sort((a,b) => a.amount - b.amount);
      else if (sortMode === 'max') income.sort((a,b) => b.amount - a.amount);
      else income.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const groups: Record<string, Transaction[]> = {};
      
      if (sortMode !== 'date') {
        groups['Todos os lançamentos'] = income;
      } else if (groupMode === 'category') {
        income.forEach(t => {
          const key = t.category || 'Outros';
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });
      } else if (groupMode === 'person') {
        income.forEach(t => {
          let key = 'Meus';
          if (t.payerPayee && t.payerPayee !== 'geral' && t.payerPayee !== 'multi') {
            const person = people.find(p => p.id === t.payerPayee);
            key = person ? person.name : 'Outros';
          } else if (t.payerPayee === 'multi') {
            key = 'Dividido';
          }
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });
      } else {
        income.forEach(t => {
          const dateKey = format(parseISO(t.date), 'yyyy-MM-dd');
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(t);
        });
      }
      return groups;
    }
    
    if (activeTab === 'despesas') {
      let expenses = list.filter(t => {
        const effectiveMonth = getTransactionEffectiveMonth(t);
        const isThisMonth = format(effectiveMonth, 'yyyy-MM') === format(currentDate, 'yyyy-MM');
        const matchesType = t.type === 'expense';
        const matchesFilter = transactionFilter === 'all' ? true : (t.status === 'planned');
        return matchesType && isThisMonth && matchesFilter;
      });

      if (sortMode === 'min') expenses.sort((a,b) => a.amount - b.amount);
      else if (sortMode === 'max') expenses.sort((a,b) => b.amount - a.amount);
      else expenses.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const groups: Record<string, Transaction[]> = {};
      
      if (sortMode !== 'date') {
        groups['Todos os lançamentos'] = expenses;
      } else if (groupMode === 'category') {
        expenses.forEach(t => {
          const key = t.category || 'Outros';
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });
      } else if (groupMode === 'person') {
        expenses.forEach(t => {
          let key = 'Meus';
          if (t.assignments && t.assignments.length > 0) {
            key = 'Dividido';
          } else if (t.payerPayee && t.payerPayee !== 'geral' && t.payerPayee !== 'multi') {
            const person = people.find(p => p.id === t.payerPayee);
            key = person ? person.name : 'Outros';
          } else if (t.id.startsWith('bill-')) {
            key = 'Meus';
          }
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });
      } else {
        expenses.forEach(t => {
          const dateKey = format(parseISO(t.date), 'yyyy-MM-dd');
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(t);
        });
      }
      return groups;
    }

    if (activeTab === 'cartoes') {
      let cardPurchases = transactions.filter(t => {
        if (t.type !== 'card_purchase') return false;
        
        const isThisCard = !selectedCard || t.cardId === selectedCard;
        if (!isThisCard) return false;

        const card = cards.find(c => c.id === t.cardId);
        if (!card) return false;

        return format(getTransactionEffectiveMonth(t), 'yyyy-MM') === format(currentDate, 'yyyy-MM');
      });

      if (sortMode === 'min') cardPurchases.sort((a,b) => a.amount - b.amount);
      else if (sortMode === 'max') cardPurchases.sort((a,b) => b.amount - a.amount);
      else cardPurchases.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const groups: Record<string, Transaction[]> = {};
      
      if (sortMode !== 'date') {
        groups['Todos os lançamentos'] = cardPurchases;
      } else if (groupMode === 'category') {
        cardPurchases.forEach(t => {
          const key = t.category || 'Outros';
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        });
      } else {
        cardPurchases.forEach(t => {
          const dateKey = format(parseISO(t.date), 'yyyy-MM-dd');
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(t);
        });
      }
      return groups;
    }

    return {};
  }, [transactions, activeTab, selectedCard, transactionFilter, currentDate, cards, groupMode, sortMode]);

  // Listas da tela "Movimentações" (nav unificada de receitas + despesas, com
  // sub-abas "Movimentações" / "A pagar" / "A receber" no estilo da referência).
  const movimentacoesLists: { all: Transaction[]; aPagar: Transaction[]; aReceber: Transaction[] } = useMemo(() => {
    const cardBills: Transaction[] = cards
      .map(card => computeCardBill(card, currentDate))
      .filter(bill => bill.amount > 0 && !isCardBillPaid(bill.cardId as string, currentDate));

    const monthTransactions: Transaction[] = [...transactions.filter(t => t.type !== 'card_purchase'), ...cardBills].filter(t =>
      format(getTransactionEffectiveMonth(t), 'yyyy-MM') === format(currentDate, 'yyyy-MM')
    );

    const all: Transaction[] = [...monthTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const aPagar: Transaction[] = monthTransactions
      .filter(t => t.type !== 'income' && t.status === 'planned')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const aReceber: Transaction[] = monthTransactions
      .filter(t => t.type === 'income' && t.status === 'planned')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { all, aPagar, aReceber };
  }, [transactions, cards, currentDate]);

  // Form State
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    type: 'expense',
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'planned',
    recurrence: 'none',
    category: '',
    payerPayee: 'geral',
    description: '',
    amount: 0
  });
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrenceDateMode, setRecurrenceDateMode] = useState<'fixed' | 'businessDay'>('fixed');
  const [recurrenceBusinessDay, setRecurrenceBusinessDay] = useState(5);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');
  const [newPersonImage, setNewPersonImage] = useState('');
  const [personLinkQuery, setPersonLinkQuery] = useState('');
  const [personLinkResults, setPersonLinkResults] = useState<PublicProfile[]>([]);
  const [personLinkSelected, setPersonLinkSelected] = useState<PublicProfile | null>(null);
  const [personLinkSearching, setPersonLinkSearching] = useState(false);
  const [quickAssignQuery, setQuickAssignQuery] = useState('');
  const [quickAssignSubmitting, setQuickAssignSubmitting] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [newCardClosingDay, setNewCardClosingDay] = useState('');
  const [newCardDueDay, setNewCardDueDay] = useState('');
  const [newCardColor, setNewCardColor] = useState('#8A7FF5');
  const [assignmentMode, setAssignmentMode] = useState<'single' | 'split'>('single');
  const [personSplits, setPersonSplits] = useState<{ personId: string; type: 'value' | 'parts' | 'percentage'; value: string }[]>([]);

  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const cardsCarouselRef = React.useRef<HTMLDivElement>(null);
  const CARD_CAROUSEL_ITEM_WIDTH = 296; // 280px card + 16px gap

  const handleCardsCarouselScroll = () => {
    const el = cardsCarouselRef.current;
    if (!el || cards.length === 0) return;
    const index = Math.round(el.scrollLeft / CARD_CAROUSEL_ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    const card = cards[clamped];
    if (card && card.id !== selectedCard) setSelectedCard(card.id);
  };

  // Gráfico de evolução da fatura (aba Cartões, mobile) — 6 meses do cartão
  // ativo; clicar numa barra seleciona o mês e mostra os itens logo abaixo.
  const [selectedBillDate, setSelectedBillDate] = useState<Date>(new Date());
  useEffect(() => {
    if (activeTab === 'cartoes') setSelectedBillDate(new Date());
  }, [selectedCard, activeTab]);

  const CHART_MONTHS_HISTORY = 24;
  const CHART_BAR_WIDTH = 48;

  const cardBillHistory = useMemo(() => {
    const activeCard = cards.find(c => c.id === selectedCard) || cards[0];
    if (!activeCard) return [];
    const points = Array.from({ length: CHART_MONTHS_HISTORY }).map((_, i) => {
      const monthDate = subMonths(currentDate, CHART_MONTHS_HISTORY - 1 - i);
      const bill = computeCardBill(activeCard, monthDate);
      return { monthKey: format(monthDate, 'yyyy-MM'), label: format(monthDate, 'MMM', { locale: ptBR }), amount: bill.amount };
    });
    // Só mostra a partir do primeiro mês com fatura (evita meses vazios no
    // início do intervalo); o mês atual sempre fica, mesmo com fatura zerada.
    const firstWithBill = points.findIndex(p => p.amount > 0);
    return firstWithBill === -1 ? points.slice(-1) : points.slice(firstWithBill);
  }, [cards, selectedCard, currentDate, transactions]);

  const billChartScrollRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = billChartScrollRef.current;
    if (!el || cardBillHistory.length === 0) return;
    const selectedMonthKey = format(selectedBillDate, 'yyyy-MM');
    const index = cardBillHistory.findIndex(p => p.monthKey === selectedMonthKey);
    const targetIndex = index === -1 ? cardBillHistory.length - 1 : index;
    const barCenter = targetIndex * CHART_BAR_WIDTH + CHART_BAR_WIDTH / 2;
    const target = barCenter - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [selectedCard, currentDate, selectedBillDate, cards.length, activeTab]);

  const cardBillItems = useMemo(() => {
    const activeCard = cards.find(c => c.id === selectedCard) || cards[0];
    if (!activeCard) return [];
    return transactions
      .filter(t => t.type === 'card_purchase' && t.cardId === activeCard.id && format(getTransactionEffectiveMonth(t), 'yyyy-MM') === format(selectedBillDate, 'yyyy-MM'))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cards, selectedCard, transactions, selectedBillDate]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [showSeriesEditDialog, setShowSeriesEditDialog] = useState(false);
  const [forcedSeriesMode, setForcedSeriesMode] = useState<'single' | 'future' | null>(null);

  const lastProcessedAmountRef = useRef<string>(amountInput);
  const lastProcessedPeopleCountRef = useRef<number>(personSplits.length);

  useEffect(() => {
    if (personSplits.length > 0 && globalSplitType === 'value') {
      const currentAmount = amountInput;
      const currentCount = personSplits.length;
      
      if (lastProcessedAmountRef.current !== currentAmount || lastProcessedPeopleCountRef.current !== currentCount) {
        const amount = parseCurrency(currentAmount);
        const perPerson = Math.floor(amount / currentCount);
        const remainder = amount % currentCount;
        
        setPersonSplits(prev => prev.map((s, idx) => ({
            ...s,
            value: maskCurrency(String((idx === 0 ? perPerson + remainder : perPerson) * 100))
        })));
        
        lastProcessedAmountRef.current = currentAmount;
        lastProcessedPeopleCountRef.current = currentCount;
      }
    }
  }, [amountInput, personSplits.length, globalSplitType]);

  /** Despesas atribuídas a uma pessoa (via payerPayee ou split) num mês específico — usado para cobrança. */
  const getPersonMonthlyCharges = (personId: string, month: Date) => {
    const monthStr = format(month, 'yyyy-MM');

    const relevant = transactions.filter(t => {
      if (t.type !== 'expense' && t.type !== 'card_purchase') return false;
      const isForPerson = t.payerPayee === personId || (t.assignments && t.assignments.some(a => a.personId === personId));
      if (!isForPerson) return false;
      return format(getTransactionEffectiveMonth(t), 'yyyy-MM') === monthStr;
    });

    const items = relevant
      .map(t => {
        let amount = t.amount;
        if (t.assignments && t.assignments.length > 0) {
          const assignment = t.assignments.find(a => a.personId === personId);
          if (assignment) amount = assignment.amount;
        }
        return { ...t, amount };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const pending = items.filter(t => t.status === 'planned');
    const paid = items.filter(t => t.status === 'actual');
    const pendingTotal = pending.reduce((acc, t) => acc + t.amount, 0);
    const paidTotal = paid.reduce((acc, t) => acc + t.amount, 0);

    return { items, pending, paid, pendingTotal, paidTotal, total: pendingTotal + paidTotal };
  };

  // Aba Pessoas (mobile) — mesmo padrão da aba Cartões: carrossel + gráfico
  // de evolução mensal + lista do mês selecionado.
  const [showPersonForm, setShowPersonForm] = useState(false);
  const peopleCarouselRef = React.useRef<HTMLDivElement>(null);
  const PEOPLE_CAROUSEL_ITEM_WIDTH = 296; // 280px card + 16px gap

  const handlePeopleCarouselScroll = () => {
    const el = peopleCarouselRef.current;
    if (!el || people.length === 0) return;
    const index = Math.round(el.scrollLeft / PEOPLE_CAROUSEL_ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(people.length - 1, index));
    const person = people[clamped];
    if (person && person.id !== selectedPersonId) setSelectedPersonId(person.id);
  };

  const [selectedChargeDate, setSelectedChargeDate] = useState<Date>(new Date());
  useEffect(() => {
    if (activeTab === 'pessoas') setSelectedChargeDate(new Date());
  }, [selectedPersonId, activeTab]);

  const personChargeHistory = useMemo(() => {
    const activePerson = people.find(p => p.id === selectedPersonId) || people[0];
    if (!activePerson) return [];
    const points = Array.from({ length: CHART_MONTHS_HISTORY }).map((_, i) => {
      const monthDate = subMonths(currentDate, CHART_MONTHS_HISTORY - 1 - i);
      const charges = getPersonMonthlyCharges(activePerson.id, monthDate);
      return { monthKey: format(monthDate, 'yyyy-MM'), label: format(monthDate, 'MMM', { locale: ptBR }), amount: charges.total };
    });
    const firstWithCharge = points.findIndex(p => p.amount > 0);
    return firstWithCharge === -1 ? points.slice(-1) : points.slice(firstWithCharge);
  }, [people, selectedPersonId, currentDate, transactions]);

  const personChargeScrollRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = personChargeScrollRef.current;
    if (!el || personChargeHistory.length === 0) return;
    const selectedMonthKey = format(selectedChargeDate, 'yyyy-MM');
    const index = personChargeHistory.findIndex(p => p.monthKey === selectedMonthKey);
    const targetIndex = index === -1 ? personChargeHistory.length - 1 : index;
    const barCenter = targetIndex * CHART_BAR_WIDTH + CHART_BAR_WIDTH / 2;
    const target = barCenter - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [selectedPersonId, currentDate, selectedChargeDate, people.length, activeTab]);

  const togglePersonSplit = (personId: string) => {
    let newSplits = [...personSplits];
    const isSelected = newSplits.some(s => s.personId === personId);
    if (isSelected) {
      newSplits = newSplits.filter(s => s.personId !== personId);
    } else {
      newSplits.push({ personId, type: globalSplitType, value: globalSplitType === 'parts' ? '1' : '0,00' });
    }
    if (globalSplitType === 'percentage' && newSplits.length > 0) {
      const perPerson = Math.floor(100 / newSplits.length);
      const remainder = 100 % newSplits.length;
      newSplits = newSplits.map((s, idx) => ({ ...s, value: (idx === 0 ? perPerson + remainder : perPerson).toString() }));
    }
    setPersonSplits(newSplits);
    if (newSplits.length === 0) setNewTransaction(prev => ({ ...prev, payerPayee: 'geral' }));
    else if (newSplits.length === 1) setNewTransaction(prev => ({ ...prev, payerPayee: newSplits[0].personId }));
    else setNewTransaction(prev => ({ ...prev, payerPayee: 'multi', category: 'Emprestado' }));
  };

  /** Atribui alguém a um lançamento buscando por @usuário; se a pessoa ainda não existir, cadastra na hora. */
  const handleQuickAssignPerson = async () => {
    const raw = quickAssignQuery.trim();
    if (!raw || !user || quickAssignSubmitting) return;
    setQuickAssignSubmitting(true);
    try {
      const looksLikeUsername = /^@?[a-zA-Z0-9_.]+$/.test(raw) && !raw.includes(' ');
      if (looksLikeUsername) {
        const cleaned = raw.replace(/^@+/, '');
        const matches = await api.searchProfilesByUsername(cleaned, user.id);
        const profile = matches.find(m => m.username?.toLowerCase() === cleaned.toLowerCase()) || matches[0];
        if (profile) {
          let existing = people.find(p => p.linkedUserId === profile.id);
          if (!existing) {
            await api.createPerson(user.id, {
              name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.nickname || profile.username || cleaned,
              linkedUserId: profile.id,
              visible: true
            });
            const refreshed = await api.fetchPeople(user.id);
            existing = refreshed.find(p => p.linkedUserId === profile.id);
            if (existing) setPeople(refreshed);
          }
          if (existing) {
            togglePersonSplit(existing.id);
            setQuickAssignQuery('');
            setQuickAssignSubmitting(false);
            return;
          }
        }
      }

      // Não é um @usuário conhecido: cadastra como uma pessoa nova (só com o nome)
      const name = raw.replace(/^@+/, '');
      await api.createPerson(user.id, { name, visible: true });
      const refreshed = await api.fetchPeople(user.id);
      setPeople(refreshed);
      const created = [...refreshed].reverse().find(p => p.name === name);
      if (created) togglePersonSplit(created.id);
      setQuickAssignQuery('');
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'people');
    } finally {
      setQuickAssignSubmitting(false);
    }
  };

  const getAssignmentsFromSplits = (total: number, splits: { personId: string; type: 'value' | 'parts' | 'percentage'; value: string }[]) => {
    const fixedSplits = splits.filter(s => s.type === 'value');
    const percentSplits = splits.filter(s => s.type === 'percentage');
    const partSplits = splits.filter(s => s.type === 'parts');
    
    const fixedTotal = fixedSplits.reduce((acc, s) => acc + parseCurrency(s.value), 0);
    const percentTotal = percentSplits.reduce((acc, s) => acc + (total * (Number(s.value.replace(',', '.')) || 0) / 100), 0);
    
    const remaining = total - fixedTotal - percentTotal;
    const totalParts = partSplits.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
    
    const partValue = totalParts > 0 ? Math.max(0, remaining / totalParts) : 0;

    const rounded = splits.map(s => {
      let amount = 0;
      if (s.type === 'value') {
        amount = parseCurrency(s.value);
      } else if (s.type === 'percentage') {
        amount = total * (Number(s.value.replace(',', '.')) || 0) / 100;
      } else {
        amount = (Number(s.value) || 0) * partValue;
      }
      return { personId: s.personId, cents: Math.round(amount * 100) };
    });

    // Adjust the last split so the sum matches the total exactly (avoids rounding drift)
    const totalCents = Math.round(total * 100);
    const sumCents = rounded.reduce((acc, r) => acc + r.cents, 0);
    if (rounded.length > 0 && sumCents !== totalCents) {
      rounded[rounded.length - 1].cents += totalCents - sumCents;
    }

    return rounded.map(r => ({ personId: r.personId, amount: r.cents / 100 }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPersonImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Calculations
  const stats = useMemo(() => {
    const targetMonthStr = format(currentDate, 'yyyy-MM');

    const monthTransactions = transactions.filter(t => {
      const effectiveMonth = getTransactionEffectiveMonth(t);
      return format(effectiveMonth, 'yyyy-MM') === targetMonthStr;
    });

    const incomePlanned = monthTransactions
      .filter(t => t.type === 'income' && t.status === 'planned')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const incomeActual = monthTransactions
      .filter(t => t.type === 'income' && t.status === 'actual')
      .reduce((acc, t) => acc + t.amount, 0);

    const expensesPlanned = monthTransactions
      .filter(t => (t.type === 'expense' || t.type === 'card_purchase') && t.status === 'planned')
      .reduce((acc, t) => acc + t.amount, 0);

    const expensesActual = monthTransactions
      .filter(t => (t.type === 'expense' || t.type === 'card_purchase') && t.status === 'actual')
      .reduce((acc, t) => acc + t.amount, 0);

    const incomeTotal = incomeActual + incomePlanned;
    const expenseTotal = expensesActual + expensesPlanned;

    const cardTotals = cards.map(card => ({
      ...card,
      total: transactions
        .filter(t => t.type === 'card_purchase' && t.cardId === card.id)
        .reduce((acc, t) => acc + t.amount, 0)
    }));

    return {
      incomePlanned,
      incomeActual,
      incomeTotal,
      expensesPlanned,
      expensesActual,
      expenseTotal,
      balance: incomeActual - expensesActual,
      cardTotals
    };
  }, [transactions, cards, currentDate]);

  const chartData = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const currentMonthTransactions = transactions.filter(t => 
      isWithinInterval(parseISO(t.date), { start, end })
    );

    const categories = Array.from(new Set(currentMonthTransactions.map(t => t.category)));
    return categories.map(cat => ({
      name: cat,
      value: currentMonthTransactions
        .filter(t => t.category === cat && (t.type === 'expense' || t.type === 'card_purchase'))
        .reduce((acc, t) => acc + t.amount, 0)
    })).filter(d => d.value > 0);
  }, [transactions, currentDate]);

  const evolutionData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(currentDate, i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const monthTransactions = transactions.filter(t => 
        isWithinInterval(parseISO(t.date), { start, end })
      );
      
      const income = monthTransactions.filter(t => t.type === 'income' && t.status === 'actual').reduce((acc, t) => acc + t.amount, 0);
      const expense = monthTransactions.filter(t => (t.type === 'expense' || t.type === 'card_purchase') && t.status === 'actual').reduce((acc, t) => acc + t.amount, 0);
      
      data.push({
        name: format(date, 'MMM', { locale: ptBR }),
        receitas: income,
        despesas: expense
      });
    }
    return data;
  }, [transactions, currentDate]);

  const COLORS = ['#8A7FF5', '#37D6A3', '#FF6F61', '#FDB8D7', '#6FA8FF', '#FFC168'];

  const handleAddTransaction = async (overrideUpdateMode?: 'single' | 'future') => {
    if (!user || isSubmitting) return;
    const userId = user.id;
    const amount = parseCurrency(amountInput);
    if (!newTransaction.description) {
      showAlert("Descrição necessária", "Por favor, informe a descrição do lançamento.");
      return;
    }
    if (!amount) {
      showAlert("Valor necessário", "Por favor, informe o valor do lançamento.");
      return;
    }

    setIsSubmitting(true);
    try {
      const assignments = personSplits.length > 0 ? getAssignmentsFromSplits(amount, personSplits) : [];

      const baseData = {
        description: newTransaction.description as string,
        amount: amount,
        category: newTransaction.category as string,
        status: newTransaction.status as 'planned' | 'actual',
        cardId: newTransaction.cardId || null,
        payerPayee: personSplits.length > 1 ? 'multi' : (newTransaction.payerPayee || ''),
        assignments: assignments,
        // Ensure type is correct based on cardId presence if it was confused
        type: (newTransaction.type === 'expense' && newTransaction.cardId) ? 'card_purchase' : (newTransaction.type as TransactionType),
        date: newTransaction.date as string,
        recurrence: (isRecurrent ? 'monthly' : 'none') as RecurrenceType,
        recurrenceEndDate: isRecurrent ? (newTransaction.recurrenceEndDate ?? null) : null,
        installments: isInstallment ? {
          total: installmentCount,
          current: editingTransaction?.installments?.current || 1
        } : null,
        // Coluna NOT NULL no banco — precisa ir explícito em todo insert.
        linkedToCard: false
      };

      if (editingTransaction) {
        const isActuallySeries = !!(editingTransaction.seriesId) ||
                                 (editingTransaction.recurrence && editingTransaction.recurrence !== 'none') ||
                                 (editingTransaction.installments && editingTransaction.installments.total > 1);

        if (!overrideUpdateMode && !forcedSeriesMode && isActuallySeries) {
          setIsRegistrarOpen(false); // Close registrar to show sequence edit dialog
          setShowSeriesEditDialog(true);
          setIsSubmitting(false); // <--- Resetting isSubmitting so the dialog call can proceed
          return;
        }

        const mode = overrideUpdateMode || forcedSeriesMode || 'single';

        // Handle series ID for legacy transactions being upgraded to series
        let seriesIdToUse = editingTransaction.seriesId || null;
        if (!seriesIdToUse && isActuallySeries && mode === 'future') {
          seriesIdToUse = api.newTransactionId();
        }

        const finalBaseData = {
          ...baseData,
          seriesId: seriesIdToUse
        };

        if (mode === 'future' && isActuallySeries) {
          try {
            // Find siblings (same series, or legacy fallback by description+amount)
            const siblings = editingTransaction.seriesId
              ? await api.fetchSeriesSiblings(userId, editingTransaction.seriesId)
              : (await api.fetchByDescriptionAndAmount(userId, editingTransaction.description, editingTransaction.amount))
                  .filter(tx => tx.recurrence !== 'none' || !!tx.installments);

            const originalDate = parseISO(editingTransaction.date);
            const newDate = parseISO(finalBaseData.date);
            const daysOffset = differenceInCalendarDays(newDate, originalDate);

            const rowsToUpsert: Array<Partial<Transaction>> = [
              { id: editingTransaction.id, ...finalBaseData }
            ];

            // Update future "main" siblings (same type as the edited transaction)
            const futureMainSiblings = siblings.filter(s =>
              s.id !== editingTransaction.id && s.type === editingTransaction.type && s.date >= editingTransaction.date
            );
            futureMainSiblings.forEach(s => {
              const siblingNewDate = daysOffset !== 0 ? format(addDays(parseISO(s.date), daysOffset), 'yyyy-MM-dd') : s.date;
              rowsToUpsert.push({
                id: s.id,
                ...finalBaseData,
                date: siblingNewDate,
                installments: s.installments ? { total: finalBaseData.installments?.total || s.installments.total, current: s.installments.current } : finalBaseData.installments
              });
            });

            // Sync linked income entries: only amount/description/date per matched person, not the whole payload
            const futureLinkedIncome = siblings.filter(s =>
              s.linkedToCard && s.date >= editingTransaction.date
            );
            futureLinkedIncome.forEach(s => {
              const match = assignments.find(a => a.personId === s.payerPayee);
              if (match) {
                const linkedNewDate = daysOffset !== 0 ? format(addDays(parseISO(s.date), daysOffset), 'yyyy-MM-dd') : s.date;
                rowsToUpsert.push({
                  id: s.id,
                  amount: match.amount,
                  description: finalBaseData.description,
                  date: linkedNewDate
                });
              }
            });

            // Atualiza cada linha individualmente (update, não upsert): a RPC
            // upsert_transactions exige todas as colunas NOT NULL mesmo em
            // linhas já existentes, o que quebra as sincronizações parciais
            // (ex: renda vinculada, que só manda amount/description/date).
            await Promise.all(rowsToUpsert.map(row => {
              const { id, ...data } = row;
              return api.updateTransaction(id as string, data);
            }));
            showAlert('Sucesso', 'Sequência atualizada com sucesso.');
          } catch (err) {
            handleSupabaseError(err, OperationType.WRITE, 'transactions-series');
          }
        } else {
          await api.updateTransaction(editingTransaction.id, finalBaseData);

          // Sync linked transactions (per-person amount, not the whole payload)
          const linked = await api.fetchLinkedTransactions(userId, editingTransaction.id);
          if (linked.length > 0) {
            const rows = linked
              .map(l => {
                const match = assignments.find(a => a.personId === l.payerPayee);
                return match ? { id: l.id, amount: match.amount, description: finalBaseData.description, date: finalBaseData.date } : null;
              })
              .filter((r): r is { id: string; amount: number; description: string; date: string } => r !== null);
            if (rows.length > 0) {
              await Promise.all(rows.map(row => api.updateTransaction(row.id, { amount: row.amount, description: row.description, date: row.date })));
            }
          }
        }
        setEditingTransaction(null);
        setShowSeriesEditDialog(false);
        setForcedSeriesMode(null);
      } else {
        // Create new
        const generatedSeriesId = (isRecurrent || (isInstallment && installmentCount > 1)) ? api.newTransactionId() : null;
        const rows: Array<Transaction & { userId: string }> = [];

        // Use the synced linkedIncomeDate which matches newTransaction.date by default
        let startingLinkedRunner = parseISO(linkedIncomeDate);
        const shouldLinkIncome = (baseData.type === 'card_purchase' || baseData.type === 'expense') &&
          baseData.payerPayee && baseData.payerPayee !== 'geral' && createLinkedIncome;
        const incomeAssignments = assignments.length > 0 ? assignments : [{ personId: baseData.payerPayee, amount }];

        if (isRecurrent && newTransaction.recurrenceEndDate) {
          const startDate = parseISO(newTransaction.date as string);
          let runner = startDate;
          let linkedRunner = startingLinkedRunner;

          while (format(runner, 'yyyy-MM') <= newTransaction.recurrenceEndDate) {
            const mainId = api.newTransactionId();
            const effectiveDate = recurrenceDateMode === 'businessDay'
              ? getNthBusinessDay(runner.getFullYear(), runner.getMonth(), recurrenceBusinessDay)
              : runner;
            rows.push({
              ...baseData,
              id: mainId,
              userId,
              date: format(effectiveDate, 'yyyy-MM-dd'),
              recurrence: 'monthly',
              recurrenceEndDate: newTransaction.recurrenceEndDate,
              installments: null,
              seriesId: generatedSeriesId
            } as Transaction & { userId: string });

            if (shouldLinkIncome) {
              for (const incomeAssignment of incomeAssignments) {
                rows.push({
                  id: api.newTransactionId(),
                  userId,
                  type: 'income',
                  description: baseData.description,
                  amount: incomeAssignment.amount,
                  date: format(linkedRunner, 'yyyy-MM-dd'),
                  category: 'Associado',
                  status: 'planned',
                  payerPayee: incomeAssignment.personId,
                  recurrence: 'monthly',
                  recurrenceEndDate: format(addMonths(linkedRunner, differenceInMonths(parseISO(newTransaction.recurrenceEndDate + "-01"), parseISO(format(startingLinkedRunner, 'yyyy-MM') + "-01"))), 'yyyy-MM'),
                  installments: null,
                  seriesId: generatedSeriesId,
                  cardId: baseData.cardId,
                  linkedToCard: true,
                  linkedTransactionId: mainId,
                  assignments: []
                } as Transaction & { userId: string });
              }
            }

            runner = addMonths(runner, 1);
            linkedRunner = addMonths(linkedRunner, 1);
            if (isAfter(runner, addMonths(parseISO(newTransaction.recurrenceEndDate + "-28"), 12))) break;
          }
        } else if (isInstallment && installmentCount > 1) {
          let runner = parseISO(newTransaction.date as string);
          let linkedRunner = startingLinkedRunner;

          for (let i = 1; i <= installmentCount; i++) {
            const mainId = api.newTransactionId();
            rows.push({
              ...baseData,
              id: mainId,
              userId,
              date: format(runner, 'yyyy-MM-dd'),
              recurrence: 'none',
              installments: { total: installmentCount, current: i },
              seriesId: generatedSeriesId
            } as Transaction & { userId: string });

            if (shouldLinkIncome) {
              for (const incomeAssignment of incomeAssignments) {
                rows.push({
                  id: api.newTransactionId(),
                  userId,
                  type: 'income',
                  description: baseData.description,
                  amount: incomeAssignment.amount,
                  date: format(linkedRunner, 'yyyy-MM-dd'),
                  category: 'Associado',
                  status: 'planned',
                  payerPayee: incomeAssignment.personId,
                  recurrence: 'none',
                  installments: { total: installmentCount, current: i },
                  seriesId: generatedSeriesId,
                  cardId: baseData.cardId,
                  linkedToCard: true,
                  linkedTransactionId: mainId,
                  assignments: []
                } as Transaction & { userId: string });
              }
            }

            runner = addMonths(runner, 1);
            linkedRunner = addMonths(linkedRunner, 1);
          }
        } else if (shouldLinkIncome) {
          const mainId = api.newTransactionId();
          rows.push({
            ...baseData,
            id: mainId,
            userId,
            date: newTransaction.date as string,
            recurrence: 'none',
            installments: null,
            seriesId: generatedSeriesId
          } as Transaction & { userId: string });

          for (const incomeAssignment of incomeAssignments) {
            rows.push({
              id: api.newTransactionId(),
              userId,
              type: 'income',
              description: baseData.description,
              amount: incomeAssignment.amount,
              date: format(startingLinkedRunner, 'yyyy-MM-dd'),
              category: 'Associado',
              status: 'planned',
              payerPayee: incomeAssignment.personId,
              recurrence: 'none',
              installments: null,
              seriesId: generatedSeriesId,
              cardId: baseData.cardId,
              linkedToCard: true,
              linkedTransactionId: mainId,
              assignments: []
            } as Transaction & { userId: string });
          }
        } else {
          rows.push({
            ...baseData,
            id: api.newTransactionId(),
            userId,
            date: newTransaction.date as string,
            recurrence: isRecurrent ? 'monthly' : 'none',
            installments: isInstallment ? { total: installmentCount, current: 1 } : null,
            seriesId: generatedSeriesId
          } as Transaction & { userId: string });
        }

        await api.insertTransactions(rows);
      }

      await loadTransactions();
      setIsRegistrarOpen(false);
      setCreateLinkedIncome(true);
      setNewTransaction({
        type: 'expense',
        date: format(new Date(), 'yyyy-MM-dd'),
        status: 'planned',
        recurrence: 'none',
        category: '',
        payerPayee: 'geral'
      });
      setAmountInput('0,00');
      setIsInstallment(false);
      setInstallmentCount(2);
      setIsRecurrent(false);
      setRecurrenceDateMode('fixed');
      setRecurrenceBusinessDay(5);
      setPersonSplits([]);
    } catch (err) {
      console.error('Erro ao salvar lançamento:', err);
      showAlert('Não foi possível salvar', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const profileImageInputRef = React.useRef<HTMLInputElement>(null);
  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await api.saveProfile(user.id, { photoURL: reader.result as string });
        await loadProfile();
      } catch (err) {
        handleSupabaseError(err, OperationType.WRITE, 'profiles');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNickname = async () => {
    if (!tempNickname.trim() || !user) return;
    try {
      await api.saveProfile(user.id, {
        nickname: tempNickname.trim(),
        email: user.email ?? ''
      });
      await loadProfile();
      setIsNicknameModalOpen(false);
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'profiles');
    }
  };

  const handleOpenAccountEdit = () => {
    setEditFirstName(userProfile?.firstName || '');
    setEditLastName(userProfile?.lastName || '');
    setEditUsername(userProfile?.username || '');
    setEditNickname(userProfile?.nickname || '');
    setEditNewPassword('');
    setEditConfirmPassword('');
    setEditError('');
    setIsProfileOpen(false);
    setIsAccountEditOpen(true);
  };

  const handleUpdateAccountInfo = async () => {
    if (!user) return;
    if (!editFirstName.trim() || !editLastName.trim() || !editUsername.trim()) {
      setEditError('Preencha nome, sobrenome e usuário.');
      return;
    }
    if (editNewPassword && editNewPassword !== editConfirmPassword) {
      setEditError('As senhas não coincidem.');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      await api.saveProfile(user.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        username: editUsername.trim(),
        nickname: editNickname.trim() || `${editFirstName.trim()} ${editLastName.trim()}`
      });
      if (editNewPassword) {
        const { error } = await supabase.auth.updateUser({ password: editNewPassword });
        if (error) {
          setEditError(translateAuthError(error.message));
          setEditSubmitting(false);
          return;
        }
      }
      setEditNewPassword('');
      setEditConfirmPassword('');
      await loadProfile();
      showAlert('Sucesso', 'Suas informações foram atualizadas.');
      setIsAccountEditOpen(false);
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'profiles');
      setEditError('Não foi possível salvar. Tente novamente.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleEditClick = (t: Transaction) => {
    setEditingTransaction(t);
    setNewTransaction(t);
    setAmountInput(t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setIsInstallment(!!t.installments);
    setInstallmentCount(t.installments?.total || 1);
    setIsRecurrent(t.recurrence !== 'none');
    
    // Ensure we have a default end date if none exists
    if (t.recurrence !== 'none' && !t.recurrenceEndDate) {
      setNewTransaction({
        ...t,
        recurrenceEndDate: format(addMonths(new Date(), 12), 'yyyy-MM')
      });
    } else {
      setNewTransaction(t);
    }
    setLinkedIncomeDate(t.date || format(new Date(), 'yyyy-MM-dd'));
    if (t.assignments && t.assignments.length > 0) {
      setAssignmentMode('split');
      setShowPersonSelector(true);
      setPersonSplits(t.assignments.map(a => ({ 
        personId: a.personId, 
        type: 'value', 
        value: a.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      })));
    } else {
      setAssignmentMode('single');
      setPersonSplits([]);
      setShowPersonSelector(t.payerPayee !== 'geral');
    }

    setIsRegistrarOpen(true);
    setConfirmingTransaction(null); // Close confirmation modal if open
  };

  const handleTransactionClick = (t: Transaction) => {
    setForcedSeriesMode(null);
    if (t.id.startsWith('bill-')) {
      setSelectedCard(t.cardId ?? null);
      setActiveTab('cartoes');
      return;
    }
    if (t.status === 'planned') {
      setConfirmingTransaction(t);
      setConfirmAmount(t.amount);
      setConfirmDate(format(new Date(), 'yyyy-MM-dd'));
    } else {
      handleEditClick(t);
    }
  };

  const handleOpenRegistrar = (typeOverride?: TransactionType) => {
    setEditingTransaction(null);
    setAssignmentMode('single');
    setPersonSplits([]);
    setShowPersonSelector(false);
    setForcedSeriesMode(null);
    setLinkedIncomeDate(format(new Date(), 'yyyy-MM-dd'));
    setRecurrenceDateMode('fixed');
    setRecurrenceBusinessDay(5);
    let initialType: TransactionType = 'expense';
    if (activeTab === 'receitas') initialType = 'income';
    if (activeTab === 'cartoes') initialType = 'card_purchase';
    if (typeOverride) initialType = typeOverride;
    
    setNewTransaction({
      type: initialType,
      date: format(new Date(), 'yyyy-MM-dd'),
      status: 'planned',
      recurrence: 'none',
      recurrenceEndDate: format(addMonths(new Date(), 12), 'yyyy-MM'),
      category: '',
      payerPayee: 'geral',
      description: '',
      amount: 0
    });
    setAmountInput('0,00');
    setIsRegistrarOpen(true);
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const handleAddPerson = async () => {
    if (!newPersonName.trim() || !user) return;
    try {
      const personData = {
        name: newPersonName.trim(),
        email: newPersonEmail.trim() || undefined,
        phone: newPersonPhone.trim() || undefined,
        image: newPersonImage || `https://picsum.photos/seed/${newPersonName}/100/100`,
        linkedUserId: personLinkSelected?.id || null
      };
      if (editingPerson) {
        await api.updatePerson(editingPerson.id, personData);
        setEditingPerson(null);
      } else {
        await api.createPerson(user.id, { ...personData, visible: true });
      }
      await loadPeople();
      setNewPersonName('');
      setNewPersonEmail('');
      setNewPersonPhone('');
      setNewPersonImage('');
      setPersonLinkQuery('');
      setPersonLinkResults([]);
      setPersonLinkSelected(null);
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'people');
    }
  };

  const handleEditPersonClick = (p: Person) => {
    setEditingPerson(p);
    setNewPersonName(p.name);
    setNewPersonEmail(p.email || '');
    setNewPersonPhone(p.phone || '');
    setNewPersonImage(p.image || '');
    if (p.linkedUserId) {
      api.fetchPublicProfile(p.linkedUserId).then(profile => {
        if (profile) setPersonLinkSelected(profile);
      });
    } else {
      setPersonLinkSelected(null);
    }
  };

  const handleCancelEditPerson = () => {
    setEditingPerson(null);
    setNewPersonName('');
    setNewPersonEmail('');
    setNewPersonPhone('');
    setNewPersonImage('');
    setPersonLinkQuery('');
    setPersonLinkResults([]);
    setPersonLinkSelected(null);
  };

  useEffect(() => {
    if (personLinkSelected || !personLinkQuery.trim()) {
      setPersonLinkResults([]);
      return;
    }
    let cancelled = false;
    setPersonLinkSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchProfilesByUsername(personLinkQuery, user?.id);
        if (!cancelled) setPersonLinkResults(results);
      } catch (err) {
        handleSupabaseError(err, OperationType.LIST, 'profiles');
      } finally {
        if (!cancelled) setPersonLinkSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [personLinkQuery, personLinkSelected, user?.id]);

  const handleTogglePersonVisibility = async (p: Person) => {
    try {
      await api.updatePerson(p.id, { visible: p.visible === false ? true : false });
      await loadPeople();
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, 'people');
      showAlert('Erro', 'Não foi possível atualizar a visibilidade dessa pessoa.');
    }
  };

  const handleDeletePerson = async (id: string) => {
    try {
      await api.deletePerson(id);
      await loadPeople();
      setPersonToDelete(null);
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'people');
      showAlert('Erro', 'Não foi possível excluir essa pessoa.');
    }
  };

  const handleDeleteCard = async (id: string) => {
    try {
      await api.deleteCard(id);
      await loadCards();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'cards');
      showAlert('Erro', 'Não foi possível excluir esse cartão.');
    }
  };

  const [limitInput, setLimitInput] = useState('0,00');

  const handleAddCard = async () => {
    if (isSubmittingCard) return;
    const limitValue = parseCurrency(limitInput);
    if (!newCardName.trim() || !limitValue || !user) return;
    setIsSubmittingCard(true);
    try {
      const cardData = {
        name: newCardName.trim(),
        limit: limitValue,
        closingDay: Number(newCardClosingDay) || 1,
        dueDay: Number(newCardDueDay) || 10,
        color: newCardColor
      };

      if (editingCard) {
        await api.updateCard(editingCard.id, cardData);
        setEditingCard(null);
      } else {
        await api.createCard(user.id, cardData);
      }
      await loadCards();
      setShowCardForm(false);

      setNewCardName('');
      setLimitInput('0,00');
      setNewCardClosingDay('');
      setNewCardDueDay('');
      setNewCardColor('#8A7FF5');
    } catch (err) {
      handleSupabaseError(err, OperationType.WRITE, 'cards');
    } finally {
      setIsSubmittingCard(false);
    }
  };

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#8A7FF5');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showAlert("Nome necessário", "Por favor, informe o nome da categoria.");
      return;
    }
    if (!newCategoryIcon.trim()) {
      showAlert("Emoji necessário", "Por favor, escolha um emoji para a categoria.");
      return;
    }
    if (!user) return;
    try {
      const catData = {
        name: newCategoryName.trim(),
        color: newCategoryColor,
        icon: newCategoryIcon.trim()
      };

      if (editingCategory) {
        await api.updateCategory(editingCategory.id, catData);
        setEditingCategory(null);
      } else {
        await api.createCategory(user.id, catData);
      }
      await loadCategories();
      setNewCategoryName('');
      setNewCategoryColor('#8A7FF5');
      setNewCategoryIcon('');
    } catch (err) {
      handleSupabaseError(err, editingCategory ? OperationType.UPDATE : OperationType.CREATE, 'categories');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!user) return;
    try {
      await api.deleteCategory(id);
      await loadCategories();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'categories');
    }
  };

  const handleConfirmTransaction = async (id: string, actualAmount: number, actualDate: string, referenceDate?: string) => {
    if (!user) return;
    try {
      if (id.startsWith('bill-')) {
        const cardId = id.replace('bill-', '');
        const card = cards.find(c => c.id === cardId);
        await api.insertTransactions([{
          id: api.newTransactionId(),
          userId: user.id,
          description: `Pagamento Fatura ${card?.name || ''}`,
          amount: actualAmount,
          date: referenceDate || actualDate, // mês de referência da fatura (bate com getTransactionEffectiveMonth)
          actualDate: actualDate, // dia em que o pagamento realmente aconteceu
          type: 'expense',
          status: 'actual',
          category: 'Fatura Cartão',
          cardId: card?.id ?? null, // permite checar se a fatura do mês já foi paga
          payerPayee: 'geral',
          recurrence: 'none',
          assignments: [],
          linkedToCard: false
        } as Transaction & { userId: string }]);
      } else {
        await api.updateTransaction(id, {
          status: 'actual',
          amount: actualAmount,
          actualDate: actualDate
        });
      }
      await loadTransactions();
      setConfirmingTransaction(null);
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, 'transactions');
      showAlert('Erro ao confirmar', 'Não foi possível salvar a confirmação. Tente novamente.');
    }
  };

  /** Marca um lançamento planejado como pago/recebido com um clique, sem abrir o modal de confirmação. */
  const handleQuickConfirm = (t: Transaction) => {
    handleConfirmTransaction(t.id, t.amount, format(new Date(), 'yyyy-MM-dd'), t.date);
  };

  const handleDeleteTransaction = async (id: string, deleteAllFuture = false) => {
    if (!user) return;
    try {
      // Find the transaction to see if it has linked entries
      const t = transactions.find(tx => tx.id === id);

      // If it's a virtual bill- transaction, we might handle it differently but for now we just return
      // (The UI should hide the delete button for virtual bills)
      if (!t && id.startsWith('bill-')) return;
      if (!t) return;

      const isSeries = t.seriesId || t.recurrence !== 'none' || t.installments;

      if (deleteAllFuture && isSeries) {
        let txsToDelete: Transaction[] = [];
        if (!t.seriesId) {
          // Fallback delete for legacy without seriesId
          txsToDelete = transactions.filter(tx =>
            tx.description === t.description &&
            tx.amount === t.amount &&
            tx.date >= t.date &&
            (tx.recurrence !== 'none' || tx.installments)
          );
        } else {
          txsToDelete = (await api.fetchSeriesSiblings(user.id, t.seriesId)).filter(tx => tx.date >= t.date);
        }

        const idsToDelete = txsToDelete.map(tx => tx.id);

        // Also handle linked transactions for EACH item in the series if requested
        if (deleteLinked) {
          for (const tx of txsToDelete) {
            const linked = await api.fetchLinkedTransactions(user.id, tx.id);
            idsToDelete.push(...linked.map(l => l.id));
          }
        }

        await api.deleteTransactions(idsToDelete);
        showAlert('Sucesso', 'Lançamentos apagados com sucesso.');
      } else {
        const idsToDelete = [id];

        // Handle linked transactions for single delete
        if (deleteLinked) {
          const linked = await api.fetchLinkedTransactions(user.id, id);
          idsToDelete.push(...linked.map(l => l.id));
        }

        await api.deleteTransactions(idsToDelete);
        showAlert('Sucesso', 'Lançamento apagado com sucesso.');
      }

      await loadTransactions();
      setIsDeleteDialogOpen(false);
      setTransactionToDelete(null);
      setEditingTransaction(null);
      setConfirmingTransaction(null);
      setIsRegistrarOpen(false);
      setDeleteLinked(false);
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'transactions');
    }
  };

  const handleDeleteAllTransactions = async () => {
    if (!user) return;
    try {
      await api.deleteAllUserData(user.id);
      await Promise.all([loadTransactions(), loadCards(), loadCategories(), loadPeople()]);
      showAlert('Sucesso', 'Todos os seus dados foram apagados.');
      setIsDeleteAllConfirmOpen(false);
      setIsProfileOpen(false);
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'transactions');
    }
  };

  const [confirmingTransaction, setConfirmingTransaction] = useState<Transaction | null>(null);
  const [confirmAmount, setConfirmAmount] = useState<number>(0);
  const [confirmDate, setConfirmDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full mb-6"
        ></motion.div>
        <h2 className="text-2xl font-heading font-medium tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Carregando seu financeiro...</h2>
        <p className="text-slate-500 dark:text-[#A8A4CC] font-normal mt-2">Estamos preparando tudo para você.</p>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full text-left">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white mx-auto mb-5">
              <KeyRound size={28} strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">
              Defina sua nova senha
            </h1>
            <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] mt-2">Escolha uma nova senha para entrar no Financeiro.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500 dark:text-[#A8A4CC] ml-4">Nova senha</Label>
              <div className="relative">
                <Input
                  type={showRecoveryPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm pl-6 pr-14"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryPassword(v => !v)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] hover:text-primary transition-colors"
                >
                  {showRecoveryPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500 dark:text-[#A8A4CC] ml-4">Confirmar nova senha</Label>
              <Input
                type={showRecoveryPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6"
                value={recoveryConfirmPassword}
                onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRecoveryPasswordSubmit()}
              />
            </div>

            {recoveryError && (
              <p className="text-xs font-normal text-rose-500 bg-rose-50 rounded-2xl px-5 py-3">{recoveryError}</p>
            )}

            <button
              onClick={handleRecoveryPasswordSubmit}
              disabled={recoverySubmitting}
              className="w-full h-14 rounded-full bg-primary text-white hover:bg-primary/90 font-medium text-base disabled:opacity-50 transition-all active:scale-95"
            >
              Salvar nova senha
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    const pillInput = "h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6 placeholder:text-slate-400 dark:placeholder:text-[#6B679C]";
    const fieldLabel = "text-[11px] font-medium text-slate-500 dark:text-[#A8A4CC] ml-1";

    return (
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center text-white shadow-bubbly rotate-3 shrink-0">
              <Wallet size={20} strokeWidth={2.5} />
            </div>
            <span className="text-lg font-heading font-medium text-slate-800 dark:text-[#EDE9E3] tracking-tight">Financeiro</span>
          </div>

          {showForgotPassword ? (
            forgotSent ? (
              <div className="space-y-6">
                <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                  <Mail size={26} strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] mb-2">Link enviado!</h1>
                  <p className="text-sm font-normal text-slate-500 dark:text-[#A8A4CC]">Verifique seu e-mail ({forgotEmail}) e clique no link para definir uma nova senha.</p>
                </div>
                <button
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Voltar para o login
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setForgotError(''); }}
                  className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5] mb-8"
                >
                  <ChevronLeft size={20} />
                </button>
                <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] mb-2">Recuperar senha</h1>
                <p className="text-sm font-normal text-slate-500 dark:text-[#A8A4CC] mb-8">Informe seu e-mail e enviaremos um link para redefinir a senha.</p>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className={fieldLabel}>E-mail</Label>
                    <Input
                      type="email"
                      placeholder="voce@email.com"
                      className={pillInput}
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleForgotPasswordSubmit()}
                    />
                  </div>
                  {forgotError && (
                    <p className="text-xs font-normal text-rose-500 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-2xl px-5 py-3">{forgotError}</p>
                  )}
                  <Button
                    onClick={handleForgotPasswordSubmit}
                    disabled={forgotSubmitting}
                    className="w-full h-14 rounded-full bg-primary text-white hover:bg-primary/90 font-medium text-base disabled:opacity-50"
                  >
                    Enviar link de recuperação
                  </Button>
                </div>
              </>
            )
          ) : (
            <>
              <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] mb-5">
                {authMode === 'signin' ? 'Entrar' : 'Criar conta'}
              </h1>
              <div className="flex items-center gap-6 mb-8 border-b border-slate-200/70 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => { setAuthMode('signin'); setAuthError(''); setAuthInfo(''); }}
                  className={cn("text-sm pb-3 -mb-px border-b-2 transition-colors", authMode === 'signin' ? "font-medium text-slate-800 dark:text-[#EDE9E3] border-primary" : "text-slate-400 dark:text-[#8D89AC] border-transparent")}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthInfo(''); }}
                  className={cn("text-sm pb-3 -mb-px border-b-2 transition-colors", authMode === 'signup' ? "font-medium text-slate-800 dark:text-[#EDE9E3] border-primary" : "text-slate-400 dark:text-[#8D89AC] border-transparent")}
                >
                  Criar conta
                </button>
              </div>

              <div className="space-y-5">
                {authMode === 'signup' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className={fieldLabel}>Nome</Label>
                        <Input placeholder="Edson" className={pillInput} value={authFirstName} onChange={(e) => setAuthFirstName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className={fieldLabel}>Sobrenome</Label>
                        <Input placeholder="Vargas" className={pillInput} value={authLastName} onChange={(e) => setAuthLastName(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className={fieldLabel}>Usuário</Label>
                      <Input
                        placeholder="edson"
                        className={pillInput}
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label className={fieldLabel}>E-mail</Label>
                  <Input type="email" placeholder="voce@email.com" className={pillInput} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className={fieldLabel}>Senha</Label>
                  <div className="relative">
                    <Input
                      type={showAuthPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={cn(pillInput, "pr-12")}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword(v => !v)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] hover:text-primary transition-colors"
                      aria-label={showAuthPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showAuthPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {authMode === 'signin' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setForgotEmail(authEmail); setForgotSent(false); setForgotError(''); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}

                {authError && (
                  <p className="text-xs font-normal text-rose-500 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-2xl px-5 py-3">{authError}</p>
                )}
                {authInfo && (
                  <p className="text-xs font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl px-5 py-3">{authInfo}</p>
                )}

                <Button
                  onClick={handleAuthSubmit}
                  disabled={authSubmitting}
                  className="w-full h-14 rounded-full bg-primary text-white hover:bg-primary/90 gap-2 transition-all active:scale-95 font-medium text-base disabled:opacity-50 flex items-center justify-center"
                >
                  <LogIn size={18} strokeWidth={2.5} />
                  <span>{authMode === 'signin' ? 'Entrar' : 'Criar conta'}</span>
                </Button>

                <p className="text-[11px] font-normal text-slate-400 dark:text-[#6B679C] text-center leading-relaxed pt-2">
                  Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Cabeçalho mobile compartilhado (foto + "Oi, Nome!" + calendário + notificações),
  // igual em toda página — dispensa qualquer controle de mês flutuante à parte.
  const mobileTopHeader = (
    <div className="md:hidden flex items-center justify-between">
      <button onClick={() => setIsProfileOpen(true)} className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium shrink-0 overflow-hidden">
          {userProfile?.photoURL ? (
            <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            userProfile?.nickname ? userProfile.nickname.charAt(0).toUpperCase() : (user?.email || 'U').charAt(0).toUpperCase()
          )}
        </div>
        <p className="text-lg text-slate-500 dark:text-[#A8A4CC] font-normal truncate">
          Oi, <span className="font-medium text-slate-800 dark:text-[#EDE9E3]">{userProfile?.nickname || 'de novo'}</span>!
        </p>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setPickerMonth(format(currentDate, 'MM'));
            setPickerYear(format(currentDate, 'yyyy'));
            setIsMonthPickerOpen(true);
          }}
          className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5]"
          aria-label="Selecionar mês"
        >
          <CalendarIcon size={18} />
        </button>
        <button
          type="button"
          onClick={() => setAlertConfig({ open: true, title: 'Notificações', message: 'Você não tem notificações novas.' })}
          className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5]"
          aria-label="Notificações"
        >
          <Bell size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans text-foreground selection:bg-primary/20 md:pl-80">
      {/* Onboarding / Nickname Modal */}
      <Dialog open={isNicknameModalOpen} onOpenChange={setIsNicknameModalOpen}>
        <DialogContent className="max-w-none sm:max-w-sm p-0 overflow-hidden rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep bg-[#F6F4FD] dark:bg-[#0B0A2E] flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Quase lá</DialogTitle>
            <DialogDescription>Escolha como quer ser chamado</DialogDescription>
          </DialogHeader>
          <div className="p-7 space-y-7">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 text-primary font-heading font-medium text-2xl">
                {(tempNickname || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <h1 className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Quase lá</h1>
              <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC]">Como você quer ser chamado?</p>
            </div>
            <Input
              placeholder="Ex: Edson"
              className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6 text-center"
              value={tempNickname || ''}
              onChange={(e) => setTempNickname(e.target.value)}
              autoFocus
            />
            <button
              onClick={handleSaveNickname}
              className="w-full h-14 rounded-full bg-primary text-white hover:bg-primary/90 font-medium text-base transition-all active:scale-95"
            >
              Salvar e continuar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmingTransaction} onOpenChange={(open) => !open && setConfirmingTransaction(null)}>
        <DialogContent className="rounded-t-[2rem] rounded-b-none md:rounded-[2rem] border-none shadow-deep max-w-sm max-h-[90vh] p-0 overflow-hidden bg-white dark:bg-[#100E3D] flex flex-col">
          <div className="p-6 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-heading font-medium text-slate-800 dark:text-[#EDE9E3] leading-tight">
                {confirmingTransaction?.id.startsWith('bill-') ? 'Fatura do cartão' : 'Confirmar recebimento'}
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-slate-500 dark:text-[#A8A4CC]">
                {confirmingTransaction?.type === 'income' ? 'Registrar recebimento de' : 'Registrar pagamento de'} <strong className="text-primary">{confirmingTransaction?.description}</strong>
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">
                  {confirmingTransaction?.type === 'card_purchase' || confirmingTransaction?.id.startsWith('bill-') ? 'Valor a pagar' : 'Quanto recebeu?'}
                </Label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-medium text-slate-300 dark:text-[#6B679C] group-focus-within:text-primary transition-colors">R$</span>
                  <Input 
                    className="rounded-2xl border-none bg-slate-50 dark:bg-[#16133F] h-12 pl-12 text-lg font-medium focus:bg-white dark:focus:bg-[#100E3D] focus:ring-2 focus:ring-primary/20 transition-all" 
                    value={confirmAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    onChange={(e) => setConfirmAmount(parseCurrency(maskCurrency(e.target.value)))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Data que aconteceu</Label>
                <DateField
                  className="rounded-2xl h-12"
                  value={confirmDate}
                  onChange={setConfirmDate}
                />
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button className="w-full h-14 rounded-full font-medium text-lg bg-primary hover:bg-primary/90 transition-all active:scale-95" onClick={() => {
                if (confirmingTransaction) {
                  handleConfirmTransaction(confirmingTransaction.id, confirmAmount, confirmDate, confirmingTransaction.date);
                  setConfirmingTransaction(null);
                }
              }}>
                {confirmingTransaction?.type === 'income' ? 'Confirmar recebimento' : (confirmingTransaction?.type === 'card_purchase' || confirmingTransaction?.id.startsWith('bill-') ? 'Confirmar pagamento' : 'Confirmar pagamento')}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1 h-12 rounded-2xl font-normal text-slate-500 dark:text-[#A8A4CC] hover:bg-slate-100 dark:hover:bg-[#1C1852]" onClick={() => {
                  if (confirmingTransaction) {
                    if (confirmingTransaction.id.startsWith('bill-')) {
                      setSelectedCard(confirmingTransaction.cardId || null);
                      setActiveTab('cartoes');
                      setConfirmingTransaction(null);
                    } else {
                      handleEditClick(confirmingTransaction);
                      setConfirmingTransaction(null);
                    }
                  }
                }}>
                  {confirmingTransaction?.id.startsWith('bill-') ? 'Ver detalhes' : 'Editar'}
                </Button>
                {(!confirmingTransaction?.id.startsWith('bill-')) && (
                  <Button variant="ghost" className="flex-1 h-12 rounded-2xl font-normal text-rose-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => {
                    if (confirmingTransaction) {
                      setTransactionToDelete(confirmingTransaction);
                      setIsDeleteDialogOpen(true);
                      setDeleteLinked(false);
                    }
                  }}>
                    <Trash2 size={16} className="mr-2" />
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Month/Year Picker */}
      <Dialog open={isMonthPickerOpen} onOpenChange={setIsMonthPickerOpen}>
        <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
          <div className="p-7 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Ir para o mês</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Select value={pickerMonth} onValueChange={setPickerMonth}>
                <SelectTrigger className="h-12 border-none bg-slate-50 dark:bg-[#16133F] rounded-xl font-normal text-sm px-4 shadow-sm">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-none shadow-deep p-2">
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value} className="rounded-lg font-normal text-sm p-2">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pickerYear} onValueChange={setPickerYear}>
                <SelectTrigger className="h-12 border-none bg-slate-50 dark:bg-[#16133F] rounded-xl font-normal text-sm px-4 shadow-sm">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-none shadow-deep p-2">
                  {monthPickerYears.map(y => (
                    <SelectItem key={y.value} value={y.value} className="rounded-lg font-normal text-sm p-2">{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={() => {
                setCurrentDate(new Date(Number(pickerYear), Number(pickerMonth) - 1, 1));
                setIsMonthPickerOpen(false);
              }}
              className="w-full h-14 rounded-full font-medium bg-primary text-white hover:bg-primary/90 transition-all active:scale-95"
            >
              Ir para esse mês
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Novo lançamento (mobile) — controlled dialog, triggered from the per-tab "+" buttons */}
      <div className="md:hidden">
        <Dialog open={isRegistrarOpen && window.innerWidth < 768} onOpenChange={setIsRegistrarOpen}>
          <DialogContent className="max-w-none sm:max-w-lg h-[85vh] flex flex-col p-0 border-none shadow-deep rounded-t-[2.5rem] rounded-b-none overflow-hidden bg-white dark:bg-[#100E3D]">
            <div className="px-6 pt-6 pb-2 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">{editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
              </DialogHeader>
            </div>
          <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-6 scrollbar-hide">
            <div className="flex justify-center gap-2">
                <button 
                  onClick={() => setNewTransaction({...newTransaction, type: 'income', cardId: null})}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-medium transition-all flex flex-col items-center gap-1 text-[9px] capitalize tracking-wide relative overflow-hidden group",
                    newTransaction.type === 'income' ? "bg-emerald-400 text-white shadow-soft" : "bg-slate-50 dark:bg-[#16133F] text-slate-400 dark:text-[#8D89AC] hover:bg-slate-100 dark:hover:bg-[#1C1852]/80"
                  )}
                >
                  <ArrowUpCircle size={16} strokeWidth={3} />
                  Receita
                </button>
                <button 
                  onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-medium transition-all flex flex-col items-center gap-1 text-[9px] capitalize tracking-wide relative overflow-hidden group",
                    (newTransaction.type === 'expense' || newTransaction.type === 'card_purchase') ? "bg-rose-400 text-white shadow-soft" : "bg-slate-50 dark:bg-[#16133F] text-slate-400 dark:text-[#8D89AC] hover:bg-slate-100 dark:hover:bg-[#1C1852]/80"
                  )}
                >
                  <ArrowDownCircle size={16} strokeWidth={3} />
                  Despesa
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-slate-50 dark:bg-[#16133F] rounded-2xl space-y-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Descrição</Label>
                  <Input
                    placeholder="Ex: Aluguel"
                    className="h-11 rounded-xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm px-4 shadow-sm"
                    value={newTransaction.description || ''}
                    onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Valor</Label>
                    <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-normal text-slate-300 dark:text-[#6B679C] group-focus-within:text-primary transition-colors text-xs">R$</span>
                      <Input
                        className="h-11 rounded-xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm pl-10 pr-4 shadow-sm"
                        value={amountInput}
                        onChange={(e) => setAmountInput(maskCurrency(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">{newTransaction.cardId ? 'Data da compra' : 'Data'}</Label>
                    <DateField
                      className="h-11 text-xs bg-white dark:bg-[#100E3D] shadow-sm"
                      value={newTransaction.date || ''}
                      onChange={(v) => {
                        setNewTransaction({...newTransaction, date: v});
                        setLinkedIncomeDate(v);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Categoria</Label>
                  <Select value={newTransaction.category || ''} onValueChange={(v) => setNewTransaction({...newTransaction, category: v})}>
                    <SelectTrigger className="h-11 border-none bg-white dark:bg-[#100E3D] rounded-xl font-normal text-sm px-4 shadow-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-deep p-2">
                      {categories.filter(c => c.id !== 'all').map(cat => (
                        <SelectItem key={cat.id} value={cat.name} className="rounded-xl font-normal p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span>{cat.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(newTransaction.type === 'expense' || newTransaction.type === 'card_purchase') && cards.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">É no cartão de crédito?</Label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setNewTransaction({ ...newTransaction, cardId: null, type: 'expense' })}
                        className={cn(
                          "h-9 px-3 rounded-full text-xs font-medium border-2 transition-all",
                          !newTransaction.cardId ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm" : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC]"
                        )}
                      >
                        Não
                      </button>
                      {cards.map(card => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setNewTransaction({ ...newTransaction, cardId: card.id, type: 'card_purchase' })}
                          className={cn(
                            "h-9 px-3 rounded-full text-xs font-medium border-2 transition-all flex items-center gap-2",
                            newTransaction.cardId === card.id ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm" : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC]"
                          )}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                          {card.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowMoreOptions(v => !v)}
                    className="w-full flex items-center justify-between px-1 py-1"
                  >
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] cursor-pointer">
                      Mais opções {(personSplits.length > 0 || isRecurrent || isInstallment) && !showMoreOptions && '(em uso)'}
                    </Label>
                    <ChevronDown size={14} strokeWidth={2.5} className={cn("text-slate-400 dark:text-[#8D89AC] transition-transform", (showMoreOptions || personSplits.length > 0 || isRecurrent || isInstallment) && "rotate-180")} />
                  </button>
                </div>

                {(showMoreOptions || personSplits.length > 0 || isRecurrent || isInstallment) && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 dark:bg-[#16133F] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="assign-someone-m" className="text-[10px] font-medium text-slate-500 dark:text-[#A8A4CC] cursor-pointer tracking-tight">Dividir com pessoas</Label>
                    <ToggleSwitch
                      checked={showPersonSelector}
                      onChange={(checked) => {
                        setShowPersonSelector(checked);
                        if (!checked) {
                          setPersonSplits([]);
                          setNewTransaction({...newTransaction, payerPayee: 'geral'});
                        }
                      }}
                    />
                  </div>

                  {showPersonSelector && (
                    <div className="flex flex-wrap gap-2 p-1 animate-in fade-in slide-in-from-top-1">
                      {people.filter(p => p.visible !== false).map(p => {
                        const isSelected = personSplits.some(s => s.personId === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              let newSplits = [...personSplits];
                              if (isSelected) {
                                newSplits = newSplits.filter(s => s.personId !== p.id);
                              } else {
                                newSplits.push({ personId: p.id, type: globalSplitType, value: globalSplitType === 'parts' ? '1' : '0,00' });
                              }

                              if (globalSplitType === 'percentage' && newSplits.length > 0) {
                                const perPerson = Math.floor(100 / newSplits.length);
                                const remainder = 100 % newSplits.length;
                                newSplits = newSplits.map((s, idx) => ({
                                  ...s,
                                  value: (idx === 0 ? perPerson + remainder : perPerson).toString()
                                }));
                              }

                              setPersonSplits(newSplits);
                              if (newSplits.length === 0) {
                                setNewTransaction({...newTransaction, payerPayee: 'geral'});
                              } else if (newSplits.length === 1) {
                                setNewTransaction({...newTransaction, payerPayee: newSplits[0].personId});
                              } else {
                                setNewTransaction({...newTransaction, payerPayee: 'multi', category: 'Emprestado'});
                              }
                            }}
                            className={cn(
                              "h-10 px-3 rounded-full font-normal text-xs transition-all flex items-center gap-2 border-2",
                              isSelected
                                ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm"
                                : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC] hover:border-slate-200 dark:hover:border-[#2A2566]"
                            )}
                          >
                            <img src={p.image} alt="" className="w-5 h-5 rounded-full object-cover shadow-sm" />
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {showPersonSelector && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] font-medium text-xs pointer-events-none">@</span>
                        <Input
                          placeholder="usuário ou nome novo"
                          className="h-10 rounded-xl border-none bg-white dark:bg-[#100E3D] font-normal text-xs pl-8 pr-3 shadow-sm"
                          value={quickAssignQuery}
                          onChange={(e) => setQuickAssignQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuickAssignPerson()}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleQuickAssignPerson}
                        disabled={!quickAssignQuery.trim() || quickAssignSubmitting}
                        className="h-10 px-4 rounded-xl font-medium text-xs bg-primary text-white disabled:opacity-40 shrink-0"
                      >
                        Adicionar
                      </Button>
                    </div>
                  )}
                  </div>
                </div>

                {personSplits.length > 0 && (
                  <div className="p-4 bg-slate-50 dark:bg-[#16133F] rounded-2xl space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Configurar divisões</Label>
                      <div className="flex bg-slate-100 dark:bg-[#1C1852] p-0.5 rounded-lg border border-slate-200 dark:border-[#2A2566] shadow-sm overflow-hidden min-w-[120px]">
                        {(['parts', 'percentage', 'value'] as const).filter(t => personSplits.length > 1 || t !== 'parts').map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setGlobalSplitType(type);
                              let newSplits = personSplits.map(s => ({
                                ...s,
                                type: type,
                                value: type === 'parts' ? '1' : '0,00'
                              }));

                              if (type === 'percentage' && newSplits.length > 0) {
                                const perPerson = Math.floor(100 / newSplits.length);
                                const remainder = 100 % newSplits.length;
                                newSplits = newSplits.map((s, idx) => ({
                                  ...s,
                                  value: (idx === 0 ? perPerson + remainder : perPerson).toString()
                                }));
                              }
                              setPersonSplits(newSplits);
                            }}
                            className={cn(
                              "flex-1 py-1 rounded-md text-[8px] font-medium transition-all",
                              globalSplitType === type ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC] hover:text-slate-600 dark:hover:text-[#C5C1E5]"
                            )}
                          >
                            {type === 'parts' ? 'Partes' : type === 'percentage' ? '%' : 'R$'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {personSplits.length === 1 ? (
                      // Single person card (existing style but without uppercase)
                      <div className="grid gap-3">
                        {personSplits.map((split, index) => {
                          const person = people.find(p => p.id === split.personId);
                          return (
                            <div key={index} className="bg-white dark:bg-[#100E3D] p-4 rounded-2xl shadow-sm space-y-3 group hover:ring-1 hover:ring-primary/20 transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#100E3D] shadow-sm flex items-center justify-center overflow-hidden border border-slate-50 dark:border-[#1C1852]">
                                    <img src={person?.image} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-slate-700 dark:text-[#EDEAF9]">{person?.name}</p>
                                    <p className="text-[10px] font-normal text-primary">
                                      {(() => {
                                        const amount = parseCurrency(amountInput);
                                        const result = getAssignmentsFromSplits(amount, personSplits)[index]?.amount || 0;
                                        return result.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                      })()}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] ml-1">
                                  {split.type === 'parts' ? 'Quantas partes?' : split.type === 'percentage' ? 'Qual percentual?' : 'Qual valor fixo?'}
                                </p>
                                <div className="relative w-32">
                                  <Input
                                    className="h-10 rounded-xl border-none bg-slate-50 dark:bg-[#1C1852] font-medium text-xs px-4 text-right shadow-sm focus:ring-1 focus:ring-primary/20"
                                    value={split.value}
                                    onChange={(e) => {
                                      setPersonSplits(prev => prev.map((s, i) => {
                                        if (i !== index) return s;
                                        if (split.type === 'value') return { ...s, value: maskCurrency(e.target.value) };
                                        if (split.type === 'percentage') return { ...s, value: maskPercentage(e.target.value) };
                                        return { ...s, value: e.target.value.replace(/[^0-9]/g, '') };
                                      }));
                                    }}
                                  />
                                  {split.type === 'percentage' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-300 dark:text-[#6B679C]">%</span>}
                                  {split.type === 'value' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-slate-200 dark:text-[#5C5686]">R$</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Unified card for multiple people
                      <div className="bg-white dark:bg-[#100E3D] p-4 rounded-2xl shadow-sm space-y-4">
                        <div className="space-y-3">
                          {personSplits.map((split, index) => {
                            const person = people.find(p => p.id === split.personId);
                            return (
                              <div key={index} className="flex items-center gap-3 pb-3 border-b border-slate-50 dark:border-[#201C56] last:border-0 last:pb-0">
                                <img src={person?.image} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-medium text-slate-700 dark:text-[#EDEAF9] truncate">{person?.name}</p>
                                  <p className="text-[9px] font-normal text-primary">
                                    {(() => {
                                      const amount = parseCurrency(amountInput);
                                      const result = getAssignmentsFromSplits(amount, personSplits)[index]?.amount || 0;
                                      return result.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                    })()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="relative w-20">
                                    <input
                                      className="w-full h-8 bg-slate-50 dark:bg-[#1C1852] border-0 rounded-lg font-medium text-[10px] px-2 text-right shadow-sm outline-none focus:ring-1 focus:ring-primary/20"
                                      value={split.value}
                                      onChange={(e) => {
                                        setPersonSplits(prev => prev.map((s, i) => {
                                          if (i !== index) return s;
                                          if (split.type === 'value') return { ...s, value: maskCurrency(e.target.value) };
                                          if (split.type === 'percentage') return { ...s, value: maskPercentage(e.target.value) };
                                          return { ...s, value: e.target.value.replace(/[^0-9]/g, '') };
                                        }));
                                      }}
                                    />
                                    {split.type === 'percentage' && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-medium text-slate-300 dark:text-[#6B679C]">%</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Repetição</Label>
                  <div className="p-4 bg-slate-50 dark:bg-[#16133F] rounded-2xl space-y-4">
                    <div className="flex bg-white dark:bg-[#100E3D] rounded-xl p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => { setIsRecurrent(false); setIsInstallment(false); }}
                        className={cn("flex-1 h-9 rounded-lg text-[10px] font-medium transition-all", !isRecurrent && !isInstallment ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Única vez
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsRecurrent(true); setIsInstallment(false); }}
                        className={cn("flex-1 h-9 rounded-lg text-[10px] font-medium transition-all", isRecurrent ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Recorrente
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsInstallment(true); setIsRecurrent(false); }}
                        className={cn("flex-1 h-9 rounded-lg text-[10px] font-medium transition-all", isInstallment ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Parcelado
                      </button>
                    </div>

                    {isRecurrent && (
                      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-[#2A2566] transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-1">
                          <CalendarIcon size={12} className="text-primary" />
                          <Label className="text-[10px] font-medium tracking-wider text-primary">Repetir até</Label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select 
                            value={newTransaction.recurrenceEndDate?.split('-')[1] || ''} 
                            onValueChange={(m) => {
                              const year = newTransaction.recurrenceEndDate?.split('-')[0] || years[0].value;
                              setNewTransaction({...newTransaction, recurrenceEndDate: `${year}-${m}`});
                            }}
                          >
                            <SelectTrigger className="h-10 border-none bg-white dark:bg-[#100E3D] rounded-xl font-normal text-xs px-4 shadow-sm focus:ring-1 focus:ring-primary/20">
                              <SelectValue placeholder="Mês" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-deep p-2">
                              {months.map(m => (
                                <SelectItem key={m.value} value={m.value} className="rounded-lg font-normal text-xs p-2">{m.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select 
                            value={newTransaction.recurrenceEndDate?.split('-')[0] || ''} 
                            onValueChange={(y) => {
                              const month = newTransaction.recurrenceEndDate?.split('-')[1] || months[0].value;
                              setNewTransaction({...newTransaction, recurrenceEndDate: `${y}-${month}`});
                            }}
                          >
                            <SelectTrigger className="h-10 border-none bg-white dark:bg-[#100E3D] rounded-xl font-normal text-xs px-4 shadow-sm focus:ring-1 focus:ring-primary/20">
                              <SelectValue placeholder="Ano" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-deep p-2">
                              {years.map(y => (
                                <SelectItem key={y.value} value={y.value} className="rounded-lg font-normal text-xs p-2">{y.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2 pt-1">
                          <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Quando lançar todo mês</Label>
                          <div className="flex bg-white dark:bg-[#100E3D] rounded-xl p-1 shadow-sm">
                            <button type="button" onClick={() => setRecurrenceDateMode('fixed')} className={cn("flex-1 h-9 rounded-lg text-[10px] font-medium transition-all", recurrenceDateMode === 'fixed' ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}>
                              Dia fixo
                            </button>
                            <button type="button" onClick={() => setRecurrenceDateMode('businessDay')} className={cn("flex-1 h-9 rounded-lg text-[10px] font-medium transition-all", recurrenceDateMode === 'businessDay' ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}>
                              Dia útil
                            </button>
                          </div>
                          {recurrenceDateMode === 'businessDay' && (
                            <div className="flex items-center gap-2 pt-1">
                              <Input
                                type="number"
                                min="1"
                                max="23"
                                className="h-10 w-16 rounded-xl border-none bg-white dark:bg-[#100E3D] font-medium text-sm text-center shadow-sm px-2"
                                value={recurrenceBusinessDay}
                                onChange={(e) => setRecurrenceBusinessDay(Math.max(1, Number(e.target.value) || 1))}
                              />
                              <span className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] flex-1">º dia útil do mês (seg-sex, varia conforme os fins de semana)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isInstallment && (
                      <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-[#2A2566] transition-all animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[10px] font-medium tracking-wider text-primary block">Quantidade de Parcelas</Label>
                        <Input
                          type="number" 
                          min="2" 
                          max="84"
                          className="h-10 border-none bg-white dark:bg-[#100E3D] rounded-xl font-normal text-base px-4 shadow-sm"
                          value={installmentCount ?? 2}
                          onChange={(e) => setInstallmentCount(Math.min(84, Number(e.target.value)))}
                        />
                      </div>
                    )}
                  </div>
                </div>
                </div>
                )}

                {newTransaction.type === 'card_purchase' && newTransaction.payerPayee && newTransaction.payerPayee !== 'geral' && (
                  <div className="flex items-center gap-3 bg-indigo-50/80 dark:bg-indigo-950/20 px-4 h-12 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 relative">
                    <Label htmlFor="linked-income-m" className="text-[10px] font-medium text-indigo-600 dark:text-indigo-300 cursor-pointer flex items-center gap-2 flex-1">
                      Associar receita
                      <Popover>
                        <PopoverTrigger render={
                          <button className="h-5 w-5 flex items-center justify-center rounded-full bg-white dark:bg-[#100E3D] shadow-sm outline-none">
                            <Info size={12} className="text-indigo-400" />
                          </button>
                        } />
                        <PopoverContent className="w-56 p-4 rounded-3xl bg-indigo-600 text-white border-none shadow-deep z-[70]">
                          <p className="text-[10px] font-normal leading-relaxed tracking-tight">
                            Cria uma receita automática para a pessoa selecionada. Útil para reembolsos.
                          </p>
                        </PopoverContent>
                      </Popover>
                    </Label>
                    <ToggleSwitch checked={createLinkedIncome} onChange={setCreateLinkedIncome} />
                  </div>
                )}

                {newTransaction.type !== 'card_purchase' && (
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-[#16133F] px-4 h-12 rounded-2xl border border-slate-100 dark:border-[#201C56]">
                    <Label htmlFor="status-m" className="text-xs font-medium text-slate-500 dark:text-[#A8A4CC] cursor-pointer flex-1">
                      {newTransaction.type === 'income' ? 'Já recebido?' : 'Já pago?'}
                    </Label>
                    <ToggleSwitch
                      checked={newTransaction.status === 'actual'}
                      onChange={(checked) => setNewTransaction({ ...newTransaction, status: checked ? 'actual' : 'planned' })}
                    />
                  </div>
                )}

                {editingTransaction?.linkedTransactionId && (() => {
                  const linked = transactions.find(t => t.id === editingTransaction.linkedTransactionId);
                  if (!linked) return null;
                  return (
                    <div
                      onClick={() => handleEditClick(linked)}
                      className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/40 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#100E3D] shadow-sm flex items-center justify-center text-indigo-500 shrink-0">
                          {linked.type === 'income' ? <ArrowUpCircle size={16} strokeWidth={3} /> : <CreditCard size={16} strokeWidth={3} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-normal text-slate-700 dark:text-[#EDEAF9] truncate">Vinculado a: {linked.description}</p>
                          <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC]">R$ {linked.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-indigo-300 group-hover:translate-x-1 transition-transform shrink-0" />
                    </div>
                  );
                })()}

                <div className="flex items-center gap-3 pt-2">
                  {editingTransaction && !editingTransaction.id.startsWith('bill-') && (
                    <Button
                      onClick={() => {
                        setTransactionToDelete(editingTransaction);
                        setIsDeleteDialogOpen(true);
                      }}
                      variant="outline"
                      className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/20 border-none text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-all flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={18} />
                    </Button>
                  )}
                  <Button onClick={() => handleAddTransaction()} className="flex-1 h-12 rounded-full font-medium bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all">
                    Salvar lançamento
                  </Button>
                </div>
              </div>
          </DialogContent>
        </Dialog>

        {/* Categories Management Modal */}
        <Dialog open={isCategoriasOpen} onOpenChange={setIsCategoriasOpen}>
          <DialogContent className="max-w-none w-full h-[100dvh] top-0 bottom-0 left-0 right-0 rounded-none p-0 border-none shadow-deep flex flex-col overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E] sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:translate-x-0 sm:w-full sm:max-w-md sm:h-screen sm:rounded-l-[1.75rem] sm:rounded-r-none">
            <div className="p-6 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-3xl font-heading font-normal text-slate-800 dark:text-[#EDE9E3] tracking-tighter">Categorias</DialogTitle>
                <DialogDescription className="font-normal text-sm text-slate-500 dark:text-[#A8A4CC] tracking-tight mt-1">Personalize sua organização</DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="space-y-4 p-6 bg-slate-50 dark:bg-[#16133F] rounded-[2rem]">
                {editingCategory && (
                  <div className="flex items-center justify-between bg-primary/10 text-primary text-xs font-medium rounded-xl px-4 py-2.5">
                    <span>Editando "{editingCategory.name}"</span>
                    <button type="button" onClick={() => { setEditingCategory(null); setNewCategoryName(''); setNewCategoryColor('#8A7FF5'); setNewCategoryIcon(''); }} className="hover:text-primary/70">
                      Cancelar
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Emoji</Label>
                    <Input
                      placeholder="🏷️"
                      className="h-12 w-16 rounded-2xl border-none bg-white dark:bg-[#100E3D] text-center text-xl px-0 shadow-sm"
                      maxLength={4}
                      value={newCategoryIcon}
                      onChange={(e) => {
                        const EMOJI_PARTS = new RegExp(
                          '\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\u200D|\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}]|[\\u{1F1E6}-\\u{1F1FF}]',
                          'gu'
                        );
                        const matches = e.target.value.match(EMOJI_PARTS) || [];
                        setNewCategoryIcon(matches.join(''));
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Nome da categoria</Label>
                    <Input
                      placeholder="Ex: Assinaturas"
                      className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm px-5 shadow-sm"
                      value={newCategoryName || ''}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Cor</Label>
                  <div className="grid grid-cols-5 gap-2 bg-white dark:bg-[#100E3D] p-3 rounded-2xl shadow-sm">
                    {['#8A7FF5', '#37D6A3', '#FDB8D7', '#FF6F61', '#FFC168', '#6FA8FF', '#B6ADFF', '#5FC9A8', '#F797C0'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategoryColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full transition-all shrink-0",
                          newCategoryColor === color ? "ring-2 ring-primary ring-offset-2 scale-110" : "opacity-40"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => colorInputRef.current?.click()}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#1C1852] flex items-center justify-center text-slate-400 dark:text-[#8D89AC] hover:text-slate-600 dark:hover:text-[#C5C1E5] transition-all border-2 border-dashed border-slate-300 dark:border-[#5a5a5a]"
                    >
                      <Plus size={16} />
                      <input 
                        ref={colorInputRef}
                        type="color" 
                        className="sr-only"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                      />
                    </button>
                  </div>
                </div>
                <button onClick={handleAddCategory} className="w-full h-12 rounded-full font-medium bg-primary text-white hover:bg-primary/90 transition-all active:scale-95">
                  {editingCategory ? 'Salvar alterações' : 'Adicionar categoria'}
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-2 tracking-widest">Suas categorias ({categories.length})</p>
                <div className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 pl-3 pr-2 py-2 bg-card rounded-full shadow-soft group">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0" style={{ backgroundColor: cat.color }}>
                        {cat.icon || DEFAULT_CATEGORY_ICON}
                      </div>
                      <span className="flex-1 font-medium text-slate-700 dark:text-[#EDEAF9] text-sm truncate tracking-tight">{cat.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          className="h-9 w-9 flex items-center justify-center text-slate-300 dark:text-[#6B679C] hover:text-primary rounded-full transition-all"
                          onClick={() => {
                            setEditingCategory(cat);
                            setNewCategoryName(cat.name);
                            setNewCategoryColor(cat.color);
                            setNewCategoryIcon(cat.icon);
                          }}
                        >
                          <Settings size={14} strokeWidth={2.5} />
                        </button>
                        <button
                          className="h-9 w-9 flex items-center justify-center text-slate-300 dark:text-[#6B679C] hover:text-rose-400 rounded-full transition-all"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash2 size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="fixed bottom-10 right-10 z-50 hidden md:block">
        <Dialog open={isRegistrarOpen && window.innerWidth >= 768} onOpenChange={setIsRegistrarOpen}>
          {/* Desktop FAB */}
          <DialogTrigger 
            render={
              <Button 
                className="w-16 h-16 rounded-full bg-primary hover:active:scale-90 shadow-deep p-0 border-[6px] border-white dark:border-[#100E3D] transition-all duration-500 overflow-hidden group"
                onClick={handleOpenRegistrar}
              >
                <Plus size={32} className="text-white relative z-10 transition-transform duration-500 group-hover:rotate-90" strokeWidth={3} />
              </Button>
            }
          />
          <DialogContent className="max-w-none w-full h-[100dvh] top-0 bottom-0 left-0 right-0 rounded-none flex flex-col p-0 overflow-hidden border-none shadow-deep bg-white dark:bg-[#100E3D] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-xl sm:h-auto sm:max-h-[85vh] sm:rounded-[1.75rem]">
            <div className="px-8 pt-8 pb-2 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-4xl font-heading font-normal text-slate-800 dark:text-[#EDE9E3] tracking-tighter">{editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pb-12 space-y-8 scrollbar-hide">
              <div className="flex justify-center gap-3">
                <button 
                  onClick={() => setNewTransaction({...newTransaction, type: 'income', cardId: null})}
                  className={cn(
                    "flex-1 py-3 rounded-2xl font-medium transition-all flex flex-col items-center gap-2 text-[10px] capitalize tracking-wide relative overflow-hidden group",
                    newTransaction.type === 'income' ? "bg-emerald-400 text-white shadow-soft" : "bg-slate-50 dark:bg-[#16133F] text-slate-400 dark:text-[#8D89AC] hover:bg-slate-100 dark:hover:bg-[#1C1852]/80"
                  )}
                >
                  <ArrowUpCircle size={22} strokeWidth={3} />
                  Receita
                </button>
                <button 
                  onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                  className={cn(
                    "flex-1 py-3 rounded-2xl font-medium transition-all flex flex-col items-center gap-2 text-[10px] capitalize tracking-wide relative overflow-hidden group",
                    (newTransaction.type === 'expense' || newTransaction.type === 'card_purchase') ? "bg-rose-400 text-white shadow-soft" : "bg-slate-50 dark:bg-[#16133F] text-slate-400 dark:text-[#8D89AC] hover:bg-slate-100 dark:hover:bg-[#1C1852]/80"
                  )}
                >
                  <ArrowDownCircle size={22} strokeWidth={3} />
                  Despesa
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="p-6 bg-slate-50 dark:bg-[#16133F] rounded-[1.75rem] space-y-5">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Descrição</Label>
                      <Input
                        placeholder="Ex: Aluguel"
                        className="h-14 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-normal text-base px-6 shadow-sm"
                        value={newTransaction.description || ''}
                        onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Valor</Label>
                        <div className="relative group">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 font-normal text-slate-300 dark:text-[#6B679C] group-focus-within:text-primary transition-colors text-lg">R$</span>
                          <Input
                            className="h-14 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-normal text-base pl-16 pr-6 shadow-sm"
                            value={amountInput}
                            onChange={(e) => setAmountInput(maskCurrency(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Categoria</Label>
                        <Select value={newTransaction.category || ''} onValueChange={(v) => setNewTransaction({...newTransaction, category: v})}>
                          <SelectTrigger className="h-14 border-none bg-white dark:bg-[#100E3D] rounded-2xl font-normal text-base px-6 shadow-sm">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-deep p-2">
                            {categories.filter(c => c.id !== 'all').map(cat => (
                              <SelectItem key={cat.id} value={cat.name} className="rounded-xl font-normal p-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                                  <span>{cat.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">{newTransaction.cardId ? 'Data da compra' : 'Data'}</Label>
                        <DateField
                          className="h-14 rounded-2xl bg-white dark:bg-[#100E3D] text-sm px-6 shadow-sm"
                          value={newTransaction.date || ''}
                          onChange={(v) => {
                            setNewTransaction({...newTransaction, date: v});
                            setLinkedIncomeDate(v);
                          }}
                        />
                      </div>
                    </div>

                    {(newTransaction.type === 'expense' || newTransaction.type === 'card_purchase') && cards.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">É no cartão de crédito?</Label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setNewTransaction({ ...newTransaction, cardId: null, type: 'expense' })}
                            className={cn(
                              "h-11 px-4 rounded-full text-sm font-medium border-2 transition-all",
                              !newTransaction.cardId ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm" : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC]"
                            )}
                          >
                            Não
                          </button>
                          {cards.map(card => (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => setNewTransaction({ ...newTransaction, cardId: card.id, type: 'card_purchase' })}
                              className={cn(
                                "h-11 px-4 rounded-full text-sm font-medium border-2 transition-all flex items-center gap-2",
                                newTransaction.cardId === card.id ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm" : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC]"
                              )}
                            >
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: card.color }} />
                              {card.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowMoreOptions(v => !v)}
                    className="w-full flex items-center justify-between px-1 py-1"
                  >
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] cursor-pointer">
                      Mais opções {(personSplits.length > 0 || isRecurrent || isInstallment) && !showMoreOptions && '(em uso)'}
                    </Label>
                    <ChevronDown size={14} strokeWidth={2.5} className={cn("text-slate-400 dark:text-[#8D89AC] transition-transform", (showMoreOptions || personSplits.length > 0 || isRecurrent || isInstallment) && "rotate-180")} />
                  </button>
                </div>

                {(showMoreOptions || personSplits.length > 0 || isRecurrent || isInstallment) && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-1">
                  <div className="p-6 bg-slate-50 dark:bg-[#16133F] rounded-[1.75rem] space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <Label htmlFor="assign-someone-d" className="text-xs font-medium text-slate-500 dark:text-[#A8A4CC] cursor-pointer tracking-wide">Dividir com pessoas</Label>
                      <ToggleSwitch
                        checked={showPersonSelector}
                        onChange={(checked) => {
                          setShowPersonSelector(checked);
                          if (!checked) {
                            setPersonSplits([]);
                            setNewTransaction({...newTransaction, payerPayee: 'geral'});
                          }
                        }}
                      />
                    </div>

                    {showPersonSelector && (
                      <div className="flex flex-wrap gap-2 p-1 animate-in fade-in slide-in-from-top-2">
                        {people.filter(p => p.visible !== false).map(p => {
                          const isSelected = personSplits.some(s => s.personId === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                let newSplits = [...personSplits];
                                if (isSelected) {
                                  newSplits = newSplits.filter(s => s.personId !== p.id);
                                } else {
                                  newSplits.push({ personId: p.id, type: globalSplitType, value: globalSplitType === 'parts' ? '1' : '0,00' });
                                }

                                if (globalSplitType === 'percentage' && newSplits.length > 0) {
                                  const perPerson = Math.floor(100 / newSplits.length);
                                  const remainder = 100 % newSplits.length;
                                  newSplits = newSplits.map((s, idx) => ({
                                    ...s,
                                    value: (idx === 0 ? perPerson + remainder : perPerson).toString()
                                  }));
                                }

                                setPersonSplits(newSplits);
                                if (newSplits.length === 0) {
                                  setNewTransaction({...newTransaction, payerPayee: 'geral'});
                                } else if (newSplits.length === 1) {
                                  setNewTransaction({...newTransaction, payerPayee: newSplits[0].personId});
                                } else {
                                  setNewTransaction({...newTransaction, payerPayee: 'multi', category: 'Emprestado'});
                                }
                              }}
                              className={cn(
                                "h-12 px-4 rounded-2xl font-normal text-sm transition-all flex items-center gap-3 border-2 outline-none",
                                isSelected
                                  ? "bg-white dark:bg-[#100E3D] border-primary text-primary shadow-sm"
                                  : "bg-white dark:bg-[#100E3D] border-transparent text-slate-400 dark:text-[#8D89AC] hover:bg-slate-100 dark:hover:bg-[#1C1852]"
                              )}
                            >
                              <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover shadow-sm" />
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {showPersonSelector && (
                      <div className="flex items-center gap-2 px-1 pt-1">
                        <div className="relative flex-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] font-medium text-sm pointer-events-none">@</span>
                          <Input
                            placeholder="usuário ou nome novo"
                            className="h-11 rounded-xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm pl-9 pr-4"
                            value={quickAssignQuery}
                            onChange={(e) => setQuickAssignQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleQuickAssignPerson()}
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleQuickAssignPerson}
                          disabled={!quickAssignQuery.trim() || quickAssignSubmitting}
                          className="h-11 px-5 rounded-xl font-medium text-sm bg-primary text-white disabled:opacity-40 shrink-0"
                        >
                          Adicionar
                        </Button>
                      </div>
                    )}
                  </div>

                  {personSplits.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between px-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Configurar divisões</Label>
                        <div className="flex bg-slate-100 dark:bg-[#1C1852] p-1 rounded-xl border border-slate-200 dark:border-[#2A2566] shadow-sm overflow-hidden min-w-[180px]">
                          {(['parts', 'percentage', 'value'] as const).filter(t => personSplits.length > 1 || t !== 'parts').map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setGlobalSplitType(type);
                                let newSplits = personSplits.map(s => ({
                                  ...s,
                                  type: type,
                                  value: type === 'parts' ? '1' : '0,00'
                                }));

                                if (type === 'percentage' && newSplits.length > 0) {
                                  const perPerson = Math.floor(100 / newSplits.length);
                                  const remainder = 100 % newSplits.length;
                                  newSplits = newSplits.map((s, idx) => ({
                                    ...s,
                                    value: (idx === 0 ? perPerson + remainder : perPerson).toString()
                                  }));
                                }
                                setPersonSplits(newSplits);
                              }}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-[10px] font-medium transition-all",
                                globalSplitType === type ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC] hover:text-slate-600 dark:hover:text-[#C5C1E5]"
                              )}
                            >
                              {type === 'parts' ? 'Partes' : type === 'percentage' ? '%' : 'R$'}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {personSplits.length === 1 ? (
                        <div className="grid gap-4">
                          {personSplits.map((split, index) => {
                            const person = people.find(p => p.id === split.personId);
                            return (
                              <div key={index} className="bg-slate-50/50 dark:bg-[#16133F]/50 p-5 rounded-[2rem] border border-slate-100 dark:border-[#201C56] space-y-4 group hover:border-primary/20 transition-all">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#100E3D] shadow-sm flex items-center justify-center overflow-hidden border border-slate-50 dark:border-[#1C1852]">
                                      <img src={person?.image} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-700 dark:text-[#EDEAF9]">{person?.name}</p>
                                      <p className="text-xs font-medium text-primary">
                                        {(() => {
                                          const amount = parseCurrency(amountInput);
                                          const result = getAssignmentsFromSplits(amount, personSplits)[index]?.amount || 0;
                                          return result.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between gap-4">
                                  <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC] ml-1">
                                    {split.type === 'parts' ? 'Quantas partes desse valor?' : split.type === 'percentage' ? 'Qual percentual do total?' : 'Qual o valor exato?'}
                                  </p>
                                  <div className="relative w-40">
                                    <Input 
                                      className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-medium text-sm px-6 text-right shadow-sm focus:ring-2 focus:ring-primary/10"
                                      value={split.value}
                                      onChange={(e) => {
                                        setPersonSplits(prev => prev.map((s, i) => {
                                          if (i !== index) return s;
                                          if (split.type === 'value') return { ...s, value: maskCurrency(e.target.value) };
                                          if (split.type === 'percentage') return { ...s, value: maskPercentage(e.target.value) };
                                          return { ...s, value: e.target.value.replace(/[^0-9]/g, '') };
                                        }));
                                      }}
                                    />
                                    {split.type === 'percentage' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-300 dark:text-[#6B679C]">%</span>}
                                    {split.type === 'value' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-200 dark:text-[#5C5686]">R$</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-slate-50/50 dark:bg-[#16133F]/50 p-6 rounded-[2rem] border border-slate-100 dark:border-[#201C56] space-y-4">
                          <div className="space-y-4">
                            {personSplits.map((split, index) => {
                              const person = people.find(p => p.id === split.personId);
                              return (
                                <div key={index} className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-[#201C56] last:border-0 last:pb-0">
                                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white dark:border-[#100E3D] shadow-sm shrink-0">
                                    <img src={person?.image} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 dark:text-[#EDEAF9] truncate">{person?.name}</p>
                                    <p className="text-[10px] font-normal text-primary">
                                      {(() => {
                                        const amount = parseCurrency(amountInput);
                                        const result = getAssignmentsFromSplits(amount, personSplits)[index]?.amount || 0;
                                        return result.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                      })()}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="relative w-28">
                                      <input 
                                        className="h-10 w-full rounded-xl border-none bg-white dark:bg-[#100E3D] font-medium text-xs px-3 text-right shadow-sm focus:ring-1 focus:ring-primary/20 outline-none"
                                        value={split.value}
                                        onChange={(e) => {
                                          setPersonSplits(prev => prev.map((s, i) => {
                                            if (i !== index) return s;
                                            if (split.type === 'value') return { ...s, value: maskCurrency(e.target.value) };
                                            if (split.type === 'percentage') return { ...s, value: maskPercentage(e.target.value) };
                                            return { ...s, value: e.target.value.replace(/[^0-9]/g, '') };
                                          }));
                                        }}
                                      />
                                      {split.type === 'percentage' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-300 dark:text-[#6B679C]">%</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                  <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Repetição</Label>
                  <div className="p-6 bg-slate-50 dark:bg-[#16133F] rounded-[1.5rem] space-y-4">
                    <div className="flex bg-white dark:bg-[#100E3D] rounded-2xl p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => { setIsRecurrent(false); setIsInstallment(false); }}
                        className={cn("flex-1 h-10 rounded-xl text-xs font-medium transition-all", !isRecurrent && !isInstallment ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Única vez
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsRecurrent(true); setIsInstallment(false); }}
                        className={cn("flex-1 h-10 rounded-xl text-xs font-medium transition-all", isRecurrent ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Recorrente
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsInstallment(true); setIsRecurrent(false); }}
                        className={cn("flex-1 h-10 rounded-xl text-xs font-medium transition-all", isInstallment ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}
                      >
                        Parcelado
                      </button>
                    </div>

                    {isRecurrent && (
                      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-[#2A2566] transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3 mb-1">
                          <div className="p-2 bg-white dark:bg-[#100E3D] rounded-xl shadow-sm">
                            <CalendarIcon size={16} className="text-primary" />
                          </div>
                          <div>
                            <Label className="text-[10px] font-medium tracking-wider text-primary block">Repetir até</Label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-normal text-primary/40 ml-1">Mês</Label>
                            <Select 
                              value={newTransaction.recurrenceEndDate?.split('-')[1] || ''} 
                              onValueChange={(m) => {
                                const year = newTransaction.recurrenceEndDate?.split('-')[0] || years[0].value;
                                setNewTransaction({...newTransaction, recurrenceEndDate: `${year}-${m}`});
                              }}
                            >
                              <SelectTrigger className="h-12 border-none bg-white dark:bg-[#100E3D] rounded-2xl font-normal text-sm px-6 shadow-sm focus:ring-2 focus:ring-primary/20 transition-all">
                                <SelectValue placeholder="Mês" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-deep">
                                {months.map(m => (
                                  <SelectItem key={m.value} value={m.value} className="rounded-xl font-normal text-sm">{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-normal text-primary/40 ml-1">Ano</Label>
                            <Select 
                              value={newTransaction.recurrenceEndDate?.split('-')[0] || ''} 
                              onValueChange={(y) => {
                                const month = newTransaction.recurrenceEndDate?.split('-')[1] || months[0].value;
                                setNewTransaction({...newTransaction, recurrenceEndDate: `${y}-${month}`});
                              }}
                            >
                              <SelectTrigger className="h-12 border-none bg-white dark:bg-[#100E3D] rounded-2xl font-normal text-sm px-6 shadow-sm focus:ring-2 focus:ring-primary/20 transition-all">
                                <SelectValue placeholder="Ano" />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-deep">
                                {years.map(y => (
                                  <SelectItem key={y.value} value={y.value} className="rounded-xl font-normal text-sm">{y.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <Label className="text-[9px] font-normal text-primary/40 ml-1">Quando lançar todo mês</Label>
                          <div className="flex bg-white dark:bg-[#100E3D] rounded-2xl p-1 shadow-sm">
                            <button type="button" onClick={() => setRecurrenceDateMode('fixed')} className={cn("flex-1 h-10 rounded-xl text-xs font-medium transition-all", recurrenceDateMode === 'fixed' ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}>
                              Dia fixo
                            </button>
                            <button type="button" onClick={() => setRecurrenceDateMode('businessDay')} className={cn("flex-1 h-10 rounded-xl text-xs font-medium transition-all", recurrenceDateMode === 'businessDay' ? "bg-primary/10 text-primary" : "text-slate-400 dark:text-[#8D89AC]")}>
                              Dia útil
                            </button>
                          </div>
                          {recurrenceDateMode === 'businessDay' && (
                            <div className="flex items-center gap-3 pt-1">
                              <Input
                                type="number"
                                min="1"
                                max="23"
                                className="h-11 w-20 rounded-xl border-none bg-white dark:bg-[#100E3D] font-medium text-sm text-center shadow-sm px-2"
                                value={recurrenceBusinessDay}
                                onChange={(e) => setRecurrenceBusinessDay(Math.max(1, Number(e.target.value) || 1))}
                              />
                              <span className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] flex-1">º dia útil do mês (seg-sex, varia conforme os fins de semana)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isInstallment && (
                      <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-[#2A2566] transition-all animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[10px] font-medium tracking-wider text-primary ml-1">Quantidade de Parcelas</Label>
                        <Input
                          type="number" 
                          min="2" 
                          max="84"
                          className="h-12 border-none bg-white dark:bg-[#100E3D] rounded-xl font-normal text-base px-6 shadow-sm"
                          value={installmentCount ?? 2}
                          onChange={(e) => setInstallmentCount(Math.min(84, Number(e.target.value)))}
                        />
                      </div>
                    )}
                  </div>
                </div>
                </div>
                )}

                <div className="flex items-center gap-4">
                  {(newTransaction.type === 'expense' || newTransaction.type === 'card_purchase') && newTransaction.payerPayee && newTransaction.payerPayee !== 'geral' && (
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3 bg-indigo-50/80 dark:bg-indigo-950/20 px-5 h-16 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm">
                        <Label htmlFor="linked-income-d" className="text-xs font-medium text-indigo-600 dark:text-indigo-300 cursor-pointer flex items-center gap-2 flex-1">
                          Associar receita
                          <Popover>
                            <PopoverTrigger render={
                              <button className="h-6 w-6 flex items-center justify-center rounded-full bg-white dark:bg-[#100E3D] shadow-sm hover:scale-110 active:scale-95 transition-all outline-none">
                                <Info size={14} className="text-indigo-400" />
                              </button>
                            } />
                            <PopoverContent className="w-64 p-4 rounded-[1.5rem] bg-indigo-600 text-white border-none shadow-deep z-[70]">
                              <p className="text-[11px] font-normal leading-relaxed tracking-tight">
                                Ao ativar, o sistema gerará automaticamente uma receita correspondente para a pessoa selecionada. Útil para quando você paga algo para alguém e quer controlar o reembolso.
                              </p>
                            </PopoverContent>
                          </Popover>
                        </Label>
                        <ToggleSwitch checked={createLinkedIncome} onChange={setCreateLinkedIncome} />
                      </div>

                      {createLinkedIncome && (
                        <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 space-y-2 animate-in fade-in slide-in-from-top-2">
                          <Label className="text-[10px] font-medium tracking-wider text-indigo-400 ml-1">
                            Data limite para reembolso
                          </Label>
                          <DateField
                            value={linkedIncomeDate}
                            onChange={setLinkedIncomeDate}
                            className="h-12 rounded-xl text-sm text-indigo-600"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {newTransaction.type !== 'card_purchase' && (
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-[#16133F] px-5 h-16 rounded-2xl border border-slate-100 dark:border-[#201C56] shadow-sm flex-1">
                    <Label htmlFor="status-d" className="text-sm font-medium text-slate-500 dark:text-[#A8A4CC] cursor-pointer flex-1">
                      {newTransaction.type === 'income' ? 'Já recebido?' : 'Já pago?'}
                    </Label>
                    <ToggleSwitch
                      checked={newTransaction.status === 'actual'}
                      onChange={(checked) => setNewTransaction({ ...newTransaction, status: checked ? 'actual' : 'planned' })}
                    />
                  </div>
                )}
                </div>

                {editingTransaction?.linkedTransactionId && (
                  <div>
                    <p className="text-[10px] font-medium tracking-wider text-indigo-400 ml-1 mb-2">Lançamento vinculado</p>
                    {(() => {
                      const linked = transactions.find(t => t.id === editingTransaction.linkedTransactionId);
                      if (!linked) return <p className="text-xs font-normal text-slate-300 dark:text-[#6B679C] italic ml-1 font-heading">Lançamento original não encontrado</p>;
                      return (
                        <div
                          onClick={() => handleEditClick(linked)}
                          className="flex items-center justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/40 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#100E3D] shadow-sm flex items-center justify-center text-indigo-500">
                              {linked.type === 'income' ? <ArrowUpCircle size={16} strokeWidth={3} /> : <CreditCard size={16} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-normal text-slate-700 dark:text-[#EDEAF9] truncate">{linked.description}</p>
                              <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC]">R$ {linked.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-indigo-300 group-hover:translate-x-1 transition-transform" />
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="flex gap-3">
                  {editingTransaction && !editingTransaction.id.startsWith('bill-') && (
                    <Button 
                      onClick={() => {
                        setTransactionToDelete(editingTransaction);
                        setIsDeleteDialogOpen(true);
                      }}
                      variant="outline"
                      className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-500/10 border-none text-rose-400 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={24} />
                    </Button>
                  )}
                  <Button onClick={() => handleAddTransaction()} className="flex-1 h-16 rounded-full font-medium text-lg bg-primary text-white hover:bg-primary/90 transition-all active:scale-95">
                      Salvar lançamento
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom Navigation - Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-[#F6F4FD] dark:bg-[#0B0A2E] border-t border-slate-200/70 dark:border-white/10 flex items-center justify-around px-4 pt-3 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <MobileNavItem
          active={activeTab === 'visao-geral'}
          onClick={() => setActiveTab('visao-geral')}
          icon={<Home />}
        />
        <MobileNavItem
          active={activeTab === 'receitas' || activeTab === 'despesas'}
          onClick={() => setActiveTab('despesas')}
          icon={<ArrowUpDown />}
        />
        <button
          onClick={() => handleOpenRegistrar()}
          className="flex items-center justify-center h-12 w-12 rounded-full bg-primary text-white shadow-bubbly shrink-0 active:scale-90 transition-transform"
          aria-label="Nova movimentação"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
        <MobileNavItem
          active={activeTab === 'cartoes'}
          onClick={() => setActiveTab('cartoes')}
          icon={<CreditCard />}
        />
        <MobileNavItem
          active={activeTab === 'pessoas'}
          onClick={() => setActiveTab('pessoas')}
          icon={<Users />}
        />

        <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <DialogContent className="max-w-none w-screen h-[100dvh] top-0 bottom-0 left-0 right-0 rounded-none p-0 overflow-hidden border-none shadow-none flex flex-col bg-[#F6F4FD] dark:bg-[#0B0A2E] sm:top-0 sm:bottom-0 sm:left-0 sm:right-0 sm:w-screen sm:max-w-none sm:translate-x-0 sm:rounded-none">
            <div className="px-6 pt-6 pb-2 shrink-0">
              <DialogHeader className="sr-only">
                <DialogTitle>Minha conta</DialogTitle>
                <DialogDescription>{userProfile?.username ? `@${userProfile.username} · ` : ''}{user?.email}</DialogDescription>
              </DialogHeader>
              <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] mb-6">Minha conta</h1>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => profileImageInputRef.current?.click()}
                  className="relative w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white font-medium text-xl shrink-0 overflow-visible"
                  aria-label="Alterar foto de perfil"
                >
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                    {userProfile?.photoURL ? (
                      <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      (userProfile?.nickname || user?.email || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-secondary text-secondary-foreground border-2 border-white dark:border-[#100E3D] flex items-center justify-center shadow-sm">
                    <Camera size={11} />
                  </div>
                </button>
                <input
                  type="file"
                  ref={profileImageInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleProfileImageChange}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-[#EDE9E3] truncate">{userProfile?.nickname || user?.email?.split('@')[0] || 'Usuário'}</p>
                  <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC] truncate">
                    {userProfile?.username ? `@${userProfile.username} · ` : ''}{user?.email}
                  </p>
                </div>
                <button
                  onClick={handleOpenAccountEdit}
                  className="w-11 h-11 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0"
                  aria-label="Editar informações"
                >
                  <Pencil size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-10">
              <div className="max-w-2xl mx-auto w-full space-y-8">

                <AccountSection label="Gerenciamento">
                  <AccountRow
                    icon={<Settings size={18} />}
                    title="Categorias"
                    description="Personalize as categorias de receitas e despesas"
                    onClick={() => { setIsProfileOpen(false); setIsCategoriasOpen(true); }}
                  />
                  <AccountRow
                    icon={<Users size={18} />}
                    title="Pessoas"
                    description="Contatos para dividir gastos e ver o resumo de cada um"
                    onClick={() => { setIsProfileOpen(false); setIsPessoasSummaryOpen(true); }}
                  />
                </AccountSection>

                <AccountSection label="Dados">
                  <AccountRow
                    icon={<Database size={18} />}
                    title="Opções de dados"
                    description="Exportar lançamentos em CSV ou apagar tudo"
                    onClick={() => { setIsProfileOpen(false); setIsDataModalOpen(true); }}
                  />
                </AccountSection>

                <AccountSection label="Aplicativo">
                  <AccountRow
                    icon={darkMode ? <Moon size={18} /> : <Sun size={18} />}
                    title="Modo escuro"
                    description="Reduz o brilho da interface"
                    right={<ToggleSwitch checked={darkMode} onChange={setDarkMode} />}
                  />
                  <AccountRow
                    icon={<Smartphone size={18} />}
                    title="Instalar aplicativo"
                    description={isStandalone ? 'Já instalado neste dispositivo' : 'Acesse o Financeiro direto da tela inicial'}
                    onClick={handleInstallApp}
                    disabled={isStandalone}
                  />
                </AccountSection>

                <AccountSection>
                  <AccountRow
                    icon={<LogOut size={18} />}
                    title="Sair do aplicativo"
                    description="Encerra sua sessão neste dispositivo"
                    onClick={() => logout()}
                    danger
                    right={<></>}
                  />
                </AccountSection>

                <p className="text-[10px] font-normal text-slate-300 dark:text-[#6B679C] text-center">Feito com carinho, por edinho</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </nav>

      {/* iOS Install Instructions */}
      <Dialog open={showIOSInstallHelp} onOpenChange={setShowIOSInstallHelp}>
        <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
          <DialogHeader className="sr-only">
            <DialogTitle>Instalar no iPhone/iPad</DialogTitle>
            <DialogDescription>Passos para adicionar o app à tela de início</DialogDescription>
          </DialogHeader>
          <div className="p-7 space-y-6 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
              <Smartphone size={28} strokeWidth={2.5} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Instalar no iPhone/iPad</h1>
              <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">
                O iOS não permite instalar apps direto pelo navegador. Siga os passos:
              </p>
            </div>
            <div className="text-left space-y-3 bg-card rounded-[1.75rem] p-5 shadow-soft">
              <p className="text-sm font-normal text-slate-700 dark:text-[#EDEAF9]">1. Toque no ícone de compartilhar (□↑) na barra do Safari.</p>
              <p className="text-sm font-normal text-slate-700 dark:text-[#EDEAF9]">2. Escolha "Adicionar à Tela de Início".</p>
              <p className="text-sm font-normal text-slate-700 dark:text-[#EDEAF9]">3. Toque em "Adicionar" no canto superior direito.</p>
            </div>
            <button onClick={() => setShowIOSInstallHelp(false)} className="w-full h-14 rounded-full font-medium bg-primary text-white hover:bg-primary/90 transition-all active:scale-95">
              Entendi
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Edit Dialog */}
      <Dialog open={isAccountEditOpen} onOpenChange={setIsAccountEditOpen}>
        <DialogContent className="max-w-none sm:max-w-md rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E] max-h-[85vh] flex flex-col">
          <div className="p-6 pb-2 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Editar informações</DialogTitle>
              <DialogDescription className="font-normal text-sm text-slate-400 dark:text-[#8D89AC] mt-1">Atualize seus dados de conta</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Nome</Label>
                <Input
                  className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Sobrenome</Label>
                <Input
                  className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Usuário</Label>
              <div className="relative">
                <AtSign size={15} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 dark:text-[#6B679C]" />
                <Input
                  className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm pl-12 pr-6"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Apelido</Label>
              <Input
                placeholder="Como quer ser chamado no app"
                className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
              />
            </div>

            <div className="pt-4 space-y-3">
              <p className="text-xs font-medium tracking-widest text-slate-400 dark:text-[#8D89AC] ml-4">Trocar senha (opcional)</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Nova senha</Label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 dark:text-[#6B679C]" />
                  <Input
                    type={showEditPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm pl-12 pr-12"
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(v => !v)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] hover:text-primary transition-colors"
                  >
                    {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {editNewPassword && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-4">Confirmar nova senha</Label>
                  <Input
                    type={showEditPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="h-14 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 focus:bg-white dark:focus:bg-white/10 font-normal text-sm px-6"
                    value={editConfirmPassword}
                    onChange={(e) => setEditConfirmPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            {editError && (
              <p className="text-xs font-normal text-rose-500 bg-rose-50 rounded-2xl px-5 py-3">{editError}</p>
            )}
          </div>
          <div className="p-6 shrink-0 space-y-2">
            <button
              onClick={handleUpdateAccountInfo}
              disabled={editSubmitting}
              className="w-full h-14 rounded-full font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95"
            >
              Salvar alterações
            </button>
            <button onClick={() => setIsAccountEditOpen(false)} className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col fixed left-4 top-4 bottom-4 w-72 bg-card rounded-[3rem] shadow-bubbly p-8 z-50">
    <div className="flex items-center gap-4 mb-12 px-2 transition-transform hover:scale-105 duration-500">
      <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white shadow-bubbly">
        <Wallet size={26} strokeWidth={2.5} />
      </div>
      <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Financeiro</h1>
    </div>

      <nav className="space-y-2 flex-1">
          <NavItem
            active={activeTab === 'visao-geral'}
            onClick={() => { setActiveTab('visao-geral'); setSelectedCard(null); }}
            icon={<LayoutDashboard size={20} />}
            label="Resumo"
          />
          <NavItem
            active={activeTab === 'receitas'}
            onClick={() => { setActiveTab('receitas'); setSelectedCard(null); }}
            icon={<ArrowUpCircle size={20} />}
            label="Receitas"
          />
          <NavItem 
            active={activeTab === 'despesas'} 
            onClick={() => { setActiveTab('despesas'); setSelectedCard(null); }}
            icon={<ArrowDownCircle size={20} />}
            label="Despesas"
          />
          <NavItem 
            active={isPessoasSummaryOpen} 
            onClick={() => { setIsPessoasSummaryOpen(true); setIsProfileOpen(false); }}
            icon={<Users size={20} />}
            label="Pessoas"
          />
        </nav>

        <div className="mt-auto pt-6 flex flex-col gap-2">
          <button className="w-full flex items-center gap-3 p-2 rounded-[1.75rem] hover:bg-slate-50 dark:hover:bg-[#16133F] transition-colors group" onClick={() => setIsProfileOpen(true)}>
            <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-white font-medium text-lg shrink-0 overflow-hidden">
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (userProfile?.nickname || user?.email || 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 overflow-hidden text-left">
              <p className="text-sm font-medium text-slate-800 dark:text-[#EDE9E3] truncate tracking-tight">{userProfile?.nickname || user?.email?.split('@')[0] || 'Usuário'}</p>
              <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC] truncate tracking-tight">{user?.email}</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 pt-4 md:p-12 md:pt-12 max-w-7xl mx-auto w-full pb-48 md:pb-12 text-slate-400 dark:text-[#8D89AC]">
        <AnimatePresence mode="wait">
          {activeTab === 'visao-geral' && (
            <motion.div
              key="visao-geral"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8 pb-32"
            >
              <div className="hidden md:flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-3xl font-heading font-medium tracking-tighter text-slate-800 dark:text-[#EDE9E3]">
                    Olá, {userProfile?.nickname || 'de novo'} 👋
                  </h2>
                  <p className="text-slate-400 dark:text-[#8D89AC] font-normal text-sm mt-1 capitalize">{format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-white dark:bg-[#100E3D] px-1.5 py-1.5 rounded-full shadow-soft">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 text-primary transition-all active:scale-95" onClick={prevMonth}>
                      <ChevronLeft size={18} strokeWidth={3} />
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerMonth(format(currentDate, 'MM'));
                        setPickerYear(format(currentDate, 'yyyy'));
                        setIsMonthPickerOpen(true);
                      }}
                      className="text-sm font-normal text-center capitalize text-slate-700 dark:text-[#EDEAF9] font-heading tracking-tight px-2 hover:text-primary transition-colors whitespace-nowrap"
                    >
                      {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                    </button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 text-primary transition-all active:scale-95" onClick={nextMonth}>
                      <ChevronRight size={18} strokeWidth={3} />
                    </Button>
                  </div>
                  {!isSameMonth(currentDate, new Date()) && (
                    <button
                      type="button"
                      onClick={() => setCurrentDate(new Date())}
                      className="h-11 px-4 rounded-full bg-white dark:bg-[#100E3D] shadow-soft text-xs font-medium text-primary shrink-0"
                    >
                      Hoje
                    </button>
                  )}
                </div>
              </div>

              {/* Hero de saldo (mobile) — no estilo "Your Balance" da referência */}
              <div className="md:hidden space-y-5">
                {mobileTopHeader}

                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] tracking-tight capitalize">{format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}</p>
                  <h1 className="text-3xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] mt-1">Balanço do mês</h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {(() => {
                      const [intPart, decPart] = Math.abs(stats.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
                      return (
                        <p className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">
                          {stats.balance < 0 && '-'}R$ {intPart}<span className="text-slate-300 dark:text-[#5C5686]">,{decPart}</span>
                        </p>
                      );
                    })()}
                    <span className={cn(
                      "text-[11px] font-medium px-2.5 py-1 rounded-full",
                      stats.balance >= 0 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400"
                    )}>
                      {stats.balance >= 0 ? '↑ Positivo' : '↓ Negativo'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenRegistrar('income')}
                    className="flex-1 h-12 rounded-full bg-primary text-white font-medium text-sm flex items-center justify-center gap-1.5 shadow-bubbly active:scale-95 transition-transform"
                  >
                    <ArrowUpCircle size={16} strokeWidth={2.5} /> Receita
                  </button>
                  <button
                    onClick={() => handleOpenRegistrar('expense')}
                    className="flex-1 h-12 rounded-full bg-secondary text-secondary-foreground font-medium text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <ArrowDownCircle size={16} strokeWidth={2.5} /> Despesa
                  </button>
                </div>

                {people.filter(p => p.visible !== false).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] tracking-tight mb-3">Pessoas</p>
                    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
                      <button
                        onClick={() => setIsPessoasOpen(true)}
                        className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </button>
                      {people.filter(p => p.visible !== false).map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setIsPessoasSummaryOpen(true); setSelectedPersonId(p.id); }}
                          className="w-12 h-12 rounded-full overflow-hidden shrink-0 shadow-soft"
                        >
                          <img src={p.image || `https://picsum.photos/seed/${p.name}/100/100`} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const [ii, id] = stats.incomeActual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
                    const [ei, ed] = stats.expensesActual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
                    return (
                      <>
                        <div className="bg-secondary shadow-soft rounded-xl p-4">
                          <p className="text-sm font-normal text-emerald-600/70 dark:text-emerald-400/70 truncate">Receita</p>
                          <p className="text-2xl font-heading font-medium tracking-tighter text-emerald-600 dark:text-emerald-400 truncate mt-1">
                            R$ {ii}<span className="opacity-50 font-normal">,{id}</span>
                          </p>
                        </div>
                        <div className="bg-secondary shadow-soft rounded-xl p-4">
                          <p className="text-sm font-normal text-rose-500/70 dark:text-rose-400/70 truncate">Despesa</p>
                          <p className="text-2xl font-heading font-medium tracking-tighter text-rose-500 dark:text-rose-400 truncate mt-1">
                            R$ {ei}<span className="opacity-50 font-normal">,{ed}</span>
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Receitas confirmadas"
                  value={stats.incomeActual}
                  icon={<ArrowUpCircle />}
                  subValue={stats.incomePlanned > 0 ? `+ R$ ${stats.incomePlanned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} previstas` : undefined}
                />
                <StatCard
                  title="Despesas confirmadas"
                  value={stats.expensesActual}
                  icon={<ArrowDownCircle />}
                  subValue={stats.expensesPlanned > 0 ? `+ R$ ${stats.expensesPlanned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} previstas` : undefined}
                />
                <StatCard title="Saldo do mês" value={stats.balance} icon={<Wallet />} />
                <StatCard
                  title="Faturas em aberto"
                  value={stats.cardTotals.reduce((acc, c) => acc + c.total, 0)}
                  icon={<CreditCard />}
                  subValue={cards.length > 0 ? `${cards.length} cartão(ões)` : undefined}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <ShadcnCard className="lg:col-span-3 border-none shadow-soft rounded-[2rem] bg-white dark:bg-[#100E3D]">
                  <CardContent className="p-8">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-[#EDEAF9] mb-6">Receitas x despesas (últimos 6 meses)</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={evolutionData}>
                        <defs>
                          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#37D6A3" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#37D6A3" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FF6F61" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#FF6F61" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: '#A0947F' }} />
                        <YAxis hide />
                        <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                        <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#37D6A3" strokeWidth={3} fill="url(#colorReceitas)" />
                        <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#FF6F61" strokeWidth={3} fill="url(#colorDespesas)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </ShadcnCard>

                <ShadcnCard className="lg:col-span-2 border-none shadow-soft rounded-[2rem] bg-white dark:bg-[#100E3D]">
                  <CardContent className="p-8">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-[#EDEAF9] mb-6">Principais categorias</h3>
                    {chartData.length === 0 ? (
                      <p className="text-xs font-normal text-slate-300 dark:text-[#6B679C] py-16 text-center">Sem despesas neste mês.</p>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                              {chartData.map((entry, i) => (
                                <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-3 mt-4">
                          {[...chartData].sort((a, b) => b.value - a.value).slice(0, 5).map((cat, i) => (
                            <div key={cat.name} className="flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[chartData.findIndex(c => c.name === cat.name) % COLORS.length] }} />
                              <span className="text-xs font-normal text-slate-600 dark:text-[#C5C1E5] flex-1 truncate">{cat.name}</span>
                              <span className="text-xs font-medium text-slate-800 dark:text-[#EDE9E3] shrink-0">R$ {cat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </ShadcnCard>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-[#EDEAF9] mb-4 ml-2">Devedores do mês</h3>
                {(() => {
                  const debtors = people
                    .map(p => ({ person: p, charges: getPersonMonthlyCharges(p.id, currentDate) }))
                    .filter(d => d.charges.pendingTotal > 0)
                    .sort((a, b) => b.charges.pendingTotal - a.charges.pendingTotal);
                  if (debtors.length === 0) {
                    return (
                      <div className="bg-card rounded-[1.75rem] shadow-soft p-10 text-center">
                        <p className="text-xs font-normal text-slate-300 dark:text-[#6B679C]">Ninguém deve nada neste mês. 🎉</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {debtors.map(({ person, charges }) => (
                        <button
                          key={person.id}
                          onClick={() => { setIsPessoasSummaryOpen(true); setSelectedPersonId(person.id); }}
                          className="w-full flex items-center gap-3 bg-card rounded-full pl-2 pr-4 py-2 shadow-soft transition-transform active:scale-[0.99] text-left"
                        >
                          <img src={person.image || `https://picsum.photos/seed/${person.name}/100/100`} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                          <span className="flex-1 min-w-0 font-medium text-slate-700 dark:text-[#EDEAF9] text-sm truncate tracking-tight">{person.name}</span>
                          <span className="font-heading font-medium text-rose-400 text-base tracking-tighter shrink-0">R$ {charges.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <div
                            className="w-9 h-9 rounded-full bg-emerald-400 text-white flex items-center justify-center shrink-0"
                            onClick={(e) => { e.stopPropagation(); shareChargeOnWhatsApp(person, charges); }}
                          >
                            <MessageCircle size={14} strokeWidth={2.5} />
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-[#EDEAF9] mb-4 ml-2">Lançamentos recentes</h3>
                <div className="space-y-2">
                    {((groupedTransactions as Record<string, Transaction[]>)['Lançamentos Recentes'] || []).map(t => {
                      const person = people.find(p => p.id === t.payerPayee);
                      const card = cards.find(c => c.id === t.cardId);
                      return (
                        <div key={t.id}>
                          <TransactionItem
                            transaction={t}
                            personName={person?.name}
                            cardName={card?.name}
                            onClick={() => handleTransactionClick(t)}
                            onQuickConfirm={() => handleQuickConfirm(t)}
                          />
                        </div>
                      );
                    })}
                    {(!(groupedTransactions as Record<string, Transaction[]>)['Lançamentos Recentes'] || (groupedTransactions as Record<string, Transaction[]>)['Lançamentos Recentes'].length === 0) && (
                      <p className="p-10 text-center text-xs font-normal text-slate-300 dark:text-[#6B679C] bg-card rounded-3xl">Nenhum lançamento ainda.</p>
                    )}
                  </div>
              </div>
            </motion.div>
          )}
          {(activeTab === 'receitas' || activeTab === 'despesas') && (
            <motion.div 
              key="grouped-list"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6 pb-32"
            >
              <div className="md:hidden space-y-5">
                {mobileTopHeader}
                <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">
                  Movimentações
                </h1>
                <div className="flex items-center gap-5">
                  <button
                    onClick={() => setMovTab('movimentacoes')}
                    className={cn(
                      "text-base transition-colors",
                      movTab === 'movimentacoes' ? "font-medium text-slate-800 dark:text-[#EDE9E3]" : "font-normal text-slate-400 dark:text-[#6B679C]"
                    )}
                  >
                    Tudo
                  </button>
                  <button
                    onClick={() => setMovTab('apagar')}
                    className={cn(
                      "text-base transition-colors",
                      movTab === 'apagar' ? "font-medium text-slate-800 dark:text-[#EDE9E3]" : "font-normal text-slate-400 dark:text-[#6B679C]"
                    )}
                  >
                    A pagar
                  </button>
                  <button
                    onClick={() => setMovTab('areceber')}
                    className={cn(
                      "text-base transition-colors",
                      movTab === 'areceber' ? "font-medium text-slate-800 dark:text-[#EDE9E3]" : "font-normal text-slate-400 dark:text-[#6B679C]"
                    )}
                  >
                    A receber
                  </button>
                </div>

                {movTab === 'movimentacoes' && (
                  <div className="flex bg-slate-100 dark:bg-[#1C1852] p-1 rounded-full shadow-inner w-fit">
                    <button
                      onClick={() => setMovStatusFilter('all')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-medium transition-all",
                        movStatusFilter === 'all' ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC]"
                      )}
                    >
                      Tudo
                    </button>
                    <button
                      onClick={() => setMovStatusFilter('planned')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-medium transition-all",
                        movStatusFilter === 'planned' ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC]"
                      )}
                    >
                      Previsto
                    </button>
                    <button
                      onClick={() => setMovStatusFilter('actual')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-medium transition-all",
                        movStatusFilter === 'actual' ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC]"
                      )}
                    >
                      Pago
                    </button>
                  </div>
                )}

                <div className="relative">
                  <Search size={16} strokeWidth={2.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-[#6B679C]" />
                  <Input
                    placeholder="Buscar movimentações"
                    className="h-11 rounded-full border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm pl-11 shadow-sm"
                    value={movSearchQuery}
                    onChange={(e) => setMovSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="hidden md:flex md:items-center justify-between gap-6">
                <div className="flex items-center gap-2 flex-1 relative">
                  <div className="flex bg-slate-100 dark:bg-[#1C1852] p-1 rounded-full shadow-inner">
                    <button 
                      onClick={() => setTransactionFilter('all')}
                      className={cn(
                        "px-6 py-2.5 rounded-full text-xs font-medium transition-all",
                        transactionFilter === 'all' ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC] hover:text-slate-600 dark:hover:text-[#C5C1E5]"
                      )}
                    >
                      Todas
                    </button>
                    <button 
                      onClick={() => setTransactionFilter('pending')}
                      className={cn(
                        "px-6 py-2.5 rounded-full text-xs font-medium transition-all",
                        transactionFilter === 'pending' ? "bg-white dark:bg-[#100E3D] text-primary shadow-sm" : "text-slate-400 dark:text-[#8D89AC] hover:text-slate-600 dark:hover:text-[#C5C1E5]"
                      )}
                    >
                      Pendentes
                    </button>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger render={
                        <Button variant="outline" className="h-11 w-11 p-0 border-none bg-slate-100/50 dark:bg-[#1C1852]/50 hover:bg-slate-100 dark:hover:bg-[#1C1852] rounded-xl shadow-sm">
                          <LayoutDashboard size={18} strokeWidth={3} className="text-primary" />
                        </Button>
                      } />
                      <PopoverContent className="w-64 p-5 rounded-[2rem] border-none shadow-deep bg-white dark:bg-[#100E3D] z-50">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Agrupamento</Label>
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => setGroupMode('date')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                groupMode === 'date' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Agrupar por data
                            </button>
                            <button 
                              onClick={() => setGroupMode('category')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                groupMode === 'category' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Agrupar por categoria
                            </button>
                            <button 
                              onClick={() => setGroupMode('person')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                groupMode === 'person' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Agrupar por pessoa
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <Popover>
                      <PopoverTrigger render={
                        <Button variant="outline" className="h-11 w-11 p-0 border-none bg-slate-100/50 dark:bg-[#1C1852]/50 hover:bg-slate-100 dark:hover:bg-[#1C1852] rounded-xl shadow-sm">
                          <ArrowUpDown size={18} strokeWidth={3} className="text-primary" />
                        </Button>
                      } />
                      <PopoverContent className="w-64 p-5 rounded-[2rem] border-none shadow-deep bg-white dark:bg-[#100E3D] z-50">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Ordenamento</Label>
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => setSortMode('date')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                sortMode === 'date' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Por data (mais antigos primeiro)
                            </button>
                            <button 
                              onClick={() => setSortMode('min')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                sortMode === 'min' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Menor valor
                            </button>
                            <button 
                              onClick={() => setSortMode('max')}
                              className={cn(
                                "w-full py-3 px-4 rounded-xl text-xs font-normal text-left transition-all",
                                sortMode === 'max' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                              )}
                            >
                              Maior valor
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex-1 bg-white dark:bg-[#100E3D] px-6 py-4 rounded-[1.75rem] border border-white dark:border-[#100E3D] shadow-soft flex justify-between items-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/2 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125 duration-700"></div>
                  <div>
                    <p className="text-[9px] font-medium text-slate-400 dark:text-[#8D89AC] tracking-widest opacity-60">Total</p>
                    <p className={cn(
                      "text-lg font-heading font-bold tracking-tighter",
                      activeTab === 'receitas' ? "text-emerald-500" : "text-rose-400"
                    )}>
                      R$ {(activeTab === 'receitas' ? stats.incomeTotal : stats.expenseTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-px h-8 bg-slate-100 dark:bg-[#1C1852] mx-2" />
                  <div className="text-right">
                    <p className="text-[9px] font-medium text-slate-400 dark:text-[#8D89AC] tracking-widest opacity-60">Pendente</p>
                    <p className={cn(
                      "text-lg font-heading font-bold tracking-tighter",
                      activeTab === 'receitas' ? "text-emerald-500" : "text-rose-400"
                    )}>
                      R$ {(activeTab === 'receitas' ? stats.incomePlanned : stats.expensesPlanned).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Movimentações (mobile) — cards no estilo Transactions.png / Upcoming Bills.png */}
              <div className="md:hidden space-y-6">
                {movTab === 'movimentacoes' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary shadow-soft rounded-xl p-4">
                        <p className="text-sm font-normal text-emerald-600/70 dark:text-emerald-400/70 truncate">Receita</p>
                        {(() => {
                          const [i, d] = stats.incomeTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
                          return (
                            <p className="text-2xl font-heading font-medium tracking-tighter text-emerald-600 dark:text-emerald-400 truncate mt-1">
                              R$ {i}<span className="opacity-50 font-normal">,{d}</span>
                            </p>
                          );
                        })()}
                      </div>
                      <div className="bg-secondary shadow-soft rounded-xl p-4">
                        <p className="text-sm font-normal text-rose-500/70 dark:text-rose-400/70 truncate">Despesa</p>
                        {(() => {
                          const [i, d] = stats.expenseTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
                          return (
                            <p className="text-2xl font-heading font-medium tracking-tighter text-rose-500 dark:text-rose-400 truncate mt-1">
                              R$ {i}<span className="opacity-50 font-normal">,{d}</span>
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(() => {
                        const filtered = movimentacoesLists.all
                          .filter(t => movStatusFilter === 'all' ? true : t.status === movStatusFilter)
                          .filter(t => t.description.toLowerCase().includes(movSearchQuery.trim().toLowerCase()));
                        return filtered.length === 0 ? (
                          <p className="text-sm font-normal text-slate-300 dark:text-[#6B679C] text-center py-12">Nenhuma movimentação neste mês.</p>
                        ) : (
                          filtered.map(t => {
                            const person = people.find(p => p.id === t.payerPayee);
                            const card = cards.find(c => c.id === t.cardId);
                            return (
                              <div key={t.id}>
                                <TransactionItem
                                  transaction={t}
                                  personName={person?.name}
                                  cardName={card?.name}
                                  onClick={() => handleTransactionClick(t)}
                                  onQuickConfirm={() => handleQuickConfirm(t)}
                                />
                              </div>
                            );
                          })
                        );
                      })()}
                    </div>
                  </>
                )}

                {(movTab === 'apagar' || movTab === 'areceber') && (() => {
                  const list = (movTab === 'apagar' ? movimentacoesLists.aPagar : movimentacoesLists.aReceber)
                    .filter(t => t.description.toLowerCase().includes(movSearchQuery.trim().toLowerCase()));
                  return (
                    <div className="space-y-3">
                      {list.length === 0 ? (
                        <p className="text-sm font-normal text-slate-300 dark:text-[#6B679C] text-center py-12">
                          {movTab === 'apagar' ? 'Nada pendente para pagar neste mês.' : 'Nada pendente para receber neste mês.'}
                        </p>
                      ) : (
                        list.map(t => {
                          const category = categories.find(c => c.name === t.category);
                          const recurrenceLabel = t.installments
                            ? `${t.installments.current}/${t.installments.total}`
                            : t.recurrence === 'monthly' ? 'Mensal'
                            : t.recurrence === 'weekly' ? 'Semanal'
                            : t.recurrence === 'yearly' ? 'Anual'
                            : 'Único';
                          return (
                            <div key={t.id} className="bg-card rounded-[1.75rem] shadow-soft p-4 space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0"
                                    style={{ backgroundColor: category?.color || '#9C93BE' }}
                                  >
                                    {category?.icon || DEFAULT_CATEGORY_ICON}
                                  </div>
                                  <p className="text-base font-medium text-slate-800 dark:text-[#EDEAF9] tracking-tight truncate">{t.description}</p>
                                </div>
                                <p className={cn(
                                  "font-heading font-medium tracking-tighter whitespace-nowrap text-base shrink-0",
                                  movTab === 'apagar' ? "text-rose-400" : "text-emerald-500"
                                )}>
                                  R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className="flex items-center justify-between text-xs font-normal text-slate-400 dark:text-[#8D89AC] pl-1">
                                <span>{format(parseISO(t.date), 'dd/MM/yyyy')}</span>
                                <span>{recurrenceLabel}</span>
                                <span className="truncate max-w-[35%]">{t.category || 'Sem categoria'}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleQuickConfirm(t)}
                                className={cn(
                                  "w-full h-12 rounded-full font-medium text-sm active:scale-95 transition-all",
                                  movTab === 'apagar' ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                )}
                              >
                                {movTab === 'apagar' ? 'Pagar agora' : 'Receber agora'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="hidden md:block space-y-6">
              {Object.entries(groupedTransactions as Record<string, Transaction[]>).map(([date, items], groupIndex) => (
                <div key={date} className="space-y-4">
                  <div className={cn("flex items-center gap-3 ml-2 group", groupIndex > 0 && "md:hidden")}>
                    <div className="w-1.5 h-6 rounded-full bg-primary/20 group-hover:bg-primary transition-colors"></div>
                    <h3 className="text-sm font-medium tracking-tight text-slate-400 dark:text-[#8D89AC] lowercase first-letter:uppercase">
                      {sortMode !== 'date' || groupMode === 'category' || groupMode === 'person' || activeTab === 'visao-geral' ? date : format(parseISO(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h3>
                  </div>
                  <ShadcnCard className="border-none shadow-none md:shadow-soft rounded-[1.25rem] md:rounded-2xl overflow-visible md:overflow-hidden py-0 md:py-4 bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#100E3D]">
                    {/* Mobile: card list */}
                    <div className="md:hidden space-y-2">
                      {items.map(t => {
                        const person = people.find(p => p.id === t.payerPayee);
                        const card = cards.find(c => c.id === t.cardId);
                        return (
                          <div key={t.id}>
                            <TransactionItem
                              transaction={t}
                              personName={person?.name}
                              cardName={card?.name}
                              onClick={() => handleTransactionClick(t)}
                              onQuickConfirm={() => handleQuickConfirm(t)}
                              hideDate={groupMode === 'date'}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: table */}
                    <Table className="hidden md:table">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-slate-100 dark:border-[#201C56]">
                          <TableHead className="w-10 pl-6"></TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Data</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Descrição</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Categoria</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Pessoa</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Status</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] text-right pr-6">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(t => {
                          const person = people.find(p => p.id === t.payerPayee);
                          const card = cards.find(c => c.id === t.cardId);
                          const isBill = t.id.startsWith('bill-');
                          return (
                            <TableRow
                              key={t.id}
                              onClick={() => handleTransactionClick(t)}
                              className="cursor-pointer border-slate-50 dark:border-[#1C1852] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                            >
                              <TableCell className="pl-6">
                                {t.status === 'actual' ? (
                                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", t.type === 'income' ? "text-emerald-500" : "text-rose-400")}>
                                    <CheckCircle2 size={18} strokeWidth={3} />
                                  </div>
                                ) : !isBill && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleQuickConfirm(t); }}
                                    title={t.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}
                                    className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-[#2A2566] hover:border-primary hover:bg-primary/10 active:scale-90 transition-all flex items-center justify-center text-transparent hover:text-primary"
                                  >
                                    <CheckCircle2 size={14} strokeWidth={3} />
                                  </button>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-normal text-slate-400 dark:text-[#8D89AC]">{format(parseISO(t.date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="font-normal text-slate-700 dark:text-[#EDEAF9] max-w-xs truncate">
                                <span className="flex items-center gap-2">
                                  {t.description}
                                  {card && <Badge variant="outline" className="rounded-md text-[9px] border-none px-2 h-4 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-medium shrink-0">{card.name}</Badge>}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-normal text-slate-500 dark:text-[#A8A4CC]">{t.category}</TableCell>
                              <TableCell className="text-xs font-normal text-slate-500 dark:text-[#A8A4CC]">{person?.name || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  "rounded-md text-[9px] border-none px-2 h-5 font-medium",
                                  t.status === 'actual' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-[#1C1852] text-slate-400 dark:text-[#8D89AC]"
                                )}>
                                  {t.status === 'actual' ? 'Confirmado' : 'Planejado'}
                                </Badge>
                              </TableCell>
                              <TableCell className={cn(
                                "text-right font-bold font-heading tracking-tight pr-6",
                                t.type === 'income' ? "text-emerald-500" : "text-rose-400"
                              )}>
                                R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ShadcnCard>
                </div>
              ))}
              </div>

              <div className="md:hidden fixed bottom-24 right-6 z-30 flex items-center gap-0.5 bg-white dark:bg-[#100E3D] rounded-full p-1.5 shadow-bubbly">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-primary active:scale-90 transition-transform"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft size={16} strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickerMonth(format(currentDate, 'MM'));
                    setPickerYear(format(currentDate, 'yyyy'));
                    setIsMonthPickerOpen(true);
                  }}
                  className="px-1.5 text-[11px] font-medium text-slate-700 dark:text-[#EDEAF9] capitalize whitespace-nowrap"
                >
                  {format(currentDate, 'MMM yyyy', { locale: ptBR })}
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-primary active:scale-90 transition-transform"
                  aria-label="Próximo mês"
                >
                  <ChevronRight size={16} strokeWidth={3} />
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'cartoes' && (
            <motion.div 
              key="cartoes-list"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6 pb-32"
            >
              <div className="md:hidden space-y-5">
                {mobileTopHeader}
                {!showCardForm && (
                  <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Cartões</h1>
                )}
              </div>

              <div className="md:hidden space-y-6">
                {showCardForm ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setShowCardForm(false); setEditingCard(null); }}
                        className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5] shrink-0"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <h1 className="text-2xl font-heading font-normal text-slate-800 dark:text-[#EDE9E3] tracking-tighter truncate">
                        {editingCard ? 'Editar cartão' : 'Novo cartão'}
                      </h1>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Nome do cartão</Label>
                        <Input
                          placeholder="Ex: Nubank"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm shadow-sm"
                          value={newCardName || ''}
                          onChange={(e) => setNewCardName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Limite</Label>
                        <Input
                          placeholder="0,00"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-medium text-sm px-4 shadow-sm"
                          value={limitInput || ''}
                          onChange={(e) => setLimitInput(maskCurrency(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Fechamento</Label>
                        <Input
                          type="number"
                          placeholder="1"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm shadow-sm"
                          value={newCardClosingDay || ''}
                          onChange={(e) => setNewCardClosingDay(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Vencimento</Label>
                        <Input
                          type="number"
                          placeholder="10"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm shadow-sm"
                          value={newCardDueDay || ''}
                          onChange={(e) => setNewCardDueDay(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Visual do cartão</Label>
                      <div
                        className="rounded-[1.75rem] h-24 shadow-sm flex items-end p-4 transition-colors duration-300 relative overflow-hidden"
                        style={{ backgroundColor: newCardColor }}
                      >
                        <svg className="absolute -right-2 top-3 w-24 h-12 opacity-25" viewBox="0 0 100 50" fill="none">
                          <path d="M0 25 Q 12.5 8 25 25 T 50 25 T 75 25 T 100 25" stroke="white" strokeWidth="5" strokeLinecap="round" />
                        </svg>
                        <span className="text-white font-medium text-sm drop-shadow-sm truncate relative z-10">{newCardName || 'Novo cartão'}</span>
                      </div>
                      <div className="grid grid-cols-6 gap-2 bg-slate-50 dark:bg-[#16133F] p-3 rounded-2xl shadow-sm">
                        {CARD_COLOR_PRESETS.map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewCardColor(color)}
                            className={cn(
                              "aspect-square rounded-xl transition-all relative flex items-center justify-center",
                              newCardColor === color ? "ring-2 ring-offset-2 ring-primary scale-105" : "hover:scale-105 opacity-80 hover:opacity-100"
                            )}
                            style={{ backgroundColor: color }}
                          >
                            {newCardColor === color && <CheckCircle2 size={14} className="text-white drop-shadow" strokeWidth={3} />}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => colorInputRef.current?.click()}
                          className={cn(
                            "aspect-square rounded-xl border-2 border-dashed flex items-center justify-center transition-all",
                            !CARD_COLOR_PRESETS.includes(newCardColor) ? "border-primary text-primary ring-2 ring-offset-2 ring-primary" : "border-slate-200 dark:border-[#2A2566] text-slate-400 dark:text-[#8D89AC] hover:border-primary hover:text-primary"
                          )}
                          style={{ backgroundColor: !CARD_COLOR_PRESETS.includes(newCardColor) ? newCardColor : undefined }}
                        >
                          <Palette size={14} className={cn(!CARD_COLOR_PRESETS.includes(newCardColor) && "text-white")} />
                        </button>
                        <input type="color" ref={colorInputRef} className="sr-only" value={newCardColor} onChange={(e) => setNewCardColor(e.target.value)} />
                      </div>
                    </div>
                    <button onClick={handleAddCard} disabled={isSubmittingCard} className="w-full h-12 rounded-full font-medium bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60">
                      {editingCard ? 'Salvar alterações' : 'Adicionar cartão'}
                    </button>
                    {editingCard && (
                      <button
                        type="button"
                        onClick={() => setCardToDelete(editingCard)}
                        className="w-full h-12 rounded-full font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                        Excluir cartão
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      ref={cardsCarouselRef}
                      onScroll={handleCardsCarouselScroll}
                      className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-6 px-6 pb-1"
                    >
                      {cards.map(card => (
                        <div key={card.id} className="w-[280px] shrink-0 snap-center">
                          <div
                            onClick={() => setSelectedCard(card.id)}
                            role="button"
                            tabIndex={0}
                            className="rounded-[1.75rem] h-44 p-5 relative overflow-hidden flex flex-col justify-between shadow-bubbly cursor-pointer active:scale-[0.98] transition-transform"
                            style={{ backgroundColor: card.color }}
                          >
                            <svg className="absolute -right-3 top-10 w-40 h-16 opacity-20" viewBox="0 0 160 60" fill="none">
                              <path d="M0 30 Q 20 10 40 30 T 80 30 T 120 30 T 160 30" stroke="white" strokeWidth="6" strokeLinecap="round" />
                            </svg>
                            <div className="flex items-center justify-between relative z-10">
                              <span className="text-white font-medium text-sm drop-shadow-sm">{card.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCard(card);
                                  setNewCardName(card.name);
                                  setLimitInput(maskCurrency(String(card.limit * 100)));
                                  setNewCardClosingDay(String(card.closingDay));
                                  setNewCardDueDay(String(card.dueDay));
                                  setNewCardColor(card.color);
                                  setShowCardForm(true);
                                }}
                                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0"
                                aria-label="Editar cartão"
                              >
                                <Pencil size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                            <div className="relative z-10 space-y-2">
                              <p className="text-white/90 font-mono text-lg tracking-widest">•••• •••• •••• ••••</p>
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-[10px] tracking-wider">Limite</span>
                                <span className="text-white text-xs font-medium">R$ {card.limit.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-[10px] tracking-wider">Vencimento</span>
                                <span className="text-white text-xs font-medium">{card.dueDay ? `Dia ${card.dueDay}` : '—'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="w-[280px] shrink-0 snap-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCard(null);
                            setNewCardName('');
                            setLimitInput('0,00');
                            setNewCardClosingDay('');
                            setNewCardDueDay('');
                            setNewCardColor('#8A7FF5');
                            setShowCardForm(true);
                          }}
                          className="w-full h-44 rounded-[1.75rem] border-2 border-dashed border-slate-200 dark:border-[#2A2566] flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-[#8D89AC] hover:border-primary hover:text-primary transition-all"
                        >
                          <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-[#1C1852] flex items-center justify-center">
                            <Plus size={20} strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-medium">Adicionar cartão</span>
                        </button>
                      </div>
                    </div>

                    {cards.length > 1 && (
                      <div className="flex items-center justify-center gap-1.5 -mt-3">
                        {cards.map(card => (
                          <div
                            key={card.id}
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              (selectedCard || cards[0].id) === card.id ? "w-5 bg-primary" : "w-1.5 bg-slate-200 dark:bg-[#2A2566]"
                            )}
                          />
                        ))}
                      </div>
                    )}

                    {cards.length > 0 && (() => {
                      const activeCard = cards.find(c => c.id === selectedCard) || cards[0];
                      const selectedMonthKey = format(selectedBillDate, 'yyyy-MM');
                      const billTotal = cardBillItems.reduce((acc, t) => acc + t.amount, 0);
                      const billPaid = isCardBillPaid(activeCard.id, selectedBillDate);
                      return (
                        <>
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-2 tracking-widest">Evolução da fatura</p>
                            <div className="bg-card rounded-[1.75rem] shadow-soft p-5 pb-2 overflow-hidden">
                              <div ref={billChartScrollRef} className="overflow-x-auto scrollbar-hide" style={{ scrollBehavior: 'smooth' }}>
                                <ComposedChart key={`${activeCard.id}-${cardBillHistory.length}`} width={cardBillHistory.length * CHART_BAR_WIDTH} height={130} data={cardBillHistory}>
                                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: '#9C93BE' }} />
                                  <Bar
                                    dataKey="amount"
                                    radius={[8, 8, 8, 8]}
                                    cursor="pointer"
                                    onClick={(data: any) => setSelectedBillDate(parseISO(`${data.monthKey}-01`))}
                                  >
                                    {cardBillHistory.map(entry => (
                                      <Cell key={entry.monthKey} fill={activeCard.color} fillOpacity={entry.monthKey === selectedMonthKey ? 1 : 0.25} />
                                    ))}
                                  </Bar>
                                </ComposedChart>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between ml-2 gap-3">
                              <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] tracking-widest shrink-0">
                                Fatura de {format(selectedBillDate, "MMMM", { locale: ptBR })}
                              </p>
                              <button
                                type="button"
                                disabled={billPaid || cardBillItems.length === 0}
                                onClick={() => {
                                  const bill = computeCardBill(activeCard, selectedBillDate);
                                  setConfirmingTransaction(bill);
                                  setConfirmAmount(billTotal);
                                  setConfirmDate(format(new Date(), 'yyyy-MM-dd'));
                                }}
                                className={cn(
                                  "flex items-center gap-1.5 text-[11px] font-medium pl-2.5 pr-3 py-1.5 rounded-full shrink-0 transition-all",
                                  billPaid
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 active:scale-95"
                                )}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", billPaid ? "bg-emerald-500" : "bg-amber-500")} />
                                {billPaid ? 'Paga' : 'Em aberto'}
                              </button>
                            </div>
                            <p className="text-2xl font-heading font-medium tracking-tighter text-slate-800 dark:text-[#EDE9E3] ml-2">
                              R$ {billTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {cardBillItems.length === 0 ? (
                              <div className="bg-card rounded-[1.75rem] shadow-soft p-8 text-center">
                                <p className="text-sm font-normal text-slate-300 dark:text-[#6B679C]">Nenhuma compra nesta fatura.</p>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  {cardBillItems.map(t => (
                                    <div key={t.id}>
                                      <TransactionItem
                                        transaction={t}
                                        onClick={() => handleTransactionClick(t)}
                                        hideStatus
                                        categoryIcon={categories.find(c => c.name === t.category)?.icon || DEFAULT_CATEGORY_ICON}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {!billPaid && (
                                  <button
                                    onClick={() => {
                                      const bill = computeCardBill(activeCard, selectedBillDate);
                                      setConfirmingTransaction(bill);
                                      setConfirmAmount(billTotal);
                                      setConfirmDate(format(new Date(), 'yyyy-MM-dd'));
                                    }}
                                    className="w-full h-12 rounded-full bg-primary text-white font-medium text-sm active:scale-95 transition-all"
                                  >
                                    Pagar fatura
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>

              <div className="hidden md:block space-y-6">
              <div className="flex items-center gap-2 w-full overflow-hidden px-1">
                <div className="flex gap-2.5 items-center overflow-x-auto pb-2 pt-1 scrollbar-hide flex-1 relative fade-edge-x px-4 -mx-4">
                  <button
                    onClick={() => setSelectedCard(null)}
                    className={cn(
                      "px-5 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0",
                      !selectedCard ? "bg-primary text-white scale-105" : "bg-card text-slate-400 dark:text-[#8D89AC] hover:bg-slate-50 dark:hover:bg-[#16133F] shadow-soft"
                    )}
                  >
                    Meus Cartões
                  </button>
                  {cards.map(card => (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCard(card.id)}
                      className={cn(
                        "px-5 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0",
                        selectedCard === card.id ? "text-white scale-105" : "bg-card text-slate-400 dark:text-[#8D89AC] hover:bg-slate-50 dark:hover:bg-[#16133F] shadow-soft"
                      )}
                      style={{ 
                        backgroundColor: selectedCard === card.id ? card.color : undefined,
                        boxShadow: selectedCard === card.id ? `0 10px 15px -3px ${card.color}40` : undefined
                      }}
                    >
                      {card.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pl-2 shrink-0 border-l border-slate-100/50 dark:border-[#201C56]/50">
                  <Popover>
                    <PopoverTrigger render={
                      <Button variant="outline" className="h-10 w-10 p-0 border-none bg-slate-100/50 dark:bg-[#1C1852]/50 hover:bg-slate-100 dark:hover:bg-[#1C1852] rounded-xl transition-all active:scale-95">
                        <ArrowUpDown size={16} strokeWidth={3} className="text-primary" />
                      </Button>
                    } />
                    <PopoverContent className="w-64 p-5 rounded-[2rem] border-none shadow-deep bg-white dark:bg-[#100E3D] z-50">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Ordenamento</Label>
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => setSortMode('date')}
                            className={cn(
                              "w-full py-3.5 px-4 rounded-xl text-xs font-normal text-left transition-all",
                              sortMode === 'date' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                            )}
                          >
                            Por data (mais antigos primeiro)
                          </button>
                          <button 
                            onClick={() => setSortMode('min')}
                            className={cn(
                              "w-full py-3.5 px-4 rounded-xl text-xs font-normal text-left transition-all",
                              sortMode === 'min' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                            )}
                          >
                            Menor valor
                          </button>
                          <button 
                            onClick={() => setSortMode('max')}
                            className={cn(
                              "w-full py-3.5 px-4 rounded-xl text-xs font-normal text-left transition-all",
                              sortMode === 'max' ? "bg-primary/10 text-primary" : "text-slate-600 dark:text-[#C5C1E5] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                            )}
                          >
                            Maior valor
                          </button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {Object.entries(groupedTransactions as Record<string, Transaction[]>).map(([date, items], groupIndex) => (
                <div key={date} className="space-y-3">
                  <h3 className={cn("text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-2", groupIndex > 0 && "md:hidden")}>
                    {sortMode !== 'date' || groupMode === 'category' || groupMode === 'person' ? date : format(parseISO(date), "dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <ShadcnCard className="border-none shadow-none md:shadow-sm rounded-[1.25rem] md:rounded-2xl overflow-visible md:overflow-hidden py-0 md:py-4 bg-transparent md:bg-card">
                    {/* Mobile: card list */}
                    <div className="md:hidden space-y-2">
                      {items.map(t => {
                        const person = people.find(p => p.id === t.payerPayee);
                        const card = cards.find(c => c.id === t.cardId);
                        return (
                          <div key={t.id}>
                            <TransactionItem
                              transaction={t}
                              personName={person?.name}
                              cardName={card?.name}
                              onClick={() => handleTransactionClick(t)}
                              onQuickConfirm={() => handleQuickConfirm(t)}
                              hideDate={groupMode === 'date'}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: table */}
                    <Table className="hidden md:table">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-slate-100 dark:border-[#201C56]">
                          <TableHead className="w-10 pl-6"></TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Data</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Descrição</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Categoria</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Cartão</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC]">Pessoa</TableHead>
                          <TableHead className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] text-right pr-6">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(t => {
                          const person = people.find(p => p.id === t.payerPayee);
                          const card = cards.find(c => c.id === t.cardId);
                          return (
                            <TableRow
                              key={t.id}
                              onClick={() => handleTransactionClick(t)}
                              className="cursor-pointer border-slate-50 dark:border-[#1C1852] hover:bg-slate-50 dark:hover:bg-[#16133F]"
                            >
                              <TableCell className="pl-6">
                                {t.status === 'actual' ? (
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-rose-400">
                                    <CheckCircle2 size={18} strokeWidth={3} />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleQuickConfirm(t); }}
                                    title="Marcar como pago"
                                    className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-[#2A2566] hover:border-primary hover:bg-primary/10 active:scale-90 transition-all flex items-center justify-center text-transparent hover:text-primary"
                                  >
                                    <CheckCircle2 size={14} strokeWidth={3} />
                                  </button>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-normal text-slate-400 dark:text-[#8D89AC]">{format(parseISO(t.date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="font-normal text-slate-700 dark:text-[#EDEAF9] max-w-xs truncate">{t.description}</TableCell>
                              <TableCell className="text-xs font-normal text-slate-500 dark:text-[#A8A4CC]">{t.category}</TableCell>
                              <TableCell className="text-xs font-normal text-slate-500 dark:text-[#A8A4CC]">
                                {card && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: card.color }} />
                                    {card.name}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-normal text-slate-500 dark:text-[#A8A4CC]">{person?.name || '—'}</TableCell>
                              <TableCell className="text-right font-bold font-heading tracking-tight text-rose-400 pr-6">
                                R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ShadcnCard>
                </div>
              ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'pessoas' && (
            <motion.div
              key="pessoas-list"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6 pb-32"
            >
              <div className="md:hidden space-y-5">
                {mobileTopHeader}
                {!showPersonForm && (
                  <h1 className="text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Pessoas</h1>
                )}
              </div>

              <div className="md:hidden space-y-6">
                {showPersonForm ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setShowPersonForm(false); handleCancelEditPerson(); }}
                        className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5] shrink-0"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <h1 className="text-2xl font-heading font-normal text-slate-800 dark:text-[#EDE9E3] tracking-tighter truncate">
                        {editingPerson ? 'Editar pessoa' : 'Nova pessoa'}
                      </h1>
                    </div>
                    <div className="flex gap-4 items-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-[#16133F] border-2 border-dashed border-slate-200 dark:border-[#2A2566] flex items-center justify-center overflow-hidden hover:border-primary transition-all group shrink-0"
                      >
                        {newPersonImage ? (
                          <img src={newPersonImage} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Users size={28} className="text-slate-300 dark:text-[#6B679C] group-hover:text-primary" />
                        )}
                      </button>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Nome</Label>
                        <Input
                          placeholder="Ex: Edson"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm shadow-sm"
                          value={newPersonName || ''}
                          onChange={(e) => setNewPersonName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">E-mail</Label>
                        <Input
                          placeholder="contato@edson.com"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-xs px-4 shadow-sm"
                          value={newPersonEmail || ''}
                          onChange={(e) => setNewPersonEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Telefone</Label>
                        <Input
                          placeholder="(00) 00000-0000"
                          className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-xs px-4 shadow-sm"
                          value={newPersonPhone || ''}
                          onChange={(e) => setNewPersonPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 relative">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Vincular a um usuário do app (opcional)</Label>
                      {personLinkSelected ? (
                        <div className="h-11 rounded-xl bg-slate-50 dark:bg-[#16133F] shadow-sm flex items-center justify-between px-4">
                          <span className="flex items-center gap-2 font-normal text-sm text-primary">
                            <UserCheck size={16} />
                            @{personLinkSelected.username}
                          </span>
                          <button type="button" onClick={() => { setPersonLinkSelected(null); setPersonLinkQuery(''); }} className="text-slate-300 dark:text-[#6B679C] hover:text-rose-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] font-medium text-sm pointer-events-none">@</span>
                          <Input
                            placeholder="usuario"
                            className="h-11 rounded-xl border-none bg-slate-50 dark:bg-[#16133F] font-normal text-sm pl-8 pr-4 shadow-sm"
                            value={personLinkQuery}
                            onChange={(e) => setPersonLinkQuery(e.target.value.replace(/^@+/, ''))}
                          />
                        </div>
                      )}
                      {!personLinkSelected && personLinkQuery.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#100E3D] rounded-2xl shadow-deep border border-slate-50 dark:border-[#1C1852] z-20 overflow-hidden max-h-48 overflow-y-auto">
                          {personLinkSearching && (
                            <p className="p-4 text-xs font-normal text-slate-300 dark:text-[#6B679C] text-center">Buscando...</p>
                          )}
                          {!personLinkSearching && personLinkResults.length === 0 && (
                            <p className="p-4 text-xs font-normal text-slate-300 dark:text-[#6B679C] text-center">Nenhum usuário encontrado.</p>
                          )}
                          {personLinkResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setPersonLinkSelected(p); setPersonLinkQuery(''); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#16133F] text-left"
                            >
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs shrink-0">
                                {(p.firstName || p.username || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700 dark:text-[#EDEAF9] truncate">{[p.firstName, p.lastName].filter(Boolean).join(' ') || p.nickname}</p>
                                <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] truncate">@{p.username}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => { await handleAddPerson(); setShowPersonForm(false); }}
                      className="w-full h-12 rounded-full font-medium bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      {editingPerson ? 'Salvar alterações' : 'Adicionar pessoa'}
                    </button>
                    {editingPerson && (
                      <button
                        type="button"
                        onClick={() => setPersonToDelete(editingPerson)}
                        className="w-full h-12 rounded-full font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                        Excluir pessoa
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      ref={peopleCarouselRef}
                      onScroll={handlePeopleCarouselScroll}
                      className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-6 px-6 pb-1"
                    >
                      {people.map(person => {
                        const monthCharges = getPersonMonthlyCharges(person.id, currentDate);
                        const identityLine = personLinkSelected && editingPerson?.id === person.id
                          ? `@${personLinkSelected.username}`
                          : person.linkedUserId ? '@vinculado' : (person.email || person.phone || '');
                        return (
                          <div key={person.id} className="w-[280px] shrink-0 snap-center">
                            <div
                              onClick={() => setSelectedPersonId(person.id)}
                              role="button"
                              tabIndex={0}
                              className="rounded-[1.75rem] h-44 p-5 relative overflow-hidden flex flex-col justify-between shadow-bubbly cursor-pointer active:scale-[0.98] transition-transform"
                              style={{ backgroundColor: getPersonColor(person.id) }}
                            >
                              <svg className="absolute -right-3 top-10 w-40 h-16 opacity-20" viewBox="0 0 160 60" fill="none">
                                <path d="M0 30 Q 20 10 40 30 T 80 30 T 120 30 T 160 30" stroke="white" strokeWidth="6" strokeLinecap="round" />
                              </svg>
                              <div className="flex items-center justify-between relative z-10 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-medium text-xs shrink-0 overflow-hidden">
                                    {person.image ? (
                                      <img src={person.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      person.name.charAt(0).toUpperCase()
                                    )}
                                  </div>
                                  <span className="text-white font-medium text-sm drop-shadow-sm truncate">{person.name}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleEditPersonClick(person); setShowPersonForm(true); }}
                                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0"
                                  aria-label="Editar pessoa"
                                >
                                  <Pencil size={14} strokeWidth={2.5} />
                                </button>
                              </div>
                              <div className="relative z-10 space-y-2">
                                <p className="text-white/90 text-sm truncate h-[1.75rem] flex items-center">{identityLine}</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-white/70 text-[10px] tracking-wider">Pendente</span>
                                  <span className="text-white text-xs font-medium">R$ {monthCharges.pendingTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-white/70 text-[10px] tracking-wider">Pago</span>
                                  <span className="text-white text-xs font-medium">R$ {monthCharges.paidTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="w-[280px] shrink-0 snap-center">
                        <button
                          type="button"
                          onClick={() => { handleCancelEditPerson(); setShowPersonForm(true); }}
                          className="w-full h-44 rounded-[1.75rem] border-2 border-dashed border-slate-200 dark:border-[#2A2566] flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-[#8D89AC] hover:border-primary hover:text-primary transition-all"
                        >
                          <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-[#1C1852] flex items-center justify-center">
                            <Plus size={20} strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-medium">Adicionar pessoa</span>
                        </button>
                      </div>
                    </div>

                    {people.length > 1 && (
                      <div className="flex items-center justify-center gap-1.5 -mt-3">
                        {people.map(person => (
                          <div
                            key={person.id}
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              (selectedPersonId || people[0].id) === person.id ? "w-5 bg-primary" : "w-1.5 bg-slate-200 dark:bg-[#2A2566]"
                            )}
                          />
                        ))}
                      </div>
                    )}

                    {people.length > 0 && (() => {
                      const activePerson = people.find(p => p.id === selectedPersonId) || people[0];
                      const selectedMonthKey = format(selectedChargeDate, 'yyyy-MM');
                      const charges = getPersonMonthlyCharges(activePerson.id, selectedChargeDate);
                      const personColor = getPersonColor(activePerson.id);
                      return (
                        <>
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] ml-2 tracking-widest">Evolução</p>
                            <div className="bg-card rounded-[1.75rem] shadow-soft p-5 pb-2 overflow-hidden">
                              <div ref={personChargeScrollRef} className="overflow-x-auto scrollbar-hide" style={{ scrollBehavior: 'smooth' }}>
                                <ComposedChart key={`${activePerson.id}-${personChargeHistory.length}`} width={personChargeHistory.length * CHART_BAR_WIDTH} height={130} data={personChargeHistory}>
                                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: '#9C93BE' }} />
                                  <Bar
                                    dataKey="amount"
                                    radius={[8, 8, 8, 8]}
                                    cursor="pointer"
                                    onClick={(data: any) => setSelectedChargeDate(parseISO(`${data.monthKey}-01`))}
                                  >
                                    {personChargeHistory.map(entry => (
                                      <Cell key={entry.monthKey} fill={personColor} fillOpacity={entry.monthKey === selectedMonthKey ? 1 : 0.25} />
                                    ))}
                                  </Bar>
                                </ComposedChart>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between ml-2 gap-3">
                              <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] tracking-widest shrink-0">
                                Pendências de {format(selectedChargeDate, "MMMM", { locale: ptBR })}
                              </p>
                              <button
                                type="button"
                                disabled={charges.items.length === 0}
                                onClick={() => shareChargeOnWhatsApp(activePerson, charges)}
                                className={cn(
                                  "flex items-center gap-1.5 text-[11px] font-medium pl-2.5 pr-3 py-1.5 rounded-full shrink-0 transition-all",
                                  charges.pendingTotal === 0
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 active:scale-95"
                                )}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", charges.pendingTotal === 0 ? "bg-emerald-500" : "bg-amber-500")} />
                                {charges.pendingTotal === 0 ? 'Em dia' : 'Pendente'}
                              </button>
                            </div>
                            <p className="text-2xl font-heading font-medium tracking-tighter text-slate-800 dark:text-[#EDE9E3] ml-2">
                              R$ {charges.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {charges.items.length === 0 ? (
                              <div className="bg-card rounded-[1.75rem] shadow-soft p-8 text-center">
                                <p className="text-sm font-normal text-slate-300 dark:text-[#6B679C]">Nenhuma despesa neste mês.</p>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  {charges.items.map(t => (
                                    <div key={t.id}>
                                      <TransactionItem
                                        transaction={t}
                                        onClick={() => handleTransactionClick(t)}
                                        hideStatus
                                        categoryIcon={categories.find(c => c.name === t.category)?.icon || DEFAULT_CATEGORY_ICON}
                                      />
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => shareChargeOnWhatsApp(activePerson, charges)}
                                  disabled={charges.items.length === 0}
                                  className="w-full h-12 rounded-full bg-primary text-white font-medium text-sm active:scale-95 transition-all disabled:opacity-40"
                                >
                                  Cobrar no WhatsApp
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>

              <div className="hidden md:block space-y-6">
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC]">
                  Use o menu lateral "Pessoas" para gerenciar contatos no desktop.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Pessoas Management Modal */}
      <Dialog open={isPessoasOpen} onOpenChange={(open) => { setIsPessoasOpen(open); if (!open) handleCancelEditPerson(); }}>
        <DialogContent className="max-w-none w-full h-[100dvh] top-0 bottom-0 left-0 right-0 rounded-none overflow-hidden flex flex-col p-0 border-none shadow-deep z-[60] bg-[#F6F4FD] dark:bg-[#0B0A2E] sm:top-0 sm:bottom-0 sm:right-0 sm:left-auto sm:translate-x-0 sm:w-full sm:max-w-md sm:h-screen sm:rounded-l-[1.75rem] sm:rounded-r-none">
          <div className="p-8 bg-white dark:bg-[#100E3D] flex flex-col h-full overflow-hidden">
            <DialogHeader className="shrink-0 mb-6">
              <DialogTitle className="text-3xl font-heading font-normal text-slate-800 dark:text-[#EDE9E3] tracking-tighter">Pessoas</DialogTitle>
              <DialogDescription className="font-normal text-sm text-slate-500 dark:text-[#A8A4CC] tracking-tight mt-1">Sua rede de contatos</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 -mx-2 px-2 overflow-y-auto">
              <div className="space-y-8 pr-2 pb-10">
                <div className="space-y-5 p-6 bg-slate-50 dark:bg-[#16133F] rounded-[2rem] border-none shadow-inner">
                  {editingPerson && (
                    <div className="flex items-center justify-between bg-primary/10 text-primary text-xs font-medium rounded-xl px-4 py-2.5">
                      <span>Editando "{editingPerson.name}"</span>
                      <button type="button" onClick={handleCancelEditPerson} className="hover:text-primary/70">
                        Cancelar
                      </button>
                    </div>
                  )}
                  <div className="flex gap-6 items-center">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 rounded-3xl bg-white dark:bg-[#100E3D] border-2 border-dashed border-slate-200 dark:border-[#2A2566] flex items-center justify-center overflow-hidden hover:border-primary transition-all group shrink-0 shadow-sm"
                    >
                      {newPersonImage ? (
                        <img src={newPersonImage} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Users size={32} className="text-slate-300 dark:text-[#6B679C] group-hover:text-primary" />
                      )}
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleImageChange} 
                    />
                    <div className="flex-1 space-y-2">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Nome</Label>
                      <Input 
                        placeholder="Ex: Edson" 
                        className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm px-5"
                        value={newPersonName || ''}
                        onChange={(e) => setNewPersonName(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">E-mail</Label>
                      <Input 
                        placeholder="contato@edson.com" 
                        className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-medium text-xs px-5 shadow-sm"
                        value={newPersonEmail || ''}
                        onChange={(e) => setNewPersonEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Telefone</Label>
                      <Input 
                        placeholder="(00) 00000-0000" 
                        className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-medium text-xs px-5 shadow-sm"
                        value={newPersonPhone || ''}
                        onChange={(e) => setNewPersonPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    <Label className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Vincular a um usuário do app (opcional)</Label>
                    {personLinkSelected ? (
                      <div className="h-12 rounded-2xl bg-white dark:bg-[#100E3D] shadow-sm flex items-center justify-between px-5">
                        <span className="flex items-center gap-2 font-normal text-sm text-primary">
                          <UserCheck size={16} />
                          @{personLinkSelected.username}
                        </span>
                        <button type="button" onClick={() => { setPersonLinkSelected(null); setPersonLinkQuery(''); }} className="text-slate-300 dark:text-[#6B679C] hover:text-rose-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8D89AC] font-medium text-sm pointer-events-none">@</span>
                        <Input
                          placeholder="usuario"
                          className="h-12 rounded-2xl border-none bg-white dark:bg-[#100E3D] font-normal text-sm pl-9 pr-5 shadow-sm"
                          value={personLinkQuery}
                          onChange={(e) => setPersonLinkQuery(e.target.value.replace(/^@+/, ''))}
                        />
                      </div>
                    )}
                    {!personLinkSelected && personLinkQuery.trim() && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#100E3D] rounded-2xl shadow-deep border border-slate-50 dark:border-[#1C1852] z-20 overflow-hidden max-h-48 overflow-y-auto">
                        {personLinkSearching && (
                          <p className="p-4 text-xs font-normal text-slate-300 dark:text-[#6B679C] text-center">Buscando...</p>
                        )}
                        {!personLinkSearching && personLinkResults.length === 0 && (
                          <p className="p-4 text-xs font-normal text-slate-300 dark:text-[#6B679C] text-center">Nenhum usuário encontrado.</p>
                        )}
                        {personLinkResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setPersonLinkSelected(p); setPersonLinkQuery(''); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#16133F] text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs shrink-0">
                              {(p.firstName || p.username || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-[#EDEAF9] truncate">{[p.firstName, p.lastName].filter(Boolean).join(' ') || p.nickname}</p>
                              <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] truncate">@{p.username}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleAddPerson} className="w-full h-14 rounded-full font-medium text-base bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all">
                    {editingPerson ? <Settings size={20} className="mr-2" strokeWidth={3} /> : <Plus size={20} className="mr-2" strokeWidth={4} />}
                    {editingPerson ? 'Salvar alterações' : 'Adicionar Pessoa'}
                  </Button>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-medium tracking-wider text-slate-400 dark:text-[#8D89AC] ml-1">Pessoas cadastradas ({people.length})</p>
                  <div className="grid grid-cols-1 gap-3">
                    {people.map(p => (
                      <div key={p.id} className="flex items-center gap-4 p-4 bg-white dark:bg-[#100E3D] rounded-2xl border border-slate-50 dark:border-[#1C1852] shadow-soft group hover:bg-slate-50 dark:hover:bg-[#16133F] transition-colors">
                        <img src={p.image} alt="" className="w-12 h-12 rounded-2xl object-cover shadow-sm transition-transform group-hover:scale-105" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 dark:text-[#EDE9E3] text-sm truncate flex items-center gap-1.5">
                            {p.name}
                            {p.linkedUserId && <UserCheck size={12} className="text-primary shrink-0" />}
                          </p>
                          <p className="text-[10px] font-normal text-slate-400 dark:text-[#8D89AC] truncate tracking-tight">{p.email || 'Sem e-mail'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTogglePersonVisibility(p)}
                            className={cn(
                              "h-10 px-3 rounded-xl text-[9px] font-medium transition-all flex flex-col items-center justify-center gap-0.5 shrink-0",
                              p.visible !== false ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20" : "bg-slate-100 dark:bg-[#1C1852] text-slate-400 dark:text-[#8D89AC] border border-slate-200 dark:border-[#2A2566]"
                            )}
                          >
                            <div className={cn("w-1.5 h-1.5 rounded-full", p.visible !== false ? "bg-emerald-500" : "bg-slate-400 dark:bg-[#555555]")} />
                            {p.visible !== false ? 'Visível' : 'Oculto'}
                          </button>
                          <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 dark:text-[#6B679C] hover:text-primary rounded-xl transition-all" onClick={() => handleEditPersonClick(p)}>
                            <Settings size={14} strokeWidth={2.5} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-200 dark:text-[#5C5686] hover:text-rose-400 hover:bg-rose-50 rounded-xl transition-all" onClick={() => setPersonToDelete(p)}>
                            <Trash2 size={16} strokeWidth={2.5} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pessoas Modal */}
      <Dialog open={isPessoasSummaryOpen} onOpenChange={(open) => {
        setIsPessoasSummaryOpen(open);
        if (!open) setSelectedPersonId(null);
      }}>
        <DialogContent className="max-w-none w-full h-[100dvh] top-0 bottom-0 left-0 right-0 rounded-none p-0 border-none shadow-deep overflow-hidden flex flex-col bg-[#F6F4FD] dark:bg-[#0B0A2E] sm:top-auto sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-4xl sm:h-auto sm:max-h-[85vh] sm:rounded-3xl">
          <div className="p-6 md:p-8 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              {selectedPersonId && (
                <button
                  className="w-11 h-11 rounded-full border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-[#C5C1E5] shrink-0"
                  onClick={() => setSelectedPersonId(null)}
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="min-w-0">
                <DialogTitle className="text-3xl md:text-4xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] leading-none truncate">
                  {selectedPersonId ? people.find(p => p.id === selectedPersonId)?.name : 'Pessoas'}
                </DialogTitle>
                <p className="text-sm font-normal text-slate-500 dark:text-[#A8A4CC] mt-1.5 capitalize">
                  {selectedPersonId ? format(currentDate, "MMMM 'de' yyyy", { locale: ptBR }) : `Pendências de ${format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}`}
                </p>
              </div>
            </div>
            {!selectedPersonId && (
              <button
                onClick={() => setIsPessoasOpen(true)}
                className="w-11 h-11 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0"
                aria-label="Gerenciar pessoas"
              >
                <Users size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-hide">
            {!selectedPersonId ? (
              <div className="space-y-2 max-w-2xl mx-auto">
                {people.length === 0 && (
                  <p className="text-sm font-normal text-slate-300 dark:text-[#6B679C] text-center py-12">Nenhuma pessoa cadastrada ainda.</p>
                )}
                {people.map(p => {
                  const charges = getPersonMonthlyCharges(p.id, currentDate);
                  return (
                    <div key={p.id} className="bg-card rounded-full pl-2 pr-2 py-2 shadow-soft flex items-center gap-3">
                      <button
                        onClick={() => setSelectedPersonId(p.id)}
                        className="flex-1 min-w-0 text-left flex items-center gap-3"
                      >
                        <div className="w-11 h-11 rounded-full overflow-hidden shrink-0">
                          <img src={p.image || `https://picsum.photos/seed/${p.name}/200/200`} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-[#EDEAF9] truncate tracking-tight flex items-center gap-1.5">
                            {p.name}
                            {p.linkedUserId && <UserCheck size={12} className="text-primary shrink-0" />}
                          </p>
                          <p className={cn(
                            "text-xs font-normal tracking-tight",
                            charges.pendingTotal > 0 ? "text-rose-400" : "text-emerald-500"
                          )}>
                            {charges.pendingTotal > 0
                              ? `Deve R$ ${charges.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : 'Sem pendências'}
                          </p>
                        </div>
                      </button>
                      {charges.pendingTotal > 0 ? (
                        <button
                          onClick={() => shareChargeOnWhatsApp(p, charges)}
                          className="w-11 h-11 rounded-full bg-emerald-400 text-white flex items-center justify-center shrink-0"
                          aria-label="Cobrar no WhatsApp"
                        >
                          <MessageCircle size={16} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedPersonId(p.id)}
                          className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 dark:text-[#6B679C] shrink-0"
                          aria-label="Ver detalhes"
                        >
                          <ChevronRight size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (() => {
              const p = people.find(p => p.id === selectedPersonId)!;
              const charges = getPersonMonthlyCharges(p.id, currentDate);

              return (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="flex items-center gap-5 bg-card p-6 rounded-[2rem] shadow-soft">
                    <div className="w-16 h-16 rounded-full overflow-hidden shrink-0">
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC]">Total do mês</p>
                      <p className={cn("text-3xl font-heading font-medium tracking-tighter", charges.pendingTotal > 0 ? "text-rose-400" : "text-emerald-500")}>
                        R$ {charges.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {charges.paidTotal > 0 && (
                        <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC] mt-0.5">
                          + R$ {charges.paidTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} já confirmado
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-400 dark:text-[#8D89AC] px-2 tracking-widest">Despesas do mês ({charges.items.length})</p>
                    {charges.items.length > 0 ? (
                      charges.items.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 bg-card rounded-full pl-3 pr-4 py-3 shadow-soft">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-sm font-medium text-slate-800 dark:text-[#EDEAF9] truncate tracking-tight">{t.description}</p>
                            <p className="text-xs font-normal text-slate-400 dark:text-[#8D89AC] mt-0.5">{format(parseISO(t.date), 'dd/MM/yyyy')} · {t.category}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className={cn(
                              "rounded-md text-[8px] border-none px-2 leading-none h-4 font-medium",
                              t.status === 'actual' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-[#1C1852] text-slate-400 dark:text-[#8D89AC]"
                            )}>
                              {t.status === 'actual' ? 'Pago' : 'Pendente'}
                            </Badge>
                            <p className="text-base font-heading font-medium tracking-tighter text-rose-400 whitespace-nowrap">
                              R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center">
                        <p className="text-slate-300 dark:text-[#6B679C] font-normal italic text-sm">Nenhuma despesa vinculada a {p.name.split(' ')[0]} neste mês.</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => shareChargeOnWhatsApp(p, charges)}
                    disabled={charges.items.length === 0}
                    className="w-full h-14 rounded-full bg-emerald-400 hover:bg-emerald-500 text-white font-medium gap-2 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                  >
                    <MessageCircle size={18} />
                    Cobrar no WhatsApp
                  </button>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
        {/* Alert Popup */}
        <Dialog open={alertConfig.open} onOpenChange={(open) => setAlertConfig({ ...alertConfig, open })}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <Info size={28} strokeWidth={2.5} />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">{alertConfig.title}</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">{alertConfig.message}</p>
              </div>
              <button onClick={() => setAlertConfig({ ...alertConfig, open: false })} className="w-full h-14 rounded-full font-medium bg-primary text-white hover:bg-primary/90 transition-all active:scale-95">
                Entendi
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Transaction Modal */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <Trash2 size={28} strokeWidth={2.5} />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Excluir lançamento</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">
                  {(transactionToDelete?.recurrence && transactionToDelete?.recurrence !== 'none') || transactionToDelete?.installments
                    ? "Este lançamento é parcelado ou recorrente. Como deseja prosseguir?"
                    : "Tem certeza que deseja apagar este lançamento? Esta ação não pode ser desfeita."}
                </p>
              </div>

              {transactionToDelete && transactions.some(tx => tx.linkedTransactionId === transactionToDelete.id) && (
                <div className="flex items-center gap-3 justify-center p-4 bg-rose-50/50 dark:bg-rose-500/5 rounded-2xl">
                  <input
                    type="checkbox"
                    id="del-linked"
                    checked={deleteLinked}
                    onChange={e => setDeleteLinked(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-2 border-rose-200 text-rose-500 focus:ring-rose-500 cursor-pointer"
                  />
                  <Label htmlFor="del-linked" className="text-xs font-medium text-rose-500 cursor-pointer">Excluir também receitas associadas</Label>
                </div>
              )}

              <div className="space-y-2">
                {(transactionToDelete?.recurrence && transactionToDelete?.recurrence !== 'none') || transactionToDelete?.installments ? (
                  <>
                    <button
                      onClick={() => transactionToDelete && handleDeleteTransaction(transactionToDelete.id, false)}
                      className="w-full h-14 rounded-full font-medium bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-all active:scale-95"
                    >
                      Excluir somente este
                    </button>
                    <button
                      onClick={() => transactionToDelete && handleDeleteTransaction(transactionToDelete.id, true)}
                      className="w-full h-14 rounded-full font-medium bg-rose-400 hover:bg-rose-500 text-white transition-all active:scale-95"
                    >
                      Excluir todos os seguintes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => transactionToDelete && handleDeleteTransaction(transactionToDelete.id, false)}
                    className="w-full h-14 rounded-full font-medium bg-rose-400 hover:bg-rose-500 text-white transition-all active:scale-95"
                  >
                    Confirmar exclusão
                  </button>
                )}
                <button
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!personToDelete} onOpenChange={(open) => !open && setPersonToDelete(null)}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <Trash2 size={28} strokeWidth={2.5} />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Excluir pessoa</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">
                  Tem certeza que deseja remover {personToDelete?.name}? Os lançamentos já atribuídos a ela não serão apagados.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => personToDelete && handleDeletePerson(personToDelete.id)}
                  className="w-full h-14 rounded-full font-medium bg-rose-400 hover:bg-rose-500 text-white transition-all active:scale-95"
                >
                  Confirmar exclusão
                </button>
                <button
                  onClick={() => setPersonToDelete(null)}
                  className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!cardToDelete} onOpenChange={(open) => !open && setCardToDelete(null)}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <Trash2 size={28} strokeWidth={2.5} />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Excluir cartão</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">
                  Tem certeza que deseja excluir {cardToDelete?.name}? As compras já lançadas nele não serão apagadas.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (!cardToDelete) return;
                    await handleDeleteCard(cardToDelete.id);
                    setCardToDelete(null);
                    setShowCardForm(false);
                    setEditingCard(null);
                  }}
                  className="w-full h-14 rounded-full font-medium bg-rose-400 hover:bg-rose-500 text-white transition-all active:scale-95"
                >
                  Confirmar exclusão
                </button>
                <button
                  onClick={() => setCardToDelete(null)}
                  className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteAllConfirmOpen} onOpenChange={setIsDeleteAllConfirmOpen}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6 text-center">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <Trash2 size={28} strokeWidth={2.5} />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Apagar tudo</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">
                  Tem certeza? Isso apagará TODOS os seus lançamentos, cartões, categorias e pessoas para sempre. Sua conta e login continuam ativos.
                </p>
                <div className="pt-4 space-y-2 text-left">
                  <Label className="text-xs font-medium tracking-widest text-slate-400 dark:text-[#8D89AC] ml-1">Para confirmar, digite:</Label>
                  <p className="text-xs font-medium text-slate-700 dark:text-[#EDE9E3] bg-card p-3 rounded-2xl shadow-soft">
                    Eu {userProfile?.nickname || 'usuário'}, sei que não é possível recuperar os dados apagados
                  </p>
                  <Input
                    value={deleteConfirmText || ''}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Digite a frase acima..."
                    className="h-12 rounded-full border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 font-normal px-5 focus:border-rose-300"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <button
                  disabled={deleteConfirmText !== `Eu ${userProfile?.nickname || 'usuário'}, sei que não é possível recuperar os dados apagados`}
                  onClick={handleDeleteAllTransactions}
                  className="w-full h-14 rounded-full font-medium bg-rose-400 hover:bg-rose-500 text-white transition-all active:scale-95 disabled:opacity-30"
                >
                  Confirmar exclusão total
                </button>
                <button
                  onClick={() => { setIsDeleteAllConfirmOpen(false); setDeleteConfirmText(''); }}
                  className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Data Options Modal */}
        <Dialog open={isDataModalOpen} onOpenChange={setIsDataModalOpen}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <div className="p-7 space-y-6">
              <div className="text-center space-y-1.5">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                  <Database size={28} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Opções de dados</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed">Gerencie seus lançamentos e backups</p>
              </div>

              <div className="space-y-2 pt-2">
                <button className="w-full h-14 rounded-full font-medium bg-card shadow-soft hover:bg-slate-50 dark:hover:bg-[#16133F] flex items-center justify-between px-6 transition-colors" onClick={handleExportGlobalCSV}>
                  <div className="flex items-center gap-3">
                    <Download size={18} className="text-primary" />
                    <span>Exportar CSV</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 dark:text-[#6B679C]" />
                </button>

                <button className="w-full h-14 rounded-full font-medium bg-card shadow-soft hover:bg-slate-50 dark:hover:bg-[#16133F] flex items-center justify-between px-6 transition-colors" onClick={handleSeedTestData}>
                  <div className="flex items-center gap-3">
                    <Sparkles size={18} className="text-primary" />
                    <span>Gerar dados de teste</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 dark:text-[#6B679C]" />
                </button>

                <button
                  className="w-full h-14 rounded-full font-medium text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center justify-between px-6 mt-2 transition-colors"
                  onClick={() => { setIsDataModalOpen(false); setIsDeleteAllConfirmOpen(true); }}
                >
                  <div className="flex items-center gap-3">
                    <Trash2 size={18} />
                    <span>Apagar tudo</span>
                  </div>
                  <ChevronRight size={18} />
                </button>
              </div>

              <button onClick={() => setIsDataModalOpen(false)} className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors mt-2">
                Voltar
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Series Edit Choice Dialog */}
        <Dialog open={showSeriesEditDialog} onOpenChange={setShowSeriesEditDialog}>
          <DialogContent className="max-w-none sm:max-w-sm rounded-t-[2.5rem] rounded-b-none md:rounded-[2.5rem] border-none shadow-deep p-0 overflow-hidden bg-[#F6F4FD] dark:bg-[#0B0A2E]">
            <DialogHeader className="sr-only">
              <DialogTitle>Lançamento em série</DialogTitle>
              <DialogDescription>Escolha como aplicar as alterações</DialogDescription>
            </DialogHeader>
            <div className="p-7 space-y-6">
              <div className="text-center space-y-1.5">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                  <Repeat size={28} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3]">Lançamento em série</h1>
                <p className="text-sm font-normal text-slate-400 dark:text-[#8D89AC] leading-relaxed px-2">
                  Este lançamento faz parte de uma sequência. Como deseja aplicar as alterações?
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setShowSeriesEditDialog(false);
                    handleAddTransaction('single');
                  }}
                  className="w-full h-14 rounded-full font-medium bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-all active:scale-95"
                >
                  Editar somente este
                </button>
                <button
                  onClick={() => {
                    setShowSeriesEditDialog(false);
                    handleAddTransaction('future');
                  }}
                  className="w-full h-14 rounded-full font-medium bg-primary text-white hover:bg-primary/90 transition-all active:scale-95"
                >
                  Editar sequência
                </button>
                <button
                  onClick={() => {
                    setShowSeriesEditDialog(false);
                    setIsRegistrarOpen(true);
                  }}
                  className="w-full h-12 rounded-full font-normal text-slate-400 dark:text-[#8D89AC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Voltar e revisar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-6 py-4 rounded-[1.75rem] transition-all duration-500 group relative overflow-hidden",
        active 
          ? "bg-primary text-white font-normal shadow-soft" 
          : "text-slate-400 dark:text-[#8D89AC] hover:bg-slate-50 dark:hover:bg-[#16133F] hover:text-slate-600 dark:hover:text-[#C5C1E5]"
      )}
    >
      {active && (
        <motion.div 
          layoutId="nav-bg"
          className="absolute inset-0 bg-primary z-0"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <div className={cn("relative z-10 transition-transform duration-500 flex items-center justify-center", active ? "scale-110" : "group-hover:scale-110")}>
        {React.cloneElement(icon as React.ReactElement, { strokeWidth: active ? 3 : 2.5 })}
      </div>
      <span className={cn("relative z-10 text-sm transition-all tracking-tight", active ? "font-normal" : "font-medium")}>{label}</span>
      {active && (
        <motion.div 
          layoutId="active-indicator" 
          className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full bg-white/80 dark:bg-[#100E3D]/80 shadow-[0_0_8px_rgba(255,255,255,0.6)]" 
        />
      )}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center h-11 w-11 shrink-0 active:scale-90 transition-transform"
    >
      <div className={cn("transition-colors duration-300", active ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-[#6B679C]")}>
        {React.cloneElement(icon as React.ReactElement, { strokeWidth: active ? 2.25 : 1.75, size: 26 })}
      </div>
    </button>
  );
}

function StatCard({ title, value, icon, trend, subValue }: { title: string, value: number, icon: React.ReactNode, trend?: 'up' | 'down', subValue?: string }) {
  const [intPart, decPart] = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
  return (
    <ShadcnCard className="border-none shadow-soft hover:shadow-deep transition-all duration-500 rounded-[1.75rem] group bg-white dark:bg-[#100E3D] overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-125 duration-700"></div>
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center gap-4 mb-3">
          <div className="p-3 bg-accent/80 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-sm shrink-0">
            {React.cloneElement(icon as React.ReactElement, { strokeWidth: 2.5, size: 20 })}
          </div>
          <p className="text-[11px] font-normal text-slate-400 dark:text-[#8D89AC] tracking-tight truncate flex-1">{title}</p>
        </div>
        <p className="text-2xl font-heading font-normal tracking-tighter text-slate-800 dark:text-[#EDE9E3] truncate">
          R$ {intPart}<span className="text-slate-300 dark:text-[#5C5686]">,{decPart}</span>
        </p>
        {subValue && (
          <p className="text-[11px] font-normal text-slate-500 dark:text-[#A8A4CC] mt-4 flex items-center gap-2 truncate bg-slate-50 dark:bg-[#16133F] px-4 py-2 rounded-full w-fit group-hover:bg-primary/5 group-hover:text-primary transition-colors">
            <span className="w-2 h-2 rounded-full bg-primary/40"></span>
            {subValue}
          </p>
        )}
      </CardContent>
    </ShadcnCard>
  );
}

function SwipeToConfirm({
  enabled,
  actionLabel,
  colorClass,
  onConfirm,
  children
}: {
  enabled: boolean,
  actionLabel: string,
  colorClass: string,
  onConfirm: () => void,
  children: React.ReactNode
}) {
  const dragX = useMotionValue(0);
  const revealScale = useTransform(dragX, [0, 45], [0.7, 1]);
  const [confirmed, setConfirmed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  if (!enabled) return <div className="relative">{children}</div>;

  return (
    <div className="relative rounded-full overflow-hidden">
      {(isDragging || confirmed) && (
        <motion.div style={{ width: dragX }} className={cn("absolute inset-y-0 left-0 flex items-center pl-6 rounded-full overflow-hidden", colorClass)}>
          <motion.div style={{ scale: revealScale }} className="flex items-center gap-2 text-white font-medium text-sm whitespace-nowrap">
            <CheckCircle2 size={18} strokeWidth={2.5} />
            {actionLabel}
          </motion.div>
        </motion.div>
      )}
      <motion.div
        drag={confirmed ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        dragMomentum={false}
        style={{ x: dragX }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(_, info) => {
          setIsDragging(false);
          if (info.offset.x > 56) {
            setConfirmed(true);
            setTimeout(() => onConfirm(), 450);
          }
        }}
        className="relative rounded-full"
      >
        <div className={cn("transition-opacity duration-200", confirmed && "opacity-0")}>
          {children}
        </div>
        <AnimatePresence>
          {confirmed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn("absolute inset-0 flex items-center justify-center gap-2 text-white font-medium text-sm rounded-full", colorClass)}
            >
              <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                <CheckCircle2 size={22} strokeWidth={2.5} />
              </motion.div>
              {actionLabel}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function TransactionItem({
  transaction,
  personName,
  cardName,
  onClick,
  onQuickConfirm,
  hideDate = false,
  hideStatus = false,
  categoryIcon
}: {
  transaction: Transaction,
  personName?: string,
  cardName?: string,
  onClick?: () => void,
  onQuickConfirm?: () => void,
  hideDate?: boolean,
  hideStatus?: boolean,
  categoryIcon?: string
}) {
  const formattedDate = format(parseISO(transaction.date), 'dd/MM/yyyy', { locale: ptBR });
  const canConfirm = !!onQuickConfirm && transaction.status !== 'actual' && !transaction.id.startsWith('bill-');

  return (
    <SwipeToConfirm
      enabled={canConfirm}
      actionLabel={transaction.type === 'income' ? 'Recebido' : 'Pago'}
      colorClass={transaction.type === 'income' ? 'bg-emerald-400' : 'bg-primary'}
      onConfirm={() => onQuickConfirm?.()}
    >
      <div
        onClick={onClick}
        className="flex items-center justify-between gap-3 border border-slate-200/70 dark:border-white/10 rounded-full pl-3 pr-4 py-3 cursor-pointer active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
          {categoryIcon ? (
            <div className="w-6 h-6 flex items-center justify-center shrink-0 text-base">
              {categoryIcon}
            </div>
          ) : !hideStatus && (
            canConfirm ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onQuickConfirm?.(); }}
                title={transaction.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'}
                className={cn(
                  "w-6 h-6 flex items-center justify-center shrink-0 rounded-full active:scale-90 transition-transform",
                  transaction.type === 'income' ? "text-emerald-400" : "text-rose-400"
                )}
              >
                <Clock size={19} strokeWidth={2.5} />
              </button>
            ) : (
              <div className={cn(
                "w-6 h-6 flex items-center justify-center shrink-0",
                transaction.type === 'income' ? "text-emerald-400" : "text-rose-400"
              )}>
                {transaction.status === 'actual' ? (
                  <Check size={20} strokeWidth={2.5} />
                ) : (
                  <Clock size={19} strokeWidth={2.5} />
                )}
              </div>
            )
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 overflow-hidden">
              {!hideDate && (
                <span className="text-[11px] font-normal text-slate-400 dark:text-[#8D89AC] tracking-tight shrink-0">
                  {formattedDate}
                </span>
              )}
              {transaction.installments && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                  {transaction.installments.current}/{transaction.installments.total}
                </span>
              )}
              {personName && (
                <span className="text-[11px] font-normal text-slate-400 dark:text-[#8D89AC] truncate">· {personName}</span>
              )}
              {cardName && (
                <span className="text-[11px] font-normal text-slate-400 dark:text-[#8D89AC] truncate">· {cardName}</span>
              )}
              {transaction.linkedToCard && (
                <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400 shrink-0">· vinculado</span>
              )}
            </div>
            <p className="text-base font-medium text-slate-800 dark:text-[#EDEAF9] tracking-tight truncate mt-0.5">{transaction.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className={cn(
            "font-heading font-medium tracking-tighter whitespace-nowrap text-base",
            transaction.type === 'income' ? "text-emerald-500" : "text-rose-400"
          )}>
            R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </SwipeToConfirm>
  );
}
