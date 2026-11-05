import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, PageHead, Stat } from '../components/ui';
import { IconDownload } from '../components/Icons';
import { Legend, MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { addMonths, downloadFile, formatMoney, monthKey, monthLabel, sum, toCSV } from '../lib/util';

const MANUAL = 'Carga manual';

interface MonthRow {
  month: string;
  income: number;
  expense: number;
  count: number;
  topCategory: string;
}

export default function Historial() {
  const { data } = useStore();
  const { transactions, settings } = data;
  const { toDisplay } = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const [year, setYear] = useState('');
  const [source, setSource] = useState('');

  const sources = useMemo(() => [...new Set(transactions.map((t) => t.source || MANUAL))].sort(), [transactions]);
  const years = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 4)))].sort().reverse(), [transactions]);

  const txs = useMemo(
    () => transactions.filter((t) => (!year || t.date.startsWith(year)) && (!source || (t.source || MANUAL) === source)),
    [transactions, year, source],
  );

  const months: MonthRow[] = useMemo(() => {
    if (!txs.length) return [];
    const keys = txs.map((t) => monthKey(t.date)).sort();
    const list: string[] = [];
    for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonths(m, 1)) list.push(m);
    return list.map((m) => {
      const mt = txs.filter((t) => monthKey(t.date) === m);
      const cats = new Map<string, number>();
      mt.filter((t) => t.type === 'gasto').forEach((t) => cats.set(t.category, (cats.get(t.category) ?? 0) + toDisplay(t.amount, t.currency)));
      const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        month: m,
        income: sum(mt.filter((t) => t.type === 'ingreso').map((t) => toDisplay(t.amount, t.currency))),
        expense: sum(mt.filter((t) => t.type === 'gasto').map((t) => toDisplay(t.amount, t.currency))),
        count: mt.length,
        topCategory: top ? top[0] : '—',
      };
    });
  }, [txs, toDisplay]);

  const totalIn = sum(months.map((m) => m.income));
  const totalOut = sum(months.map((m) => m.expense));
  const activeMonths = months.filter((m) => m.count).length || 1;

  const byYear = useMemo(() => {
    const m = new Map<string, MonthRow[]>();
    months.forEach((r) => m.set(r.month.slice(0, 4), [...(m.get(r.month.slice(0, 4)) ?? []), r]));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [months]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    txs.filter((t) => t.type === 'gasto').forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + toDisplay(t.amount, t.currency)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [txs, toDisplay]);

  const exportCSV = () => {
    const rows = [['Mes', 'Ingresos', 'Gastos', 'Balance', 'Movimientos', 'Mayor gasto'],
      ...months.map((m) => [m.month, m.income.toFixed(2), m.expense.toFixed(2), (m.income - m.expense).toFixed(2), m.count, m.topCategory])];
    downloadFile(`historial-${year || 'completo'}.csv`, '﻿' + toCSV(rows), 'text/csv');
  };

  const pct = (m: MonthRow) => (m.income ? Math.round(((m.income - m.expense) / m.income) * 100) : null);

  return (
    <>
      <PageHead title="Historial" subtitle="Todo lo que fuiste cargando e importando, mes a mes. Se acumula con cada resumen nuevo.">
        <select className="select" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año">
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {sources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn" onClick={exportCSV} disabled={!months.length}><IconDownload width={16} />CSV</button>
      </PageHead>

      {!transactions.length ? (
        <Card><Empty title="Todavía no hay historial"><Link to="/importar">Importá un resumen</Link> o cargá movimientos a mano.</Empty></Card>
      ) : (
        <>
          <div className="grid grid-4">
            <Stat label="Ingresos" value={formatMoney(totalIn, cur)} sub={year || 'Total histórico'} />
            <Stat label="Gastos" value={formatMoney(totalOut, cur)} sub={`Promedio ${formatMoney(totalOut / activeMonths, cur, { compact: true })}/mes`} />
            <Stat label="Balance" value={formatMoney(totalIn - totalOut, cur)} tone={totalIn - totalOut >= 0 ? 'good' : 'bad'}
              sub={totalIn ? `Ahorraste el ${Math.round(((totalIn - totalOut) / totalIn) * 100)}% de lo que ingresó` : undefined} />
            <Stat label="Movimientos" value={String(txs.length)} sub={`${activeMonths} meses con datos · ${sources.length} orígenes`} />
          </div>

          <Card title="Ingresos y gastos por mes" subtitle={`en ${cur}`} actions={<Legend items={[{ label: 'Ingresos', color: colors.series[0] }, { label: 'Gastos', color: colors.series[1] }]} />}>
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={months.map((m) => ({ month: m.month, Ingresos: m.income, Gastos: m.expense }))} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tickFormatter={axisMoney(cur)} axisLine={false} tickLine={false} width={70} />
                  <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={<MoneyTooltip currency={cur} labelFormatter={(m) => monthLabel(m, true)} />} />
                  <Bar dataKey="Ingresos" fill={colors.series[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="Gastos" fill={colors.series[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-3">
            <Card title="Mes a mes" className="span-2">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Mes</th><th className="r">Ingresos</th><th className="r">Gastos</th><th className="r">Balance</th><th className="r">Ahorro</th><th>Mayor gasto</th><th className="r">Movs.</th></tr></thead>
                  <tbody>
                    {byYear.map(([y, rows]) => {
                      const yi = sum(rows.map((r) => r.income)), yo = sum(rows.map((r) => r.expense));
                      return [
                        ...[...rows].reverse().map((m) => (
                          <tr key={m.month} style={{ opacity: m.count ? 1 : 0.5 }}>
                            <td><Link to={`/movimientos?mes=${m.month}`}>{monthLabel(m.month, true)}</Link></td>
                            <td className="r good">{formatMoney(m.income, cur)}</td>
                            <td className="r">{formatMoney(m.expense, cur)}</td>
                            <td className={`r ${m.income - m.expense >= 0 ? 'good' : 'bad'}`}>{formatMoney(m.income - m.expense, cur)}</td>
                            <td className="r muted">{pct(m) == null ? '—' : `${pct(m)}%`}</td>
                            <td className="small">{m.topCategory}</td>
                            <td className="r muted">{m.count}</td>
                          </tr>
                        )),
                        <tr key={`y-${y}`} style={{ background: 'var(--surface-2)' }}>
                          <td><b>Total {y}</b></td>
                          <td className="r good"><b>{formatMoney(yi, cur)}</b></td>
                          <td className="r"><b>{formatMoney(yo, cur)}</b></td>
                          <td className={`r ${yi - yo >= 0 ? 'good' : 'bad'}`}><b>{formatMoney(yi - yo, cur)}</b></td>
                          <td className="r muted">{yi ? `${Math.round(((yi - yo) / yi) * 100)}%` : '—'}</td>
                          <td />
                          <td className="r muted">{sum(rows.map((r) => r.count))}</td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="En qué se fue la plata" subtitle={year || 'Todo el período'}>
              {categories.length ? (
                <div className="list">
                  {categories.slice(0, 12).map(([cat, v]) => (
                    <div key={cat} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{cat}</span>
                        <span className="num"><b>{formatMoney(v, cur, { compact: true })}</b> <span className="muted small">{Math.round((v / totalOut) * 100)}%</span></span>
                      </div>
                      <div className="progress"><div style={{ width: `${(v / categories[0][1]) * 100}%`, background: colors.series[1] }} /></div>
                    </div>
                  ))}
                </div>
              ) : <Empty title="Sin gastos" />}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
