/**
 * Puente de Mis Finanzas: Yahoo Finance + sincronización cifrada
 *
 * Yahoo Finance no permite que una página web consulte sus cotizaciones directamente
 * desde el navegador. Este pequeño Worker de Cloudflare (gratis) hace la consulta por vos
 * y le agrega el permiso que el navegador necesita.
 *
 * Solo deja pasar consultas de cotizaciones, gráficos y búsqueda de símbolos de Yahoo Finance:
 * no sirve como intermediario para ninguna otra página.
 *
 * Sincronización (opcional): si al Worker le vinculás un espacio KV con el nombre SYNC, guarda una
 * copia CIFRADA de tus datos para usarlos en varios dispositivos. El cifrado se hace en tu dispositivo
 * con tu frase secreta: acá solo llegan datos ilegibles y un identificador derivado de la frase.
 *
 * Cómo publicarlo: ver la sección "Fuentes de datos" de la app o el README.
 */
const ALLOWED = [
  /^\/v8\/finance\/chart\/[A-Za-z0-9.\-^=%]+$/, // cotización e histórico
  /^\/v1\/finance\/search$/, // búsqueda de símbolos
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Updated-At',
  'Access-Control-Expose-Headers': 'X-Updated-At',
  'Access-Control-Max-Age': '86400',
};

const SYNC_PATH = /^\/sync\/([a-f0-9]{64})$/;
const MAX_SYNC_BYTES = 10 * 1024 * 1024;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });

async function handleSync(request, env, id) {
  if (!env || !env.SYNC) return json({ error: 'Falta vincular el espacio KV "SYNC" al Worker' }, 501);
  if (request.method === 'GET') {
    const { value, metadata } = await env.SYNC.getWithMetadata(id);
    if (value === null) return json({ error: 'vacío' }, 404);
    return new Response(value, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Updated-At': (metadata && metadata.updatedAt) || '' } });
  }
  if (request.method === 'PUT') {
    const body = await request.text();
    if (body.length > MAX_SYNC_BYTES) return json({ error: 'Demasiado grande' }, 413);
    // solo aceptamos el formato cifrado de la app ({ v, iv, ct })
    try {
      const p = JSON.parse(body);
      if (!p || p.v !== 1 || typeof p.iv !== 'string' || typeof p.ct !== 'string') throw new Error();
    } catch {
      return json({ error: 'Formato inválido' }, 400);
    }
    const updatedAt = request.headers.get('X-Updated-At') || new Date().toISOString();
    await env.SYNC.put(id, body, { metadata: { updatedAt } });
    return json({ ok: true, updatedAt });
  }
  return json({ error: 'Método no permitido' }, 405);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    const sync = url.pathname.match(SYNC_PATH);
    if (sync) return handleSync(request, env, sync[1]);

    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: CORS });
    if (url.pathname === '/' || url.pathname === '') {
      return json({ ok: true, servicio: 'Puente de Mis Finanzas', sincronizacion: !!(env && env.SYNC) });
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
