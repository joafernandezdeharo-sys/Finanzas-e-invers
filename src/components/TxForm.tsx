import { useState } from 'react';
import { Field, Modal, NumberInput, Segmented } from './ui';
import { useStore } from '../store/AppStore';
import { todayISO, uid } from '../lib/util';
import type { Currency, Transaction, TxType } from '../types';

type Mode = TxType | 'transferencia';

export const INTERNAL_CATEGORY = 'Transferencia entre cuentas';

export function TxForm({ initial, defaultType = 'gasto', onClose }: { initial?: Transaction; defaultType?: TxType; onClose: () => void }) {
  const { data, add, update, setLinked } = useStore();
  const { settings } = data;
  // una transferencia ya guardada se edita como movimiento suelto (cada lado por separado)
  const [mode, setMode] = useState<Mode>(initial ? initial.type : defaultType);
  const type: TxType = mode === 'ingreso' ? 'ingreso' : 'gasto';
  const cats = type === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
  const [form, setForm] = useState({
    date: initial?.date ?? todayISO(),
    amount: initial?.amount ?? (null as number | null),
    currency: initial?.currency ?? settings.displayCurrency,
    category: initial?.category ?? cats[0] ?? '',
    description: initial?.description ?? '',
    account: initial?.account ?? settings.accounts[0] ?? '',
    toAccount: settings.accounts.find((a) => a !== (initial?.account ?? settings.accounts[0])) ?? '',
    internal: initial?.internal ?? false,
    cuotaN: initial?.installment?.n ?? (null as number | null),
    cuotaTotal: initial?.installment?.total ?? (null as number | null),
    repeat: false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const changeMode = (m: Mode) => {
    setMode(m);
    const list = m === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
    if (m !== 'transferencia' && !list.includes(form.category)) set('category', list[0] ?? '');
  };

  const cuotasOk = (form.cuotaN == null && form.cuotaTotal == null) || (form.cuotaN != null && form.cuotaTotal != null && form.cuotaN >= 1 && form.cuotaN <= form.cuotaTotal);
  const valid = form.amount != null && form.amount > 0 && !!form.date && cuotasOk && (mode !== 'transferencia' || (form.toAccount && form.toAccount !== form.account));

  const save = () => {
    if (!valid) return;
    const amount = form.amount!;
    if (mode === 'transferencia') {
      // dos movimientos vinculados: sale de una cuenta y entra en la otra
      const base = { date: form.date, amount, currency: form.currency, category: INTERNAL_CATEGORY, internal: true, description: form.description || `De ${form.account} a ${form.toAccount}` };
      setLinked(uid(), [
        { ...base, type: 'gasto', account: form.account },
        { ...base, type: 'ingreso', account: form.toAccount },
      ]);
      onClose();
      return;
    }
    const installment = form.cuotaN && form.cuotaTotal ? { n: form.cuotaN, total: form.cuotaTotal } : undefined;
    const tx = {
      date: form.date, amount, currency: form.currency as Currency, category: form.internal ? INTERNAL_CATEGORY : form.category,
      description: form.description, account: form.account, type, internal: form.internal || undefined, installment,
    };
    if (initial) {
      update('transactions', initial.id, tx);
    } else if (form.repeat) {
      const recurringId = add('recurring', {
        description: form.description || form.category, type, amount, currency: form.currency as Currency, category: form.category,
        account: form.account, day: Number(form.date.slice(8, 10)), start: form.date.slice(0, 7), end: '', active: true,
      });
      add('transactions', { ...tx, recurringId });
    } else {
      add('transactions', tx);
    }
    onClose();
  };

  return (
    <Modal
      title={initial ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid} onClick={save}>Guardar</button>
      </>}
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full">
          <Segmented<Mode>
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'gasto', label: 'Gasto' },
              { value: 'ingreso', label: 'Ingreso' },
              ...(initial ? [] : [{ value: 'transferencia' as Mode, label: 'Entre mis cuentas' }]),
            ]}
          />
          {mode === 'transferencia' && (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Mover plata entre tus cuentas (ej. del banco a Mercado Pago, o pagar la tarjeta) no es ni ingreso ni gasto: cambia los saldos pero no tus totales.
              Para comprar o vender dólares usá la sección Dólar.
            </p>
          )}
        </div>
        <Field label="Monto">
          <NumberInput value={form.amount} onChange={(n) => set('amount', n)} placeholder="0,00" autoFocus required />
        </Field>
        <Field label="Moneda">
          <select className="select" value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
            <option value="ARS">Pesos (ARS)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </Field>
        {mode === 'transferencia' ? (
          <>
            <Field label="Desde la cuenta">
              <select className="select" value={form.account} onChange={(e) => set('account', e.target.value)}>
                {settings.accounts.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Hacia la cuenta">
              <select className="select" value={form.toAccount} onChange={(e) => set('toAccount', e.target.value)}>
                {settings.accounts.filter((c) => c !== form.account).map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            {!form.internal && (
              <Field label="Categoría">
                <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {[...new Set([...cats, ...(initial ? [initial.category] : [])])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            )}
            <Field label="Cuenta / medio de pago">
              <select className="select" value={form.account} onChange={(e) => set('account', e.target.value)}>
                {[...new Set([...settings.accounts, ...(initial ? [initial.account] : [])])].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Fecha">
          <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </Field>
        <Field label="Descripción">
          <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={mode === 'transferencia' ? 'Opcional' : 'Ej. compra semanal'} />
        </Field>
        {mode === 'gasto' && !form.internal && (
          <Field label="¿En cuotas? (opcional)" hint={!cuotasOk ? 'Completá cuota y total (ej. 3 de 6)' : 'Ej. cuota 1 de 6. Se proyectan las cuotas que faltan.'}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <NumberInput value={form.cuotaN} onChange={(n) => set('cuotaN', n == null ? null : Math.round(n))} placeholder="Cuota" />
              <span className="muted">de</span>
              <NumberInput value={form.cuotaTotal} onChange={(n) => set('cuotaTotal', n == null ? null : Math.round(n))} placeholder="Total" />
            </div>
          </Field>
        )}
        {mode !== 'transferencia' && (
          <div className="full" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!initial && (
              <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={form.repeat} onChange={(e) => set('repeat', e.target.checked)} />
                Es fijo: cargarlo solo todos los meses (alquiler, sueldo, suscripción…)
              </label>
            )}
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.internal} onChange={(e) => set('internal', e.target.checked)} />
              Es un movimiento entre mis cuentas (no cuenta como {type})
            </label>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
