import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, MonthPicker, PageHead, Segmented, Stat } from '../components/ui';
import { TxForm } from '../components/TxForm';
import { IconDownload, IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { currentMonth, downloadFile, formatDate, formatMoney, monthKey, monthLabel, sum, toCSV } from '../lib/util';
import type { Transaction } from '../types';

type SortKey = 'date' | 'amount' | 'category';

export default function Movimientos() {
  const { data, remove } = useStore();
  const { settings, transactions } = data;
  const { toDisplay } = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;

  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState<'todos' | 'ingreso' | 'gasto'>('todos');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
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
        (type === 'todos' || t.type === type) &&
        (!category || t.category === category) &&
        (!account || t.account === account) &&
        (!currency || t.currency === currency) &&
        (!term || `${t.description} ${t.category} ${t.account}`.toLowerCase().includes(term)))
      .sort((a, b) => {
        const d = sort.dir;
        if (sort.key === 'amount') return (toDisplay(a.amount, a.currency) - toDisplay(b.amount, b.currency)) * d;
        if (sort.key === 'category') return a.category.localeCompare(b.category) * d;
        return a.date.localeCompare(b.date) * d;
      });
  }, [transactions, month, type, category, account, currency, q, sort, toDisplay]);

  const income = sum(filtered.filter((t) => t.type === 'ingreso').map((t) => toDisplay(t.amount, t.currency)));
  const expense = sum(filtered.filter((t) => t.type === 'gasto').map((t) => toDisplay(t.amount, t.currency)));

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((t) => t.type === (type === 'ingreso' ? 'ingreso' : 'gasto'))
      .forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + toDisplay(t.amount, t.currency)));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered, type, toDisplay]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');

  const exportCSV = () => {
    const rows = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Cuenta', 'Moneda', 'Monto'],
      ...filtered.map((t) => [t.date, t.type, t.category, t.description, t.account, t.currency, t.amount])];
    downloadFile(`movimientos-${month || 'todos'}.csv`, '﻿' + toCSV(rows), 'text/csv');
  };

  const clearFilters = () => { setType('todos'); setCategory(''); setAccount(''); setCurrency(''); setQ(''); };

  return (
    <>
      <PageHead title="Ingresos y gastos" subtitle="El día a día de tu plata, separado por mes.">
        <MonthPicker value={month} onChange={setMonth} months={months} />
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IconPlus width={16} />Nuevo movimiento</button>
      </PageHead>

      <div className="grid grid-3">
        <Stat label="Ingresos" value={formatMoney(income, cur)} sub={`${filtered.filter((t) => t.type === 'ingreso').length} movimientos`} />
        <Stat label="Gastos" value={formatMoney(expense, cur)} sub={`${filtered.filter((t) => t.type === 'gasto').length} movimientos`} />
        <Stat label="Balance" value={formatMoney(income - expense, cur)} tone={income - expense >= 0 ? 'good' : 'bad'}
          sub={income ? `Ahorrás el ${Math.round(((income - expense) / income) * 100)}% de lo que ingresa` : month ? monthLabel(month, true) : 'Todo el período'} />
      </div>

      <Card
        title={`${type === 'ingreso' ? 'Ingresos' : 'Gastos'} por categoría`}
        subtitle={`${month ? monthLabel(month, true) : 'Todos los meses'} · en ${cur}`}
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
          <Segmented value={type} onChange={setType} options={[{ value: 'todos', label: 'Todos' }, { value: 'ingreso', label: 'Ingresos' }, { value: 'gasto', label: 'Gastos' }]} />
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
                    <td><span className={`badge ${t.type === 'ingreso' ? 'good' : ''}`}>{t.category}</span></td>
                    <td>{t.description || <span className="muted">—</span>}</td>
                    <td className="muted">{t.account}</td>
                    <td className="r muted">{formatMoney(t.amount, t.currency)}</td>
                    <td className={`r ${t.type === 'ingreso' ? 'good' : ''}`}>
                      {t.type === 'ingreso' ? '+' : '−'}{formatMoney(toDisplay(t.amount, t.currency), cur)}
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
