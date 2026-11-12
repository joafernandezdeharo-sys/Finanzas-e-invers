import { useState } from 'react';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, NumberInput, PageHead, Segmented } from '../components/ui';
import { IconPlus, IconTrash } from '../components/Icons';
import { systemNotify } from '../components/Watcher';
import { DOLLAR_KINDS, dollarLabel } from '../lib/defaults';
import { formatMoney, uid } from '../lib/util';
import type { PriceAlert } from '../types';

const OPS: { value: PriceAlert['op']; label: string }[] = [
  { value: 'mayor', label: 'Sube a' },
  { value: 'menor', label: 'Baja a' },
  { value: 'variacion', label: 'Se mueve ±%' },
];

export default function Alertas() {
  const { data, setSettings } = useStore();
  const { settings, investments } = data;
  const live = useLive();
  const [f, setF] = useState<{ kind: PriceAlert['kind']; target: string; op: PriceAlert['op']; value: number | null }>({ kind: 'dolar', target: 'blue', op: 'mayor', value: null });
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const current = (kind: PriceAlert['kind'], target: string) => {
    if (kind === 'dolar') {
      const q = live.dollars.find((d) => d.casa === target);
      return q?.venta != null ? formatMoney(q.venta, 'ARS') : '—';
    }
    const q = live.quotes[target];
    return q ? formatMoney(q.price, q.currency) : 'sin cotización';
  };
  const label = (a: PriceAlert) => {
    const name = a.kind === 'dolar' ? `Dólar ${dollarLabel(a.target)}` : investments.find((i) => i.id === a.target)?.symbol.toUpperCase() ?? '(inversión borrada)';
    const unit = a.kind === 'dolar' ? formatMoney(a.value, 'ARS') : String(a.value);
    return `${name} ${a.op === 'mayor' ? `sube a ${unit} o más` : a.op === 'menor' ? `baja a ${unit} o menos` : `se mueve ±${a.value}% en el día`}`;
  };

  const add = () => {
    if (!f.value || !f.target || (f.kind === 'dolar' && f.op === 'variacion')) return;
    setSettings({ alerts: [...settings.alerts, { id: uid(), kind: f.kind, target: f.target, op: f.op, value: f.value, active: true, lastTriggered: null }] });
    setF({ ...f, value: null });
  };
  const patch = (id: string, p: Partial<PriceAlert>) => setSettings({ alerts: settings.alerts.map((a) => (a.id === id ? { ...a, ...p } : a)) });

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') {
      setSettings({ notifications: true });
      systemNotify('Mis Finanzas', 'Listo: te vamos a avisar acá cuando se cumpla una alerta.');
    }
  };

  const liveInvestments = investments.filter((i) => live.quotes[i.id]);

  return (
    <>
      <PageHead title="Alertas" subtitle="Te avisamos cuando el dólar o tus inversiones llegan a un precio, y cuando te acercás al tope de un presupuesto." />

      <Card title="Notificaciones">
        {perm === 'unsupported' ? (
          <p className="small muted" style={{ margin: 0 }}>Este navegador no permite notificaciones. Las alertas se van a mostrar como avisos dentro de la app.</p>
        ) : perm === 'granted' && settings.notifications ? (
          <div className="filters">
            <span className="badge good">● Notificaciones activadas</span>
            <button className="btn btn-sm" onClick={() => setSettings({ notifications: false })}>Desactivar</button>
            <button className="btn btn-sm" onClick={() => systemNotify('Mis Finanzas', 'Así se ve una alerta.')}>Probar</button>
          </div>
        ) : perm === 'denied' ? (
          <p className="small" style={{ margin: 0 }}>Bloqueaste las notificaciones para esta página. Para activarlas, habilitalas en la configuración del navegador (ícono del candado junto a la dirección).</p>
        ) : (
          <div className="filters">
            <button className="btn btn-primary" onClick={enableNotifications}>Activar notificaciones</button>
            <span className="small muted">Sin esto, las alertas se muestran como avisos dentro de la app.</span>
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Importante: las alertas se revisan mientras la app está abierta (aunque sea en segundo plano), cada vez que se actualizan las cotizaciones. Como la app no tiene servidor propio, no puede avisarte con la app cerrada.
        </p>
      </Card>

      <Card title="Nueva alerta">
        <form className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Field label="Sobre">
            <Segmented value={f.kind} onChange={(kind) => setF({ ...f, kind, target: kind === 'dolar' ? 'blue' : liveInvestments[0]?.id ?? '', op: 'mayor' })}
              options={[{ value: 'dolar', label: 'Dólar' }, { value: 'activo', label: 'Mis inversiones' }]} />
          </Field>
          <Field label={f.kind === 'dolar' ? 'Tipo de dólar' : 'Activo'} hint={f.target ? `Ahora: ${current(f.kind, f.target)}` : undefined}>
            <select className="select" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
              {f.kind === 'dolar'
                ? DOLLAR_KINDS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)
                : liveInvestments.length ? liveInvestments.map((i) => <option key={i.id} value={i.id}>{i.symbol.toUpperCase()}{i.name ? ` · ${i.name}` : ''}</option>)
                  : <option value="">No hay inversiones con cotización en vivo</option>}
            </select>
          </Field>
          <Field label="Condición">
            <select className="select" value={f.op} onChange={(e) => setF({ ...f, op: e.target.value as PriceAlert['op'] })}>
              {OPS.filter((o) => f.kind === 'activo' || o.value !== 'variacion').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label={f.op === 'variacion' ? 'Porcentaje' : 'Precio'}>
            <NumberInput value={f.value} onChange={(n) => setF({ ...f, value: n })} placeholder={f.op === 'variacion' ? 'Ej. 5' : 'Ej. 1600'} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={!f.value || !f.target}><IconPlus width={16} />Crear alerta</button>
          </div>
        </form>
      </Card>

      <Card title="Mis alertas">
        {settings.alerts.length ? (
          <div className="list">
            {settings.alerts.map((a) => (
              <div key={a.id} className="list-row" style={{ opacity: a.active ? 1 : 0.5 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                  <input type="checkbox" checked={a.active} onChange={(e) => patch(a.id, { active: e.target.checked })} aria-label="Activa" />
                  <span>
                    {label(a)}
                    <div className="small muted">Ahora: {current(a.kind, a.target)}{a.lastTriggered ? ` · último aviso ${new Date(a.lastTriggered).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>
                  </span>
                </label>
                <button className="btn-icon" aria-label="Borrar alerta" onClick={() => setSettings({ alerts: settings.alerts.filter((x) => x.id !== a.id) })}><IconTrash /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="No tenés alertas">Por ejemplo: “avisame si el blue pasa los $1.600”.</Empty>}
      </Card>
    </>
  );
}
