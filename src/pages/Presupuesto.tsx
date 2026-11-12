import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, NumberInput, PageHead, Segmented, Stat } from '../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { Legend, MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { installmentPlans, installmentSchedule } from '../lib/installments';
import { dayInMonth, upcomingThisMonth } from '../lib/recurring';
import { addMonths, currentMonth, formatDate, formatMoney, monthLabel, sum, todayISO } from '../lib/util';
import type { CategoryBudget, Currency, Recurring, TxType } from '../types';

function RecurringForm({ initial, onClose }: { initial?: Recurring; onClose: () => void }) {
  const { data, add, update } = useStore();
  const { settings } = data;
  const [f, setF] = useState({
    description: initial?.description ?? '',
    type: initial?.type ?? ('gasto' as TxType),
    amount: initial?.amount ?? (null as number | null),
    currency: initial?.currency ?? settings.displayCurrency,
    category: initial?.category ?? settings.expenseCategories[0] ?? '',
    account: initial?.account ?? settings.accounts[0] ?? '',
    day: initial?.day ?? Number(todayISO().slice(8, 10)),
    start: initial?.start ?? currentMonth(),
    end: initial?.end ?? '',
    active: initial?.active ?? true,
  });
  const cats = f.type === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
  const valid = f.description.trim() && f.amount && f.amount > 0 && f.day >= 1 && f.day <= 31 && f.start && (!f.end || f.end >= f.start);
  const save = () => {
    if (!valid) return;
    const r = { ...f, description: f.description.trim(), amount: f.amount!, currency: f.currency as Currency };
    if (initial) update('recurring', initial.id, r); else add('recurring', r);
    onClose();
  };
  return (
    <Modal title={initial ? 'Editar fijo' : 'Nuevo gasto o ingreso fijo'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full">
          <Segmented<TxType> value={f.type} onChange={(type) => setF({ ...f, type, category: (type === 'ingreso' ? settings.incomeCategories : settings.expenseCategories)[0] ?? '' })}
            options={[{ value: 'gasto', label: 'Gasto fijo' }, { value: 'ingreso', label: 'Ingreso fijo' }]} />
        </div>
        <Field label="Descripción" full><input className="input" autoFocus value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ej. Alquiler, Sueldo, Netflix" /></Field>
        <Field label="Monto" hint="Si cambia (aumentos), editalo y se usa desde el próximo mes"><NumberInput value={f.amount} onChange={(n) => setF({ ...f, amount: n })} /></Field>
        <Field label="Moneda">
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
            <option value="ARS">Pesos</option><option value="USD">Dólares</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Cuenta">
          <select className="select" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
            {settings.accounts.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Día del mes"><NumberInput value={f.day} onChange={(n) => setF({ ...f, day: Math.round(n ?? 1) })} /></Field>
        <Field label="Desde (mes)"><input type="month" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Hasta (opcional)"><input type="month" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <label className="small full" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (se carga solo cada mes)
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function Presupuesto() {
  const { data, setSettings, remove, update } = useStore();
  const { settings, transactions, recurring } = data;
  const live = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const month = currentMonth();
  const today = todayISO();
  const [editRec, setEditRec] = useState<Recurring | 'new' | null>(null);
  const [nb, setNb] = useState<{ category: string; amount: number | null; currency: Currency }>({ category: settings.expenseCategories[0] ?? '', amount: null, currency: cur });

  const monthTx = transactions.filter((t) => t.date.startsWith(month) && !t.internal);
  const income = sum(monthTx.filter((t) => t.type === 'ingreso').map((t) => live.flow(t.amount, t.currency, t.date)));
  const expense = sum(monthTx.filter((t) => t.type === 'gasto').map((t) => live.flow(t.amount, t.currency, t.date)));
  const upcoming = upcomingThisMonth(recurring, transactions, today);
  const upIn = sum(upcoming.filter((r) => r.type === 'ingreso').map((r) => live.toDisplay(r.amount, r.currency)));
  const upOut = sum(upcoming.filter((r) => r.type === 'gasto').map((r) => live.toDisplay(r.amount, r.currency)));

  // ritmo de gastos variables: lo gastado (sin fijos) proyectado al resto del mes
  const day = Number(today.slice(8, 10));
  const daysInMonth = Number(dayInMonth(month, 31).slice(8, 10));
  const variable = sum(monthTx.filter((t) => t.type === 'gasto' && !t.recurringId && !t.installment).map((t) => live.flow(t.amount, t.currency, t.date)));
  const variableRest = day > 3 ? (variable / day) * (daysInMonth - day) : 0;
  const projIn = income + upIn;
  const projOut = expense + upOut + variableRest;

  const plans = useMemo(() => installmentPlans(transactions), [transactions]);
  const schedule = useMemo(() => installmentSchedule(plans, addMonths(month, 1), 12), [plans, month]);
  const scheduleDisplay = schedule.map((s) => ({ month: s.month, Cuotas: live.toDisplay(s.ARS, 'ARS') + live.toDisplay(s.USD, 'USD') }));
  const committedNext = scheduleDisplay[0]?.Cuotas ?? 0;
  const committedTotal = sum(scheduleDisplay.map((s) => s.Cuotas));

  const spentBy = useMemo(() => {
    const m = new Map<string, number>();
    monthTx.filter((t) => t.type === 'gasto').forEach((t) => m.set(t.category, (m.get(t.category) ?? 0) + live.flow(t.amount, t.currency, t.date)));
    return m;
  }, [monthTx, live]);
  const budgets = settings.budgets.map((b) => {
    const limit = live.toDisplay(b.amount, b.currency);
    const spent = spentBy.get(b.category) ?? 0;
    return { ...b, limit, spent, pct: limit ? (spent / limit) * 100 : 0 };
  }).sort((a, b) => b.pct - a.pct);

  const addBudget = () => {
    if (!nb.category || !nb.amount) return;
    const next: CategoryBudget[] = [...settings.budgets.filter((b) => b.category !== nb.category), { category: nb.category, amount: nb.amount, currency: nb.currency }];
    setSettings({ budgets: next });
    setNb({ ...nb, amount: null });
  };

  const recTotal = (type: TxType) => sum(recurring.filter((r) => r.active && r.type === type).map((r) => live.toDisplay(r.amount, r.currency)));

  return (
    <>
      <PageHead title="Presupuesto y fijos" subtitle="Cuánto podés gastar, qué se viene a fin de mes, tus gastos fijos y las cuotas que tenés comprometidas." />

      <div className="grid grid-4">
        <Stat label={`Proyección ${monthLabel(month, true)}`} value={formatMoney(projIn - projOut, cur)} tone={projIn - projOut >= 0 ? 'good' : 'bad'} sub="Balance estimado a fin de mes" />
        <Stat label="Ingresos esperados" value={formatMoney(projIn, cur)} sub={upIn ? `Incluye ${formatMoney(upIn, cur, { compact: true })} de fijos por cobrar` : 'Ya cobrados'} />
        <Stat label="Gastos esperados" value={formatMoney(projOut, cur)} sub={`Fijos por pagar ${formatMoney(upOut, cur, { compact: true })} · al ritmo actual ${formatMoney(variableRest, cur, { compact: true })} más`} />
        <Stat label="Cuotas del mes que viene" value={formatMoney(committedNext, cur)} sub={`${formatMoney(committedTotal, cur, { compact: true })} comprometidos en total`} />
      </div>

      <div className="grid grid-2">
        <Card title="Presupuesto por categoría" subtitle={`${monthLabel(month, true)} · te avisamos al llegar al 90%`}>
          {budgets.length ? (
            <div className="list">
              {budgets.map((b) => (
                <div key={b.category} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span>{b.pct >= 100 ? '🔴 ' : b.pct >= 90 ? '🟠 ' : ''}{b.category}</span>
                    <span className="num small">
                      <b className={b.pct >= 100 ? 'bad' : ''}>{formatMoney(b.spent, cur)}</b> <span className="muted">de {formatMoney(b.limit, cur)}</span>
                      <button className="btn-icon" aria-label={`Quitar presupuesto de ${b.category}`} onClick={() => setSettings({ budgets: settings.budgets.filter((x) => x.category !== b.category) })}><IconTrash /></button>
                    </span>
                  </div>
                  <div className="progress"><div style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct >= 100 ? 'var(--bad)' : b.pct >= 90 ? 'var(--warn)' : undefined }} /></div>
                  <span className="small muted">{b.pct >= 100 ? `Te pasaste por ${formatMoney(b.spent - b.limit, cur)}` : `Te quedan ${formatMoney(b.limit - b.spent, cur)} (${Math.round(b.pct)}% usado)`}</span>
                </div>
              ))}
            </div>
          ) : <Empty title="Sin presupuestos por categoría">Poné un tope mensual a las categorías que querés controlar.</Empty>}
          <form className="filters" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); addBudget(); }}>
            <select className="select" style={{ width: 'auto' }} value={nb.category} onChange={(e) => setNb({ ...nb, category: e.target.value })} aria-label="Categoría">
              {settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <div style={{ width: 130 }}><NumberInput value={nb.amount} onChange={(n) => setNb({ ...nb, amount: n })} placeholder="Tope mensual" /></div>
            <select className="select" style={{ width: 'auto' }} value={nb.currency} onChange={(e) => setNb({ ...nb, currency: e.target.value as Currency })} aria-label="Moneda">
              <option value="ARS">$</option><option value="USD">US$</option>
            </select>
            <button className="btn" type="submit" disabled={!nb.amount}><IconPlus width={16} />Agregar</button>
          </form>
          <Field label={`Presupuesto total del mes (${cur}, 0 = sin tope)`}>
            <NumberInput value={settings.monthlyBudget} onChange={(n) => setSettings({ monthlyBudget: n ?? 0 })} />
          </Field>
        </Card>

        <Card title="Cuotas que vienen" subtitle="Compras en cuotas detectadas en tus movimientos y resúmenes" actions={<Legend items={[{ label: 'Cuotas', color: colors.series[1] }]} />}>
          {plans.length ? (
            <>
              <div className="chart-box" style={{ height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={scheduleDisplay}>
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={axisMoney(cur)} axisLine={false} tickLine={false} width={64} />
                    <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={<MoneyTooltip currency={cur} labelFormatter={(m) => monthLabel(m, true)} />} />
                    <Bar dataKey="Cuotas" fill={colors.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className="small">
                  <thead><tr><th>Compra</th><th className="r">Cuota</th><th className="r">Pagadas</th><th className="r">Falta</th></tr></thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.key}>
                        <td>{p.description}<div className="muted">{p.account} · última {formatDate(p.lastDate)}</div></td>
                        <td className="r">{formatMoney(p.amount, p.currency)}</td>
                        <td className="r">{p.paid} de {p.total}</td>
                        <td className="r"><b>{formatMoney(p.amount * p.remaining, p.currency)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <Empty title="No tenés cuotas pendientes">Se detectan solas al importar resúmenes de tarjeta, o cargalas al registrar un gasto.</Empty>}
        </Card>
      </div>

      <Card
        title="Gastos e ingresos fijos"
        subtitle={`Se cargan solos cada mes · gastos ${formatMoney(recTotal('gasto'), cur)}/mes · ingresos ${formatMoney(recTotal('ingreso'), cur)}/mes`}
        actions={<button className="btn btn-primary btn-sm" onClick={() => setEditRec('new')}><IconPlus width={14} />Nuevo fijo</button>}
      >
        {recurring.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th className="r">Día</th><th className="r">Monto</th><th>Este mes</th><th /></tr></thead>
              <tbody>
                {recurring.map((r) => {
                  const done = transactions.some((t) => t.recurringId === r.id && t.date.startsWith(month));
                  return (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td><b>{r.description}</b><div className="small muted">desde {monthLabel(r.start, true)}{r.end ? ` hasta ${monthLabel(r.end, true)}` : ''}</div></td>
                      <td><span className={`badge ${r.type === 'ingreso' ? 'good' : ''}`}>{r.category}</span></td>
                      <td className="small muted">{r.account}</td>
                      <td className="r">{r.day}</td>
                      <td className={`r ${r.type === 'ingreso' ? 'good' : ''}`}>{r.type === 'ingreso' ? '+' : '−'}{formatMoney(r.amount, r.currency)}</td>
                      <td className="small">{!r.active ? <span className="muted">Pausado</span> : done ? <span className="good">✓ Cargado</span> : <span className="muted">El {formatDate(dayInMonth(month, r.day))}</span>}</td>
                      <td className="actions">
                        <button className="btn-icon" aria-label={r.active ? 'Pausar' : 'Activar'} title={r.active ? 'Pausar' : 'Activar'} onClick={() => update('recurring', r.id, { active: !r.active })}>{r.active ? '⏸' : '▶'}</button>
                        <button className="btn-icon" aria-label="Editar" onClick={() => setEditRec(r)}><IconEdit /></button>
                        <button className="btn-icon" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar "${r.description}"? Los movimientos ya cargados se mantienen.`) && remove('recurring', r.id)}><IconTrash /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No tenés gastos fijos">Cargá alquiler, sueldo, expensas o suscripciones y se registran solos todos los meses.</Empty>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Si después importás el resumen del banco con ese mismo pago, la app lo reconoce y no lo duplica.
        </p>
      </Card>

      {editRec && <RecurringForm initial={editRec === 'new' ? undefined : editRec} onClose={() => setEditRec(null)} />}
    </>
  );
}
