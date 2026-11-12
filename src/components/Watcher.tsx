import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { alertTriggered, alreadyToday } from '../lib/alerts';
import { dollarLabel } from '../lib/defaults';
import { formatMoney, formatNumber, formatPct, sum, todayISO } from '../lib/util';

interface Toast {
  id: number;
  title: string;
  body: string;
  to?: string;
}

/** Notificación del sistema (si el usuario la permitió). En el celular usa el service worker si está disponible. */
export async function systemNotify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
    else new Notification(title, { body, icon: './icons/icon-192.png' });
  } catch {
    /* algunos navegadores no permiten notificaciones fuera de un service worker */
  }
}

/** Vigila alertas de precio y presupuestos mientras la app está abierta y muestra avisos */
export function Watcher() {
  const { data, setSettings } = useStore();
  const { settings, investments, transactions } = data;
  const live = useLive();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 12_000);
    if (settings.notifications) systemNotify(t.title, t.body);
  }, [settings.notifications]);

  // alertas de dólar y activos
  useEffect(() => {
    const today = todayISO();
    let changed = false;
    const next = settings.alerts.map((a) => {
      if (!a.active || alreadyToday(a, today)) return a;
      let reading = { price: null as number | null, changePct: null as number | null };
      let name = '';
      let fmt = (v: number) => formatNumber(v, 2);
      if (a.kind === 'dolar') {
        const q = live.dollars.find((d) => d.casa === a.target);
        if (!q) return a;
        reading = { price: q.venta, changePct: null };
        name = `Dólar ${dollarLabel(a.target)}`;
        fmt = (v) => formatMoney(v, 'ARS');
      } else {
        const inv = investments.find((i) => i.id === a.target);
        const q = live.quotes[a.target];
        if (!inv || !q) return a;
        reading = { price: q.price, changePct: q.changePct };
        name = inv.symbol.toUpperCase();
        fmt = (v) => formatMoney(v, q.currency);
      }
      if (!alertTriggered(a, reading)) return a;
      changed = true;
      push({
        title: `🔔 ${name}`,
        body: a.op === 'variacion'
          ? `Se movió ${formatPct(reading.changePct ?? 0)} hoy (tu alerta: ±${a.value}%)`
          : `Está en ${fmt(reading.price!)} (${a.op === 'mayor' ? 'superó' : 'bajó de'} ${fmt(a.value)})`,
        to: a.kind === 'dolar' ? '/dolar' : '/inversiones',
      });
      return { ...a, lastTriggered: new Date().toISOString() };
    });
    if (changed) setSettings({ alerts: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.dollars, live.quotes]);

  // presupuestos: aviso al llegar al 90% y al 100% (una vez por mes y categoría)
  useEffect(() => {
    if (!settings.budgets.length) return;
    const month = todayISO().slice(0, 7);
    const KEY = 'mis-finanzas:budget-warned';
    let warned: Record<string, string> = {};
    try { warned = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { /* */ }
    for (const b of settings.budgets) {
      const spent = sum(transactions.filter((t) => !t.internal && t.type === 'gasto' && t.category === b.category && t.date.startsWith(month))
        .map((t) => live.flow(t.amount, t.currency, t.date)));
      const limit = live.toDisplay(b.amount, b.currency);
      if (!limit) continue;
      const level = spent >= limit ? '100' : spent >= limit * 0.9 ? '90' : '';
      const key = `${month}|${b.category}`;
      if (!level || (warned[key] && (warned[key] === '100' || warned[key] === level))) continue;
      warned[key] = level;
      push({
        title: level === '100' ? `🔴 Te pasaste en ${b.category}` : `🟠 ${b.category}: 90% del presupuesto`,
        body: `Llevás ${formatMoney(spent, settings.displayCurrency)} de ${formatMoney(limit, settings.displayCurrency)} este mes`,
        to: '/presupuesto',
      });
    }
    try { localStorage.setItem(KEY, JSON.stringify(warned)); } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, settings.budgets]);

  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div style={{ flex: 1 }}>
            <b>{t.title}</b>
            <div className="small">{t.body}</div>
            {t.to && <Link to={t.to} className="small" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>Ver →</Link>}
          </div>
          <button className="btn-icon" aria-label="Cerrar aviso" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
