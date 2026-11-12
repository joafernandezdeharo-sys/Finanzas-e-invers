import type { Recurring, Transaction } from '../types';
import { addMonths } from './util';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha real del día `day` en el mes `month` (si el mes tiene menos días, el último día) */
export function dayInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${pad(Math.min(Math.max(1, day), last))}`;
}

/**
 * Movimientos de gastos/ingresos fijos que todavía no se generaron, hasta hoy inclusive.
 * Es idempotente: un fijo genera como máximo un movimiento por mes.
 */
export function pendingRecurring(recurring: Recurring[], transactions: Transaction[], today: string): Omit<Transaction, 'id'>[] {
  const done = new Set(transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date.slice(0, 7)}`));
  const out: Omit<Transaction, 'id'>[] = [];
  const thisMonth = today.slice(0, 7);
  for (const r of recurring) {
    if (!r.active || !r.start) continue;
    const endMonth = r.end && r.end < thisMonth ? r.end : thisMonth;
    // como máximo 24 meses hacia atrás, por si alguien pone un inicio muy viejo
    let m = r.start < addMonths(thisMonth, -24) ? addMonths(thisMonth, -24) : r.start;
    for (; m <= endMonth; m = addMonths(m, 1)) {
      const date = dayInMonth(m, r.day);
      if (date > today || done.has(`${r.id}|${m}`)) continue;
      out.push({
        date, type: r.type, amount: r.amount, currency: r.currency, category: r.category,
        description: r.description, account: r.account, recurringId: r.id,
      });
    }
  }
  return out;
}

/** Fijos que faltan cargar en lo que queda del mes (para la proyección) */
export function upcomingThisMonth(recurring: Recurring[], transactions: Transaction[], today: string): Recurring[] {
  const month = today.slice(0, 7);
  const done = new Set(transactions.filter((t) => t.recurringId && t.date.startsWith(month)).map((t) => t.recurringId));
  return recurring.filter((r) => r.active && r.start <= month && (!r.end || r.end >= month) && !done.has(r.id) && dayInMonth(month, r.day) > today);
}
