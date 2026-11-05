import type { Currency } from '../types';

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 'YYYY-MM' */
export const monthKey = (iso: string) => iso.slice(0, 7);
export const currentMonth = () => todayISO().slice(0, 7);

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${long ? y : String(y).slice(2)}`;
};

export const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Lista de los últimos n meses terminando en `end` (inclusive), del más viejo al más nuevo */
export const lastMonths = (n: number, end = currentMonth()) =>
  Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));

export const formatDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const formatMoney = (value: number, currency: Currency, opts: { compact?: boolean; decimals?: number } = {}) => {
  if (!Number.isFinite(value)) return '—';
  const decimals = opts.decimals ?? (Math.abs(value) >= 1000 && currency === 'ARS' ? 0 : 2);
  const n = new Intl.NumberFormat('es-AR', {
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.compact ? 0 : decimals,
    maximumFractionDigits: opts.compact ? 1 : decimals,
  }).format(value);
  return currency === 'USD' ? `US$ ${n}` : `$ ${n}`;
};

export const formatNumber = (value: number, decimals = 2) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimals }).format(value)
    : '—';

export const formatPct = (value: number, decimals = 2) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(decimals).replace('.', ',')}%` : '—';

/** Convierte entre ARS y USD usando `rate` (ARS por 1 USD) */
export const convert = (amount: number, from: Currency, to: Currency, rate: number) => {
  if (from === to) return amount;
  if (!rate) return NaN;
  return from === 'USD' ? amount * rate : amount / rate;
};

export const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export const downloadFile = (name: string, content: string, type = 'application/json') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const toCSV = (rows: (string | number)[][]) =>
  rows
    .map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';'))
    .join('\n');

export const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
