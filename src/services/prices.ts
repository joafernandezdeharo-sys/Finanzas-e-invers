import type { Currency, Investment } from '../types';
import { fetchYahooQuotes, yahooSymbol } from './yahoo';

export interface Quote {
  price: number;
  currency: Currency;
  changePct: number | null;
  source: string;
}

interface D912Row {
  symbol: string;
  c: number;
  px_bid: number;
  px_ask: number;
  pct_change: number;
}

const D912 = {
  arg_stocks: 'https://data912.com/live/arg_stocks',
  arg_cedears: 'https://data912.com/live/arg_cedears',
  arg_bonds: 'https://data912.com/live/arg_bonds',
  arg_corp: 'https://data912.com/live/arg_corp',
  usa_stocks: 'https://data912.com/live/usa_stocks',
} as const;
type D912Panel = keyof typeof D912;

async function fetchPanel(panel: D912Panel): Promise<Map<string, D912Row>> {
  const res = await fetch(D912[panel]);
  if (!res.ok) throw new Error(`data912 ${panel}: ${res.status}`);
  const rows: D912Row[] = await res.json();
  return new Map(rows.map((r) => [r.symbol.toUpperCase(), r]));
}

/** En BYMA los tickers terminados en D cotizan en dólares MEP, en C en dólares cable */
const bondCurrency = (symbol: string): Currency => (/[DC]$/.test(symbol) && symbol.length > 4 ? 'USD' : 'ARS');

const panelsFor = (inv: Investment): D912Panel[] => {
  switch (inv.type) {
    case 'cedear': return ['arg_cedears'];
    case 'accion_ar': return ['arg_stocks'];
    case 'bono': return ['arg_bonds', 'arg_corp'];
    case 'accion_us': return ['usa_stocks'];
    default: return [];
  }
};

async function coingecko(ids: string[]): Promise<Record<string, { usd: number; usd_24h_change?: number }>> {
  if (!ids.length) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko: ${res.status}`);
  return res.json();
}

async function finnhub(symbol: string, key: string): Promise<Quote | null> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  const j = await res.json();
  if (!j || !j.c) return null;
  return { price: j.c, currency: 'USD', changePct: j.dp ?? null, source: 'Finnhub' };
}

export interface PriceResult {
  quotes: Record<string, Quote>; // por id de inversión
  errors: string[];
}

/**
 * Obtiene cotizaciones en vivo para todas las inversiones que se puedan cotizar online.
 * Orden de prioridad:
 *  1. Yahoo Finance (si está configurado el puente): acciones, CEDEARs y cripto.
 *  2. data912 (datos de BYMA): bonos y ONs, y respaldo de acciones/CEDEARs.
 *  3. CoinGecko: respaldo de cripto.
 *  4. Finnhub (con API key): respaldo de acciones de EE.UU.
 */
export async function fetchQuotes(investments: Investment[], finnhubKey: string, yahooProxy = ''): Promise<PriceResult> {
  const quotes: Record<string, Quote> = {};
  const errors: string[] = [];

  // 1. Yahoo Finance
  if (yahooProxy) {
    const bySymbol = new Map<string, Investment[]>();
    for (const inv of investments) {
      const ys = yahooSymbol(inv);
      if (ys) bySymbol.set(ys, [...(bySymbol.get(ys) ?? []), inv]);
    }
    if (bySymbol.size) {
      const r = await fetchYahooQuotes(yahooProxy, [...bySymbol.keys()]);
      r.quotes.forEach((q, sym) => {
        if (q.currency !== 'ARS' && q.currency !== 'USD') return;
        for (const inv of bySymbol.get(sym) ?? []) {
          quotes[inv.id] = { price: q.price, currency: q.currency, changePct: q.changePct, source: 'Yahoo Finance' };
        }
      });
      if (r.errors.length) errors.push(`Yahoo Finance: ${r.errors.slice(0, 3).join(', ')}${r.errors.length > 3 ? '…' : ''}`);
    }
  }
  const pending = investments.filter((i) => !quotes[i.id]);

  // 2. data912 / BYMA
  const needed = new Set<D912Panel>();
  pending.forEach((i) => panelsFor(i).forEach((p) => needed.add(p)));
  const panels = new Map<D912Panel, Map<string, D912Row>>();
  await Promise.all(
    [...needed].map(async (p) => {
      try {
        panels.set(p, await fetchPanel(p));
      } catch (e) {
        errors.push(String((e as Error).message));
      }
    }),
  );

  // 3. CoinGecko
  const cryptoIds = [...new Set(pending.filter((i) => i.type === 'cripto').map((i) => i.symbol.toLowerCase().trim()))];
  let cg: Awaited<ReturnType<typeof coingecko>> = {};
  try {
    cg = await coingecko(cryptoIds);
  } catch (e) {
    errors.push(String((e as Error).message));
  }

  for (const inv of pending) {
    const sym = inv.symbol.toUpperCase().trim().replace(/\.BA$/, '');
    if (inv.type === 'cripto') {
      const q = cg[inv.symbol.toLowerCase().trim()];
      if (q) quotes[inv.id] = { price: q.usd, currency: 'USD', changePct: q.usd_24h_change ?? null, source: 'CoinGecko' };
      continue;
    }
    for (const p of panelsFor(inv)) {
      const row = panels.get(p)?.get(sym);
      const price = row ? row.c || (row.px_bid + row.px_ask) / 2 : 0;
      if (row && price) {
        const currency: Currency = p === 'usa_stocks' ? 'USD' : p.startsWith('arg_bonds') || p === 'arg_corp' ? bondCurrency(sym) : 'ARS';
        quotes[inv.id] = { price, currency, changePct: row.pct_change ?? null, source: 'BYMA (vía data912)' };
        break;
      }
    }
    // 4. Finnhub
    if (!quotes[inv.id] && inv.type === 'accion_us' && finnhubKey) {
      try {
        const q = await finnhub(sym, finnhubKey);
        if (q) quotes[inv.id] = q;
      } catch (e) {
        errors.push(`Finnhub ${sym}: ${(e as Error).message}`);
      }
    }
  }
  return { quotes, errors };
}

export interface CoinSearchResult {
  id: string;
  name: string;
  symbol: string;
}

export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.coins ?? []).slice(0, 8);
}
