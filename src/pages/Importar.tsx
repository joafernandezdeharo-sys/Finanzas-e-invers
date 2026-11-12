import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, PageHead, Segmented, Stat } from '../components/ui';
import { IconDownload, IconTrash, IconUpload } from '../components/Icons';
import { SOURCES } from '../lib/defaults';
import { convert, formatDate, formatMoney, sum } from '../lib/util';
import { readDocument, PasswordError, type RawDoc } from '../lib/importer/readers';
import { analyze, type Analysis, type Mapping } from '../lib/importer/analyze';
import { buildCandidates, categorize, type Candidate, type CandidateStatus } from '../lib/importer/finalize';
import { detectSource, isCardSource, suggestAccount } from '../lib/importer/detect';
import { descKey } from '../lib/importer/normalize';
import { exportBackup } from '../components/BackupReminder';
import { INTERNAL_CATEGORY } from '../components/TxForm';
import type { CategoryRule, Currency, TxType } from '../types';

interface Session {
  file: File;
  doc: RawDoc;
  source: string;
  account: string;
  defaultCurrency: Currency;
  positiveIsExpense: boolean;
  mapping: Mapping | null;
  analysis: Analysis;
  candidates: Candidate[];
  learned: Record<string, CategoryRule>; // descKey -> regla aprendida en esta sesión
}

const ACCEPT = '.csv,.txt,.xls,.xlsx,.xlsm,.ods,.pdf,.ofx,.qfx,.jpg,.jpeg,.png,.webp,image/*';

const FORMAT_LABEL: Record<RawDoc['format'], string> = { csv: 'CSV', excel: 'Excel', pdf: 'PDF', ofx: 'OFX' };
const formatLabel = (d: RawDoc) => (d.format === 'pdf' && d.ocr ? 'Imagen / PDF escaneado (texto reconocido por OCR: revisá montos y fechas)' : FORMAT_LABEL[d.format]);

