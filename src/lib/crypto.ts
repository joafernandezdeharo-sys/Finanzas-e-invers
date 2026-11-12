/**
 * Cifrado local con la Web Crypto API del navegador.
 * - Sincronización: de una frase secreta se derivan una clave AES-256 y un identificador.
 *   El servidor solo ve el identificador y datos cifrados: nunca la frase ni tus datos.
 * - PIN: se guarda solo un hash (PBKDF2), nunca el PIN.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

async function pbkdf2(secret: string, salt: Uint8Array, bits: number, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, bits);
  return new Uint8Array(out);
}

// misma sal en todos los dispositivos: así la misma frase da la misma clave y el mismo identificador
const SYNC_SALT = enc.encode('mis-finanzas/sync/v1');
const SYNC_ITERATIONS = 310_000;

export interface SyncKeys {
  id: string; // identificador público del espacio en la nube (64 hex)
  key: string; // clave AES en base64 (se guarda solo en este dispositivo)
}

/** Normaliza la frase para que mayúsculas, tildes o espacios de más no cambien la clave */
export const normalizePhrase = (p: string) => p.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

export async function deriveSyncKeys(phrase: string): Promise<SyncKeys> {
  const bits = await pbkdf2(normalizePhrase(phrase), SYNC_SALT, 512, SYNC_ITERATIONS);
  return { key: toB64(bits.slice(0, 32)), id: toHex(bits.slice(32, 64)) };
}

const aesKey = (b64: string) => crypto.subtle.importKey('raw', fromB64(b64) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function encryptJson(keyB64: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), enc.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) });
}

export async function decryptJson<T>(keyB64: string, payload: string): Promise<T> {
  const { iv, ct } = JSON.parse(payload) as { iv: string; ct: string };
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) as BufferSource }, await aesKey(keyB64), fromB64(ct) as BufferSource);
  return JSON.parse(dec.decode(plain)) as T;
}

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(pin, salt, 256, 200_000);
  return { hash: toB64(bits), salt: toB64(salt) };
}

const WORDS = [
  'mate', 'tango', 'asado', 'river', 'puerto', 'monte', 'lago', 'sierra', 'nube', 'rayo', 'faro', 'bosque', 'arena', 'piedra', 'cielo',
  'luna', 'campo', 'viento', 'trigo', 'cobre', 'plata', 'vidrio', 'papel', 'cuero', 'barco', 'tren', 'puente', 'torre', 'jardin', 'limon',
  'naranja', 'durazno', 'canela', 'menta', 'pampa', 'glaciar', 'volcan', 'condor', 'puma', 'yacare', 'hornero', 'ceibo', 'quebracho',
  'malbec', 'alfajor', 'empanada', 'dulce', 'leche', 'helado', 'bandoneon', 'guitarra', 'farol', 'esquina', 'bondi', 'subte', 'plaza',
];

/** Frase al azar fácil de anotar: 6 palabras + un número (~48 bits), reforzada con 310.000 iteraciones de PBKDF2 */
export function randomPhrase(): string {
  const r = crypto.getRandomValues(new Uint32Array(7));
  const words = Array.from(r.slice(0, 6), (n) => WORDS[n % WORDS.length]);
  return `${words.join(' ')} ${(r[6] % 9000) + 1000}`;
}
