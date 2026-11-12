import type { Currency } from '../../types';
import type { PdfLine, RawDoc } from './readers';
import {
  type Cell, type DateHints, type DecimalSep, cellText, cleanDescription, detectCurrency, detectDateOrder, detectDecimal,
  looksLikeAmount, norm, parseAmount, parseDate,
} from './normalize';

/** Índices de columna (-1 = no usar) */
export interface Mapping {
  headerRow: number; // -1 = sin encabezado
  date: number;
  description: number[];
  amount: number;
  debit: number;
  credit: number;
  amountUSD: number;
  currency: number;
}

export interface ParsedRow {
  date: string;
  description: string;
  signed: number; // positivo = entra plata (crédito), negativo = sale (débito) — antes de aplicar "modo tarjeta"
  currency: Currency;
  exclude?: string; // motivo por el que se sugiere no importarlo
  internalHint?: string; // motivo por el que parece un movimiento entre cuentas propias
  isCard?: boolean;
}

export interface Analysis {
  format: RawDoc['format'];
  columns: string[]; // nombres de columna para el mapeo manual
  sampleRows: Cell[][];
  mapping: Mapping | null;
  rows: ParsedRow[];
  isCard: boolean;
  suggestPositiveIsExpense: boolean;
  warnings: string[];
}

const KW = {
  date: ['fecha', 'date', 'release_date', 'f. operacion', 'f.operacion', 'f. origen', 'dia'],
  balance: ['saldo', 'balance', 'partial_balance'],
  currency: ['moneda', 'currency', 'divisa'],
  amountUSD: ['dolares', 'dolar', 'usd', 'u$s', 'us$'],
  debit: ['debito', 'debitos', 'debe', 'egreso', 'egresos', 'salida', 'salidas', 'cargo', 'cargos', 'retiro', 'debit'],
  credit: ['credito', 'creditos', 'haber', 'ingreso', 'ingresos', 'entrada', 'entradas', 'deposito', 'credit'],
  amount: ['importe', 'monto', 'amount', 'valor', 'net_amount', 'neto', 'pesos', 'total', '$'],
  description: ['descripcion', 'concepto', 'detalle', 'description', 'movimiento', 'transaction_type', 'comercio', 'establecimiento', 'leyenda', 'referencia', 'observacion', 'operacion', 'nombre', 'causal'],
};

const matches = (header: string, words: string[]) => {
  const h = norm(header);
  if (!h || h.length > 45) return false;
  return words.some((w) => h === w || h.split(/[\s_/().-]+/).includes(w) || (w.length > 4 && h.includes(w)));
};

const roleCount = (row: Cell[]) =>
  row.filter((c) => typeof c === 'string' && Object.values(KW).some((ws) => matches(c, ws))).length;

