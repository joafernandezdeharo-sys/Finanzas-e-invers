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
}

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
  opts: { positiveIsExpense: boolean; rules: CategoryRule[]; existing: Transaction[]; fallback: { ingreso: string; gasto: string } },
): Candidate[] {
  // contamos cuántas veces existe cada huella, para permitir movimientos idénticos legítimos (dos cafés el mismo día)
  const existing = new Map<string, number>();
  for (const t of opts.existing) {
    const f = fingerprint(t);
    existing.set(f, (existing.get(f) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const signed = opts.positiveIsExpense ? -r.signed : r.signed;
    const type: TxType = signed >= 0 ? 'ingreso' : 'gasto';
    const amount = Math.round(Math.abs(signed) * 100) / 100;
    const base = { date: r.date, description: r.description, amount, type, currency: r.currency };
    const f = fingerprint(base);
    const n = (seen.get(f) ?? 0) + 1;
    seen.set(f, n);
    const dup = n <= (existing.get(f) ?? 0);
    const status: CandidateStatus = dup ? 'duplicado' : r.exclude ? 'excluido' : 'nuevo';
    return {
      key: `${i}-${f}`,
      ...base,
      category: categorize(r.description, type, opts.rules, opts.fallback),
      include: status === 'nuevo',
      status,
      note: dup ? 'Ya está cargado (importado antes)' : r.exclude,
    };
  });
}
