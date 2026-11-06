import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchDollarQuotes, type DollarQuote } from '../services/dolar';
import { fetchQuotes, type Quote } from '../services/prices';
import { useStore } from './AppStore';
import type { Currency, DollarKind } from '../types';
import { convert } from '../lib/util';

interface Live {
  dollars: DollarQuote[];
  dollarsUpdated: Date | null;
  dollarsError: string | null;
  quotes: Record<string, Quote>;
  quotesUpdated: Date | null;
  quotesErrors: string[];
  loading: boolean;
  refresh: () => void;
  /** Cotización (venta) del tipo de dólar elegido en configuración */
  rate: number;
  rateFor: (kind: DollarKind, side?: 'compra' | 'venta') => number;
  /** Convierte a la moneda de visualización */
  toDisplay: (amount: number, from: Currency) => number;
}

const LiveContext = createContext<Live | null>(null);
const CACHE_KEY = 'mis-finanzas:dollars-cache';

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const { settings, investments } = data;
  const [dollars, setDollars] = useState<DollarQuote[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [dollarsUpdated, setDollarsUpdated] = useState<Date | null>(null);
  const [dollarsError, setDollarsError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quotesUpdated, setQuotesUpdated] = useState<Date | null>(null);
  const [quotesErrors, setQuotesErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const invRef = useRef(investments);
  invRef.current = investments;
  const keyRef = useRef(settings.finnhubKey);
  keyRef.current = settings.finnhubKey;
  const yahooRef = useRef(settings.yahooProxyUrl);
  yahooRef.current = settings.yahooProxyUrl;

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchDollarQuotes()
        .then((d) => {
          setDollars(d);
          setDollarsUpdated(new Date());
          setDollarsError(null);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* */ }
        })
        .catch((e) => setDollarsError((e as Error).message)),
      invRef.current.length
        ? fetchQuotes(invRef.current, keyRef.current, yahooRef.current).then((r) => {
            setQuotes(r.quotes);
            setQuotesErrors(r.errors);
            setQuotesUpdated(new Date());
          })
        : Promise.resolve(),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ms = Math.max(15, settings.refreshSeconds || 60) * 1000;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, ms);
    return () => clearInterval(t);
  }, [refresh, settings.refreshSeconds]);

  // si cambia la lista de inversiones (alta de un ticker nuevo) refrescamos sus precios
  const invSignature = investments.map((i) => `${i.type}:${i.symbol}`).join('|');
  useEffect(() => {
    if (!invRef.current.length) return;
    fetchQuotes(invRef.current, keyRef.current, yahooRef.current).then((r) => {
      setQuotes(r.quotes);
      setQuotesErrors(r.errors);
      setQuotesUpdated(new Date());
    });
  }, [invSignature, settings.finnhubKey, settings.yahooProxyUrl]);

  const rateFor = useCallback(
    (kind: DollarKind, side: 'compra' | 'venta' = 'venta') => {
      const q = dollars.find((d) => d.casa === kind);
      return (q?.[side] ?? q?.venta ?? 0) || 0;
    },
    [dollars],
  );
  const rate = rateFor(settings.rateKind);
  const toDisplay = useCallback(
    (amount: number, from: Currency) => convert(amount, from, settings.displayCurrency, rate),
    [settings.displayCurrency, rate],
  );

  const value = useMemo(
    () => ({ dollars, dollarsUpdated, dollarsError, quotes, quotesUpdated, quotesErrors, loading, refresh, rate, rateFor, toDisplay }),
    [dollars, dollarsUpdated, dollarsError, quotes, quotesUpdated, quotesErrors, loading, refresh, rate, rateFor, toDisplay],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => {
  const l = useContext(LiveContext);
  if (!l) throw new Error('useLive fuera de LiveDataProvider');
  return l;
};