export default function Importar() {
  const { data, importBatch, removeImport, clearImports } = useStore();
  const { settings, transactions, imports } = data;
  const live = useLive();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [needPassword, setNeedPassword] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [view, setView] = useState<'todos' | CandidateStatus>('todos');
  const [remember, setRemember] = useState(true);
  const [showMapping, setShowMapping] = useState(false);
  const [done, setDone] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);

  const fallback = useMemo(() => ({
    ingreso: settings.incomeCategories.includes('Otros ingresos') ? 'Otros ingresos' : settings.incomeCategories[0] ?? 'Otros ingresos',
    gasto: settings.expenseCategories.includes('Otros gastos') ? 'Otros gastos' : settings.expenseCategories[0] ?? 'Otros gastos',
  }), [settings.incomeCategories, settings.expenseCategories]);

  const rebuild = useCallback((s: Omit<Session, 'analysis' | 'candidates'>, keepMapping: boolean): Session => {
    const analysis = analyze(s.doc, { mapping: keepMapping ? s.mapping : null, defaultCurrency: s.defaultCurrency, sourceIsCard: isCardSource(s.source) });
    const candidates = buildCandidates(analysis.rows, {
      positiveIsExpense: s.positiveIsExpense,
      rules: [...Object.values(s.learned), ...settings.categoryRules],
      existing: transactions,
      fallback,
      account: s.account,
      userName: settings.userName,
      internalCategory: INTERNAL_CATEGORY,
    });
    return { ...s, mapping: analysis.mapping, analysis, candidates };
  }, [settings.categoryRules, settings.userName, transactions, fallback]);

  const open = useCallback(async (file: File, pwd?: string) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const doc = await readDocument(file, pwd, (msg, pct) => setProgress({ msg, pct }));
      const source = detectSource(file.name, doc.text) ?? '';
      const first = analyze(doc, { defaultCurrency: 'ARS', sourceIsCard: isCardSource(source) });
      const base = {
        file, doc, source,
        account: suggestAccount(source, first.isCard, settings.accounts),
        defaultCurrency: 'ARS' as Currency,
        positiveIsExpense: first.suggestPositiveIsExpense,
        mapping: first.mapping,
        learned: {},
      };
      setSession(rebuild(base, true));
      setNeedPassword(null);
      setPassword('');
      setView('todos');
      setShowMapping(false);
    } catch (e) {
      if (e instanceof PasswordError) {
        setNeedPassword(file);
        if (pwd) setError('La contraseña no es correcta.');
      } else {
        setError(`No se pudo leer "${file.name}": ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [rebuild, settings.accounts]);

  const addFiles = (files: FileList | File[]) => {
    // copiamos la lista ya: el FileList del input se vacía al resetearlo
    const list = Array.from(files);
    if (list.length) setQueue((q) => [...q, ...list]);
  };

  // abrimos el siguiente archivo en espera cuando no hay ninguno en revisión
  // (después de re-renderizar, así la detección de repetidos incluye lo recién importado)
  useEffect(() => {
    if (session || needPassword || busy || !queue.length) return;
    const [first, ...rest] = queue;
    setQueue(rest);
    open(first);
  }, [session, needPassword, busy, queue, open]);

  const next = () => setSession(null);

  const update = (patch: Partial<Session>, keepMapping = true) => {
    if (!session) return;
    setSession(rebuild({ ...session, ...patch }, keepMapping));
  };

  const editCandidate = (key: string, patch: Partial<Candidate>) => {
    if (!session) return;
    const target = session.candidates.find((c) => c.key === key)!;
    let learned = session.learned;
    let candidates = session.candidates.map((c) => (c.key === key ? { ...c, ...patch } : c));
    if (patch.type && patch.type !== target.type) {
      candidates = candidates.map((c) => (c.key === key && !c.internal ? { ...c, category: categorize(c.description, c.type, settings.categoryRules, fallback) } : c));
    }
    if (patch.category) {
      // aprendemos la categoría y la aplicamos a los movimientos con la misma descripción
      const k = descKey(target.description);
      if (k.length >= 3) {
        learned = { ...learned, [k]: { keyword: k, category: patch.category, type: target.type } };
        candidates = candidates.map((c) => (descKey(c.description) === k && c.type === target.type ? { ...c, category: patch.category! } : c));
      }
    }
    setSession({ ...session, candidates, learned });
  };

  const setAll = (include: boolean) => {
    if (!session) return;
    setSession({ ...session, candidates: session.candidates.map((c) => (view === 'todos' || c.status === view ? { ...c, include } : c)) });
  };

  const selected = session?.candidates.filter((c) => c.include) ?? [];
  const toARS = (n: number, cur: Currency) => convert(n, cur, 'ARS', live.rate || 1);
  const selIn = sum(selected.filter((c) => c.type === 'ingreso' && !c.internal).map((c) => toARS(c.amount, c.currency)));
  const selOut = sum(selected.filter((c) => c.type === 'gasto' && !c.internal).map((c) => toARS(c.amount, c.currency)));
  const counts = (st: CandidateStatus) => session?.candidates.filter((c) => c.status === st).length ?? 0;

  const doImport = () => {
    if (!session || !selected.length) return;
    const dates = selected.map((c) => c.date).sort();
    const source = session.source || 'Otro';
    importBatch(
      {
        fileName: session.file.name,
        source,
        importedAt: new Date().toISOString(),
        count: selected.length,
        skipped: session.candidates.length - selected.length,
        from: dates[0],
        to: dates[dates.length - 1],
        totalIn: selIn,
        totalOut: selOut,
      },
      selected.map((c) => ({
        date: c.date, type: c.type, amount: c.amount, currency: c.currency, category: c.category,
        description: c.description, account: session.account, source,
        internal: c.internal || undefined, installment: c.installment,
      })),
      remember ? Object.values(session.learned) : [],
    );
    setDone(`Se importaron ${selected.length} movimientos de "${session.file.name}".`);
    next();
  };

  const shown = session?.candidates.filter((c) => view === 'todos' || c.status === view) ?? [];
  const importedCount = transactions.filter((t) => t.importId).length;

  const mappingSelect = (label: string, field: keyof Omit<Mapping, 'headerRow' | 'description'>) => (
    <Field label={label}>
      <select className="select" value={session?.mapping?.[field] ?? -1} onChange={(e) => update({ mapping: { ...session!.mapping!, [field]: Number(e.target.value) } })}>
        <option value={-1}>— ninguna —</option>
        {session?.analysis.columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
      </select>
    </Field>
  );

  return (
    <>
      <PageHead title="Importar resúmenes" subtitle="Subí los extractos o resúmenes de tus bancos, billeteras y tarjetas. Los movimientos se acumulan y los repetidos se omiten solos." />

      {!session && !needPassword && (
        <div
          className={`card dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <IconUpload width={32} height={32} />
          <b>{busy ? (progress?.msg ?? 'Leyendo archivo…') : 'Tocá para elegir archivos o arrastralos acá'}</b>
          {busy && progress && progress.pct > 0 && <div className="progress" style={{ width: 240 }}><div style={{ width: `${progress.pct}%` }} /></div>}
          <span className="small muted">PDF (también escaneados), Excel, CSV, OFX o una foto/captura del resumen · Mercado Pago, Ualá, Brubank, Naranja X, Galicia, Santander, BBVA, Macro, ICBC, Nación, Provincia y cualquier otro banco o tarjeta</span>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {done && <div className="alert good">{done} <Link to="/movimientos">Ver movimientos →</Link> · <Link to="/historial">Ver historial →</Link></div>}
      {error && <div className="alert bad">{error}</div>}

      {needPassword && (
        <Card title="El PDF tiene contraseña" subtitle={`${needPassword.name} — muchos bancos usan tu DNI o CUIL como contraseña del resumen.`}>
          <form className="filters" onSubmit={(e) => { e.preventDefault(); open(needPassword, password); }}>
            <input className="input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña del PDF" style={{ maxWidth: 260 }} />
            <button className="btn btn-primary" type="submit" disabled={!password || busy}>Abrir</button>
            <button className="btn" type="button" onClick={() => { setNeedPassword(null); setError(''); }}>Saltear</button>
          </form>
          <p className="small muted" style={{ marginBottom: 0 }}>La contraseña se usa solo en tu dispositivo para leer el archivo y no se guarda.</p>
        </Card>
      )}

      {session && (
        <Card
          title={`Revisar: ${session.file.name}`}
          subtitle={<>{formatLabel(session.doc)} · {session.candidates.length} movimientos detectados{queue.length ? ` · ${queue.length} archivo(s) más en espera` : ''}</>}
          actions={<>
            <button className="btn" onClick={next}>{queue.length ? 'Saltear' : 'Cancelar'}</button>
            <button className="btn btn-primary" onClick={doImport} disabled={!selected.length}>Importar {selected.length} movimientos</button>
          </>}
        >
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 14 }}>
            <Field label="Banco / app de origen" hint={!session.source ? 'No lo pudimos detectar: elegilo de la lista' : undefined}>
              <select className="select" value={session.source} onChange={(e) => {
                const source = e.target.value;
                update({ source, account: suggestAccount(source, isCardSource(source) || session.analysis.isCard, settings.accounts) });
              }}>
                <option value="">Elegí…</option>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Cuenta / medio de pago">
              <select className="select" value={session.account} onChange={(e) => update({ account: e.target.value })}>
                {[...new Set([...settings.accounts, ...(session.source ? [session.source] : [])])].map((a) => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Moneda (si el archivo no la indica)">
              <Segmented value={session.defaultCurrency} onChange={(c) => update({ defaultCurrency: c })} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} />
            </Field>
            <Field label="Los montos positivos son…" hint={session.analysis.isCard ? 'Parece un resumen de tarjeta de crédito' : undefined}>
              <Segmented
                value={session.positiveIsExpense ? 'gasto' : 'ingreso'}
                onChange={(v) => update({ positiveIsExpense: v === 'gasto' })}
                options={[{ value: 'ingreso', label: 'Ingresos' }, { value: 'gasto', label: 'Gastos' }]}
              />
            </Field>
          </div>

          {session.analysis.warnings.map((w) => <div key={w} className="alert" style={{ marginBottom: 10 }}>{w}</div>)}

          {session.analysis.format !== 'ofx' && (
            <details open={showMapping || !session.candidates.length} onToggle={(e) => setShowMapping((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 14 }}>
              <summary className="small" style={{ cursor: 'pointer', color: 'var(--accent)' }}>Ajustar columnas manualmente</summary>
              {session.mapping ? (
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 10 }}>
                  {mappingSelect('Fecha', 'date')}
                  <Field label="Descripción">
                    <select className="select" value={session.mapping.description[0] ?? -1} onChange={(e) => update({ mapping: { ...session.mapping!, description: Number(e.target.value) >= 0 ? [Number(e.target.value)] : [] } })}>
                      <option value={-1}>— ninguna —</option>
                      {session.analysis.columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
                    </select>
                  </Field>
                  {mappingSelect('Monto (con signo)', 'amount')}
                  {mappingSelect('Débitos / egresos', 'debit')}
                  {mappingSelect('Créditos / ingresos', 'credit')}
                  {mappingSelect('Monto en dólares', 'amountUSD')}
                  {mappingSelect('Moneda', 'currency')}
                  <Field label="Fila de encabezados">
                    <input className="input num" type="number" min={0} value={session.mapping.headerRow + 1} onChange={(e) => update({ mapping: { ...session.mapping!, headerRow: Math.max(-1, Number(e.target.value) - 1) } })} />
                  </Field>
                </div>
              ) : (
                <div className="small muted" style={{ marginTop: 8 }}>
                  Este PDF se leyó línea por línea (no tiene una tabla con encabezados). Si algo salió mal, probá descargar el resumen en Excel o CSV desde el home banking.
                  <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => update({ mapping: { headerRow: -1, date: 0, description: [1], amount: 2, debit: -1, credit: -1, amountUSD: -1, currency: -1 } })}>Mapear columnas a mano</button>
                </div>
              )}
              {session.analysis.sampleRows.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="small">
                    <thead><tr>{session.analysis.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                    <tbody>{session.analysis.sampleRows.map((r, i) => <tr key={i}>{session.analysis.columns.map((_, j) => <td key={j}>{r[j] instanceof Date ? (r[j] as Date).toLocaleDateString('es-AR') : String(r[j] ?? '')}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </details>
          )}

          <div className="grid grid-4 stats-compact" style={{ marginBottom: 14 }}>
            <Stat label="A importar" value={String(selected.length)} sub={`de ${session.candidates.length}`} />
            <Stat label="Ingresos" value={formatMoney(selIn, 'ARS')} />
            <Stat label="Gastos" value={formatMoney(selOut, 'ARS')} />
            <Stat label="Repetidos omitidos" value={String(counts('duplicado'))} sub={`${counts('excluido')} saldos/totales/pagos de tarjeta`} />
          </div>

          <div className="filters" style={{ marginBottom: 10 }}>
            <Segmented value={view} onChange={setView} options={[
              { value: 'todos', label: `Todos (${session.candidates.length})` },
              { value: 'nuevo', label: `Nuevos (${counts('nuevo')})` },
              { value: 'duplicado', label: `Repetidos (${counts('duplicado')})` },
              { value: 'excluido', label: `Excluidos (${counts('excluido')})` },
            ]} />
            <button className="btn btn-sm" onClick={() => setAll(true)}>Marcar todos</button>
            <button className="btn btn-sm" onClick={() => setAll(false)}>Desmarcar todos</button>
            <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordar las categorías que cambie para próximos resúmenes
            </label>
          </div>

          {shown.length ? (
            <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr><th /><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Categoría</th><th className="r">Monto</th><th title="Movimiento entre tus cuentas: no cuenta como ingreso ni gasto">Entre cuentas</th></tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const cats = c.type === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
                    return (
                      <tr key={c.key} style={{ opacity: c.include ? 1 : 0.55 }}>
                        <td><input type="checkbox" checked={c.include} onChange={(e) => editCandidate(c.key, { include: e.target.checked })} aria-label="Importar" /></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDate(c.date)}</td>
                        <td>
                          {c.description}
                          {c.installment && <span className="badge" style={{ marginLeft: 6 }}>Cuota {c.installment.n}/{c.installment.total}</span>}
                          {c.note && <div className={`small ${c.status === 'duplicado' ? 'warn' : 'muted'}`}>{c.note}</div>}
                        </td>
                        <td>
                          <button className={`badge ${c.type === 'ingreso' ? 'good' : 'bad'}`} style={{ border: 'none', cursor: 'pointer' }} title="Tocá para cambiar"
                            onClick={() => editCandidate(c.key, { type: (c.type === 'ingreso' ? 'gasto' : 'ingreso') as TxType })}>
                            {c.type === 'ingreso' ? 'Ingreso' : 'Gasto'} ⇄
                          </button>
                        </td>
                        <td>
                          {c.internal ? <span className="muted small">Entre cuentas</span> : (
                            <select className="select" style={{ minWidth: 150 }} value={c.category} onChange={(e) => editCandidate(c.key, { category: e.target.value })}>
                              {[...new Set([...cats, c.category])].map((x) => <option key={x}>{x}</option>)}
                            </select>
                          )}
                        </td>
                        <td className={`r ${c.internal ? 'muted' : c.type === 'ingreso' ? 'good' : ''}`} style={{ whiteSpace: 'nowrap' }}>{c.type === 'ingreso' ? '+' : '−'}{formatMoney(c.amount, c.currency)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={c.internal} aria-label="Movimiento entre mis cuentas" onChange={(e) => editCandidate(c.key, {
                            internal: e.target.checked,
                            category: e.target.checked ? INTERNAL_CATEGORY : categorize(c.description, c.type, settings.categoryRules, fallback),
                          })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No hay movimientos en esta vista" />}
        </Card>
      )}

      <Card
        title="Historial de importaciones"
        subtitle={`${imports.length} archivos · ${importedCount} movimientos importados en memoria`}
        actions={imports.length > 0 && <>
          <button className="btn btn-sm" onClick={() => exportBackup(data)}><IconDownload width={14} />Backup</button>
          <button className="btn btn-sm btn-danger" onClick={() => {
            if (confirm(`¿Borrar la memoria de importaciones?\n\nSe eliminan los ${importedCount} movimientos importados y el historial de archivos. Los movimientos que cargaste a mano no se tocan.\n\nTe recomendamos exportar un backup antes.`)) clearImports();
          }}><IconTrash width={14} />Borrar memoria</button>
        </>}
      >
        {imports.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Importado</th><th>Archivo</th><th>Origen</th><th>Período</th><th className="r">Movs.</th><th className="r">Ingresos</th><th className="r">Gastos</th><th /></tr></thead>
              <tbody>
                {imports.map((b) => (
                  <tr key={b.id}>
                    <td className="num small">{new Date(b.importedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.fileName}>{b.fileName}</td>
                    <td><span className="badge accent">{b.source}</span></td>
                    <td className="num small">{formatDate(b.from)} – {formatDate(b.to)}</td>
                    <td className="r">{b.count}{b.skipped ? <div className="small muted">{b.skipped} omitidos</div> : null}</td>
                    <td className="r good">{formatMoney(b.totalIn, 'ARS', { compact: true })}</td>
                    <td className="r">{formatMoney(b.totalOut, 'ARS', { compact: true })}</td>
                    <td className="actions">
                      <button className="btn-icon" aria-label="Deshacer esta importación" title="Deshacer esta importación"
                        onClick={() => confirm(`¿Eliminar "${b.fileName}" y sus ${b.count} movimientos?`) && removeImport(b.id)}><IconTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Todavía no importaste resúmenes">Cada archivo que importes queda registrado acá y sus movimientos se suman a tu historial.</Empty>}
      </Card>

      <Card title="¿Cómo descargo mi resumen?">
        <div className="grid grid-3 small">
          <div><b>Mercado Pago</b><p className="muted">App o web → Tu actividad / Dinero disponible → <i>Descargar reporte</i> (Excel o CSV) o <i>Resumen de cuenta</i> en PDF.</p></div>
          <div><b>Bancos (Galicia, Santander, BBVA, Macro, ICBC, Nación, Provincia…)</b><p className="muted">Home banking → Cuentas → Últimos movimientos → <i>Exportar / Descargar</i> en Excel o CSV. También sirve el resumen en PDF.</p></div>
          <div><b>Tarjetas de crédito</b><p className="muted">Home banking o app de la tarjeta → Resúmenes → descargá el PDF del período. Si tiene contraseña, suele ser tu DNI.</p></div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Los archivos se leen solo en tu dispositivo: nada se sube a internet. Si un formato no se reconoce bien, usá “Ajustar columnas manualmente”.</p>
      </Card>
    </>
  );
}
