import type { CategoryRule, Currency, Transaction, TxType } from '../../types';
import { BUILTIN_RULES } from '../defaults';
import type { ParsedRow } from './analyze';
import { descKey } from './normalize';

export type CandidateStatus = 'nuevo' | 'duplicado' | 'excluido';

export interface Candidate {
  key: string;
  date: string;
  description: string;
  amount: number; // siempre positivo
  type: TxType;
  currency: Currency;
  category: string;
  include: boolean;
  status: CandidateStatus;
  note?: string;
  /** Transferencia entre cuentas propias (no cuenta como ingreso ni gasto) */
  internal: boolean;
  installment?: { n: number; total: number };
}

/** Descripciones típicas de movimientos entre cuentas propias */
const INTERNAL_RE = new RegExp([
  'pago (de )?(la )?(tarjeta|tc|t\\.c\\.|visa|master|mastercard|amex|american express|cabal|naranja|resumen)',
  'cuenta propia', 'cuentas propias', 'mismo titular', 'misma titularidad', 'entre cuentas', 'transferencia propia',
  'a mi cuenta', 'de mi cuenta', 'rescate (de )?fci', 'suscripcion (de )?fci', 'rescate fondo', 'suscripcion fondo',
  'compra (de )?(dolares|moneda extranjera|u\\$s|usd|divisas)', 'venta (de )?(dolares|moneda extranjera|u\\$s|usd|divisas)',
  'dinero (ingresado|retirado) (a|de|desde) (mercado pago|tu cuenta)', 'ingreso de dinero desde', 'retiro a (tu )?cuenta',
  'carga (de saldo )?desde', 'transferencia entre',
].join('|'));

/** Detecta compras en cuotas: "C.03/06", "CUOTA 3 DE 6", "CTA 03/12"; en tarjetas también "FRAVEGA 03/06" */
export function detectInstallment(description: string, isCard: boolean): { n: number; total: number } | undefined {
  const d = description.toLowerCase();
  let m = d.match(/\b(?:c|cuota|cuotas|cta|ctas)\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
  if (!m && isCard) m = d.match(/\s(\d{2})\/(\d{2})\s*$/);
  if (!m) return undefined;
  const n = +m[1], total = +m[2];
  return n >= 1 && total >= 2 && total <= 48 && n <= total ? { n, total } : undefined;
}

const fold2 = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const daysApart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

/** Huella para detectar el mismo movimiento cargado dos veces */
export const fingerprint = (t: { date: string; type: TxType; amount: number; currency: Currency; description: string }) =>
  `${t.date}|${t.type}|${t.amount.toFixed(2)}|${t.currency}|${descKey(t.description).slice(0, 48)}`;

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Busca la palabra clave al comienzo de una palabra de la descripción ("coto" coincide con "COMPRA*COTO 123") */
export function ruleMatches(description: string, keyword: string): boolean {
  const d = ` ${fold(description).replace(/[^a-z0-9.&+$ ]/g, ' ').replace(/\s+/g, ' ')} `;
  const raw = fold(keyword).replace(/[^a-z0-9.&+$ ]/g, ' ');
  const k = raw.trim().replace(/\s+/g, ' ');
  if (!k) return false;
  return d.includes(` ${k}${raw.endsWith(' ') ? ' ' : ''}`);
}

export function categorize(description: string, type: TxType, userRules: CategoryRule[], fallback: { ingreso: string; gasto: string }): string {
  for (const r of [...userRules, ...BUILTIN_RULES]) {
    if (r.type && r.type !== type) continue;
    if (ruleMatches(description, r.keyword)) return r.category;
  }
  return fallback[type];
}

export function buildCandidates(
  rows: ParsedRow[],
  opts: {
    positiveIsExpense: boolean; rules: CategoryRule[]; existing: Transaction[]; fallback: { ingreso: string; gasto: string };
    account?: string; userName?: string; internalCategory?: string;
  },
): Candidate[] {
  // contamos cuántas veces existe cada huella, para permitir movimientos idénticos legítimos (dos cafés el mismo día)
  const existing = new Map<string, number>();
  for (const t of opts.existing) {
    const f = fingerprint(t);
    existing.set(f, (existing.get(f) ?? 0) + 1);
  }
  // gastos fijos generados automáticamente: si el resumen trae el mismo pago, no lo duplicamos
  const recurringPool = opts.existing.filter((t) => t.recurringId);
  const usedRecurring = new Set<string>();
  // movimientos de otras cuentas para encontrar la "otra punta" de una transferencia
  const otherAccounts = opts.existing.filter((t) => opts.account && t.account !== opts.account);
  const name = opts.userName ? fold2(opts.userName).trim() : '';
  const nameParts = name.split(/\s+/).filter((w) => w.length > 2);

  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const signed = opts.positiveIsExpense ? -r.signed : r.signed;
    const type: TxType = signed >= 0 ? 'ingreso' : 'gasto';
    const amount = Math.round(Math.abs(signed) * 100) / 100;
    const base = { date: r.date, description: r.description, amount, type, currency: r.currency };
    const f = fingerprint(base);
    const n = (seen.get(f) ?? 0) + 1;
    seen.set(f, n);
    let dup = n <= (existing.get(f) ?? 0);
    let note: string | undefined = dup ? 'Ya está cargado (importado antes)' : r.exclude;

    if (!dup) {
      const rec = recurringPool.find((t) => !usedRecurring.has(t.id) && t.type === type && t.currency === r.currency &&
        Math.abs(t.amount - amount) <= Math.max(1, t.amount * 0.01) && daysApart(t.date, r.date) <= 6);
      if (rec) {
        usedRecurring.add(rec.id);
        dup = true;
        note = `Ya está cargado como gasto fijo ("${rec.description}")`;
      }
    }

    // ¿es un movimiento entre cuentas propias?
    const d = fold2(r.description);
    let internalNote = r.internalHint;
    if (!internalNote && INTERNAL_RE.test(d)) internalNote = 'Parece un movimiento entre tus cuentas';
    if (!internalNote && nameParts.length >= 2 && /transf|envi|recib/.test(d) && nameParts.every((w) => d.includes(w))) {
      internalNote = 'Transferencia a tu nombre: parece entre tus cuentas';
    }
    if (!internalNote) {
      const other = otherAccounts.find((t) => t.type !== type && t.currency === r.currency &&
        Math.abs(t.amount - amount) <= Math.max(1, amount * 0.005) && daysApart(t.date, r.date) <= 3);
      if (other) internalNote = `Coincide con "${other.description || other.category}" en ${other.account}: parece un pase entre cuentas`;
    }
    const internal = !!internalNote;

    const status: CandidateStatus = dup ? 'duplicado' : r.exclude ? 'excluido' : 'nuevo';
    return {
      key: `${i}-${f}`,
      ...base,
      category: internal ? (opts.internalCategory ?? 'Transferencia entre cuentas') : categorize(r.description, type, opts.rules, opts.fallback),
      include: status === 'nuevo',
      status,
      note: note ?? internalNote,
      internal,
      installment: type === 'gasto' ? detectInstallment(r.description, !!r.isCard) : undefined,
    };
  });
}
