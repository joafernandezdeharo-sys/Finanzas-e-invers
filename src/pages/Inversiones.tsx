import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, NumberInput, PageHead, Segmented, Stat } from '../components/ui';
import { IconChart, IconEdit, IconExternal, IconList, IconPlus, IconRefresh, IconTrash } from '../components/Icons';
import { MoneyTooltip, useThemeColors } from '../components/charts';
import { ASSET_TYPES, assetLabel } from '../lib/defaults';
import { computePosition, effectiveOps, syncSummary, unitFactor, valueInvestment, type Valuation } from '../lib/portfolio';
import { searchCoins, type CoinSearchResult } from '../services/prices';
import { yahooPage, yahooSymbol } from '../services/yahoo';
import { YahooChart } from '../components/YahooChart';
import { Link } from 'react-router-dom';
import { formatDate, formatMoney, formatNumber, formatPct, sum, todayISO, uid } from '../lib/util';
import type { AssetType, Currency, Investment, InvestmentOp, InvestmentOpKind } from '../types';

/** Página de referencia del activo: Yahoo Finance si lo cotiza, si no la ficha del bono en BYMA/Rava */
const externalLink = (inv: Investment) => {
  const ys = yahooSymbol(inv);
  if (ys) return { url: yahooPage(ys), label: 'Yahoo Finance' };
  if (inv.type === 'bono') return { url: `https://www.rava.com/perfil/${encodeURIComponent(inv.symbol.trim().toUpperCase())}`, label: 'Rava Bursátil' };
  return null;
};

