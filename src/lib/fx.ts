/**
 * Conversiones con cotizaciones históricas y ajuste por inflación.
 * Funciones puras (sin React) para poder probarlas.
 */

export interface RatePoint {
  fecha: string; // YYYY-MM-DD
  venta: number;
}

/**
 * Devuelve una función que da la cotización de un día (la del último día hábil anterior o igual).
 * Si la fecha es anterior al histórico usa el primer valor; si no hay histórico, `fallback`.
 */
export function makeRateOn(history: RatePoint[], fallback: number): (date: string) => number {
  const pts = history.filter((p) => p.venta > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!pts.length) return () => fallback;
  const last = pts[pts.length - 1];
  return (date: string) => {
    const d = date.slice(0, 10);
    // si la fecha es posterior al último dato (hoy, o el histórico se publica con demora) usamos la cotización actual
    if (d > last.fecha) return fallback || last.venta;
    let lo = 0, hi = pts.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].fecha <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans < 0 ? pts[0].venta : pts[ans].venta;
  };
}

export interface MonthlyInflation {
  month: string; // YYYY-MM
  pct: number; // variación mensual en %
}

/**
 * Factor para llevar pesos de un mes a "pesos de hoy" (último mes con inflación publicada).
 * factor(m) = Π (1 + inflación) de los meses posteriores a m.
 */
export function makeInflationFactor(series: MonthlyInflation[]): { factor: (date: string) => number; lastMonth: string | null } {
  const s = [...series].sort((a, b) => a.month.localeCompare(b.month));
  if (!s.length) return { factor: () => 1, lastMonth: null };
  // índice acumulado al cierre de cada mes
  const idx = new Map<string, number>();
  let acc = 1;
  for (const p of s) {
    acc *= 1 + p.pct / 100;
    idx.set(p.month, acc);
  }
  const lastMonth = s[s.length - 1].month;
  const first = s[0].month;
  const lastIdx = acc;
  return {
    lastMonth,
    factor: (date: string) => {
      const m = date.slice(0, 7);
      if (m >= lastMonth) return 1;
      // pesos del mes m valen el nivel de precios al cierre de m
      if (m < first) return lastIdx; // antes de la serie: tomamos todo lo acumulado
      let v = idx.get(m);
      if (v == null) {
        // mes faltante: buscamos el anterior disponible
        const prev = s.filter((p) => p.month <= m).pop();
        v = prev ? idx.get(prev.month)! : 1;
      }
      return lastIdx / v;
    },
  };
}
