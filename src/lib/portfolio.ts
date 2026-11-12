import type { Currency, Investment, InvestmentOp } from '../types';
import type { Quote } from '../services/prices';
import { convert, daysBetween, todayISO } from './util';

export interface Valuation {
  inv: Investment;
  quantity: number; // tenencia actual
  avgPrice: number; // precio promedio de compra, en la moneda de la inversión
  priceNative: number; // precio unitario actual en su moneda
  priceCurrency: Currency;
  live: boolean;
  changePct: number | null;
  value: number; // valor actual (moneda de visualización)
  cost: number; // costo de la tenencia actual (moneda de visualización, con el dólar de cada compra)
  pnl: number; // resultado no realizado
  pnlPct: number;
  realized: number; // resultado de ventas ya hechas (descontadas comisiones)
  dividends: number;
  totalReturn: number; // no realizado + realizado + dividendos
  source: string;
}

/** Los bonos en BYMA cotizan cada 100 nominales */
export const unitFactor = (inv: Pick<Investment, 'type'>) => (inv.type === 'bono' ? 0.01 : 1);

/** Operaciones de la inversión (las cargadas antes del registro se toman como una única compra) */
export function effectiveOps(inv: Investment): InvestmentOp[] {
  if (inv.ops?.length) return [...inv.ops].sort((a, b) => a.date.localeCompare(b.date));
  return [{ id: 'inicial', date: inv.buyDate, kind: 'compra', quantity: inv.quantity, price: inv.buyPrice, currency: inv.currency }];
}

export interface PositionCalc {
  quantity: number;
  avgPrice: number; // en moneda de la inversión
  basis: Record<Currency, number>; // costo de la tenencia en pesos y en dólares (cada compra con el dólar de su fecha)
  realized: Record<Currency, number>;
  dividends: Record<Currency, number>;
}

/** Método de precio promedio ponderado: las ventas no cambian el precio promedio de lo que queda */
export function computePosition(inv: Investment, rateOn: (date: string) => number): PositionCalc {
  const f = unitFactor(inv);
  let qty = 0;
  let costNative = 0;
  const basis = { ARS: 0, USD: 0 };
  const realized = { ARS: 0, USD: 0 };
  const dividends = { ARS: 0, USD: 0 };
  const both = (amount: number, cur: Currency, date: string) => {
    const r = rateOn(date);
    return { ARS: convert(amount, cur, 'ARS', r), USD: convert(amount, cur, 'USD', r) };
  };
  for (const op of effectiveOps(inv)) {
    const r = rateOn(op.date);
    if (op.kind === 'compra') {
      const total = op.quantity * op.price * f;
      const b = both(total, op.currency, op.date);
      qty += op.quantity;
      costNative += convert(total, op.currency, inv.currency, r);
      basis.ARS += b.ARS;
      basis.USD += b.USD;
    } else if (op.kind === 'venta') {
      const q = Math.min(op.quantity, qty);
      if (q <= 0) continue;
      const ratio = q / qty;
      const proceeds = both(q * op.price * f, op.currency, op.date);
      for (const c of ['ARS', 'USD'] as const) {
        const removed = basis[c] * ratio;
        realized[c] += proceeds[c] - removed;
        basis[c] -= removed;
      }
      costNative -= costNative * ratio;
      qty -= q;
    } else if (op.kind === 'dividendo') {
      const d = both(op.price, op.currency, op.date);
      dividends.ARS += d.ARS;
      dividends.USD += d.USD;
    } else if (op.kind === 'comision') {
      const c = both(op.price, op.currency, op.date);
      realized.ARS -= c.ARS;
      realized.USD -= c.USD;
    }
  }
  return { quantity: qty, avgPrice: qty ? costNative / (qty * f) : 0, basis, realized, dividends };
}

/**
 * Valúa una inversión. El costo se calcula con el dólar de la fecha de cada compra (`rateOn`),
 * así el rendimiento en dólares de algo comprado en pesos es real y no depende del dólar de hoy.
 */
export function valueInvestment(
  inv: Investment, quote: Quote | undefined, display: Currency, rate: number, rateOn: (date: string) => number = () => rate,
): Valuation {
  const f = unitFactor(inv);
  const pos = computePosition(inv, rateOn);
  let priceNative = inv.manualPrice ?? pos.avgPrice;
  let priceCurrency: Currency = inv.currency;
  let live = false;
  let source = inv.manualPrice != null ? 'Manual' : 'Precio de compra';

  if (inv.type === 'plazo_fijo') {
    const days = daysBetween(inv.buyDate, todayISO());
    priceNative = pos.avgPrice * (1 + ((inv.annualRate ?? 0) / 100) * (days / 365));
    source = `TNA ${inv.annualRate ?? 0}% · ${days} días`;
  } else if (quote) {
    priceNative = quote.price;
    priceCurrency = quote.currency;
    live = true;
    source = quote.source;
  }

  const value = convert(pos.quantity * priceNative * f, priceCurrency, display, rate);
  const cost = pos.basis[display];
  const pnl = value - cost;
  const realized = pos.realized[display];
  const dividends = pos.dividends[display];
  return {
    inv,
    quantity: pos.quantity,
    avgPrice: pos.avgPrice,
    priceNative,
    priceCurrency,
    live,
    changePct: quote?.changePct ?? null,
    value,
    cost,
    pnl,
    pnlPct: cost ? (pnl / cost) * 100 : 0,
    realized,
    dividends,
    totalReturn: pnl + realized + dividends,
    source,
  };
}

/** Datos resumidos para guardar en la inversión (cantidad y precio promedio) después de cambiar operaciones */
export function syncSummary(inv: Investment, rateOn: (date: string) => number): Pick<Investment, 'quantity' | 'buyPrice' | 'buyDate'> {
  const pos = computePosition(inv, rateOn);
  const first = effectiveOps(inv).find((o) => o.kind === 'compra');
  return { quantity: pos.quantity, buyPrice: pos.avgPrice, buyDate: first?.date ?? inv.buyDate };
}