function InvestmentForm({ initial, onClose }: { initial?: Investment; onClose: () => void }) {
  const { add, update } = useStore();
  const { rateOn } = useLive();
  // con más de una operación, cantidad y precio se manejan desde "Operaciones"
  const multiOps = (initial?.ops?.length ?? 0) > 1;
  const [f, setF] = useState<Omit<Investment, 'id' | 'quantity' | 'buyPrice'> & { quantity: number | null; buyPrice: number | null }>({
    type: initial?.type ?? 'cedear',
    symbol: initial?.symbol ?? '',
    name: initial?.name ?? '',
    quantity: initial?.quantity ?? null,
    buyPrice: initial?.buyPrice ?? null,
    currency: initial?.currency ?? 'ARS',
    buyDate: initial?.buyDate ?? todayISO(),
    broker: initial?.broker ?? '',
    manualPrice: initial?.manualPrice ?? null,
    annualRate: initial?.annualRate ?? null,
    note: initial?.note ?? '',
  });
  const [coins, setCoins] = useState<CoinSearchResult[]>([]);
  const isPF = f.type === 'plazo_fijo';
  const typeInfo = ASSET_TYPES.find((a) => a.value === f.type)!;

  useEffect(() => {
    if (f.type !== 'cripto' || f.symbol.length < 2 || coins.some((c) => c.id === f.symbol)) return;
    const t = setTimeout(() => searchCoins(f.symbol).then(setCoins).catch(() => setCoins([])), 400);
    return () => clearTimeout(t);
  }, [f.symbol, f.type, coins]);

  const changeType = (type: AssetType) => {
    const currency: Currency = type === 'cripto' || type === 'accion_us' ? 'USD' : 'ARS';
    setF({ ...f, type, currency, quantity: type === 'plazo_fijo' ? 1 : f.quantity });
  };

  const valid = (isPF || f.symbol.trim()) && (multiOps || (f.quantity && f.quantity > 0 && f.buyPrice != null && f.buyPrice >= 0));
  const save = () => {
    if (!valid) return;
    const meta = { ...f, symbol: f.symbol.trim() || (isPF ? 'PF' : '') };
    if (multiOps && initial) {
      update('investments', initial.id, { ...meta, quantity: initial.quantity, buyPrice: initial.buyPrice, buyDate: initial.buyDate, ops: initial.ops });
    } else {
      const op: InvestmentOp = { id: initial?.ops?.[0]?.id ?? uid(), date: f.buyDate, kind: 'compra', quantity: f.quantity!, price: f.buyPrice!, currency: f.currency };
      const inv = { ...meta, quantity: f.quantity!, buyPrice: f.buyPrice!, ops: [op] };
      const summary = syncSummary({ ...inv, id: '' }, rateOn);
      if (initial) update('investments', initial.id, { ...inv, ...summary }); else add('investments', { ...inv, ...summary });
    }
    onClose();
  };

  return (
    <Modal title={initial ? 'Editar inversión' : 'Nueva inversión'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Tipo de activo" full hint={typeInfo.hint}>
          <select className="select" value={f.type} onChange={(e) => changeType(e.target.value as AssetType)}>
            {ASSET_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        {!isPF && (
          <Field label={f.type === 'cripto' ? 'Moneda (id CoinGecko)' : 'Ticker'}>
            <input className="input" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder={f.type === 'cripto' ? 'bitcoin' : 'AAPL'} autoFocus list="coin-list" />
            {f.type === 'cripto' && (
              <datalist id="coin-list">
                {coins.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>)}
              </datalist>
            )}
          </Field>
        )}
        <Field label="Nombre / descripción" full={isPF}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={isPF ? 'Plazo fijo Banco X' : 'Opcional'} />
        </Field>
        {isPF ? (
          <>
            <Field label="Capital"><NumberInput value={f.buyPrice} onChange={(n) => setF({ ...f, buyPrice: n })} /></Field>
            <Field label="TNA %"><NumberInput value={f.annualRate} onChange={(n) => setF({ ...f, annualRate: n })} placeholder="Ej. 32" /></Field>
          </>
        ) : multiOps ? (
          <div className="full alert">Esta inversión tiene varias compras/ventas: la cantidad y el precio se editan en <b>Operaciones</b>.</div>
        ) : (
          <>
            <Field label={initial ? 'Cantidad' : 'Cantidad comprada'} hint={f.type === 'bono' ? 'Valor nominal' : undefined}><NumberInput value={f.quantity} onChange={(n) => setF({ ...f, quantity: n })} /></Field>
            <Field label="Precio de compra (unitario)" hint={f.type === 'bono' ? 'Precio cada 100 VN, como cotiza en el mercado' : undefined}>
              <NumberInput value={f.buyPrice} onChange={(n) => setF({ ...f, buyPrice: n })} />
            </Field>
          </>
        )}
        <Field label="Moneda">
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
            <option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option>
          </select>
        </Field>
        <Field label={isPF ? 'Fecha de constitución' : multiOps ? 'Fecha de la primera compra' : 'Fecha de compra'}>
          <input type="date" className="input" value={f.buyDate} onChange={(e) => setF({ ...f, buyDate: e.target.value })} />
        </Field>
        <Field label="Broker / banco"><input className="input" value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} placeholder="Ej. IOL, Balanz, Binance" /></Field>
        {!isPF && (
          <Field label="Precio actual manual (opcional)" hint="Solo se usa si no hay cotización online.">
            <NumberInput value={f.manualPrice} onChange={(n) => setF({ ...f, manualPrice: n })} />
          </Field>
        )}
        <Field label="Nota" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const OP_LABEL: Record<InvestmentOpKind, string> = { compra: 'Compra', venta: 'Venta', dividendo: 'Dividendo / renta', comision: 'Comisión' };

/** Registro de operaciones de una inversión: compras, ventas parciales, dividendos y comisiones */
function OpsModal({ inv, onClose }: { inv: Investment; onClose: () => void }) {
  const { update, data } = useStore();
  const disp = data.settings.displayCurrency;
  const live = useLive();
  const ops = effectiveOps(inv);
  const pos = computePosition(inv, live.rateOn);
  const [f, setF] = useState<{ kind: InvestmentOpKind; date: string; quantity: number | null; price: number | null; currency: Currency; note: string }>({
    kind: 'compra', date: todayISO(), quantity: null, price: live.quotes[inv.id]?.price ?? null, currency: live.quotes[inv.id]?.currency ?? inv.currency, note: '',
  });
  const needsQty = f.kind === 'compra' || f.kind === 'venta';
  const tooMuch = f.kind === 'venta' && (f.quantity ?? 0) > pos.quantity + 1e-9;
  const valid = f.price != null && f.price > 0 && (!needsQty || (f.quantity != null && f.quantity > 0 && !tooMuch));

  const save = (next: InvestmentOp[]) => {
    const updated = { ...inv, ops: next };
    update('investments', inv.id, { ops: next, ...syncSummary(updated, live.rateOn) });
  };
  const addOp = () => {
    if (!valid) return;
    save([...ops.map((o) => (o.id === 'inicial' ? { ...o, id: uid() } : o)), {
      id: uid(), kind: f.kind, date: f.date, quantity: needsQty ? f.quantity! : 0, price: f.price!, currency: f.currency, note: f.note || undefined,
    }]);
    setF({ ...f, quantity: null, note: '' });
  };
  const f100 = unitFactor(inv);

  return (
    <Modal title={`Operaciones · ${inv.type === 'plazo_fijo' ? inv.name || 'Plazo fijo' : inv.symbol.toUpperCase()}`} onClose={onClose}>
      <div className="grid grid-3 stats-compact" style={{ marginBottom: 12 }}>
        <Stat label="Tenencia" value={formatNumber(pos.quantity, 6)} />
        <Stat label="Precio promedio" value={formatMoney(pos.avgPrice, inv.currency)} />
        <Stat label="Realizado + dividendos" value={formatMoney(pos.realized[disp] + pos.dividends[disp], disp)} />
      </div>
      <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
        <table className="small">
          <thead><tr><th>Fecha</th><th>Operación</th><th className="r">Cantidad</th><th className="r">Precio / monto</th><th className="r">Total</th><th /></tr></thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.id}>
                <td className="num">{formatDate(o.date)}</td>
                <td><span className={`badge ${o.kind === 'compra' ? 'accent' : o.kind === 'venta' ? 'bad' : o.kind === 'dividendo' ? 'good' : ''}`}>{OP_LABEL[o.kind]}</span>{o.note && <div className="muted">{o.note}</div>}</td>
                <td className="r">{o.quantity ? formatNumber(o.quantity, 6) : '—'}</td>
                <td className="r">{formatMoney(o.price, o.currency)}</td>
                <td className="r">{formatMoney(o.quantity ? o.quantity * o.price * f100 : o.price, o.currency)}</td>
                <td className="actions">
                  {ops.length > 1 && <button className="btn-icon" aria-label="Borrar operación" onClick={() => confirm('¿Borrar esta operación?') && save(ops.filter((x) => x.id !== o.id))}><IconTrash /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); addOp(); }}>
        <div className="full">
          <Segmented<InvestmentOpKind> value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={(['compra', 'venta', 'dividendo', 'comision'] as const).map((k) => ({ value: k, label: OP_LABEL[k].split(' ')[0] }))} />
        </div>
        <Field label="Fecha"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {needsQty && (
          <Field label="Cantidad" hint={f.kind === 'venta' ? `${tooMuch ? 'No podés vender más de lo que tenés: ' : 'Tenés '}${formatNumber(pos.quantity, 6)}` : undefined}>
            <NumberInput value={f.quantity} onChange={(n) => setF({ ...f, quantity: n })} />
          </Field>
        )}
        <Field label={needsQty ? (f100 !== 1 ? 'Precio (cada 100 VN)' : 'Precio unitario') : 'Monto total'}>
          <NumberInput value={f.price} onChange={(n) => setF({ ...f, price: n })} />
        </Field>
        <Field label="Moneda">
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
            <option value="ARS">Pesos</option><option value="USD">Dólares</option>
          </select>
        </Field>
        <Field label="Nota" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Opcional" /></Field>
        <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={!valid}>Agregar {OP_LABEL[f.kind].toLowerCase()}</button>
        </div>
      </form>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Se usa el método de precio promedio. El resultado en dólares de cada operación se calcula con el dólar de su fecha.
      </p>
    </Modal>
  );
}

