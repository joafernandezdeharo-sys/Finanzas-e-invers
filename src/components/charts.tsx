import { useEffect, useState } from 'react';
import type { Currency } from '../types';
import { formatMoney } from '../lib/util';

export const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

/** Lee los tokens de color actuales (cambian con el tema claro/oscuro) */
export function useThemeColors() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      series: SERIES.map(v),
      grid: v('--grid'),
      text3: v('--text-3'),
      surface: v('--surface'),
      good: v('--good'),
      bad: v('--bad'),
      accent: v('--accent'),
    };
  };
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', update); mo.disconnect(); };
  }, []);
  return colors;
}

interface TipPayload { name?: string; value?: number; color?: string; payload?: { fill?: string } }

export function MoneyTooltip({ active, payload, label, currency, labelFormatter }: {
  active?: boolean; payload?: TipPayload[]; label?: string | number; currency: Currency; labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && <div style={{ fontWeight: 600, marginBottom: 4 }}>{labelFormatter ? labelFormatter(String(label)) : label}</div>}
      {payload.map((p, i) => (
        <div className="row" key={i}>
          <span><i className="dot" style={{ background: p.color ?? p.payload?.fill }} />{p.name}</span>
          <b className="num">{formatMoney(Number(p.value), currency)}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => <span key={i.label}><i className="dot" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

export const axisMoney = (currency: Currency) => (v: number) => formatMoney(v, currency, { compact: true });
