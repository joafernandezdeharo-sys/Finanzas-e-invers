import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, NumberInput, PageHead, Stat } from '../components/ui';
import { IconEdit, IconExternal, IconPlus, IconRefresh, IconTrash } from '../components/Icons';
import { MoneyTooltip, useThemeColors } from '../components/charts';
import { ASSET_TYPES, assetLabel } from '../lib/defaults';
import { valueInvestment, type Valuation } from '../lib/portfolio';
import { searchCoins, type CoinSearchResult } from '../services/prices';
import { formatDate, formatMoney, formatNumber, formatPct, sum, todayISO } from '../lib/util';
import type { AssetType, Currency, Investment } from '../types';

const externalLink = (inv: Investment) => {
  const s = inv.symbol.trim();
  switch (inv.type) {
    case 'cripto': return `https://www.coingecko.com/es/monedas/${s.toLowerCase()}`;
    case 'accion_us': return `https://www.tradingview.com/symbols/${s.toUpperCase()}/`;
    case 'cedear':
    case 'accion_ar':
    case 'bono': return `https://www.tradingview.com/symbols/BCBA-${s.toUpperCase()}/`;
    default: return null;
  }
};

function InvestmentForm({ initial, onClose }: { initial?: Investment; onClose: () => void }) {
  const { add, update } = useStore();
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

  const valid = (isPF || f.symbol.trim()) && f.quantity && f.quantity > 0 && f.buyPrice != null && f.buyPrice >= 0;
  const save = () => {
    if (!valid) return;
    const inv = { ...f, symbol: f.symbol.trim() || (isPF ? 'PF' : ''), quantity: f.quantity!, buyPrice: f.buyPrice! };
    if (initial) update('investments', initial.id, inv); else add('investments', inv);
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
        ) : (
          <>
            <Field label="Cantidad" hint={f.type === 'bono' ? 'Valor nominal' : undefined}><NumberInput value={f.quantity} onChange={(n) => setF({ ...f, quantity: n })} /></Field>
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
        <Field label={isPF ? 'Fecha de constitución' : 'Fecha de compra'}>
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

type SortKey = 'value' | 'pnl' | 'pnlPct' | 'symbol';

export default function Inversiones() {
  const { data, remove } = useStore();
  const { investments, settings } = data;
  const live = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const [edit, setEdit] = useState<Investment | 'new' | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 });

  const valuations = useMemo(
    () => investments.map((i) => valueInvestment(i, live.quotes[i.id], cur, live.rate)),
    [investments, live.quotes, cur, live.rate],
  );
  const filtered = valuations
    .filter((v) => (!typeFilter || v.inv.type === typeFilter) && (!brokerFilter || v.inv.broker === brokerFilter))
    .sort((a, b) => (sort.key === 'symbol' ? a.inv.symbol.localeCompare(b.inv.symbol) : (a[sort.key] - b[sort.key])) * sort.dir);

  const total = sum(filtered.map((v) => v.value));
  const cost = sum(filtered.map((v) => v.cost));
  const pnl = total - cost;
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
      <PageHead title="Inversiones" subtitle="Tu cartera con precios en vivo de CoinGecko, BYMA (data912) y Finnhub.">
        <button className="btn" onClick={live.refresh} disabled={live.loading}><IconRefresh width={16} />Actualizar precios</button>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><IconPlus width={16} />Nueva inversión</button>
      </PageHead>

      {live.quotesErrors.length > 0 && <div className="alert bad">Algunas fuentes no respondieron: {live.quotesErrors.join(' · ')}</div>}

      <div className="grid grid-4">
        <Stat label="Valor de la cartera" value={formatMoney(total, cur)} sub={live.quotesUpdated ? <><span className="live-dot" /> Actualizado {live.quotesUpdated.toLocaleTimeString('es-AR')}</> : 'Sin cotizaciones aún'} />
        <Stat label="Capital invertido" value={formatMoney(cost, cur)} />
        <Stat label="Ganancia / pérdida" value={formatMoney(pnl, cur)} tone={pnl >= 0 ? 'good' : 'bad'} sub={formatPct(cost ? (pnl / cost) * 100 : 0)} />
        <Stat label="Activos" value={String(filtered.length)} sub={`${valuations.filter((v) => v.live).length} con cotización en vivo`} />
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
      </>}>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => sortBy('symbol')}>Activo{arrow('symbol')}</th>
                  <th className="r">Cantidad</th>
                  <th className="r">Precio compra</th>
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
                          {link && <a href={link} target="_blank" rel="noreferrer" className="btn-icon" aria-label="Ver en sitio externo"><IconExternal /></a>}
                        </div>
                        <div className="small muted">
                          {v.inv.type !== 'plazo_fijo' && v.inv.name ? `${v.inv.name} · ` : ''}{formatDate(v.inv.buyDate)}{v.inv.broker ? ` · ${v.inv.broker}` : ''}
                        </div>
                      </td>
                      <td className="r">{formatNumber(v.inv.quantity, 6)}</td>
                      <td className="r">{formatMoney(v.inv.buyPrice, v.inv.currency)}</td>
                      <td className="r">
                        {formatMoney(v.priceNative, v.priceCurrency)}
                        <div className="small muted" title={v.source}>{v.live ? <><span className="live-dot" /> {v.source}</> : v.source}</div>
                      </td>
                      <td className={`r ${v.changePct == null ? 'muted' : v.changePct >= 0 ? 'good' : 'bad'}`}>{v.changePct == null ? '—' : formatPct(v.changePct)}</td>
                      <td className="r"><b>{formatMoney(v.value, cur)}</b></td>
                      <td className={`r ${v.pnl >= 0 ? 'good' : 'bad'}`}>{formatMoney(v.pnl, cur)}</td>
                      <td className={`r ${v.pnl >= 0 ? 'good' : 'bad'}`}>{formatPct(v.pnlPct)}</td>
                      <td className="actions">
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
          Los resultados se calculan convirtiendo todo a {cur} con el dólar elegido en Configuración. Para cotizar acciones de EE.UU. que no estén en data912 podés cargar una API key gratuita de Finnhub.
        </p>
      </Card>

      {edit && <InvestmentForm initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
