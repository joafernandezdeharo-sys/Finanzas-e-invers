import type { DollarKind } from '../types';

export interface DollarQuote {
  casa: DollarKind;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string;
}

export interface DollarHistoryPoint {
  fecha: string;
  compra: number;
  venta: number;
}

/** Cotizaciones en tiempo real: https://dolarapi.com */
export async function fetchDollarQuotes(signal?: AbortSignal): Promise<DollarQuote[]> {
  const res = await fetch('https://dolarapi.com/v1/dolares', { signal });
  if (!res.ok) throw new Error(`DolarAPI respondió ${res.status}`);
  return res.json();
}

const historyCache = new Map<string, Promise<DollarHistoryPoint[]>>();

/** Histórico diario por casa: https://argentinadatos.com */
export function fetchDollarHistory(kind: DollarKind): Promise<DollarHistoryPoint[]> {
  if (!historyCache.has(kind)) {
    const p = fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${kind}`)
      .then((r) => {
        if (!r.ok) throw new Error(`ArgentinaDatos respondió ${r.status}`);
        return r.json() as Promise<DollarHistoryPoint[]>;
      })
      .catch((e) => {
        historyCache.delete(kind);
        throw e;
      });
    historyCache.set(kind, p);
  }
  return historyCache.get(kind)!;
}
