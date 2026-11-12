import { describe, expect, it } from 'vitest';
import { decryptJson, deriveSyncKeys, encryptJson, hashPin } from '../lib/crypto';
// @ts-expect-error módulo JavaScript del Worker de Cloudflare (sin tipos)
import worker from '../../proxy/yahoo-worker.js';

describe('cifrado de la sincronización', () => {
  it('la misma frase da las mismas claves, sin importar mayúsculas, tildes o espacios', async () => {
    const a = await deriveSyncKeys('Mate Glaciar  farol canela 1234');
    const b = await deriveSyncKeys('mate glaciar farol canela 1234 ');
    const c = await deriveSyncKeys('otra frase distinta 1234');
    expect(a).toEqual(b);
    expect(a.id).not.toBe(c.id);
    expect(a.id).toMatch(/^[a-f0-9]{64}$/);
  });
  it('cifra y descifra; con otra clave falla', async () => {
    const { key } = await deriveSyncKeys('una frase de prueba larga');
    const other = await deriveSyncKeys('otra frase de prueba larga');
    const payload = await encryptJson(key, { hola: 'mundo', n: 1 });
    expect(payload).not.toContain('mundo');
    expect(await decryptJson(key, payload)).toEqual({ hola: 'mundo', n: 1 });
    await expect(decryptJson(other.key, payload)).rejects.toThrow();
  });
  it('el PIN se guarda como hash con sal', async () => {
    const h = await hashPin('2580');
    expect(h.hash).not.toContain('2580');
    expect((await hashPin('2580', h.salt)).hash).toBe(h.hash);
    expect((await hashPin('1111', h.salt)).hash).not.toBe(h.hash);
  });
});

describe('puente de Cloudflare', () => {
  const store = new Map<string, { value: string; metadata: unknown }>();
  const env = {
    SYNC: {
      getWithMetadata: async (k: string) => store.get(k) ?? { value: null, metadata: null },
      put: async (k: string, value: string, o: { metadata: unknown }) => { store.set(k, { value, metadata: o.metadata }); },
    },
  };
  const id = 'b'.repeat(64);
  const call = (path: string, init?: RequestInit, e: unknown = env) => worker.fetch(new Request(`https://w.dev${path}`, init), e) as Promise<Response>;

  it('no funciona como intermediario abierto', async () => {
    expect((await call('/cualquier/cosa')).status).toBe(404);
    expect((await call('/v8/finance/chart/AAPL', { method: 'POST' })).status).toBe(405);
  });
  it('guarda y devuelve solo datos cifrados', async () => {
    expect((await call(`/sync/${id}`)).status).toBe(404);
    expect((await call(`/sync/${id}`, { method: 'PUT', body: '{"datos":"en claro"}' })).status).toBe(400);
    const put = await call(`/sync/${id}`, { method: 'PUT', body: '{"v":1,"iv":"a","ct":"b"}', headers: { 'X-Updated-At': '2026-11-12T00:00:00Z' } });
    expect(put.status).toBe(200);
    const got = await call(`/sync/${id}`);
    expect(got.headers.get('X-Updated-At')).toBe('2026-11-12T00:00:00Z');
    expect(await got.json()).toEqual({ v: 1, iv: 'a', ct: 'b' });
  });
  it('avisa si falta vincular el espacio KV', async () => {
    expect((await call(`/sync/${id}`, undefined, {})).status).toBe(501);
  });
});
