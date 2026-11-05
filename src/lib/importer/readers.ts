import type { Cell } from './normalize';

export interface PdfCell {
  x: number;
  xEnd: number;
  text: string;
}
export interface PdfLine {
  page: number;
  y: number;
  cells: PdfCell[];
  text: string;
}

export interface OfxTx {
  date: string;
  amount: number;
  description: string;
  currency: string | null;
}

export type RawDoc =
  | { format: 'csv' | 'excel'; rows: Cell[][]; text: string; sheets?: string[] }
  | { format: 'pdf'; rows: Cell[][]; lines: PdfLine[]; text: string }
  | { format: 'ofx'; ofx: OfxTx[]; text: string };

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

// ------------------------------------------------------------------ texto / CSV

/** Lee el archivo como texto probando UTF-8 y, si falla, Windows-1252 (típico de bancos) */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const candidates = [';', ',', '\t', '|'];
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => splitCsvLine(l, d).length);
    const common = mode(counts);
    if (common < 2) continue;
    const score = counts.filter((c) => c === common).length * common;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

const mode = (xs: number[]) => {
  const m = new Map<number, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  let best = 0, n = 0;
  m.forEach((c, x) => { if (c > n || (c === n && x > best)) { best = x; n = c; } });
  return best;
};

function splitCsvLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): Cell[][] {
  const d = detectDelimiter(text);
  // respeta saltos de línea dentro de comillas
  const rows: string[] = [];
  let cur = '', q = false;
  for (const line of text.split(/\r?\n/)) {
    cur = cur ? `${cur}\n${line}` : line;
    q = (cur.match(/"/g)?.length ?? 0) % 2 === 1;
    if (!q) { rows.push(cur); cur = ''; }
  }
  if (cur) rows.push(cur);
  return rows.filter((r) => r.trim()).map((r) => splitCsvLine(r, d));
}

// ------------------------------------------------------------------ Excel

async function readExcel(file: File): Promise<{ rows: Cell[][]; sheets: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true, dense: true });
  // elegimos la hoja con más filas con datos
  let best: Cell[][] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
    if (rows.length > best.length) best = rows;
  }
  return { rows: best.map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c))), sheets: wb.SheetNames };
}

// ------------------------------------------------------------------ PDF

async function readPdf(file: File, password?: string): Promise<{ lines: PdfLine[]; text: string }> {
  const pdfjs = await import('pdfjs-dist');
  const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline');
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise;
  const lines: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width: number };
    const items = (content.items as Item[]).filter((i) => i.str?.trim());
    // agrupamos por coordenada Y (misma línea visual)
    const byY: { y: number; items: Item[] }[] = [];
    for (const it of items) {
      const y = it.transform[5];
      const row = byY.find((r) => Math.abs(r.y - y) < 2.5);
      if (row) row.items.push(it); else byY.push({ y, items: [it] });
    }
    byY.sort((a, b) => b.y - a.y);
    for (const r of byY) {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      // unimos fragmentos cercanos en la misma celda; un hueco grande separa columnas
      const cells: PdfCell[] = [];
      let lastEnd = -Infinity;
      for (const it of r.items) {
        const x = it.transform[4];
        const fontSize = Math.abs(it.transform[0]) || 8;
        if (cells.length && x - lastEnd < fontSize * 0.9) {
          const c = cells[cells.length - 1];
          c.text += (x - lastEnd > fontSize * 0.15 ? ' ' : '') + it.str;
          c.xEnd = x + it.width;
        } else cells.push({ x, xEnd: x + it.width, text: it.str });
        lastEnd = x + it.width;
      }
      cells.forEach((c) => (c.text = c.text.replace(/\s+/g, ' ').trim()));
      lines.push({ page: p, y: r.y, cells: cells.filter((c) => c.text), text: cells.map((c) => c.text).join(' ') });
    }
  }
  return { lines, text: lines.map((l) => l.text).join('\n') };
}

// ------------------------------------------------------------------ OFX / QFX

function parseOfx(text: string): OfxTx[] {
  const cur = text.match(/<CURDEF>\s*([A-Z]{3})/i)?.[1] ?? null;
  const tag = (block: string, t: string) => block.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  return [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)].map((m) => {
    const b = m[1];
    return {
      date: tag(b, 'DTPOSTED').slice(0, 8),
      amount: Number(tag(b, 'TRNAMT').replace(',', '.')),
      description: [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' · '),
      currency: tag(b, 'CURRENCY') || cur,
    };
  });
}

// ------------------------------------------------------------------

export class PasswordError extends Error {}

export async function readDocument(file: File, password?: string): Promise<RawDoc> {
  const e = ext(file.name);
  if (e === 'pdf') {
    try {
      const { lines, text } = await readPdf(file, password);
      return { format: 'pdf', lines, text, rows: lines.map((l) => l.cells.map((c) => c.text)) };
    } catch (err) {
      if ((err as { name?: string }).name === 'PasswordException') throw new PasswordError('El PDF está protegido con contraseña');
      throw err;
    }
  }
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(e)) {
    const { rows, sheets } = await readExcel(file);
    return { format: 'excel', rows, sheets, text: rows.slice(0, 40).map((r) => r.join(' ')).join('\n') };
  }
  const text = await readText(file);
  if (e === 'ofx' || e === 'qfx' || /<OFX>/i.test(text.slice(0, 2000))) return { format: 'ofx', ofx: parseOfx(text), text: text.slice(0, 4000) };
  // algunos bancos exportan "xls" que en realidad es HTML
  if (/<table/i.test(text.slice(0, 5000))) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(text, { type: 'string', cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '', blankrows: false });
    return { format: 'excel', rows, text: rows.slice(0, 40).map((r) => r.join(' ')).join('\n') };
  }
  const rows = parseCsv(text);
  return { format: 'csv', rows, text: text.slice(0, 4000) };
}
