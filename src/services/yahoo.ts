import type { Investment } from '../types';

/**
 * Yahoo Finance (finance.yahoo.com).
 * El navegador no puede consultarlo directo, así que las consultas pasan por el "puente"
 * propio del usuario (Cloudflare Worker, ver proxy/yahoo-worker.js), configurado en Configuración.
 */

export interface YahooQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  currency: string; // ARS, USD, '' (índices)
  time: Date | null;
  exchange: string;
}

export interface YahooPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

/** Equivalencias de los ids de CoinGecko más comunes con los símbolos de Yahoo */
const CRYPTO: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT', 'usd-coin': 'USDC', binancecoin: 'BNB', solana: 'SOL', ripple: 'XRP',
  cardano: 'ADA', dogecoin: 'DOGE', 'avalanche-2': 'AVAX', polkadot: 'DOT', tron: 'TRX', chainlink: 'LINK', dai: 'DAI',
  'matic-network': 'MATIC', 'polygon-ecosystem-token': 'POL', litecoin: 'LTC', 'shiba-inu': 'SHIB', uniswap: 'UNI', stellar: 'XLM',
  'bitcoin-cash': 'BCH', cosmos: 'ATOM', near: 'NEAR', aptos: 'APT', 'the-open-network': 'TON', sui: 'SUI', pepe: 'PEPE',
};

/** Símbolo de Yahoo para una inversión (null si Yahoo no la cotiza: bonos, FCI, plazo fijo…) */
export function yahooSymbol(inv: Pick<Investment, 'type' | 'symbol'>): string | null {
  const raw = inv.symbol.trim();
  if (!raw) return null;
  const s = raw.toUpperCase();
  // si el usuario ya escribió un símbolo de Yahoo completo, lo respetamos
  const explicit = /[.^=]|-USD$/.test(s);
  switch (inv.type) {
    case 'cedear':
    case 'accion_ar':
      return explicit ? s : `${s}.BA`;
    case 'accion_us':
      return s;
    case 'cripto': {
      if (/-USD$/.test(s)) return s;
      const sym = CRYPTO[raw.toLowerCase()] ?? (/^[A-Z0-9]{2,6}$/.test(s) ? s : null);
      return sym ? `${sym}-USD` : null;
    }
    default:
      return null; // bonos, ONs, FCI y plazos fijos no están en Yahoo
  }
}

export const yahooPage = (symbol: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;

const base = (proxy: string) => proxy.trim().replace(/\/+$/, '');

async function chart(proxy: string, symbol: string, range: string, interval: string) {
  const r = await fetch(`${base(proxy)}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, {
    signal: AbortSignal.timeout(12_000),
  });
  const j = await r.json().catch(() => null);
  const res = j?.chart?.result?.[0];
  if (!r.ok || !res) throw new Error(j?.chart?.error?.description ?? `Yahoo respondió ${r.status}`);
  return res as {
    meta: { regularMarketPrice: number; chartPreviousClose?: number; currency?: string; shortName?: string; longName?: string; regularMarketTime?: number; fullExchangeName?: string };
    timestamp?: number[];
    indicators: { quote: { close: (number | null)[] }[] };
  };
}

export async function fetchYahooQuote(proxy: string, symbol: string): Promise<YahooQuote> {
  const { meta } = await chart(proxy, symbol, '1d', '1d');
  const prev = meta.chartPreviousClose ?? null;
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    price: meta.regularMarketPrice,
    previousClose: prev,
    changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null,
    currency: meta.currency ?? '',
    time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null,
    exchange: meta.fullExchangeName ?? '',
  };
}

/** Varias cotizaciones en paralelo (de a 6 para no saturar) */
export async function fetchYahooQuotes(proxy: string, symbols: string[]): Promise<{ quotes: Map<string, YahooQuote>; errors: string[] }> {
  const quotes = new Map<string, YahooQuote>();
  const errors: string[] = [];
  const list = [...new Set(symbols)];
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (s) => {
      try {
        quotes.set(s, await fetchYahooQuote(proxy, s));
      } catch (e) {
        errors.push(`${s}: ${(e as Error).message}`);
      }
    }));
  }
  return { quotes, errors };
}

export const YAHOO_RANGES = [
  { value: '1mo', label: '1M', interval: '1d' },
  { value: '6mo', label: '6M', interval: '1d' },
  { value: '1y', label: '1A', interval: '1d' },
  { value: '5y', label: '5A', interval: '1wk' },
  { value: 'max', label: 'Máx', interval: '1mo' },
] as const;
export type YahooRange = (typeof YAHOO_RANGES)[number]['value'];

export async function fetchYahooHistory(proxy: string, symbol: string, range: YahooRange): Promise<YahooPoint[]> {
  const interval = YAHOO_RANGES.find((r) => r.value === range)?.interval ?? '1d';
  const res = await chart(proxy, symbol, range, interval);
  const ts = res.timestamp ?? [];
  const closes = res.indicators.quote[0]?.close ?? [];
  return ts
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p): p is YahooPoint => p.close != null && Number.isFinite(p.close));
}

/** Prueba el puente: devuelve el precio de AAPL si responde bien */
export async function testYahooProxy(proxy: string): Promise<string> {
  const q = await fetchYahooQuote(proxy, 'AAPL');
  return `Conectado: Apple (AAPL) US$ ${q.price.toFixed(2)}`;
}
