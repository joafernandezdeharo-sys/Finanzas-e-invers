import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, MonthPicker, PageHead, Stat } from '../components/ui';
import { TxForm } from '../components/TxForm';
import { IconPlus } from '../components/Icons';
import { RealTermsToggle, useFlowNote } from '../components/RealTerms';
import { Legend, MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { addMonths, currentMonth, todayISO, formatDate, formatMoney, formatPct, lastMonths, monthKey, monthLabel, sum } from '../lib/util';
import { valueInvestment } from '../lib/portfolio';
import { accountBalances, unlinkedUsd } from '../lib/accounts';
import { installmentPlans, installmentSchedule } from '../lib/installments';
import { upcomingThisMonth } from '../lib/recurring';
import { dollarLabel } from '../lib/defaults';
import type { TxType } from '../types';

export default function Dashboard() {
  const { data } = useStore();
  const { settings, transactions, savings, investments, goals, dollarOps } = data;
  const live = useLive();
  const { toDisplay, flow, rate } = live;
  const colors = useThemeColors();
  const note = useFlowNote();
  const cur = settings.displayCurrency;
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState<TxType | null>(null);

  const monthTx = transactions.filter((t) => monthKey(t.date) === month && !t.internal);
  const income = sum(monthTx.filter((t) => t.type === 'ingreso').map((t) => flow(t.amount, t.currency, t.date)));
  const expense = sum(monthTx.filter((t) => t.type === 'gasto').map((t) => flow(t.amount, t.currency, t.date)));

  const savingsTotal = sum(savings.map((s) => toDisplay(s.amount, s.currency)));
  const valuations = investments.map((i) => valueInvestment(i, live.quotes[i.id], cur, rate, live.rateOn));
  const invTotal = sum(valuations.map((v) => v.value));
  const invPnl = sum(valuations.map((v) => v.pnl));
  const invCost = sum(valuations.map((v) => v.cost));
  const usdHeld = sum(dollarOps.map((o) => (o.operation === 'compra' ? o.usdAmount : -o.usdAmount)));
  // patrimonio: cuentas + dólares sin cuenta + inversiones (las metas de ahorro ya están dentro de las cuentas)
  const accounts = accountBalances(settings.accounts, settings.accountInfo, transactions);
  const netWorth = sum(accounts.map((a) => toDisplay(a.balances.ARS, 'ARS') + toDisplay(a.balances.USD, 'USD'))) + toDisplay(unlinkedUsd(dollarOps), 'USD') + invTotal;
  const plans = installmentPlans(transactions);
  const nextMonth = addMonths(currentMonth(), 1);
  const nextCuotas = installmentSchedule(plans, nextMonth, 1)[0];
  const nextCuotasValue = toDisplay(nextCuotas.ARS, 'ARS') + toDisplay(nextCuotas.USD, 'USD');
  const upcoming = month === currentMonth() ? upcomingThisMonth(data.recurring, transactions, todayISO()) : [];
  const upNet = sum(upcoming.map((r) => (r.type === 'ingreso' ? 1 : -1) * toDisplay(r.amount, r.currency)));

  const series = useMemo(() => lastMonths(12, month).map((m) => {
    const tx = transactions.filter((t) => monthKey(t.date) === m && !t.internal);
    return {
      month: m,
      Ingresos: sum(tx.filter((t) => t.type === 'ingreso').map((t) => flow(t.amount, t.currency, t.date))),
      Gastos: sum(tx.filter((t) => t.type === 'gasto').map((t) => flow(t.amount, t.currency, t.date))),
    };
  }), [transactions, month, flow]);

  const topCats = useMemo(() => {
    const m = new Map<string, number>();
    monthTx.filter((t) => t.type === 'gasto').forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + flow(t.amount, t.currency, t.date)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [monthTx, flow]);

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const budget = settings.monthlyBudget;
  const hasAny = transactions.length + savings.length + investments.length + dollarOps.length > 0;

  return (
    <>
      <PageHead title={`Hola${settings.userName ? `, ${settings.userName}` : ''} 👋`} subtitle={`Resumen de ${monthLabel(month, true)} · valores en ${cur} (dólar ${dollarLabel(settings.rateKind)} ${formatMoney(rate, "ARS", { decimals: 0 })})`}>
        <RealTermsToggle />
        <MonthPicker value={month} onChange={(m) => setMonth(m || currentMonth())} months={transactions.map((t) => monthKey(t.date))} allowAll={false} />
        <button className="btn" onClick={() => setAdding('ingreso')}><IconPlus width={16} />Ingreso</button>
        <button className="btn btn-primary" onClick={() => setAdding('gasto')}><IconPlus width={16} />Gasto</button>
      </PageHead>

      {!hasAny && (
        <div className="alert">
          ¡Bienvenido! Empezá cargando un ingreso o gasto, o andá a <Link to="/configuracion">Configuración</Link> para cargar datos de ejemplo y ver cómo funciona todo.
        </div>
      )}

      <div className="grid grid-4">
        <Stat label="Balance del mes" value={formatMoney(income - expense, cur)} tone={income - expense >= 0 ? 'good' : 'bad'}
          sub={<>Ingresos {formatMoney(income, cur, { compact: true })} · Gastos {formatMoney(expense, cur, { compact: true })}</>} />
        <Stat label="Patrimonio neto" value={formatMoney(netWorth, cur)} sub={<Link to="/patrimonio">Cuentas, dólares e inversiones →</Link>} />
        <Stat label="Inversiones" value={formatMoney(invTotal, cur)}
          sub={<span className={invPnl >= 0 ? 'good' : 'bad'}>{formatMoney(invPnl, cur)} ({formatPct(invCost ? (invPnl / invCost) * 100 : 0)})</span>} />
        <Stat label="Dólares comprados" value={formatMoney(usdHeld, 'USD')}
          sub={<>≈ {formatMoney(usdHeld * live.rateFor(settings.rateKind, 'compra'), 'ARS', { decimals: 0 })} hoy</>} />
      </div>

      {(upcoming.length > 0 || nextCuotasValue > 0 || savingsTotal !== 0) && (
        <div className="grid grid-3">
          {upcoming.length > 0 && (
            <Card title="Falta este mes" subtitle={<Link to="/presupuesto">Fijos por cargar →</Link>}>
              <div className={`stat-value ${upNet >= 0 ? 'good' : ''}`} style={{ fontSize: '1.3rem' }}>{formatMoney(upNet, cur)}</div>
              <div className="small muted">{upcoming.map((r) => r.description).slice(0, 4).join(', ')}{upcoming.length > 4 ? '…' : ''}</div>
            </Card>
          )}
          {nextCuotasValue > 0 && (
            <Card title={`Cuotas de ${monthLabel(nextMonth, true)}`} subtitle={<Link to="/presupuesto">{plans.length} compras en cuotas →</Link>}>
              <div className="stat-value" style={{ fontSize: '1.3rem' }}>{formatMoney(nextCuotasValue, cur)}</div>
              <div className="small muted">Ya comprometido en tus tarjetas</div>
            </Card>
          )}
          {savingsTotal !== 0 && (
            <Card title="Apartado para metas" subtitle={<Link to="/ahorro">{goals.length} metas de ahorro →</Link>}>
              <div className="stat-value" style={{ fontSize: '1.3rem' }}>{formatMoney(savingsTotal, cur)}</div>
              <div className="small muted">Ya incluido en tu patrimonio</div>
            </Card>
          )}
        </div>
      )}

      {budget > 0 && (
        <Card title="Presupuesto mensual" subtitle={`${formatMoney(expense, cur)} de ${formatMoney(budget, cur)}`}>
          <div className="progress"><div style={{ width: `${Math.min(100, (expense / budget) * 100)}%`, background: expense > budget ? 'var(--bad)' : undefined }} /></div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {expense > budget ? `Te pasaste por ${formatMoney(expense - budget, cur)}` : `Te quedan ${formatMoney(budget - expense, cur)} para gastar este mes`}
          </p>
        </Card>
      )}

      <div className="grid grid-3">
        <Card title="Ingresos vs. gastos" subtitle={`Últimos 12 meses · ${note}`} className="span-2" actions={<Legend items={[{ label: 'Ingresos', color: colors.series[0] }, { label: 'Gastos', color: colors.series[1] }]} />}>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={series} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={axisMoney(cur)} axisLine={false} tickLine={false} width={70} />
                <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={<MoneyTooltip currency={cur} labelFormatter={(m) => monthLabel(m, true)} />} />
                <Bar dataKey="Ingresos" fill={colors.series[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Gastos" fill={colors.series[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Mayores gastos del mes">
          {topCats.length ? (
            <div className="list">
              {topCats.map(([cat, v]) => (
                <div key={cat} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{cat}</span><b className="num">{formatMoney(v, cur)}</b>
                  </div>
                  <div className="progress"><div style={{ width: `${(v / topCats[0][1]) * 100}%`, background: colors.series[1] }} /></div>
                </div>
              ))}
            </div>
          ) : <Empty title="Sin gastos este mes" />}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Últimos movimientos" actions={<Link to="/movimientos" className="small">Ver todos →</Link>}>
          {recent.length ? (
            <div className="list">
              {recent.map((t) => (
                <div key={t.id} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{t.description || t.category}</div>
                    <div className="small muted">{formatDate(t.date)} · {t.category} · {t.account}</div>
                  </div>
                  <b className={`num ${t.internal ? 'muted' : t.type === 'ingreso' ? 'good' : ''}`} title={t.internal ? 'Entre tus cuentas: no cuenta como ingreso ni gasto' : undefined}>{t.type === 'ingreso' ? '+' : '−'}{formatMoney(t.amount, t.currency)}</b>
                </div>
              ))}
            </div>
          ) : <Empty title="Todavía no cargaste movimientos" />}
        </Card>
        <Card title="Metas de ahorro" actions={<Link to="/ahorro" className="small">Ir a Ahorro →</Link>}>
          {goals.length ? (
            <div className="list">
              {goals.slice(0, 5).map((g) => {
                const saved = sum(savings.filter((s) => s.goalId === g.id).map((s) => live.toDisplay(s.amount, s.currency)));
                const target = toDisplay(g.target, g.currency);
                const pct = target ? Math.min(100, (saved / target) * 100) : 0;
                return (
                  <div key={g.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{g.name}</span><span className="num small muted">{formatMoney(saved, cur)} / {formatMoney(target, cur)}</span>
                    </div>
                    <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <Empty title="No tenés metas todavía">Creá una en la sección Ahorro.</Empty>}
        </Card>
      </div>

      {adding && <TxForm defaultType={adding} onClose={() => setAdding(null)} />}
    </>
  );
}
