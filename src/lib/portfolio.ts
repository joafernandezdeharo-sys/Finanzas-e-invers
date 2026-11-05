import type { Currency, Investment } from '../types';
import type { Quote } from '../services/prices';
import { convert, daysBetween, todayISO } from './util';

export interface Valuation {
  inv: Investment;
  priceNative: number; // precio unitario actual en su moneda
  priceCurrency: Currency;
  live: boolean;
  changePct: number | null;
  value: number; // valor actual en moneda de visualización
  cost: number; // costo en moneda de visualización
  pnl: number;
  pnlPct: number;
  source: string;
}

/** Los bonos en BYMA cotizan cada 100 nominales */
const unitFactor = (inv: Investment) => (inv.type === 'bono' ? 0.01 : 1);

export function valueInvestment(inv: Investment, quote: Quote | undefined, display: Currency, rate: number): Valuation {
  const f = unitFactor(inv);
  let priceNative = inv.manualPrice ?? inv.buyPrice;
  let priceCurrency: Currency = inv.currency;
  let live = false;
  let source = inv.manualPrice != null ? 'Manual' : 'Precio de compra';

  if (inv.type === 'plazo_fijo') {
    const days = daysBetween(inv.buyDate, todayISO());
    priceNative = inv.buyPrice * (1 + ((inv.annualRate ?? 0) / 100) * (days / 365));
    source = `TNA ${inv.annualRate ?? 0}% · ${days} días`;
  } else if (quote) {
    priceNative = quote.price;
    priceCurrency = quote.currency;
    live = true;
    source = quote.source;
  }

  const value = convert(inv.quantity * priceNative * f, priceCurrency, display, rate);
  const cost = convert(inv.quantity * inv.buyPrice * f, inv.currency, display, rate);
  const pnl = value - cost;
  return {
    inv,
    priceNative,
    priceCurrency,
    live,
    changePct: quote?.changePct ?? null,
    value,
    cost,
    pnl,
    pnlPct: cost ? (pnl / cost) * 100 : 0,
    source,
  };
}