type SortKey = 'value' | 'pnl' | 'pnlPct' | 'symbol';

export default function Inversiones() {
  const { data, remove } = useStore();
  const { investments, settings } = data;
  const live = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const [edit, setEdit] = useState<Investment | 'new' | null>(null);
  const [chart, setChart] = useState<Investment | null>(null);
  const [opsOf, setOpsOf] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 });

  const valuations = useMemo(
    () => investments.map((i) => valueInvestment(i, live.quotes[i.id], cur, live.rate, live.rateOn)),
    [investments, live.quotes, cur, live.rate, live.rateOn],
  );
  const filtered = valuations
    .filter((v) => (!typeFilter || v.inv.type === typeFilter) && (!brokerFilter || v.inv.broker === brokerFilter) && (showClosed || v.quantity > 0))
    .sort((a, b) => (sort.key === 'symbol' ? a.inv.symbol.localeCompare(b.inv.symbol) : (a[sort.key] - b[sort.key])) * sort.dir);

  const total = sum(filtered.map((v) => v.value));
  const cost = sum(filtered.map((v) => v.cost));
  const pnl = total - cost;
  const realized = sum(valuations.map((v) => v.realized + v.dividends));
  const closedCount = valuations.filter((v) => v.quantity <= 0).length;
  const brokers = [...new Set(investments.map((i) => i.broker).filter(Boolean))];

  const allocation = useMemo(() => {
    const m = new Map<string, number>();
    valuations.forEach((v) => m.set(assetLabel(v.inv.type), (m.get(assetLabel(v.inv.type)) ?? 0) + v.value));
    return [...m.entries()].map(([name, value]) => ({ name, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  }, [valuations]);
  // color fijo por tipo de activo (no por ranking), así no cambia al filtrar
  const typeColor = (label: string) => colors.series[ASSET_TYPES.findIndex((a) => a.label === label) % colors.series.length];

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');

  return (
    <>
      <PageHead title="Inversiones" subtitle={settings.yahooProxyUrl ? 'Tu cartera con precios en vivo de Yahoo Finance (bonos: BYMA).' : 'Tu cartera con precios en vivo de BYMA y CoinGecko.'}>
        <button className="btn" onClick={live.refresh} disabled={live.loading}><IconRefresh width={16} />Actualizar precios</button>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><IconPlus width={16} />Nueva inversión</button>
      </PageHead>

      {!settings.yahooProxyUrl && investments.some((i) => yahooSymbol(i)) && (
        <div className="alert">Para cotizar tus inversiones con <b>Yahoo Finance</b> conectá el puente gratuito en <Link to="/fuentes">Fuentes de datos</Link>. Mientras tanto se usan BYMA (vía data912) y CoinGecko.</div>
      )}
      {live.quotesErrors.length > 0 && <div className="alert bad">Algunas fuentes no respondieron: {live.quotesErrors.join(' · ')}</div>}

      <div className="grid grid-4">
        <Stat label="Valor de la cartera" value={formatMoney(total, cur)} sub={live.quotesUpdated ? <><span className="live-dot" /> Actualizado {live.quotesUpdated.toLocaleTimeString('es-AR')}</> : 'Sin cotizaciones aún'} />
        <Stat label="Capital invertido" value={formatMoney(cost, cur)} sub={cur === 'USD' ? 'Cada compra con el dólar de su fecha' : 'Pesos invertidos en cada compra'} />
        <Stat label="Ganancia / pérdida (tenencia)" value={formatMoney(pnl, cur)} tone={pnl >= 0 ? 'good' : 'bad'} sub={formatPct(cost ? (pnl / cost) * 100 : 0)} />
        <Stat label="Ventas y dividendos" value={formatMoney(realized, cur)} tone={realized > 0 ? 'good' : realized < 0 ? 'bad' : undefined} sub="Resultado ya realizado (incluye comisiones)" />
      </div>

      <div className="grid grid-3">
        <Card title="Distribución por tipo" subtitle={`en ${cur}`}>
          {allocation.length ? (
            <>
              <div className="chart-box" style={{ height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke={colors.surface} strokeWidth={2}>
                      {allocation.map((a) => <Cell key={a.name} fill={typeColor(a.name)} />)}
                    </Pie>
                    <Tooltip content={<MoneyTooltip currency={cur} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="list">
                {allocation.map((a) => (
                  <div key={a.name} className="list-row small">
                    <i className="dot" style={{ background: typeColor(a.name) }} />
                    <span style={{ flex: 1 }}>{a.name}</span>
                    <span className="num muted">{formatMoney(a.value, cur, { compact: true })}</span>
                    <b className="num" style={{ width: 52, textAlign: 'right' }}>{((a.value / sum(allocation.map((x) => x.value))) * 100).toFixed(1)}%</b>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty title="Sin inversiones" />}
        </Card>

        <Card title="Rendimiento por activo" subtitle="Ganancia / pérdida no realizada" className="span-2">
          {valuations.length ? (
            <div className="list">
              {[...valuations].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 8).map((v) => {
                const max = Math.max(...valuations.map((x) => Math.abs(x.pnlPct)), 1);
                return (
                  <div key={v.inv.id} className="list-row small">
                    <b style={{ width: 90 }}>{v.inv.symbol.toUpperCase()}</b>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        {v.pnlPct < 0 && <div style={{ height: 10, width: `${(Math.abs(v.pnlPct) / max) * 100}%`, background: 'var(--bad)', borderRadius: '4px 0 0 4px' }} />}
                      </div>
                      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
                      <div style={{ flex: 1 }}>
                        {v.pnlPct >= 0 && <div style={{ height: 10, width: `${(v.pnlPct / max) * 100}%`, background: 'var(--good)', borderRadius: '0 4px 4px 0' }} />}
                      </div>
                    </div>
                    <span className={`num ${v.pnl >= 0 ? 'good' : 'bad'}`} style={{ width: 70, textAlign: 'right' }}>{formatPct(v.pnlPct, 1)}</span>
                  </div>
                );
              })}
            </div>
          ) : <Empty title="Agregá inversiones para ver su rendimiento" />}
        </Card>
      </div>

      <Card title="Cartera" actions={<>
        <select className="select" style={{ width: 'auto' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {ASSET_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {brokers.length > 0 && (
          <select className="select" style={{ width: 'auto' }} value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)} aria-label="Broker">
            <option value="">Todos los brokers</option>
            {brokers.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
        {closedCount > 0 && (
          <label className="small toggle"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Ver vendidas ({closedCount})</label>
        )}
      </>}>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => sortBy('symbol')}>Activo{arrow('symbol')}</th>
                  <th className="r">Cantidad</th>
                  <th className="r">Precio prom.</th>
                  <th className="r">Precio actual</th>
                  <th className="r">Var. día</th>
                  <th className="r sortable" onClick={() => sortBy('value')}>Valor ({cur}){arrow('value')}</th>
                  <th className="r sortable" onClick={() => sortBy('pnl')}>Resultado{arrow('pnl')}</th>
                  <th className="r sortable" onClick={() => sortBy('pnlPct')}>%{arrow('pnlPct')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v: Valuation) => {
                  const link = externalLink(v.inv);
                  return (
                    <tr key={v.inv.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b>{v.inv.type === 'plazo_fijo' ? (v.inv.name || 'Plazo fijo') : v.inv.symbol.toUpperCase()}</b>
                          <span className="badge">{assetLabel(v.inv.type)}</span>
                          {yahooSymbol(v.inv) && <button className="btn-icon" aria-label="Ver gráfico" title="Ver gráfico histórico" onClick={() => setChart(v.inv)}><IconChart /></button>}
                          {link && <a href={link.url} target="_blank" rel="noreferrer" className="btn-icon" aria-label={`Ver en ${link.label}`} title={`Ver en ${link.label}`}><IconExternal /></a>}
                        </div>
                        <div className="small muted">
                          {v.inv.type !== 'plazo_fijo' && v.inv.name ? `${v.inv.name} · ` : ''}{formatDate(v.inv.buyDate)}{v.inv.broker ? ` · ${v.inv.broker}` : ''}
                        </div>
                      </td>
                      <td className="r">{v.quantity > 0 ? formatNumber(v.quantity, 6) : <span className="badge">Vendida</span>}</td>
                      <td className="r">{formatMoney(v.avgPrice, v.inv.currency)}</td>
                      <td className="r">
                        {formatMoney(v.priceNative, v.priceCurrency)}
                        <div className="small muted" title={v.source}>{v.live ? <><span className="live-dot" /> {v.source}</> : v.source}</div>
                      </td>
                      <td className={`r ${v.changePct == null ? 'muted' : v.changePct >= 0 ? 'good' : 'bad'}`}>{v.changePct == null ? '—' : formatPct(v.changePct)}</td>
                      <td className="r"><b>{formatMoney(v.value, cur)}</b></td>
                      <td className={`r ${v.pnl >= 0 ? 'good' : 'bad'}`}>
                        {formatMoney(v.pnl, cur)}
                        {(v.realized || v.dividends) ? <div className="small muted">Realizado {formatMoney(v.realized + v.dividends, cur, { compact: true })}</div> : null}
                      </td>
                      <td className={`r ${v.pnl >= 0 ? 'good' : 'bad'}`}>{formatPct(v.pnlPct)}</td>
                      <td className="actions">
                        {v.inv.type !== 'plazo_fijo' && <button className="btn-icon" onClick={() => setOpsOf(v.inv.id)} aria-label="Operaciones" title="Operaciones: comprar más, vender, dividendos"><IconList /></button>}
                        <button className="btn-icon" aria-label="Editar" onClick={() => setEdit(v.inv)}><IconEdit /></button>
                        <button className="btn-icon" aria-label="Eliminar" onClick={() => confirm('¿Eliminar esta inversión?') && remove('investments', v.inv.id)}><IconTrash /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total</td>
                  <td className="r">{formatMoney(total, cur)}</td>
                  <td className={`r ${pnl >= 0 ? 'good' : 'bad'}`}>{formatMoney(pnl, cur)}</td>
                  <td className={`r ${pnl >= 0 ? 'good' : 'bad'}`}>{formatPct(cost ? (pnl / cost) * 100 : 0)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <Empty title="Tu cartera está vacía">Agregá CEDEARs, acciones, bonos, cripto, plazos fijos o FCIs.</Empty>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          El valor actual se convierte con el dólar de hoy y el costo con el dólar de la fecha de cada compra, así el rendimiento en dólares es real. Debajo de cada precio figura su fuente; el detalle de todas las fuentes está en <Link to="/fuentes">Fuentes de datos</Link>.
        </p>
      </Card>

      {chart && (
        <Modal title={`${chart.symbol.toUpperCase()}${chart.name ? ` · ${chart.name}` : ''}`} onClose={() => setChart(null)}>
          <YahooChart proxy={settings.yahooProxyUrl} symbol={yahooSymbol(chart)!} prefix={live.quotes[chart.id]?.currency === 'USD' ? 'US$ ' : '$ '} />
          <div className="modal-foot"><a className="btn btn-sm" href={yahooPage(yahooSymbol(chart)!)} target="_blank" rel="noreferrer">Ver en Yahoo Finance <IconExternal width={12} height={12} /></a></div>
        </Modal>
      )}
      {opsOf && investments.find((i) => i.id === opsOf) && <OpsModal inv={investments.find((i) => i.id === opsOf)!} onClose={() => setOpsOf(null)} />}
      {edit && <InvestmentForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
