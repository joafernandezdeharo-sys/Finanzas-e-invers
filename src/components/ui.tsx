import { useEffect, useState, type ReactNode } from 'react';
import { IconChevronL, IconChevronR, IconX } from './Icons';
import { addMonths, currentMonth, monthLabel } from '../lib/util';
import type { Currency } from '../types';

export function Card({ title, subtitle, actions, children, className = '' }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="filters">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="filters">{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><IconX /></button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, full }: { label: string; hint?: ReactNode; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return <Segmented value={value} onChange={onChange} options={[{ value: 'ARS', label: 'ARS $' }, { value: 'USD', label: 'USD' }]} />;
}

/** Selector de mes con flechas. value '' = todos los meses */
export function MonthPicker({ value, onChange, months, allowAll = true }: {
  value: string; onChange: (m: string) => void; months: string[]; allowAll?: boolean;
}) {
  const options = [...new Set([...months, currentMonth(), ...(value ? [value] : [])])].sort().reverse();
  return (
    <div className="month-nav">
      <button className="btn-icon" aria-label="Mes anterior" onClick={() => onChange(addMonths(value || currentMonth(), -1))}><IconChevronL /></button>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Mes">
        {allowAll && <option value="">Todos los meses</option>}
        {options.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
      </select>
      <button className="btn-icon" aria-label="Mes siguiente" onClick={() => onChange(addMonths(value || currentMonth(), 1))}><IconChevronR /></button>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

/** Acepta "1234.5", "1234,5" o "1.234,50" */
export const parseNumber = (t: string): number | null => {
  const s = t.trim();
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
};

export function NumberInput({ value, onChange, ...rest }: {
  value: number | null; onChange: (n: number | null) => void; placeholder?: string; required?: boolean; autoFocus?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    // sincroniza si el valor cambia desde afuera
    if (parseNumber(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="input num"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, '');
        setText(t);
        onChange(parseNumber(t));
      }}
      {...rest}
    />
  );
}

export function useConfirm() {
  return (msg: string) => window.confirm(msg);
}
