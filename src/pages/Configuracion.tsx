import { useRef, useState } from 'react';
import { InstallCard, SecurityCard, SyncCard } from '../components/DeviceCards';
import { exportBackup } from '../components/BackupReminder';
import { Link } from 'react-router-dom';
import { useStore, normalize } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Field, NumberInput, PageHead, Segmented } from '../components/ui';
import { IconDownload, IconPlus, IconTrash, IconUpload, IconX } from '../components/Icons';
import { DEFAULT_SETTINGS, DOLLAR_KINDS } from '../lib/defaults';
import { sampleData } from '../lib/sample';
import { formatMoney, uid } from '../lib/util';
import type { Settings, Theme } from '../types';

function ChipList({ items, onChange, placeholder }: { items: string[]; onChange: (xs: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const addItem = () => {
    const t = text.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setText('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="chips">
        {items.map((c) => (
          <span key={c} className="chip">{c}
            <button className="btn-icon" style={{ padding: 2 }} aria-label={`Quitar ${c}`} onClick={() => onChange(items.filter((x) => x !== c))}><IconX width={12} height={12} /></button>
          </span>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); addItem(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button className="btn" type="submit"><IconPlus width={16} />Agregar</button>
      </form>
    </div>
  );
}

export default function Configuracion() {
  const { data, setSettings, replaceAll, reset } = useStore();
  const { settings } = data;
  const live = useLive();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [newSrc, setNewSrc] = useState({ name: '', url: '' });
  const [newRule, setNewRule] = useState({ keyword: '', category: settings.expenseCategories[0] ?? '' });
  const set = (patch: Partial<Settings>) => setSettings(patch);

  const exportJSON = () => exportBackup(data);
  const importJSON = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!confirm('Esto reemplaza todos tus datos actuales por los del archivo. ¿Continuar?')) return;
      replaceAll(normalize(parsed));
      setMsg('Datos importados correctamente.');
    } catch {
      setMsg('El archivo no es un backup válido.');
    }
  };

  const counts = `${data.transactions.length} movimientos (${data.transactions.filter((t) => t.importId).length} importados de ${data.imports.length} archivos) · ${data.savings.length} aportes · ${data.goals.length} metas · ${data.dollarOps.length} operaciones de dólar · ${data.investments.length} inversiones`;

  return (
    <>
      <PageHead title="Configuración" subtitle="Personalizá la app, las categorías, las fuentes de datos y hacé backups." />

      <h2 className="section-title">Este dispositivo</h2>
      <div className="grid grid-2">
        <SyncCard />
        <SecurityCard />
        <InstallCard />
      </div>
      <h2 className="section-title">La app</h2>

      <div className="grid grid-2">
        <Card title="General">
          <div className="form-grid">
            <Field label="Tu nombre"><input className="input" value={settings.userName} onChange={(e) => set({ userName: e.target.value })} /></Field>
            <Field label="Tema">
              <Segmented<Theme> value={settings.theme} onChange={(t) => set({ theme: t })} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
            </Field>
            <Field label="Moneda para mostrar">
              <Segmented value={settings.displayCurrency} onChange={(c) => set({ displayCurrency: c })} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} />
            </Field>
            <Field label="Dólar para convertir ARS ↔ USD" hint={live.rate ? `Hoy: ${formatMoney(live.rate, 'ARS')}` : undefined}>
              <select className="select" value={settings.rateKind} onChange={(e) => set({ rateKind: e.target.value as Settings['rateKind'] })}>
                {DOLLAR_KINDS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
            <Field label={`Presupuesto mensual de gastos (${settings.displayCurrency})`} hint="0 = sin presupuesto">
              <NumberInput value={settings.monthlyBudget} onChange={(n) => set({ monthlyBudget: n ?? 0 })} />
            </Field>
            <Field label="Actualizar cotizaciones cada">
              <select className="select" value={settings.refreshSeconds} onChange={(e) => set({ refreshSeconds: Number(e.target.value) })}>
                {[15, 30, 60, 120, 300, 600].map((s) => <option key={s} value={s}>{s < 60 ? `${s} segundos` : `${s / 60} min`}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Conexiones y APIs" subtitle={<>Detalle y estado de cada fuente en <Link to="/fuentes">Fuentes de datos</Link>.</>}>
          <div className="list small">
            <div className="list-row"><span className="live-dot" style={{ background: settings.yahooProxyUrl ? undefined : 'var(--text-3)', animation: settings.yahooProxyUrl ? undefined : 'none' }} /><span style={{ flex: 1 }}><b>Yahoo Finance</b> · inversiones, índices y gráficos {settings.yahooProxyUrl ? '(conectado)' : '(sin conectar)'}</span><Link to="/fuentes" className="small">{settings.yahooProxyUrl ? 'Ver' : 'Conectar'} →</Link></div>
            <div className="list-row"><span className="live-dot" /><span style={{ flex: 1 }}><b>BCRA (oficial)</b> · dólar A 3500, reservas, tasas, inflación, UVA</span></div>
            <div className="list-row"><span className="live-dot" /><span style={{ flex: 1 }}><b>DolarAPI</b> · cotizaciones del dólar en tiempo real</span></div>
            <div className="list-row"><span className="live-dot" /><span style={{ flex: 1 }}><b>ArgentinaDatos</b> · histórico del dólar</span></div>
            <div className="list-row"><span className="live-dot" /><span style={{ flex: 1 }}><b>BYMA vía data912</b> · bonos y ONs (respaldo de acciones y CEDEARs)</span></div>
            <div className="list-row"><span className="live-dot" /><span style={{ flex: 1 }}><b>CoinGecko</b> · respaldo de criptomonedas</span></div>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label="API key de Finnhub (opcional)" hint={<>Para acciones de EE.UU. Gratis en <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">finnhub.io</a></>}>
              <input className="input" type="password" value={settings.finnhubKey} onChange={(e) => set({ finnhubKey: e.target.value.trim() })} autoComplete="off" />
            </Field>
            <Field label="API key de rss2json (opcional)" hint={<>Mejora la carga de noticias. Gratis en <a href="https://rss2json.com" target="_blank" rel="noreferrer">rss2json.com</a></>}>
              <input className="input" type="password" value={settings.rss2jsonKey} onChange={(e) => set({ rss2jsonKey: e.target.value.trim() })} autoComplete="off" />
            </Field>
          </div>
        </Card>

        <Card title="Categorías de gastos">
          <ChipList items={settings.expenseCategories} onChange={(xs) => set({ expenseCategories: xs })} placeholder="Nueva categoría de gasto" />
        </Card>
        <Card title="Categorías de ingresos">
          <ChipList items={settings.incomeCategories} onChange={(xs) => set({ incomeCategories: xs })} placeholder="Nueva categoría de ingreso" />
        </Card>
        <Card title="Cuentas y medios de pago">
          <ChipList items={settings.accounts} onChange={(xs) => set({ accounts: xs })} placeholder="Ej. Mercado Pago, Visa, Banco Nación" />
        </Card>

        <Card title="Fuentes de noticias">
          <div className="list">
            {settings.newsSources.map((s) => (
              <label key={s.id} className="list-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={s.enabled} onChange={(e) => set({ newsSources: settings.newsSources.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) })} />
                <span style={{ flex: 1, minWidth: 0 }}>{s.name}<div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div></span>
                <button className="btn-icon" aria-label="Quitar fuente" onClick={(e) => { e.preventDefault(); set({ newsSources: settings.newsSources.filter((x) => x.id !== s.id) }); }}><IconTrash /></button>
              </label>
            ))}
          </div>
          <form className="form-grid" style={{ marginTop: 12 }} onSubmit={(e) => {
            e.preventDefault();
            if (!newSrc.name.trim() || !/^https?:\/\//.test(newSrc.url)) return;
            set({ newsSources: [...settings.newsSources, { id: uid(), name: newSrc.name.trim(), url: newSrc.url.trim(), enabled: true }] });
            setNewSrc({ name: '', url: '' });
          }}>
            <Field label="Nombre"><input className="input" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} placeholder="Ej. El Economista" /></Field>
            <Field label="URL del feed RSS"><input className="input" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} placeholder="https://…/rss.xml" /></Field>
            <div className="full" style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit"><IconPlus width={16} />Agregar fuente</button>
              <button className="btn" type="button" onClick={() => set({ newsSources: DEFAULT_SETTINGS.newsSources })}>Restaurar predeterminadas</button>
            </div>
          </form>
        </Card>
      </div>

      <Card title="Reglas de categorías automáticas" subtitle="Cuando importás un resumen, si la descripción contiene la palabra clave se asigna esa categoría. Se crean solas cuando cambiás una categoría al importar.">
        {settings.categoryRules.length ? (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Si la descripción contiene</th><th>Categoría</th><th>Aplica a</th><th /></tr></thead>
              <tbody>
                {settings.categoryRules.map((r, i) => (
                  <tr key={`${r.keyword}-${i}`}>
                    <td><code>{r.keyword}</code></td>
                    <td>{r.category}</td>
                    <td className="muted small">{r.type === 'ingreso' ? 'Ingresos' : r.type === 'gasto' ? 'Gastos' : 'Ambos'}</td>
                    <td className="actions"><button className="btn-icon" aria-label="Quitar regla" onClick={() => set({ categoryRules: settings.categoryRules.filter((_, j) => j !== i) })}><IconTrash /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="small muted" style={{ marginTop: 0 }}>Todavía no tenés reglas propias. Igual la app reconoce sola cientos de comercios comunes (Coto, Carrefour, YPF, Netflix, Edenor, AFIP, Rappi…).</p>}
        <form className="filters" style={{ marginTop: 12 }} onSubmit={(e) => {
          e.preventDefault();
          const keyword = newRule.keyword.trim().toLowerCase();
          if (!keyword) return;
          const type = settings.incomeCategories.includes(newRule.category) && !settings.expenseCategories.includes(newRule.category) ? 'ingreso' as const : 'gasto' as const;
          set({ categoryRules: [{ keyword, category: newRule.category, type }, ...settings.categoryRules.filter((r) => r.keyword !== keyword)] });
          setNewRule({ ...newRule, keyword: '' });
        }}>
          <input className="input" style={{ maxWidth: 240 }} value={newRule.keyword} onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })} placeholder="Palabra clave (ej. gimnasio)" />
          <select className="select" style={{ width: 'auto' }} value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}>
            <optgroup label="Gastos">{settings.expenseCategories.map((c) => <option key={`g-${c}`}>{c}</option>)}</optgroup>
            <optgroup label="Ingresos">{settings.incomeCategories.map((c) => <option key={`i-${c}`}>{c}</option>)}</optgroup>
          </select>
          <button className="btn" type="submit"><IconPlus width={16} />Agregar regla</button>
        </form>
      </Card>

      <Card title="Datos y backup" subtitle={counts}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Todo se guarda localmente en este navegador (no se envía a ningún servidor). Exportá un backup periódicamente o para pasar tus datos a otro dispositivo.
        </p>
        <div className="filters">
          <button className="btn btn-primary" onClick={exportJSON}><IconDownload width={16} />Exportar backup (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><IconUpload width={16} />Importar backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
          <button className="btn" onClick={() => {
            if (confirm('Se van a reemplazar tus movimientos, ahorros e inversiones por datos de ejemplo. ¿Continuar?')) { replaceAll(sampleData(data)); setMsg('Datos de ejemplo cargados.'); }
          }}>Cargar datos de ejemplo</button>
          <button className="btn btn-danger" onClick={() => {
            if (confirm('¿Borrar TODOS los datos y la configuración? Esta acción no se puede deshacer.')) { reset(); setMsg('Se borraron todos los datos.'); }
          }}><IconTrash width={16} />Borrar todo</button>
        </div>
        {msg && <div className="alert" style={{ marginTop: 12 }}>{msg}</div>}
      </Card>
    </>
  );
}
