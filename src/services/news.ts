import type { NewsSource } from '../types';

export interface NewsItem {
  title: string;
  link: string;
  date: Date | null;
  description: string;
  image: string | null;
  source: string;
}

const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const parseDate = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s.includes('T') || /[A-Za-z]/.test(s) ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

function parseRss(xml: string, source: string): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = [...doc.querySelectorAll('item, entry')];
  return items.map((it) => {
    const get = (sel: string) => it.querySelector(sel)?.textContent?.trim() ?? '';
    const linkEl = it.querySelector('link');
    const link = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '';
    const media =
      it.getElementsByTagName('media:content')[0]?.getAttribute('url') ||
      it.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url') ||
      it.querySelector('enclosure')?.getAttribute('url') ||
      null;
    return {
      title: stripHtml(get('title')),
      link,
      date: parseDate(get('pubDate') || get('published') || get('updated')),
      description: stripHtml(get('description') || get('summary')).slice(0, 280),
      image: media,
      source,
    };
  });
}

const TIMEOUT = 12_000;
const okXml = (xml: string) => {
  if (!xml.includes('<item') && !xml.includes('<entry')) throw new Error('formato inválido');
  return xml;
};

/**
 * Los sitios de noticias no permiten leer sus RSS directamente desde el navegador (CORS),
 * así que consultamos en paralelo varios intermediarios públicos y usamos el primero que responda.
 */
async function viaProxies(src: NewsSource): Promise<NewsItem[]> {
  const url = encodeURIComponent(src.url);
  const signal = AbortSignal.timeout(TIMEOUT);
  const attempts: Promise<string>[] = [
    fetch(`https://api.allorigins.win/get?url=${url}`, { signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => okXml(j.contents ?? '')),
    fetch(`https://api.codetabs.com/v1/proxy/?quest=${url}`, { signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(okXml),
    fetch(`https://corsproxy.io/?url=${url}`, { signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(okXml),
  ];
  const xml = await Promise.any(attempts);
  return parseRss(xml, src.name);
}

async function viaRss2Json(src: NewsSource, apiKey: string): Promise<NewsItem[]> {
  const r = await fetch(
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}${apiKey ? `&api_key=${apiKey}&count=30` : ''}`,
    { signal: AbortSignal.timeout(TIMEOUT) },
  );
  const j = await r.json();
  if (j.status !== 'ok') throw new Error(j.message ?? 'rss2json error');
  return (j.items as { title: string; link: string; pubDate: string; description: string; thumbnail?: string; enclosure?: { link?: string } }[]).map((i) => ({
    title: stripHtml(i.title),
    link: i.link,
    date: parseDate(i.pubDate),
    description: stripHtml(i.description ?? '').slice(0, 280),
    image: i.thumbnail || i.enclosure?.link || null,
    source: src.name,
  }));
}

export async function fetchNews(src: NewsSource, rss2jsonKey: string): Promise<NewsItem[]> {
  try {
    return await Promise.any([viaRss2Json(src, rss2jsonKey), viaProxies(src)]);
  } catch {
    throw new Error('no se pudo leer el feed');
  }
}
