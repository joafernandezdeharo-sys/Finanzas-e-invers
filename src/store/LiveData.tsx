import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchDollarHistory, fetchDollarQuotes, type DollarQuote } from '../services/dolar';
import { fetchBcraSeries, BCRA_IDS } from '../services/bcra';
import { makeInflationFactor, makeRateOn, type MonthlyInflation, type RatePoint } from '../lib/fx';
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
  /**
   * Convierte a la moneda de visualización. Sin fecha usa la cotización actual (para saldos y valores de hoy);
   * con fecha usa la cotización de ese día (para ingresos y gastos de cada momento).
   */
  toDisplay: (amount: number, from: Currency, date?: string) => number;
  /**
   * Monto de un movimiento (ingreso/gasto) en la moneda de visualización: convierte con la cotización
   * del día y, si está activado "pesos de hoy", lo ajusta por inflación.
   */
  flow: (amount: number, from: Currency, date: string) => number;
  /** Cotización del dólar elegido en una fecha (ARS por USD) */
  rateOn: (date: string) => number;
  /** Multiplicador para expresar pesos de una fecha en pesos de hoy */
  inflationFactor: (date: string) => number;
  inflationLastMonth: string | null;
  /** true si los montos de movimientos se están mostrando ajustados por inflación */
  realTerms: boolean;
  historyReady: boolean;
}

const LiveContext = createContext<Live | null>(null);
const CACHE_KEY = 'mis-finanzas:dollars-cache';
const INFL_KEY = 'mis-finanzas:inflation-cache';

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
  const [fxHistory, setFxHistory] = useState<RatePoint[]>([]);
  const [inflation, setInflation] = useState<MonthlyInflation[]>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(INFL_KEY) ?? 'null');
      return c?.series ?? [];
    } catch {
      return [];
    }
  });

  // histórico del tipo de dólar elegido (para convertir cada movimiento con la cotización de su fecha)
  useEffect(() => {
    let alive = true;
    setFxHistory([]);
    fetchDollarHistory(settings.rateKind)
      .then((h) => alive && setFxHistory(h.map((p) => ({ fecha: p.fecha, venta: p.venta }))))
      .catch(() => {});
    return () => { alive = false; };
  }, [settings.rateKind]);

  // inflación mensual oficial (INDEC vía BCRA), se renueva una vez por día
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(INFL_KEY) ?? 'null');
      if (c && Date.now() - c.at < 86_400_000) return;
    } catch { /* */ }
    fetchBcraSeries(BCRA_IDS.inflacionMensual, '2016-01-01', new Date().toISOString().slice(0, 10))
      .then((s) => {
        const series = s.map((p) => ({ month: p.date.slice(0, 7), pct: p.value }));
        setInflation(series);
        try { localStorage.setItem(INFL_KEY, JSON.stringify({ at: Date.now(), series })); } catch { /* */ }
      })
      .catch(() => {});
  }, []);

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
  const rateOn = useMemo(() => makeRateOn(fxHistory, rate), [fxHistory, rate]);
  const { factor: inflationFactor, lastMonth: inflationLastMonth } = useMemo(() => makeInflationFactor(inflation), [inflation]);
  const display = settings.displayCurrency;
  const realTerms = settings.inflationAdjusted && display === 'ARS' && inflation.length > 0;

  const toDisplay = useCallback(
    (amount: number, from: Currency, date?: string) => convert(amount, from, display, date ? rateOn(date) : rate),
    [display, rate, rateOn],
  );
  const flow = useCallback(
    (amount: number, from: Currency, date: string) => {
      const v = convert(amount, from, display, rateOn(date));
      return realTerms ? v * inflationFactor(date) : v;
    },
    [display, rateOn, realTerms, inflationFactor],
  );
  const historyReady = fxHistory.length > 0;

  const value = useMemo(
    () => ({
      dollars, dollarsUpdated, dollarsError, quotes, quotesUpdated, quotesErrors, loading, refresh, rate, rateFor, toDisplay,
      flow, rateOn, inflationFactor, inflationLastMonth, realTerms, historyReady,
    }),
    [dollars, dollarsUpdated, dollarsError, quotes, quotesUpdated, quotesErrors, loading, refresh, rate, rateFor, toDisplay,
      flow, rateOn, inflationFactor, inflationLastMonth, realTerms, historyReady],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => {
  const l = useContext(LiveContext);
  if (!l) throw new Error('useLive fuera de LiveDataProvider');
  return l;
};
