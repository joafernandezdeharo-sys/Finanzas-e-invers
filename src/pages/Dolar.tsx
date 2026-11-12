import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, NumberInput, PageHead, Segmented, Stat } from '../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { MoneyTooltip, useThemeColors } from '../components/charts';
import { fetchDollarHistory, type DollarHistoryPoint } from '../services/dolar';
import { BCRA_IDS, fetchBcraVariables, type BcraVariable } from '../services/bcra';
import { DOLLAR_KINDS, accountInfo, dollarLabel } from '../lib/defaults';
import { formatDate, formatMoney, formatNumber, formatPct, sum, todayISO } from '../lib/util';
import type { DollarKind, DollarOperation, TxType } from '../types';
import { INTERNAL_CATEGORY } from '../components/TxForm';

const RANGES = [
  { value: '30', label: '1M' },
  { value: '90', label: '3M' },
  { value: '180', label: '6M' },
  { value: '365', label: '1A' },
  { value: '1825', label: '5A' },
] as const;

function OperationForm({ initial, onClose }: { initial?: DollarOperation; onClose: () => void }) {
  const { add, update, data, setLinked } = useStore();
  const accounts = data.settings.accounts;
  const usdDefault = accounts.find((a) => accountInfo(a, data.settings.accountInfo).currency === 'USD') ?? '';
  const arsDefault = accounts.find((a) => accountInfo(a, data.settings.accountInfo).kind === 'banco') ?? '';
  const live = useLive();
  const [f, setF] = useState({
    date: initial?.date ?? todayISO(),
    operation: initial?.operation ?? ('compra' as DollarOperation['operation']),
    usdAmount: initial?.usdAmount ?? (null as number | null),
    rate: initial?.rate ?? (null as number | null),
    kind: initial?.kind ?? data.settings.rateKind,
    note: initial?.note ?? '',
    fromAccount: initial ? initial.fromAccount ?? '' : arsDefault,
    toAccount: initial ? initial.toAccount ?? '' : usdDefault,
  });
  const [hint, setHint] = useState('');

  // sugerir la cotización histórica de esa fecha
  const suggest = async () => {
    setHint('Buscando cotización…');
    try {
      if (f.date === todayISO()) {
        const r = live.rateFor(f.kind, f.operation === 'compra' ? 'venta' : 'compra');
        setF((x) => ({ ...x, rate: r }));
        setHint(`Cotización actual del ${dollarLabel(f.kind)}`);
        return;
      }
      const hist = await fetchDollarHistory(f.kind);
      const point = [...hist].reverse().find((p) => p.fecha <= f.date);
      if (point) {
        setF((x) => ({ ...x, rate: f.operation === 'compra' ? point.venta : point.compra }));
        setHint(`${dollarLabel(f.kind)} del ${formatDate(point.fecha)}: compra ${formatMoney(point.compra, 'ARS')} / venta ${formatMoney(point.venta, 'ARS')}`);
      } else setHint('No hay datos para esa fecha');
    } catch {
      setHint('No se pudo obtener la cotización histórica');
    }
  };

  const valid = f.usdAmount && f.usdAmount > 0 && f.rate && f.rate > 0;
  const save = () => {
    if (!valid) return;
    const op = { ...f, usdAmount: f.usdAmount!, rate: f.rate!, fromAccount: f.fromAccount || undefined, toAccount: f.toAccount || undefined };
    const id = initial ? initial.id : add('dollarOps', op);
    if (initial) update('dollarOps', initial.id, op);
    // movimientos entre cuentas: salen pesos de una y entran dólares en la otra (o al revés si vendiste)
    const desc = `${f.operation === 'compra' ? 'Compra' : 'Venta'} de US$ ${f.usdAmount} a $ ${f.rate} (${dollarLabel(f.kind)})`;
    const base = { date: f.date, category: INTERNAL_CATEGORY, description: desc, internal: true as const };
    const ars = { ...base, amount: Math.round(f.usdAmount! * f.rate! * 100) / 100, currency: 'ARS' as const };
    const usd = { ...base, amount: f.usdAmount!, currency: 'USD' as const };
    const buy = f.operation === 'compra';
    setLinked(id, [
      ...(f.fromAccount ? [{ ...ars, type: (buy ? 'gasto' : 'ingreso') as TxType, account: f.fromAccount }] : []),
      ...(f.toAccount ? [{ ...usd, type: (buy ? 'ingreso' : 'gasto') as TxType, account: f.toAccount }] : []),
    ]);
    onClose();
  };

  return (
    <Modal title={initial ? 'Editar operación' : 'Registrar compra / venta de dólares'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><Segmented value={f.operation} onChange={(v) => setF({ ...f, operation: v })} options={[{ value: 'compra', label: 'Compré' }, { value: 'venta', label: 'Vendí' }]} /></div>
        <Field label="Cantidad de USD"><NumberInput value={f.usdAmount} onChange={(n) => setF({ ...f, usdAmount: n })} autoFocus /></Field>
        <Field label="Tipo de dólar">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DollarKind })}>
            {DOLLAR_KINDS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Precio por dólar (ARS)" hint={<button type="button" className="btn btn-sm" style={{ marginTop: 2 }} onClick={suggest}>Usar cotización de esa fecha</button>}>
          <NumberInput value={f.rate} onChange={(n) => setF({ ...f, rate: n })} />
        </Field>
        {hint && <div className="full small muted">{hint}</div>}
        {valid && <div className="full alert">Total: <b className="num">{formatMoney(f.usdAmount! * f.rate!, 'ARS')}</b></div>}
        <Field label={f.operation === 'compra' ? 'Los pesos salieron de' : 'Los pesos entraron en'} hint="Opcional: actualiza el saldo de tus cuentas">
          <select className="select" value={f.fromAccount} onChange={(e) => setF({ ...f, fromAccount: e.target.value })}>
            <option value="">— no registrar —</option>
            {accounts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={f.operation === 'compra' ? 'Los dólares entraron en' : 'Los dólares salieron de'}>
          <select className="select" value={f.toAccount} onChange={(e) => setF({ ...f, toAccount: e.target.value })}>
            <option value="">— no registrar —</option>
            {accounts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Nota" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ej. aguinaldo, cueva, homebanking" /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function Dolar() {
  const { data, setSettings, remove } = useStore();
  const { settings, dollarOps } = data;
  const live = useLive();
  const colors = useThemeColors();
  const [kind, setKind] = useState<DollarKind>(settings.rateKind);
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('90');
  const [history, setHistory] = useState<DollarHistoryPoint[]>([]);
  const [histError, setHistError] = useState('');
  const [edit, setEdit] = useState<DollarOperation | 'new' | null>(null);
  const [bcra, setBcra] = useState<Map<number, BcraVariable> | null>(null);
  useEffect(() => { fetchBcraVariables().then(setBcra).catch(() => setBcra(null)); }, []);
  const [calc, setCalc] = useState<{ amount: number | null; from: 'ARS' | 'USD' }>({ amount: 1000, from: 'USD' });

  useEffect(() => {
    setHistError('');
    fetchDollarHistory(kind).then(setHistory).catch((e) => setHistError(String(e.message)));
  }, [kind]);

  const chartData = useMemo(() => {
    const from = new Date(Date.now() - Number(range) * 86_400_000).toISOString().slice(0, 10);
    const pts = history.filter((p) => p.fecha >= from);
    // en rangos largos tomamos 1 de cada n puntos para aligerar el gráfico
    const step = Math.max(1, Math.floor(pts.length / 400));
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({ fecha: p.fecha, Compra: p.compra, Venta: p.venta }));
  }, [history, range]);

  const first = chartData[0]?.Venta;
  const last = chartData[chartData.length - 1]?.Venta;
  const variation = first && last ? ((last - first) / first) * 100 : 0;

  // Resumen de mis dólares
  const ops = [...dollarOps].sort((a, b) => b.date.localeCompare(a.date));
  const bought = dollarOps.filter((o) => o.operation === 'compra');
  const sold = dollarOps.filter((o) => o.operation === 'venta');
  const usdBought = sum(bought.map((o) => o.usdAmount));
  const usdHeld = usdBought - sum(sold.map((o) => o.usdAmount));
  const avgPrice = usdBought ? sum(bought.map((o) => o.usdAmount * o.rate)) / usdBought : 0;
  const currentSell = live.rateFor(settings.rateKind, 'compra'); // a cuánto te lo compran hoy
  const unrealized = usdHeld * (currentSell - avgPrice);

  const calcResult = calc.amount == null ? 0 : calc.from === 'USD' ? calc.amount * live.rateFor(kind, 'venta') : calc.amount / live.rateFor(kind, 'venta');

  return (
    <>
      <PageHead title="Dólar" subtitle="Cotizaciones en tiempo real, histórico y registro de tus compras.">
        <button className="btn btn-primary" onClick={() => setEdit('new')}><IconPlus width={16} />Registrar compra / venta</button>
      </PageHead>

      {live.dollarsError && <div className="alert bad">No se pudieron actualizar las cotizaciones: {live.dollarsError}</div>}

      <div className="grid grid-4">
        {live.dollars.map((d) => (
          <button
            key={d.casa}
            className={`card fx-card ${kind === d.casa ? 'selected' : ''}`}
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setKind(d.casa)}
          >
            <div className="fx-row">
              <b>{dollarLabel(d.casa)}</b>
              {settings.rateKind === d.casa && <span className="badge accent">Para convertir</span>}
            </div>
            <div className="fx-main">{formatMoney(d.venta ?? 0, 'ARS')}</div>
            <div className="small muted">Venta · Compra {d.compra ? formatMoney(d.compra, 'ARS') : '—'}</div>
            <div className="small muted">Act. {new Date(d.fechaActualizacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
          </button>
        ))}
      </div>
      {bcra && (
        <Card title="Cotización oficial del Banco Central" subtitle={<>Fuente oficial: <a href="https://www.bcra.gob.ar/PublicacionesEstadisticas/Tipos_de_cambios.asp" target="_blank" rel="noreferrer">BCRA</a> · valores de cierre del último día hábil</>}>
          <div className="grid grid-3">
            {[{ id: BCRA_IDS.mayorista, label: 'Mayorista de referencia (Com. A 3500)' }, { id: BCRA_IDS.minorista, label: 'Minorista promedio de bancos (vendedor)' }].map(({ id, label }) => {
              const v = bcra.get(id);
              return v ? (
                <div key={id} className="stat">
                  <span className="stat-label">{label}</span>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>{formatMoney(v.value, 'ARS')}</span>
                  <span className="stat-sub muted">al {formatDate(v.date)}</span>
                </div>
              ) : null;
            })}
            <div className="small muted" style={{ alignSelf: 'center' }}>
              El dólar blue no tiene fuente oficial (es un mercado informal). MEP y CCL surgen de la compraventa de bonos en BYMA.
            </div>
          </div>
        </Card>
      )}
      <p className="small muted" style={{ margin: '-8px 0 0' }}>
        Cotizaciones en tiempo real: DolarAPI (oficial = Banco Nación; se actualiza cada {settings.refreshSeconds}s). Histórico: ArgentinaDatos. Tocá una tarjeta para ver su histórico.
        {kind !== settings.rateKind && <> <button className="btn btn-sm" onClick={() => setSettings({ rateKind: kind })}>Usar {dollarLabel(kind)} para convertir ARS ↔ USD</button></>}
      </p>

      <div className="grid grid-3">
        <Card title={`Histórico dólar ${dollarLabel(kind)}`} className="span-2"
          subtitle={chartData.length ? <>Variación en el período: <b className={variation >= 0 ? 'bad' : 'good'}>{formatPct(variation)}</b> · fuente ArgentinaDatos</> : undefined}
          actions={<Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ ...r }))} />}>
          {histError ? <div className="alert bad">{histError}</div> : chartData.length ? (
            <div className="chart-box">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="fecha" tickFormatter={(d: string) => formatDate(d).slice(0, 5)} minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => `$${formatNumber(v, 0)}`} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<MoneyTooltip currency="ARS" labelFormatter={formatDate} />} />
                  <Line type="monotone" dataKey="Venta" stroke={colors.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }} />
                  <Line type="monotone" dataKey="Compra" stroke={colors.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="Cargando histórico…" />}
          {chartData.length > 0 && (
            <div className="legend" style={{ marginTop: 8 }}>
              <span><i className="dot" style={{ background: colors.series[0] }} />Venta</span>
              <span><i className="dot" style={{ background: colors.series[1] }} />Compra</span>
            </div>
          )}
        </Card>

        <Card title="Calculadora" subtitle={`Al dólar ${dollarLabel(kind)} venta`}>
          <div className="form-grid">
            <Field label="Monto" full><NumberInput value={calc.amount} onChange={(n) => setCalc({ ...calc, amount: n })} /></Field>
            <div className="full">
              <Segmented value={calc.from} onChange={(v) => setCalc({ ...calc, from: v })} options={[{ value: 'USD', label: 'USD → ARS' }, { value: 'ARS', label: 'ARS → USD' }]} />
            </div>
            <div className="full stat">
              <span className="stat-label">Resultado</span>
              <span className="stat-value">{formatMoney(calcResult, calc.from === 'USD' ? 'ARS' : 'USD')}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-4">
        <Stat label="Dólares en cartera" value={formatMoney(usdHeld, 'USD')} sub={`${bought.length} compras · ${sold.length} ventas`} />
        <Stat label="Precio promedio de compra" value={formatMoney(avgPrice, 'ARS')} sub="ponderado por monto" />
        <Stat label={`Valor hoy (${dollarLabel(settings.rateKind)} compra)`} value={formatMoney(usdHeld * currentSell, 'ARS')} sub={`${formatMoney(currentSell, 'ARS')} por dólar`} />
        <Stat label="Ganancia / pérdida en pesos" value={formatMoney(unrealized, 'ARS')} tone={unrealized >= 0 ? 'good' : 'bad'}
          sub={avgPrice ? formatPct(((currentSell - avgPrice) / avgPrice) * 100) : undefined} />
      </div>

      <Card title="Mis compras y ventas de dólares" subtitle="Anotá a cuánto compraste cada vez y compará con la cotización actual.">
        {ops.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Operación</th><th>Tipo</th><th className="r">USD</th><th className="r">Precio</th><th className="r">Total ARS</th><th className="r">Precio hoy</th><th className="r">Diferencia</th><th>Nota</th><th /></tr>
              </thead>
              <tbody>
                {ops.map((o) => {
                  const today = live.rateFor(o.kind, o.operation === 'compra' ? 'compra' : 'venta');
                  const diff = o.operation === 'compra' ? (today - o.rate) * o.usdAmount : (o.rate - today) * o.usdAmount;
                  const pct = o.rate ? ((today - o.rate) / o.rate) * 100 : 0;
                  return (
                    <tr key={o.id}>
                      <td className="num">{formatDate(o.date)}</td>
                      <td><span className={`badge ${o.operation === 'compra' ? 'good' : 'bad'}`}>{o.operation === 'compra' ? 'Compra' : 'Venta'}</span></td>
                      <td>{dollarLabel(o.kind)}</td>
                      <td className="r">{formatNumber(o.usdAmount)}</td>
                      <td className="r">{formatMoney(o.rate, 'ARS')}</td>
                      <td className="r muted">{formatMoney(o.usdAmount * o.rate, 'ARS')}</td>
                      <td className="r">{today ? formatMoney(today, 'ARS') : '—'}</td>
                      <td className={`r ${diff >= 0 ? 'good' : 'bad'}`} title={o.operation === 'venta' ? 'Positivo = vendiste más caro que hoy' : 'Positivo = hoy vale más que cuando compraste'}>
                        {today ? <>{formatMoney(diff, 'ARS')}<div className="small">{formatPct(o.operation === 'compra' ? pct : -pct)}</div></> : '—'}
                      </td>
                      <td className="muted small">{o.note}</td>
                      <td className="actions">
                        <button className="btn-icon" aria-label="Editar" onClick={() => setEdit(o)}><IconEdit /></button>
                        <button className="btn-icon" aria-label="Eliminar" onClick={() => confirm('¿Eliminar esta operación?') && remove('dollarOps', o.id)}><IconTrash /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No registraste operaciones">Cada vez que compres dólares anotalo acá con el precio que pagaste.</Empty>}
      </Card>

      {edit && <OperationForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
