import { useState } from 'react';
import { Field, Modal, NumberInput, Segmented } from './ui';
import { useStore } from '../store/AppStore';
import { todayISO } from '../lib/util';
import type { Currency, Transaction, TxType } from '../types';

export function TxForm({ initial, defaultType = 'gasto', onClose }: { initial?: Transaction; defaultType?: TxType; onClose: () => void }) {
  const { data, add, update } = useStore();
  const { settings } = data;
  const [type, setType] = useState<TxType>(initial?.type ?? defaultType);
  const cats = type === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
  const [form, setForm] = useState({
    date: initial?.date ?? todayISO(),
    amount: initial?.amount ?? null as number | null,
    currency: initial?.currency ?? settings.displayCurrency,
    category: initial?.category ?? cats[0] ?? '',
    description: initial?.description ?? '',
    account: initial?.account ?? settings.accounts[0] ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const changeType = (t: TxType) => {
    setType(t);
    const list = t === 'ingreso' ? settings.incomeCategories : settings.expenseCategories;
    if (!list.includes(form.category)) set('category', list[0] ?? '');
  };

  const valid = form.amount != null && form.amount > 0 && form.date;
  const save = () => {
    if (!valid) return;
    const tx = { ...form, amount: form.amount!, type };
    if (initial) update('transactions', initial.id, tx);
    else add('transactions', tx);
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
          <Segmented value={type} onChange={changeType} options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]} />
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
        <Field label="Categoría">
          <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </Field>
        <Field label="Cuenta / medio de pago">
          <select className="select" value={form.account} onChange={(e) => set('account', e.target.value)}>
            {settings.accounts.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Descripción">
          <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ej. compra semanal" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
