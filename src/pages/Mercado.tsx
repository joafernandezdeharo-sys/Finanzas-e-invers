import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/AppStore';
import { Card, Empty, PageHead } from '../components/ui';
import { IconExternal, IconRefresh } from '../components/Icons';
import { useThemeColors } from '../components/charts';
import { YahooChart } from '../components/YahooChart';
import { BCRA_IDS, fetchBcraSeries, fetchBcraVariables, fetchRiesgoPais, type BcraVariable, type RiesgoPais } from '../services/bcra';
import { fetchYahooQuotes, yahooPage, type YahooQuote } from '../services/yahoo';
import { formatDate, formatNumber, formatPct, monthLabel, todayISO } from '../lib/util';

interface Ticker {
  symbol: string;
  name: string;
  prefix?: string;
  suffix?: string;
}

const GROUPS: { title: string; items: Ticker[] }[] = [
  {
    title: 'Índices',
    items: [
      { symbol: '^MERV', name: 'Merval', suffix: ' pts' },
      { symbol: '^GSPC', name: 'S&P 500', suffix: ' pts' },
      { symbol: '^IXIC', name: 'Nasdaq', suffix: ' pts' },
      { symbol: '^DJI', name: 'Dow Jones', suffix: ' pts' },
      { symbol: '^BVSP', name: 'Bovespa (Brasil)', suffix: ' pts' },
      { symbol: '^TNX', name: 'Tasa bono EE.UU. 10 años', suffix: '%' },
    ],
  },
  {
    title: 'Commodities y cripto',
    items: [
      { symbol: 'GC=F', name: 'Oro (onza)', prefix: 'US$ ' },
      { symbol: 'CL=F', name: 'Petróleo WTI (barril)', prefix: 'US$ ' },
      { symbol: 'ZS=F', name: 'Soja (bushel, ¢)', suffix: ' ¢' },
      { symbol: 'BTC-USD', name: 'Bitcoin', prefix: 'US$ ' },
      { symbol: 'ETH-USD', name: 'Ethereum', prefix: 'US$ ' },
    ],
  },
  {
    title: 'ADRs argentinos (Wall Street)',
    items: ['GGAL', 'YPF', 'BMA', 'PAM', 'VIST', 'MELI', 'GLOB', 'CEPU', 'TGS', 'BBAR', 'SUPV', 'LOMA'].map((s) => ({ symbol: s, name: s, prefix: 'US$ ' })),
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

const BCRA_CARDS: { id: number; label: string; format: (v: number) => string; hint?: string }[] = [
  { id: BCRA_IDS.mayorista, label: 'Dólar mayorista (Com. A 3500)', format: (v) => `$ ${formatNumber(v, 2)}` },
  { id: BCRA_IDS.minorista, label: 'Dólar minorista promedio', format: (v) => `$ ${formatNumber(v, 2)}`, hint: 'Promedio vendedor de bancos' },
  { id: BCRA_IDS.reservas, label: 'Reservas internacionales', format: (v) => `US$ ${formatNumber(v, 0)} M` },
  { id: BCRA_IDS.inflacionMensual, label: 'Inflación mensual (INDEC)', format: (v) => `${formatNumber(v, 1)}%` },
  { id: BCRA_IDS.inflacionInteranual, label: 'Inflación interanual', format: (v) => `${formatNumber(v, 1)}%` },
  { id: BCRA_IDS.inflacionEsperada, label: 'Inflación esperada 12 meses (REM)', format: (v) => `${formatNumber(v, 1)}%` },
  { id: BCRA_IDS.plazoFijo, label: 'Tasa plazo fijo 30 días (TNA)', format: (v) => `${formatNumber(v, 2)}%` },
  { id: BCRA_IDS.badlar, label: 'Tasa BADLAR bancos privados', format: (v) => `${formatNumber(v, 2)}%` },
  { id: BCRA_IDS.tamar, label: 'Tasa TAMAR bancos privados', format: (v) => `${formatNumber(v, 2)}%` },
  { id: BCRA_IDS.uva, label: 'Valor UVA', format: (v) => `$ ${formatNumber(v, 2)}` },
  { id: BCRA_IDS.cer, label: 'Coeficiente CER', format: (v) => formatNumber(v, 4) },
  { id: BCRA_IDS.icl, label: 'Índice alquileres (ICL)', format: (v) => formatNumber(v, 2) },
];

export default function Mercado() {
  const { data } = useStore();
  const proxy = data.settings.yahooProxyUrl;
  const colors = useThemeColors();
  const [bcra, setBcra] = useState<Map<number, BcraVariable> | null>(null);
  const [bcraError, setBcraError] = useState('');
  const [riesgo, setRiesgo] = useState<RiesgoPais | null>(null);
  const [inflacion, setInflacion] = useState<{ month: string; value: number }[]>([]);
  const [quotes, setQuotes] = useState<Map<string, YahooQuote>>(new Map());
  const [yahooErrors, setYahooErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Ticker>(ALL[0]);
  const [updated, setUpdated] = useState<Date | null>(null);

  const loadYahoo = async () => {
    if (!proxy) return;
    const r = await fetchYahooQuotes(proxy, ALL.map((t) => t.symbol));
    setQuotes(r.quotes);
    setYahooErrors(r.errors);
    setUpdated(new Date());
  };

  useEffect(() => {
    fetchBcraVariables().then(setBcra).catch((e) => setBcraError((e as Error).message));
    fetchRiesgoPais().then(setRiesgo).catch(() => {});
    const desde = `${Number(todayISO().slice(0, 4)) - 2}-01-01`;
    fetchBcraSeries(BCRA_IDS.inflacionMensual, desde, todayISO())
      .then((s) => setInflacion(s.map((p) => ({ month: p.date.slice(0, 7), value: p.value }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadYahoo();
    const t = setInterval(() => document.visibilityState === 'visible' && loadYahoo(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxy]);

  const fmt = (t: Ticker, v: number) => `${t.prefix ?? ''}${formatNumber(v, v < 100 ? 2 : 0)}${t.suffix ?? ''}`;
  const names = useMemo(() => new Map([...quotes.values()].map((q) => [q.symbol, q.name])), [quotes]);

  return (
    <>
      <PageHead title="Mercado" subtitle="Indicadores oficiales del BCRA, riesgo país, índices, commodities y acciones argentinas en Wall Street.">
        {proxy && <button className="btn" onClick={loadYahoo}><IconRefresh width={16} />Actualizar</button>}
      </PageHead>

      <Card
        title="Indicadores oficiales"
        subtitle={<>Fuente: <a href="https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp" target="_blank" rel="noreferrer">Banco Central de la República Argentina</a> (la inflación la mide el INDEC)</>}
      >
        {bcraError ? <div className="alert bad">No se pudo consultar al BCRA: {bcraError}</div> : !bcra ? <Empty title="Cargando datos del BCRA…" /> : (
          <div className="grid grid-4">
            {BCRA_CARDS.map((c) => {
              const v = bcra.get(c.id);
              if (!v) return null;
              return (
                <div key={c.id} className="card stat" style={{ boxShadow: 'none' }} title={v.description}>
                  <span className="stat-label">{c.label}</span>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>{c.format(v.value)}</span>
                  <span className="stat-sub muted">{c.hint ? `${c.hint} · ` : ''}al {formatDate(v.date)}</span>
                </div>
              );
            })}
            {riesgo && (
              <div className="card stat" style={{ boxShadow: 'none' }}>
                <span className="stat-label">Riesgo país</span>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{formatNumber(riesgo.value, 0)} pb</span>
                <span className="stat-sub muted">JP Morgan EMBI (vía ArgentinaDatos) · al {formatDate(riesgo.date)}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {inflacion.length > 0 && (
        <Card title="Inflación mensual" subtitle="Variación mensual del IPC (INDEC), publicada por el BCRA">
          <div className="chart-box" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={inflacion}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis tickFormatter={(v: number) => `${v}%`} axisLine={false} tickLine={false} width={44} />
                <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="chart-tip"><div style={{ fontWeight: 600 }}>{monthLabel(String(label), true)}</div><b className="num">{formatNumber(Number(payload[0].value), 1)}%</b></div>
                ) : null} />
                <Bar dataKey="value" fill={colors.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {!proxy ? (
        <Card title="Índices, commodities y ADRs">
          <Empty title="Conectá Yahoo Finance para ver el Merval, S&P 500, oro, petróleo y ADRs en vivo">
            <Link to="/fuentes">Ver cómo conectarlo (5 minutos, gratis) →</Link>
          </Empty>
        </Card>
      ) : (
        <>
          {yahooErrors.length > 0 && <div className="alert bad">Yahoo Finance no devolvió algunos datos: {yahooErrors.slice(0, 4).join(' · ')}</div>}
          <div className="grid grid-3">
            {GROUPS.map((g) => (
              <Card key={g.title} title={g.title} subtitle={updated ? `Yahoo Finance · ${updated.toLocaleTimeString('es-AR')}` : 'Cargando…'}>
                <div className="list">
                  {g.items.map((t) => {
                    const q = quotes.get(t.symbol);
                    return (
                      <button key={t.symbol} className={`list-row market-row ${selected.symbol === t.symbol ? 'on' : ''}`} onClick={() => setSelected(t)}>
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <b>{t.name}</b>
                          {t.name === t.symbol && names.get(t.symbol) && <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names.get(t.symbol)}</div>}
                        </span>
                        <span className="num" style={{ textAlign: 'right' }}>
                          {q ? fmt(t, q.price) : '—'}
                          <div className={`small ${q?.changePct == null ? 'muted' : q.changePct >= 0 ? 'good' : 'bad'}`}>{q?.changePct == null ? '' : formatPct(q.changePct)}</div>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
          <Card
            title={`${selected.name}${selected.name === selected.symbol && names.get(selected.symbol) ? ` · ${names.get(selected.symbol)}` : ''}`}
            subtitle={selected.symbol}
            actions={<a className="btn btn-sm" href={yahooPage(selected.symbol)} target="_blank" rel="noreferrer">Ver en Yahoo Finance <IconExternal width={12} height={12} /></a>}
          >
            <YahooChart proxy={proxy} symbol={selected.symbol} prefix={selected.prefix} />
          </Card>
        </>
      )}
    </>
  );
}
