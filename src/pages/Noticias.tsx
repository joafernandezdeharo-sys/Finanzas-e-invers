import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { Card, Empty, PageHead } from '../components/ui';
import { IconRefresh } from '../components/Icons';
import { fetchNews, type NewsItem } from '../services/news';

const timeAgo = (d: Date | null) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
};

export default function Noticias() {
  const { data } = useStore();
  const sources = data.settings.newsSources.filter((s) => s.enabled);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const sig = sources.map((s) => s.url).join('|');

  const load = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const errs: string[] = [];
    const all: NewsItem[] = [];
    const publish = () => {
      // mostramos cada fuente apenas llega, sin esperar a las demás
      const seen = new Set<string>();
      const merged = all.filter((n) => n.title && !seen.has(n.title) && seen.add(n.title));
      merged.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      setItems(merged);
    };
    await Promise.all(sources.map((s) => fetchNews(s, data.settings.rss2jsonKey)
      .then((list) => { all.push(...list); publish(); })
      .catch((e) => { errs.push(`${s.name}: ${e.message}`); })));
    publish();
    setErrors(errs);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, data.settings.rss2jsonKey]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((n) => (!source || n.source === source) && (!term || `${n.title} ${n.description}`.toLowerCase().includes(term)));
  }, [items, source, q]);

  return (
    <>
      <PageHead title="Noticias" subtitle="Economía, finanzas y mercados. Elegí las fuentes en Configuración.">
        <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Fuente">
          <option value="">Todas las fuentes</option>
          {sources.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
        <input className="input" style={{ width: 200 }} placeholder="Buscar (ej. dólar, inflación)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={load} disabled={loading}><IconRefresh width={16} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />Actualizar</button>
      </PageHead>

      {errors.length > 0 && <div className="alert bad">Algunas fuentes no respondieron: {errors.join(' · ')}</div>}

      {shown.length ? (
        <div className="news-grid">
          {shown.slice(0, 90).map((n) => (
            <a key={n.link + n.title} href={n.link} target="_blank" rel="noreferrer" className="card news-item">
              {n.image && <img src={n.image} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />}
              <div className="body">
                <div className="small muted">{n.source} · {timeAgo(n.date)}</div>
                <h3>{n.title}</h3>
                {n.description && n.description !== n.title && <p>{n.description}</p>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Card>
          {loading ? <Empty title="Cargando noticias…" /> : sources.length ? <Empty title="No hay noticias para mostrar" /> : (
            <Empty title="No tenés fuentes activas"><Link to="/configuracion">Activá fuentes en Configuración</Link></Empty>
          )}
        </Card>
      )}
    </>
  );
}
