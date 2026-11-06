/**
 * Banco Central de la República Argentina — API oficial de estadísticas
 * https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp
 */

export interface BcraVariable {
  id: number;
  description: string;
  unit: string;
  date: string;
  value: number;
}

/** Indicadores que mostramos (ids de la API Principales Variables v4.0) */
export const BCRA_IDS = {
  reservas: 1,
  minorista: 4,
  mayorista: 5,
  badlar: 7,
  plazoFijo: 12,
  tamar: 44,
  inflacionMensual: 27,
  inflacionInteranual: 28,
  inflacionEsperada: 29,
  cer: 30,
  uva: 31,
  icl: 40,
  baseMonetaria: 15,
} as const;

let cache: { at: number; data: Map<number, BcraVariable> } | null = null;

export async function fetchBcraVariables(): Promise<Map<number, BcraVariable>> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const r = await fetch('https://api.bcra.gob.ar/estadisticas/v4.0/monetarias?limit=3000', { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`BCRA respondió ${r.status}`);
  const j = await r.json();
  const data = new Map<number, BcraVariable>();
  for (const v of j.results as { idVariable: number; descripcion: string; unidadExpresion: string; ultFechaInformada: string; ultValorInformado: number }[]) {
    data.set(v.idVariable, { id: v.idVariable, description: v.descripcion.trim(), unit: v.unidadExpresion, date: v.ultFechaInformada, value: v.ultValorInformado });
  }
  cache = { at: Date.now(), data };
  return data;
}

export async function fetchBcraSeries(id: number, desde: string, hasta: string): Promise<{ date: string; value: number }[]> {
  const r = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?desde=${desde}&hasta=${hasta}&limit=3000`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`BCRA respondió ${r.status}`);
  const j = await r.json();
  const detalle = (j.results?.[0]?.detalle ?? []) as { fecha: string; valor: number }[];
  return detalle.map((d) => ({ date: d.fecha, value: d.valor })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface RiesgoPais {
  value: number;
  date: string;
}

/** Riesgo país (índice EMBI de JP Morgan) vía ArgentinaDatos */
export async function fetchRiesgoPais(): Promise<RiesgoPais> {
  const r = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo', { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`ArgentinaDatos respondió ${r.status}`);
  const j = await r.json();
  return { value: j.valor, date: j.fecha };
}
