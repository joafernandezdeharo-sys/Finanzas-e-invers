import { useState } from 'react';
import workerCode from '../../proxy/yahoo-worker.js?raw';
import { useStore } from '../store/AppStore';
import { Card, Field, PageHead } from '../components/ui';
import { IconExternal, IconRefresh } from '../components/Icons';
import { testYahooProxy } from '../services/yahoo';
import { fetchBcraVariables, fetchRiesgoPais } from '../services/bcra';

type Kind = 'Oficial' | 'Mercado' | 'Agregador' | 'Prensa';

interface Source {
  id: string;
  name: string;
  kind: Kind;
  url: string;
  uses: string;
  freq: string;
  note?: string;
  test?: (ctx: { yahoo: string; finnhub: string }) => Promise<string>;
}

const okJson = async (url: string) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  return r.json();
};

const SOURCES: Source[] = [
  {
    id: 'yahoo', name: 'Yahoo Finance', kind: 'Mercado', url: 'https://finance.yahoo.com',
    uses: 'Fuente principal de inversiones: acciones argentinas y de EE.UU., CEDEARs, ADRs, criptomonedas, índices (Merval, S&P 500, Nasdaq…), oro, petróleo y gráficos históricos.',
    freq: 'En vivo (las bolsas pueden tener hasta 15–20 min de demora)',
    note: 'Necesita el puente propio (ver abajo). Si no está conectado, la app usa automáticamente BYMA y CoinGecko.',
    test: async ({ yahoo }) => {
      if (!yahoo) throw new Error('Falta conectar el puente');
      return testYahooProxy(yahoo);
    },
  },
  {
    id: 'bcra', name: 'Banco Central de la República Argentina (BCRA) — API oficial', kind: 'Oficial',
    url: 'https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp',
    uses: 'Dólar oficial mayorista (Comunicación A 3500) y minorista, reservas, tasas (BADLAR, TAMAR, plazo fijo), inflación (publicada por INDEC), expectativas de inflación (REM), UVA, CER e ICL.',
    freq: 'Diaria (inflación: mensual)',
    test: async () => {
      const d = await fetchBcraVariables();
      const v = d.get(5);
      return v ? `Mayorista A 3500: $ ${v.value.toLocaleString('es-AR')} (${v.date})` : 'Conectado';
    },
  },
  {
    id: 'byma', name: 'BYMA — Bolsas y Mercados Argentinos (vía data912)', kind: 'Mercado', url: 'https://www.byma.com.ar',
    uses: 'Bonos y obligaciones negociables (AL30, GD30, AL30D…). Respaldo de acciones y CEDEARs si Yahoo no responde.',
    freq: 'En vivo durante la rueda',
    note: 'BYMA no ofrece una API pública gratuita para usar desde el navegador; data912 republica sus precios.',
    test: async () => {
      const rows = await okJson('https://data912.com/live/arg_bonds');
      const al30 = (rows as { symbol: string; c: number }[]).find((r) => r.symbol === 'AL30');
      return al30 ? `AL30: $ ${al30.c.toLocaleString('es-AR')}` : `${rows.length} bonos`;
    },
  },
  {
    id: 'dolarapi', name: 'DolarAPI', kind: 'Agregador', url: 'https://dolarapi.com',
    uses: 'Dólar blue, MEP, contado con liqui, cripto y tarjeta en tiempo real.',
    freq: 'Cada pocos minutos',
    note: 'El dólar blue es un mercado informal: no existe una fuente oficial. MEP y CCL surgen de operaciones con bonos en BYMA.',
    test: async () => {
      const d = await okJson('https://dolarapi.com/v1/dolares/blue');
      return `Blue: $ ${d.venta}`;
    },
  },
  {
    id: 'argentinadatos', name: 'ArgentinaDatos', kind: 'Agregador', url: 'https://argentinadatos.com',
    uses: 'Histórico diario del dólar y riesgo país (índice EMBI de JP Morgan).',
    freq: 'Diaria',
    test: async () => {
      const r = await fetchRiesgoPais();
      return `Riesgo país: ${r.value} pb (${r.date})`;
    },
  },
  {
    id: 'coingecko', name: 'CoinGecko', kind: 'Agregador', url: 'https://www.coingecko.com',
    uses: 'Buscador de criptomonedas y respaldo de precios cripto si Yahoo no responde.',
    freq: 'En vivo',
    test: async () => {
      const d = await okJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      return `Bitcoin: US$ ${d.bitcoin.usd.toLocaleString('es-AR')}`;
    },
  },
  {
    id: 'finnhub', name: 'Finnhub (opcional)', kind: 'Agregador', url: 'https://finnhub.io',
    uses: 'Último respaldo para acciones de EE.UU. si cargaste tu API key en Configuración.',
    freq: 'En vivo',
    test: async ({ finnhub }) => {
      if (!finnhub) throw new Error('Sin API key (opcional)');
      const d = await okJson(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(finnhub)}`);
      return `AAPL: US$ ${d.c}`;
    },
  },
  {
    id: 'news', name: 'Medios: Ámbito, Infobae, La Nación y Google News', kind: 'Prensa', url: 'https://www.ambito.com',
    uses: 'Noticias de economía y mercados (podés elegir las fuentes en Configuración).',
    freq: 'Cada 10 minutos',
  },
];

const KIND_CLASS: Record<Kind, string> = { Oficial: 'good', Mercado: 'accent', Agregador: '', Prensa: '' };

type Status = { state: 'idle' | 'loading' | 'ok' | 'error'; msg?: string; ms?: number };

export default function Fuentes() {
  const { data, setSettings } = useStore();
  const { settings } = data;
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [proxy, setProxy] = useState(settings.yahooProxyUrl);
  const [proxyMsg, setProxyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const test = async (s: Source) => {
    if (!s.test) return;
    setStatus((st) => ({ ...st, [s.id]: { state: 'loading' } }));
    const t0 = performance.now();
    try {
      const msg = await s.test({ yahoo: settings.yahooProxyUrl, finnhub: settings.finnhubKey });
      setStatus((st) => ({ ...st, [s.id]: { state: 'ok', msg, ms: Math.round(performance.now() - t0) } }));
    } catch (e) {
      setStatus((st) => ({ ...st, [s.id]: { state: 'error', msg: (e as Error).message } }));
    }
  };
  const testAll = () => SOURCES.filter((s) => !(s.id === 'finnhub' && !settings.finnhubKey) && !(s.id === 'yahoo' && !settings.yahooProxyUrl)).forEach(test);

  const saveProxy = async () => {
    const url = proxy.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      setProxyMsg({ ok: false, text: 'La dirección tiene que empezar con https://' });
      return;
    }
    setProxyMsg({ ok: true, text: 'Probando…' });
    try {
      const msg = await testYahooProxy(url);
      setSettings({ yahooProxyUrl: url });
      setProxy(url);
      setProxyMsg({ ok: true, text: `${msg}. ¡Listo! Las inversiones ya se cotizan con Yahoo Finance.` });
    } catch (e) {
      setProxyMsg({ ok: false, text: `No respondió bien: ${(e as Error).message}. Revisá que hayas pegado el código y tocado “Deploy”.` });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(workerCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <PageHead title="Fuentes de datos" subtitle="De dónde sale cada número de la app. Priorizamos fuentes oficiales y de mercado; los agregadores se usan solo donde no hay una fuente oficial accesible.">
        <button className="btn" onClick={testAll}><IconRefresh width={16} />Probar todas</button>
      </PageHead>

      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fuente</th><th>Tipo</th><th>Qué datos aporta</th><th>Actualización</th><th>Estado</th></tr></thead>
            <tbody>
              {SOURCES.map((s) => {
                const st = status[s.id];
                return (
                  <tr key={s.id}>
                    <td style={{ minWidth: 200 }}>
                      <a href={s.url} target="_blank" rel="noreferrer"><b>{s.name}</b> <IconExternal width={12} height={12} /></a>
                    </td>
                    <td><span className={`badge ${KIND_CLASS[s.kind]}`}>{s.kind}</span></td>
                    <td className="small" style={{ minWidth: 260 }}>{s.uses}{s.note && <div className="muted" style={{ marginTop: 4 }}>{s.note}</div>}</td>
                    <td className="small muted">{s.freq}</td>
                    <td className="small" style={{ minWidth: 170 }}>
                      {s.id === 'finnhub' && !settings.finnhubKey ? <span className="muted">No configurado (opcional)</span>
                        : s.id === 'yahoo' && !settings.yahooProxyUrl ? <a href="#conectar-yahoo" className="warn" onClick={(e) => { e.preventDefault(); document.getElementById('conectar-yahoo')?.scrollIntoView({ behavior: 'smooth' }); }}>Sin conectar · ver cómo ↓</a>
                        : !s.test ? <span className="muted">—</span> : !st || st.state === 'idle' ? (
                        <button className="btn btn-sm" onClick={() => test(s)}>Probar</button>
                      ) : st.state === 'loading' ? <span className="muted">Probando…</span> : st.state === 'ok' ? (
                        <span className="good">✓ {st.msg}<div className="muted">{st.ms} ms</div></span>
                      ) : <span className="bad">✗ {st.msg}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          <b>Oficial</b>: publicado por el organismo responsable. <b>Mercado</b>: precios de bolsas y mercados (BYMA, NYSE, Nasdaq) publicados por un proveedor de datos financieros.
          <b> Agregador</b>: servicio que junta datos de varias fuentes. Las cotizaciones son informativas: antes de operar, confirmá el precio en tu broker o banco.
        </p>
      </Card>

      <div id="conectar-yahoo" />
      <Card
        title="Conectar Yahoo Finance"
        subtitle={settings.yahooProxyUrl ? `Conectado mediante ${settings.yahooProxyUrl}` : 'Paso único de unos 5 minutos. Es gratis.'}
        actions={settings.yahooProxyUrl ? <span className="badge good">● Conectado</span> : <span className="badge">No conectado</span>}
      >
        <p className="small" style={{ marginTop: 0 }}>
          Yahoo Finance no deja que las páginas web consulten sus precios directamente desde el navegador, y los intermediarios públicos gratuitos no son confiables.
          La solución segura es un <b>puente propio</b>: un pequeño programa gratuito en Cloudflare que consulta Yahoo por vos.
          Solo deja pasar consultas de cotizaciones de Yahoo y no ve ninguno de tus datos personales (solo los símbolos que se cotizan).
        </p>
        <ol className="small steps">
          <li>Entrá a <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">dash.cloudflare.com</a> y creá una cuenta gratuita (alcanza con email y contraseña).</li>
          <li>En el menú, entrá a <b>Workers &amp; Pages</b> (o <b>Compute → Workers</b>) → <b>Create</b> → <b>Create Worker</b> (o “Start with Hello World”). Ponele de nombre <code>yahoo-finanzas</code> y tocá <b>Deploy</b>.</li>
          <li>Tocá <b>Edit code</b>, borrá todo el código que aparece y pegá este (botón “Copiar código”). Después tocá <b>Deploy</b>.</li>
          <li>Copiá la dirección del Worker (algo como <code>https://yahoo-finanzas.tu-usuario.workers.dev</code>), pegala acá abajo y tocá <b>Guardar y probar</b>.</li>
        </ol>
        <div className="filters" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={copy}>{copied ? '✓ Copiado' : 'Copiar código'}</button>
          <details>
            <summary className="small" style={{ cursor: 'pointer', color: 'var(--accent)' }}>Ver el código</summary>
            <pre className="code">{workerCode}</pre>
          </details>
        </div>
        <form className="filters" onSubmit={(e) => { e.preventDefault(); saveProxy(); }}>
          <Field label="Dirección de tu puente">
            <input className="input" style={{ minWidth: 300 }} value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="https://yahoo-finanzas.tu-usuario.workers.dev" />
          </Field>
          <button className="btn btn-primary" type="submit">Guardar y probar</button>
          {settings.yahooProxyUrl && (
            <button className="btn btn-danger" type="button" onClick={() => { setSettings({ yahooProxyUrl: '' }); setProxy(''); setProxyMsg(null); }}>Desconectar</button>
          )}
        </form>
        {proxyMsg && <div className={`alert ${proxyMsg.ok ? 'good' : 'bad'}`} style={{ marginTop: 10 }}>{proxyMsg.text}</div>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          El plan gratuito de Cloudflare permite 100.000 consultas por día, muchísimo más de lo que usa la app. Si usás la app en varios dispositivos, pegá la misma dirección en cada uno (o pasala con el backup).
        </p>
      </Card>
    </>
  );
}
