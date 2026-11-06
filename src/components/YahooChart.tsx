import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { Empty, Segmented } from './ui';
import { useThemeColors } from './charts';
import { fetchYahooHistory, YAHOO_RANGES, type YahooPoint, type YahooRange } from '../services/yahoo';
import { formatDate, formatNumber, formatPct } from '../lib/util';

/** Gráfico histórico de un símbolo de Yahoo Finance */
export function YahooChart({ proxy, symbol, prefix = '' }: { proxy: string; symbol: string; prefix?: string }) {
  const colors = useThemeColors();
  const [range, setRange] = useState<YahooRange>('6mo');
  const [data, setData] = useState<YahooPoint[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!proxy) return;
    let alive = true;
    setLoading(true);
    setError('');
    fetchYahooHistory(proxy, symbol, range)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [proxy, symbol, range]);

  if (!proxy) {
    return <Empty title="Conectá Yahoo Finance para ver el gráfico"><Link to="/fuentes">Ver cómo conectarlo →</Link></Empty>;
  }
  const first = data[0]?.close, last = data[data.length - 1]?.close;
  const change = first && last ? ((last - first) / first) * 100 : null;
  const up = (change ?? 0) >= 0;
  const color = up ? colors.good : colors.bad;
  const gid = `yg-${symbol.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div>
      <div className="filters" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="small muted">
          {change != null && <>Variación en el período: <b className={up ? 'good' : 'bad'}>{formatPct(change)}</b> · </>}
          Fuente: Yahoo Finance
        </span>
        <Segmented value={range} onChange={setRange} options={YAHOO_RANGES.map((r) => ({ value: r.value, label: r.label }))} />
      </div>
      {error ? <div className="alert bad">{error}</div> : data.length > 1 ? (
        <div className="chart-box">
          <ResponsiveContainer>
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={colors.grid} />
              <XAxis dataKey="date" tickFormatter={(d: string) => (range === '5y' || range === 'max' ? d.slice(0, 4) : formatDate(d).slice(0, 5))} minTickGap={40} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => formatNumber(v, v < 10 ? 2 : 0)} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="chart-tip"><div style={{ fontWeight: 600 }}>{formatDate(String(label))}</div><b className="num">{prefix}{formatNumber(Number(payload[0].value), 2)}</b></div>
                ) : null}
              />
              <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <Empty title={loading ? 'Cargando…' : 'Sin datos para este período'} />}
    </div>
  );
}
