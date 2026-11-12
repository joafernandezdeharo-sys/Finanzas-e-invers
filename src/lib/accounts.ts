import type { AccountInfo, Currency, DollarOperation, Transaction } from '../types';
import { accountInfo } from './defaults';

export interface AccountBalance {
  name: string;
  info: AccountInfo;
  /** Saldo por moneda (una cuenta puede tener movimientos en pesos y en dólares, ej. una tarjeta) */
  balances: Record<Currency, number>;
  count: number;
  lastDate: string | null;
}

/**
 * Saldo de cada cuenta = saldo inicial + ingresos − gastos posteriores a la fecha del saldo inicial.
 * Las transferencias internas también mueven el saldo (sacan de una cuenta y ponen en otra).
 */
export function accountBalances(names: string[], info: Record<string, AccountInfo>, transactions: Transaction[]): AccountBalance[] {
  const all = [...new Set([...names, ...transactions.map((t) => t.account).filter(Boolean)])];
  return all.map((name) => {
    const inf = accountInfo(name, info);
    const balances: Record<Currency, number> = { ARS: 0, USD: 0 };
    balances[inf.currency] += inf.opening;
    let count = 0;
    let lastDate: string | null = null;
    for (const t of transactions) {
      if (t.account !== name) continue;
      if (inf.openingDate && t.date <= inf.openingDate) continue;
      balances[t.currency] += t.type === 'ingreso' ? t.amount : -t.amount;
      count++;
      if (!lastDate || t.date > lastDate) lastDate = t.date;
    }
    return { name, info: inf, balances, count, lastDate };
  });
}

/** Dólares registrados en la sección Dólar que no están vinculados a ninguna cuenta (para no contarlos dos veces) */
export function unlinkedUsd(ops: DollarOperation[]): number {
  return ops.filter((o) => !o.toAccount && !o.fromAccount).reduce((a, o) => a + (o.operation === 'compra' ? o.usdAmount : -o.usdAmount), 0);
}

/**
 * Para "Actualizar saldo real": nuevo saldo inicial tal que el saldo calculado sea el real a partir de hoy.
 * Los movimientos de hoy o anteriores quedan incluidos en ese saldo.
 */
export function openingForRealBalance(real: number, today: string): Pick<AccountInfo, 'opening' | 'openingDate'> {
  return { opening: real, openingDate: today };
}
