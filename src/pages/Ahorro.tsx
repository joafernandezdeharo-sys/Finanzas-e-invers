import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, MonthPicker, NumberInput, PageHead, Segmented, Stat } from '../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons';
import { MoneyTooltip, axisMoney, useThemeColors } from '../components/charts';
import { convert, daysBetween, formatDate, formatMoney, monthKey, monthLabel, sum, todayISO } from '../lib/util';
import type { Currency, SavingsGoal, SavingsMovement } from '../types';

function GoalForm({ initial, onClose }: { initial?: SavingsGoal; onClose: () => void }) {
  const { add, update, data } = useStore();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    target: initial?.target ?? (null as number | null),
    currency: initial?.currency ?? data.settings.displayCurrency,
    deadline: initial?.deadline ?? '',
  });
  const valid = f.name.trim() && f.target && f.target > 0;
  const save = () => {
    if (!valid) return;
    const g = { ...f, target: f.target! };
    if (initial) update('goals', initial.id, g); else add('goals', g);
    onClose();
  };
  return (
    <Modal title={initial ? 'Editar meta' : 'Nueva meta de ahorro'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Nombre" full><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Vacaciones, fondo de emergencia" /></Field>
        <Field label="Objetivo"><NumberInput value={f.target} onChange={(n) => setF({ ...f, target: n })} /></Field>
        <Field label="Moneda">
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
            <option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option>
          </select>
        </Field>
        <Field label="Fecha límite (opcional)" full><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function MovementForm({ initial, goalId, onClose }: { initial?: SavingsMovement; goalId?: string; onClose: () => void }) {
  const { add, update, data } = useStore();
  const goal = data.goals.find((g) => g.id === (initial?.goalId ?? goalId));
  const [kind, setKind] = useState<'aporte' | 'retiro'>(initial && initial.amount < 0 ? 'retiro' : 'aporte');
  const [f, setF] = useState({
    goalId: initial?.goalId ?? goalId ?? '',
    date: initial?.date ?? todayISO(),
    amount: initial ? Math.abs(initial.amount) : (null as number | null),
    currency: initial?.currency ?? goal?.currency ?? data.settings.displayCurrency,
    note: initial?.note ?? '',
  });
  const valid = f.amount && f.amount > 0;
  const save = () => {
    if (!valid) return;
    const m = { ...f, amount: kind === 'retiro' ? -f.amount! : f.amount! };
    if (initial) update('savings', initial.id, m); else add('savings', m);
    onClose();
  };
  return (
    <Modal title={initial ? 'Editar movimiento de ahorro' : 'Registrar ahorro'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><Segmented value={kind} onChange={setKind} options={[{ value: 'aporte', label: 'Aporte' }, { value: 'retiro', label: 'Retiro' }]} /></div>
        <Field label="Monto"><NumberInput value={f.amount} onChange={(n) => setF({ ...f, amount: n })} autoFocus /></Field>
        <Field label="Moneda">
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
            <option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option>
          </select>
        </Field>
        <Field label="Meta">
          <select className="select" value={f.goalId} onChange={(e) => setF({ ...f, goalId: e.target.value })}>
            <option value="">Ahorro general</option>
            {data.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Nota" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function Ahorro() {
  const { data, remove } = useStore();
  const { goals, savings, settings } = data;
  const { toDisplay, flow, rate } = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const [goalEdit, setGoalEdit] = useState<SavingsGoal | 'new' | null>(null);
  const [movEdit, setMovEdit] = useState<{ initial?: SavingsMovement; goalId?: string } | null>(null);
  const [month, setMonth] = useState('');
  const [goalFilter, setGoalFilter] = useState('*');

  const totalARS = sum(savings.filter((s) => s.currency === 'ARS').map((s) => s.amount));
  const totalUSD = sum(savings.filter((s) => s.currency === 'USD').map((s) => s.amount));
  const total = toDisplay(totalARS, 'ARS') + toDisplay(totalUSD, 'USD');

  const thisMonth = todayISO().slice(0, 7);
  const savedThisMonth = sum(savings.filter((s) => monthKey(s.date) === thisMonth).map((s) => flow(s.amount, s.currency, s.date)));

  const evolution = useMemo(() => {
    const sorted = [...savings].sort((a, b) => a.date.localeCompare(b.date));
    const byMonth = new Map<string, number>();
    let acc = 0;
    sorted.forEach((s) => { acc += toDisplay(s.amount, s.currency); byMonth.set(monthKey(s.date), acc); });
    return [...byMonth.entries()].map(([m, v]) => ({ month: m, Ahorro: v }));
  }, [savings, toDisplay]);

  const movements = savings
    .filter((s) => (!month || monthKey(s.date) === month) && (goalFilter === '*' || s.goalId === goalFilter))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHead title="Ahorro" subtitle="Metas, aportes y evolución de tus ahorros en pesos y dólares.">
        <button className="btn" onClick={() => setGoalEdit('new')}><IconPlus width={16} />Nueva meta</button>
        <button className="btn btn-primary" onClick={() => setMovEdit({})}><IconPlus width={16} />Registrar ahorro</button>
      </PageHead>

      <div className="grid grid-4">
        <Stat label="Total ahorrado" value={formatMoney(total, cur)} sub={`en ${cur} al tipo de cambio actual`} />
        <Stat label="Ahorro en pesos" value={formatMoney(totalARS, 'ARS')} />
        <Stat label="Ahorro en dólares" value={formatMoney(totalUSD, 'USD')} />
        <Stat label="Ahorrado este mes" value={formatMoney(savedThisMonth, cur)} tone={savedThisMonth >= 0 ? 'good' : 'bad'} />
      </div>

      <Card title="Evolución del ahorro acumulado" subtitle={`en ${cur}`}>
        {evolution.length > 1 ? (
          <div className="chart-box">
            <ResponsiveContainer>
              <AreaChart data={evolution}>
                <defs>
                  <linearGradient id="gSav" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.series[2]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={colors.series[2]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={axisMoney(cur)} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<MoneyTooltip currency={cur} labelFormatter={(m) => monthLabel(m, true)} />} />
                <Area type="monotone" dataKey="Ahorro" stroke={colors.series[2]} strokeWidth={2} fill="url(#gSav)" activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="Registrá aportes en al menos dos meses para ver la evolución" />}
      </Card>

      <Card title="Metas">
        {goals.length ? (
          <div className="grid grid-3">
            {goals.map((g) => {
              const items = savings.filter((s) => s.goalId === g.id);
              // el progreso se mide en la moneda de la meta
              const saved = sum(items.map((s) => convert(s.amount, s.currency, g.currency, rate)));
              const pct = Math.max(0, Math.min(100, (saved / g.target) * 100));
              const remaining = g.target - saved;
              const days = g.deadline ? daysBetween(todayISO(), g.deadline) : 0;
              const monthsLeft = Math.max(1, Math.ceil(days / 30));
              return (
                <div key={g.id} className="card" style={{ boxShadow: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <h3>{g.name}</h3>
                    <div>
                      <button className="btn-icon" aria-label="Editar meta" onClick={() => setGoalEdit(g)}><IconEdit /></button>
                      <button className="btn-icon" aria-label="Eliminar meta" onClick={() => confirm(`¿Eliminar la meta "${g.name}"? Los aportes pasan a ahorro general.`) && remove('goals', g.id)}><IconTrash /></button>
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: '1.2rem', fontWeight: 650 }}>
                    {formatMoney(saved, g.currency)} <span className="muted small">de {formatMoney(g.target, g.currency)}</span>
                  </div>
                  <div className="progress"><div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : undefined }} /></div>
                  <div className="small muted">
                    {pct >= 100 ? '¡Meta cumplida! 🎉' : <>
                      {Math.round(pct)}% · faltan {formatMoney(remaining, g.currency)}
                      {g.deadline && <> · {formatDate(g.deadline)} ({days} días) → {formatMoney(remaining / monthsLeft, g.currency)}/mes</>}
                    </>}
                  </div>
                  <button className="btn btn-sm" onClick={() => setMovEdit({ goalId: g.id })}><IconPlus width={14} />Aportar</button>
                </div>
              );
            })}
          </div>
        ) : <Empty title="Sin metas">Creá metas como “Fondo de emergencia” o “Viaje” para seguir tu progreso.</Empty>}
      </Card>

      <Card title="Aportes y retiros" actions={<>
        <select className="select" style={{ width: 'auto' }} value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} aria-label="Filtrar por meta">
          <option value="*">Todas las metas</option>
          <option value="">Ahorro general</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <MonthPicker value={month} onChange={setMonth} months={savings.map((s) => monthKey(s.date))} />
      </>}>
        {movements.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Meta</th><th>Nota</th><th className="r">Monto</th><th className="r">En {cur}</th><th /></tr></thead>
              <tbody>
                {movements.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{formatDate(s.date)}</td>
                    <td>{goals.find((g) => g.id === s.goalId)?.name ?? <span className="muted">Ahorro general</span>}</td>
                    <td className="muted">{s.note || '—'}</td>
                    <td className={`r ${s.amount >= 0 ? 'good' : 'bad'}`}>{s.amount >= 0 ? '+' : ''}{formatMoney(s.amount, s.currency)}</td>
                    <td className="r muted">{formatMoney(flow(s.amount, s.currency, s.date), cur)}</td>
                    <td className="actions">
                      <button className="btn-icon" aria-label="Editar" onClick={() => setMovEdit({ initial: s })}><IconEdit /></button>
                      <button className="btn-icon" aria-label="Eliminar" onClick={() => confirm('¿Eliminar este movimiento?') && remove('savings', s.id)}><IconTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Sin movimientos de ahorro" />}
      </Card>

      {goalEdit && <GoalForm initial={goalEdit === 'new' ? undefined : goalEdit} onClose={() => setGoalEdit(null)} />}
      {movEdit && <MovementForm {...movEdit} onClose={() => setMovEdit(null)} />}
    </>
  );
}