/** Busca la fila de encabezados (la que más palabras clave contiene en las primeras filas) */
function findHeaderRow(rows: Cell[][]): number {
  let best = -1, bestScore = 1;
  rows.slice(0, 60).forEach((r, i) => {
    const score = roleCount(r);
    const hasDate = r.some((c) => typeof c === 'string' && matches(c, KW.date));
    if (hasDate && score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function mappingFromHeader(header: Cell[], headerRow: number): Mapping {
  const used = new Set<number>();
  const take = (words: string[], extra?: (h: string) => boolean) => {
    const i = header.findIndex((c, idx) => !used.has(idx) && typeof c === 'string' && matches(c, words) && (!extra || extra(norm(c))));
    if (i >= 0) used.add(i);
    return i;
  };
  const date = take(KW.date);
  take(KW.balance); // la reservamos para no confundirla con un monto
  const currency = take(KW.currency);
  const amountUSD = take(KW.amountUSD);
  const debit = take(KW.debit);
  const credit = take(KW.credit);
  const amount = take(KW.amount);
  const description: number[] = [];
  for (let k = 0; k < 2; k++) {
    const d = take(KW.description);
    if (d >= 0) description.push(d);
  }
  return { headerRow, date, description: description.sort((a, b) => a - b), amount, debit, credit, amountUSD, currency };
}

/** Sin encabezados: deducimos las columnas por su contenido */
function mappingFromContent(rows: Cell[][], hints: DateHints): Mapping {
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  const sample = rows.slice(0, 300);
  const stats = Array.from({ length: width }, (_, i) => {
    const vals = sample.map((r) => r[i]).filter((v) => cellText(v) !== '');
    const n = vals.length || 1;
    return {
      i,
      date: vals.filter((v) => parseDate(v, hints)).length / n,
      amount: vals.filter((v) => looksLikeAmount(v) && !parseDate(v, hints)).length / n,
      len: vals.reduce<number>((a, v) => a + cellText(v).length, 0) / n,
      filled: vals.length / Math.max(1, sample.length),
    };
  });
  const date = stats.filter((s) => s.date > 0.5).sort((a, b) => b.date - a.date)[0]?.i ?? -1;
  const nums = stats.filter((s) => s.i !== date && s.amount > 0.5 && s.filled > 0.2).map((s) => s.i);
  const desc = stats.filter((s) => s.i !== date && !nums.includes(s.i)).sort((a, b) => b.len - a.len)[0]?.i ?? -1;
  const m: Mapping = { headerRow: -1, date, description: desc >= 0 ? [desc] : [], amount: -1, debit: -1, credit: -1, amountUSD: -1, currency: -1 };
  if (nums.length === 1) m.amount = nums[0];
  else if (nums.length === 2) m.amount = nums[0]; // el segundo suele ser el saldo
  else if (nums.length >= 3) { m.debit = nums[0]; m.credit = nums[1]; }
  return m;
}

const EXCLUDE_RE = /^(saldo (anterior|inicial|final|actual|al|disponible)|saldo$|total|sub ?total|pago minimo|limite de|cft|tna|tea)/;
const CARD_PAYMENT_RE = /(su pago|pago en pesos|pago en dolares|pago recibido|pago tarjeta|pago de tarjeta|pago resumen)/;

function rowsFromMapping(rows: Cell[][], m: Mapping, hints: DateHints, dec: DecimalSep, defaultCurrency: Currency, header: Cell[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  const amountHeaderCur = m.amount >= 0 ? detectCurrency(cellText(header[m.amount])) : null;
  let lastDate: string | null = null;
  for (const r of rows.slice(m.headerRow + 1)) {
    const description = cleanDescription(m.description.map((i) => cellText(r[i])).filter(Boolean).join(' · '));
    let date = m.date >= 0 ? parseDate(r[m.date], hints) : null;
    // cargos sin fecha propia (impuestos, sellos, intereses al pie del resumen): usan la fecha anterior
    if (!date && lastDate && description && !cellText(r[m.date])) date = lastDate;
    if (!date) continue;
    lastDate = date;
    let signed: number | null = null;
    let currency: Currency = amountHeaderCur ?? defaultCurrency;
    if (m.debit >= 0 || m.credit >= 0) {
      const d = m.debit >= 0 ? Math.abs(parseAmount(r[m.debit], dec) ?? 0) : 0;
      const c = m.credit >= 0 ? Math.abs(parseAmount(r[m.credit], dec) ?? 0) : 0;
      if (d || c) signed = c - d;
    }
    if (signed == null && m.amount >= 0) {
      const a = parseAmount(r[m.amount], dec);
      if (a) signed = a;
    }
    if ((signed == null || signed === 0) && m.amountUSD >= 0) {
      const u = parseAmount(r[m.amountUSD], dec);
      if (u) { signed = u; currency = 'USD'; }
    }
    if (signed == null || signed === 0) continue;
    if (m.currency >= 0) currency = detectCurrency(cellText(r[m.currency])) ?? currency;
    else if (m.amount >= 0 && typeof r[m.amount] === 'string') currency = detectCurrency(cellText(r[m.amount])) ?? currency;
    out.push({ date, description: description || '(sin descripción)', signed, currency });
  }
  return out;
}

// ------------------------------------------------------------------ PDF

/** Si el PDF tiene una fila de encabezados, armamos una tabla asignando cada celda a la columna más cercana */
function pdfToTable(lines: PdfLine[]): { rows: Cell[][]; headerIdx: number } | null {
  const headerIdx = lines.findIndex((l) => {
    const cells = l.cells.map((c) => c.text);
    return cells.some((c) => matches(c, KW.date)) && roleCount(cells) >= 3;
  });
  if (headerIdx < 0) return null;
  const header = lines[headerIdx].cells;
  const center = (c: { x: number; xEnd: number }) => (c.x + c.xEnd) / 2;
  const rows: Cell[][] = [header.map((h) => h.text)];
  for (const l of lines.slice(headerIdx + 1)) {
    // el encabezado se repite en cada página: lo salteamos
    if (roleCount(l.cells.map((c) => c.text)) >= 3) continue;
    const row: string[] = header.map(() => '');
    for (const c of l.cells) {
      // texto: por superposición; montos (alineados a la derecha): por el borde derecho
      let best = 0, bestD = Infinity;
      header.forEach((h, i) => {
        const d = looksLikeAmount(c.text) ? Math.abs(c.xEnd - h.xEnd) : Math.abs(center(c) - center(h)) * (c.x >= h.x - 4 ? 0.6 : 1);
        if (d < bestD) { bestD = d; best = i; }
      });
      row[best] = row[best] ? `${row[best]} ${c.text}` : c.text;
    }
    rows.push(row);
  }
  return { rows, headerIdx: 0 };
}

/** Modo línea: cada línea que empieza con una fecha y tiene montos es un movimiento */
function rowsFromPdfLines(lines: PdfLine[], hints: DateHints, dec: DecimalSep, defaultCurrency: Currency, text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const hasBalanceCol = /\bsaldo\b/i.test(text);
  // columnas de dólares en resúmenes de tarjeta
  const usdHeader = lines.flatMap((l) => l.cells).find((c) => /^(u\$s|us\$|usd|dolares|dólares)$/i.test(c.text.trim()));
  for (const l of lines) {
    if (!l.cells.length) continue;
    const first = l.cells[0].text;
    const date = parseDate(first, hints) ?? parseDate(first.split(' ').slice(0, 3).join(' '), hints);
    if (!date) continue;
    const amountCells = l.cells.slice(1).filter((c) => looksLikeAmount(c.text) && !parseDate(c.text, hints));
    if (!amountCells.length) continue;
    const descParts = l.cells.slice(1).filter((c) => !amountCells.includes(c)).map((c) => c.text);
    // si la fecha venía pegada a la descripción en la misma celda
    const firstRest = first.replace(/^\S+(\s+\S+){0,2}/, (m) => (parseDate(m, hints) ? '' : m)).trim();
    if (firstRest && !parseDate(firstRest, hints)) descParts.unshift(firstRest);
    let pick = amountCells[0];
    if (amountCells.length >= 2 && hasBalanceCol) pick = amountCells[amountCells.length - 2];
    const amount = parseAmount(pick.text, dec);
    if (!amount) continue;
    let currency = detectCurrency(l.text) ?? defaultCurrency;
    if (usdHeader && Math.abs(pick.xEnd - usdHeader.xEnd) < 25) currency = 'USD';
    out.push({ date, description: cleanDescription(descParts.join(' ')) || '(sin descripción)', signed: amount, currency });
  }
  return out;
}

// ------------------------------------------------------------------

function guessYear(text: string): number {
  const years = [...text.matchAll(/\b(20[2-9]\d)\b/g)].map((m) => +m[1]);
  const now = new Date().getFullYear();
  const valid = years.filter((y) => y <= now + 1);
  return valid.length ? Math.max(...valid) : now;
}

const CARD_RE = /(pago minimo|cierre actual|proximo cierre|limite de compra|resumen de tarjeta|vencimiento actual|visa|mastercard|american express|amex|cabal|naranja|consumos)/;

export function analyze(doc: RawDoc, opts: { mapping?: Mapping | null; defaultCurrency: Currency; sourceIsCard?: boolean }): Analysis {
  const textN = norm(doc.text);
  const isCard = !!opts.sourceIsCard || (CARD_RE.test(textN) && !/\b(caja de ahorro|cuenta corriente)\b/.test(textN));
  const warnings: string[] = [];
  let rows: ParsedRow[] = [];
  let table: Cell[][] = [];
  let mapping: Mapping | null = null;

  if (doc.format === 'ofx') {
    rows = doc.ofx
      .map((t) => ({
        date: parseDate(t.date) ?? '',
        description: cleanDescription(t.description) || '(sin descripción)',
        signed: t.amount,
        currency: (t.currency === 'USD' ? 'USD' : t.currency === 'ARS' ? 'ARS' : opts.defaultCurrency) as Currency,
      }))
      .filter((r) => r.date && r.signed);
  } else {
    table = doc.rows;
    let pdfLineMode = false;
    if (doc.format === 'pdf') {
      const t = pdfToTable(doc.lines);
      if (t) table = t.rows;
      else pdfLineMode = true;
    }
    const allCells = table.flat();
    const hints: DateHints = { order: detectDateOrder(allCells), defaultYear: guessYear(doc.text) };
    const dec = detectDecimal(allCells);

    if (pdfLineMode && doc.format === 'pdf') {
      rows = rowsFromPdfLines(doc.lines, hints, dec, opts.defaultCurrency, doc.text);
    } else {
      const headerRow = findHeaderRow(table);
      mapping = opts.mapping ?? (headerRow >= 0 ? mappingFromHeader(table[headerRow], headerRow) : mappingFromContent(table, hints));
      const header = mapping.headerRow >= 0 ? table[mapping.headerRow] : [];
      rows = rowsFromMapping(table, mapping, hints, dec, opts.defaultCurrency, header);
      // si el mapeo automático no encontró nada en un PDF, probamos línea por línea
      if (!rows.length && doc.format === 'pdf' && !opts.mapping) {
        rows = rowsFromPdfLines(doc.lines, hints, dec, opts.defaultCurrency, doc.text);
        mapping = null;
      }
    }

    // fechas sin año que quedaron en el futuro corresponden al año anterior
    const limit = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10);
    rows.forEach((r) => {
      if (r.date > limit) r.date = `${+r.date.slice(0, 4) - 1}${r.date.slice(4)}`;
    });
  }

  // filas que no son movimientos reales
  rows.forEach((r) => {
    const d = norm(r.description);
    if (EXCLUDE_RE.test(d)) r.exclude = 'Parece un saldo o total, no un movimiento';
    // el pago del resumen no es un ingreso: es plata que pasa del banco a la tarjeta
    else if (isCard && CARD_PAYMENT_RE.test(d)) r.internalHint = 'Pago de la tarjeta: se registra como movimiento entre cuentas';
    r.isCard = isCard;
  });

  const positives = rows.filter((r) => r.signed > 0).length;
  const singleAmount = !mapping || (mapping.debit < 0 && mapping.credit < 0);
  const suggestPositiveIsExpense = doc.format !== 'ofx' && singleAmount && rows.length > 0 && (isCard || positives / rows.length > 0.7);

  if (!rows.length) warnings.push('No se encontraron movimientos automáticamente. Probá ajustar las columnas manualmente.');

  const width = Math.max(0, ...table.slice(0, 200).map((r) => r.length));
  const headerCells = mapping && mapping.headerRow >= 0 ? table[mapping.headerRow] : [];
  const columns = Array.from({ length: width }, (_, i) => cellText(headerCells[i]) || `Columna ${i + 1}`);

  return {
    format: doc.format,
    columns,
    sampleRows: table.slice(mapping && mapping.headerRow >= 0 ? mapping.headerRow + 1 : 0).slice(0, 5),
    mapping,
    rows,
    isCard,
    suggestPositiveIsExpense,
    warnings,
  };
}
