/** Utilidades para interpretar fechas, montos y textos de resúmenes bancarios argentinos */

export type Cell = string | number | Date | null | undefined;

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const cellText = (c: Cell): string => {
  if (c == null) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
};

// ---------------------------------------------------------------- fechas

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, enero: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, apr: 4, abril: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, aug: 8, agosto: 8, august: 8,
  sep: 9, set: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, dec: 12, diciembre: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

export interface DateHints {
  order: 'dmy' | 'mdy';
  defaultYear: number;
}

/** Excel guarda fechas como número de días desde 1899-12-30 */
const fromExcelSerial = (n: number) => {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return valid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export function parseDate(c: Cell, hints: DateHints = { order: 'dmy', defaultYear: new Date().getFullYear() }): string | null {
  if (c == null || c === '') return null;
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return null;
    // SheetJS crea las fechas en hora local
    return valid(c.getFullYear(), c.getMonth() + 1, c.getDate());
  }
  if (typeof c === 'number') return c > 20000 && c < 80000 ? fromExcelSerial(c) : null;

  const s = norm(String(c));
  let m: RegExpMatchArray | null;

  // 2026-11-05 / 2026/11/05 / 20261105 (OFX)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{6})?(\b|\[|\.|$)/))) return valid(+m[1], +m[2], +m[3]);

  // 05/11/2026, 05-11-26, 05.11.2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    return hints.order === 'mdy' ? valid(y, a, b) ?? valid(y, b, a) : valid(y, b, a) ?? valid(y, a, b);
  }

  // 05-nov-26, 05 nov 2026, 5 de noviembre de 2026, 05nov26
  if ((m = s.match(/^(\d{1,2})[\s\-/.]*(?:de\s+)?([a-z]{3,10})\.?[\s\-/.]*(?:de\s+)?(\d{2,4})?\b/))) {
    const mon = MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 3)];
    if (mon) return valid(m[3] ? fullYear(+m[3]) : hints.defaultYear, mon, +m[1]);
  }

  // nov 05 2026 / november 5, 2026
  if ((m = s.match(/^([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mon = MONTHS[m[1]] ?? MONTHS[m[1].slice(0, 3)];
    if (mon) return valid(+m[3], mon, +m[2]);
  }

  // 05/11 (sin año)
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) {
    const a = +m[1], b = +m[2];
    return hints.order === 'mdy' ? valid(hints.defaultYear, a, b) : valid(hints.defaultYear, b, a);
  }
  return null;
}

/** Detecta si las fechas vienen como día/mes o mes/día mirando todos los valores */
export function detectDateOrder(values: Cell[]): 'dmy' | 'mdy' {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/) : null;
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

// ---------------------------------------------------------------- montos

export type DecimalSep = ',' | '.';

/** Mira todos los montos de texto y decide si la coma o el punto es el separador decimal */
export function detectDecimal(values: Cell[]): DecimalSep {
  let comma = 0, dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
    else if (/\d\.\d{3},/.test(s)) comma++;
    else if (/\d,\d{3}\./.test(s)) dot++;
  }
  return dot > comma ? '.' : ',';
}

const AMOUNT_RE = /^[(\-−+]?\s*(?:[a-z$€]{0,4}\s*)?[(\-−]?\s*\d[\d.,\s]*\)?\s*-?$/i;

/** Devuelve true si el texto parece un monto (ej. "$ -1.234,56", "(1,234.56)", "1.234,56-") */
export function looksLikeAmount(c: Cell): boolean {
  if (typeof c === 'number') return Number.isFinite(c);
  if (typeof c !== 'string') return false;
  const s = c.trim().replace(/u\$s|us\$|usd|ars|\$/gi, '').trim();
  return s.length > 0 && s.length < 24 && AMOUNT_RE.test(s) && /\d/.test(s);
}

export function parseAmount(c: Cell, dec: DecimalSep = ','): number | null {
  if (c == null || c === '') return null;
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (c instanceof Date) return null;
  let s = String(c).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[-−]/.test(s) || /-\s*$/.test(s) || /^[a-z$€\s]*[-−]/i.test(s)) neg = true;
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    s = parts.length === 2 && (parts[1].length !== 3 || dec === ',') ? `${parts[0]}.${parts[1]}` : parts.join('');
  } else if (hasDot) {
    const parts = s.split('.');
    s = parts.length === 2 && (parts[1].length !== 3 || dec === '.') ? s : parts.join('');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export const detectCurrency = (s: string): 'USD' | 'ARS' | null => {
  const t = norm(s);
  if (/\b(usd|u\$s|us\$|u\$d|dolar|dolares|dólares)\b/.test(t) || t.includes('u$s') || t.includes('us$')) return 'USD';
  if (/\b(ars|pesos|\$)\b/.test(t)) return 'ARS';
  return null;
};

/** Limpia la descripción: espacios, números de comprobante largos, etc. */
export const cleanDescription = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^[*\-\s]+/, '')
    .trim();

/** Descripción reducida para comparar duplicados y crear reglas (sin números ni símbolos) */
export const descKey = (s: string) =>
  norm(s)
    .replace(/\d+/g, ' ')
    .replace(/[^a-z&+. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
