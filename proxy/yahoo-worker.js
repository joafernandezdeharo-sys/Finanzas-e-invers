/**
 * Puente para Yahoo Finance — Mis Finanzas
 *
 * Yahoo Finance no permite que una página web consulte sus cotizaciones directamente
 * desde el navegador. Este pequeño Worker de Cloudflare (gratis) hace la consulta por vos
 * y le agrega el permiso que el navegador necesita.
 *
 * Solo deja pasar consultas de cotizaciones, gráficos y búsqueda de símbolos de Yahoo Finance:
 * no sirve como intermediario para ninguna otra página.
 *
 * Cómo publicarlo: ver la sección "Fuentes de datos" de la app o el README.
 */
const ALLOWED = [
  /^\/v8\/finance\/chart\/[A-Za-z0-9.\-^=%]+$/, // cotización e histórico
  /^\/v1\/finance\/search$/, // búsqueda de símbolos
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(JSON.stringify({ ok: true, servicio: 'Puente Yahoo Finance para Mis Finanzas' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED.some((re) => re.test(url.pathname))) return new Response('No encontrado', { status: 404, headers: CORS });

    const target = `https://query1.finance.yahoo.com${url.pathname}${url.search}`;
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
      // cache corto en Cloudflare: alivia a Yahoo y acelera la app
      cf: { cacheTtl: 20, cacheEverything: true },
    });
    const headers = new Headers(CORS);
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'public, max-age=20');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
