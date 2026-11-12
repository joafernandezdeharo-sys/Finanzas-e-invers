import type { Currency, Transaction } from '../types';
import { addMonths } from './util';
import { descKey } from './importer/normalize';

export interface InstallmentPlan {
  key: string;
  description: string;
  account: string;
  amount: number; // valor de cada cuota
  currency: Currency;
  paid: number; // última cuota registrada
  total: number;
  remaining: number;
  nextMonth: string | null; // YYYY-MM de la próxima cuota
  lastDate: string;
}

/** Quita "C.03/06", "cuota 3 de 6", etc. de la descripción para agrupar las cuotas de una misma compra */
const purchaseName = (d: string) =>
  d.replace(/\b(?:c|cuota|cuotas|cta|ctas)\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/gi, '').replace(/\s\d{2}\/\d{2}\s*$/, '').trim();

/** Compras en cuotas con cuotas que todavía faltan pagar */
export function installmentPlans(transactions: Transaction[]): InstallmentPlan[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.installment || t.type !== 'gasto') continue;
    const key = `${descKey(purchaseName(t.description))}|${t.account}|${t.currency}|${t.installment.total}|${Math.round(t.amount)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const plans: InstallmentPlan[] = [];
  for (const [key, txs] of groups) {
    const last = txs.reduce((a, b) => (b.installment!.n > a.installment!.n || (b.installment!.n === a.installment!.n && b.date > a.date) ? b : a));
    const { n, total } = last.installment!;
    plans.push({
      key,
      description: purchaseName(last.description) || last.description,
      account: last.account,
      amount: last.amount,
      currency: last.currency,
      paid: n,
      total,
      remaining: total - n,
      nextMonth: n < total ? addMonths(last.date.slice(0, 7), 1) : null,
      lastDate: last.date,
    });
  }
  return plans.filter((p) => p.remaining > 0).sort((a, b) => b.remaining * b.amount - a.remaining * a.amount);
}

/** Total comprometido en cuotas por mes (próximos `months` meses desde `from`) */
export function installmentSchedule(plans: InstallmentPlan[], from: string, months: number): { month: string; ARS: number; USD: number }[] {
  const out = Array.from({ length: months }, (_, i) => ({ month: addMonths(from, i), ARS: 0, USD: 0 }));
  for (const p of plans) {
    if (!p.nextMonth) continue;
    for (let k = 0; k < p.remaining; k++) {
      const m = addMonths(p.nextMonth, k);
      const slot = out.find((o) => o.month === m);
      if (slot) slot[p.currency] += p.amount;
    }
  }
  return out;
}
