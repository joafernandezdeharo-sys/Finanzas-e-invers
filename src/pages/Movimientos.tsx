import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, MonthPicker, PageHead, Segmented, Stat } from '../components/ui';
import { TxForm } from '../components/TxForm';
import { IconDownload, IconEdit, IconPlus, IconTrash, IconUpload } from '../components/Icons';
import { MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { RealTermsToggle, useFlowNote } from '../components/RealTerms';
import { currentMonth, downloadFile, formatDate, formatMoney, monthKey, monthLabel, sum, toCSV } from '../lib/util';
import type { Transaction } from '../types';

type SortKey = 'date' | 'amount' | 'category';

export default function Movimientos() {
  const { data, remove } = useStore();
  const { settings, transactions } = data;
  const { flow } = useLive();
  const note = useFlowNote();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;

  const [params] = useSearchParams();
  const [month, setMonth] = useState(params.get('mes') ?? currentMonth());
  const [source, setSource] = useState('');
  const [type, setType] = useState<'todos' | 'ingreso' | 'gasto' | 'interna'>('todos');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState(params.get('cuenta') ?? '');
  const [currency, setCurrency] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);

  const months = useMemo(() => [...new Set(transactions.map((t) => monthKey(t.date)))], [transactions]);
  const categories = useMemo(
    () => [...new Set([...settings.incomeCategories, ...settings.expenseCategories, ...transactions.map((t) => t.category)])],
    [settings, transactions],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return transactions
      .filter((t) =>
        (!month || monthKey(t.date) === month) &&
        (type === 'todos' || (type === 'interna' ? !!t.internal : !t.internal && t.type === type)) &&
        (!category || t.category === category) &&
        (!account || t.account === account) &&
        (!currency || t.currency === currency) &&
        (!source || (t.source || 'Carga manual') === source) &&
        (!term || `${t.description} ${t.category} ${t.account}`.toLowerCase().includes(term)))
      .sort((a, b) => {
        const d = sort.dir;
        if (sort.key === 'amount') return (flow(a.amount, a.currency, a.date) - flow(b.amount, b.currency, b.date)) * d;
        if (sort.key === 'category') return a.category.localeCompare(b.category) * d;
        return a.date.localeCompare(b.date) * d;
      });
  }, [transactions, month, type, category, account, currency, source, q, sort, flow]);

  const countable = filtered.filter((t) => !t.internal);
  const income = sum(countable.filter((t) => t.type === 'ingreso').map((t) => flow(t.amount, t.currency, t.date)));
  const expense = sum(countable.filter((t) => t.type === 'gasto').map((t) => flow(t.amount, t.currency, t.date)));

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((t) => !t.internal && t.type === (type === 'ingreso' ? 'ingreso' : 'gasto'))
      .forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + flow(t.amount, t.currency, t.date)));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered, type, flow]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');

  const exportCSV = () => {
    const rows = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Cuenta', 'Origen', 'Moneda', 'Monto', 'Entre cuentas', 'Cuota'],
      ...filtered.map((t) => [t.date, t.type, t.category, t.description, t.account, t.source ?? '', t.currency, t.amount, t.internal ? 'sí' : '', t.installment ? `${t.installment.n}/${t.installment.total}` : ''])];
    downloadFile(`movimientos-${month || 'todos'}.csv`, '﻿' + toCSV(rows), 'text/csv');
  };

  const clearFilters = () => { setType('todos'); setCategory(''); setAccount(''); setCurrency(''); setSource(''); setQ(''); };
  const sources = useMemo(() => [...new Set(transactions.map((t) => t.source || 'Carga manual'))].sort(), [transactions]);

  return (
    <>
      <PageHead title="Ingresos y gastos" subtitle="El día a día de tu plata, separado por mes.">
        <RealTermsToggle />
        <MonthPicker value={month} onChange={setMonth} months={months} />
        <Link to="/importar" className="btn"><IconUpload width={16} />Importar resumen</Link>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IconPlus width={16} />Nuevo movimiento</button>
      </PageHead>

      <div className="grid grid-3">
        <Stat label="Ingresos" value={formatMoney(income, cur)} sub={`${countable.filter((t) => t.type === 'ingreso').length} movimientos`} />
        <Stat label="Gastos" value={formatMoney(expense, cur)} sub={`${countable.filter((t) => t.type === 'gasto').length} movimientos${filtered.length > countable.length ? ` · ${filtered.length - countable.length} entre cuentas (no suman)` : ''}`} />
        <Stat label="Balance" value={formatMoney(income - expense, cur)} tone={income - expense >= 0 ? 'good' : 'bad'}
          sub={income ? `Ahorrás el ${Math.round(((income - expense) / income) * 100)}% de lo que ingresa` : month ? monthLabel(month, true) : 'Todo el período'} />
      </div>

      <Card
        title={`${type === 'ingreso' ? 'Ingresos' : 'Gastos'} por categoría`}
        subtitle={`${month ? monthLabel(month, true) : 'Todos los meses'} · ${note}`}
      >
        {byCategory.length ? (
          <div className="chart-box" style={{ height: Math.max(160, byCategory.length * 34 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={colors.grid} />
                <XAxis type="number" tickFormatter={axisMoney(cur)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={<MoneyTooltip currency={cur} />} />
                <Bar dataKey="value" name="Total" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {byCategory.map((_, i) => <Cell key={i} fill={type === 'ingreso' ? colors.series[0] : colors.series[1]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="Sin datos para graficar" />}
      </Card>

      <Card
        title="Movimientos"
        subtitle={`${filtered.length} resultados`}
        actions={<button className="btn btn-sm" onClick={exportCSV} disabled={!filtered.length}><IconDownload width={14} />Exportar CSV</button>}
      >
        <div className="filters" style={{ marginBottom: 14 }}>
          <Segmented value={type} onChange={setType} options={[{ value: 'todos', label: 'Todos' }, { value: 'ingreso', label: 'Ingresos' }, { value: 'gasto', label: 'Gastos' }, { value: 'interna', label: 'Entre cuentas' }]} />
          <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {settings.accounts.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Moneda">
            <option value="">ARS y USD</option>
            <option value="ARS">Solo ARS</option>
            <option value="USD">Solo USD</option>
          </select>
          {sources.length > 1 && (
            <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origen">
              <option value="">Todos los orígenes</option>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          <input className="input" style={{ width: 200 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-sm" onClick={clearFilters}>Limpiar filtros</button>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => sortBy('date')}>Fecha{arrow('date')}</th>
                  <th className="sortable" onClick={() => sortBy('category')}>Categoría{arrow('category')}</th>
                  <th>Descripción</th>
                  <th>Cuenta</th>
                  <th className="r">Monto original</th>
                  <th className="r sortable" onClick={() => sortBy('amount')}>En {cur}{arrow('amount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{formatDate(t.date)}</td>
                    <td><span className={`badge ${t.internal ? 'accent' : t.type === 'ingreso' ? 'good' : ''}`}>{t.internal ? 'Entre cuentas' : t.category}</span></td>
                    <td>
                      {t.description || <span className="muted">—</span>}
                      {(t.installment || t.recurringId) && (
                        <div className="small muted">
                          {t.installment && <>Cuota {t.installment.n} de {t.installment.total}</>}
                          {t.installment && t.recurringId && ' · '}
                          {t.recurringId && 'Gasto fijo automático'}
                        </div>
                      )}
                    </td>
                    <td className="muted">{t.account}{t.source && <div className="small">{t.source}</div>}</td>
                    <td className="r muted">{formatMoney(t.amount, t.currency)}</td>
                    <td className={`r ${t.internal ? 'muted' : t.type === 'ingreso' ? 'good' : ''}`} title={t.internal ? 'Transferencia entre tus cuentas: no cuenta como ingreso ni gasto' : undefined}>
                      {t.type === 'ingreso' ? '+' : '−'}{formatMoney(flow(t.amount, t.currency, t.date), cur)}
                    </td>
                    <td className="actions">
                      <button className="btn-icon" aria-label="Editar" onClick={() => setEditing(t)}><IconEdit /></button>
                      <button className="btn-icon" aria-label="Eliminar" onClick={() => confirm('¿Eliminar este movimiento?') && remove('transactions', t.id)}><IconTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay movimientos">Cargá tu primer ingreso o gasto con “Nuevo movimiento”.</Empty>
        )}
      </Card>

      {editing && <TxForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
