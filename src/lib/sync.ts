import type { AppData } from '../types';
import { decryptJson, deriveSyncKeys, encryptJson } from './crypto';
import { loadDevice, saveDevice } from './device';

const base = (url: string) => url.trim().replace(/\/+$/, '');

export interface RemoteData {
  data: AppData;
  updatedAt: string;
}

/** Baja y descifra los datos de la nube (null si todavía no hay nada guardado) */
export async function pullRemote(url: string, id: string, key: string): Promise<RemoteData | null> {
  const r = await fetch(`${base(url)}/sync/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return null;
  if (r.status === 501) throw new Error('Falta vincular el espacio KV "SYNC" al Worker (ver Fuentes de datos)');
  if (!r.ok) throw new Error(`La nube respondió ${r.status}`);
  const payload = await r.text();
  let data: AppData;
  try {
    data = await decryptJson<AppData>(key, payload);
  } catch {
    throw new Error('No se pudieron descifrar los datos: ¿la frase secreta es la misma que en tu otro dispositivo?');
  }
  return { data, updatedAt: r.headers.get('X-Updated-At') || data.updatedAt };
}

export async function pushRemote(url: string, id: string, key: string, data: AppData): Promise<void> {
  const body = await encryptJson(key, data);
  const r = await fetch(`${base(url)}/sync/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Updated-At': data.updatedAt },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 501) throw new Error('Falta vincular el espacio KV "SYNC" al Worker (ver Fuentes de datos)');
  if (!r.ok) throw new Error(`La nube respondió ${r.status}`);
}

/** Prepara la conexión: deriva las claves de la frase y mira si ya hay datos guardados */
export async function connect(url: string, phrase: string): Promise<{ id: string; key: string; remote: RemoteData | null }> {
  const { id, key } = await deriveSyncKeys(phrase);
  const remote = await pullRemote(url, id, key);
  return { id, key, remote };
}

export type SyncResult = 'subido' | 'bajado' | 'al-dia' | 'conflicto';

const CONFLICT_KEY = 'mis-finanzas:conflict-backup';

/**
 * Sincroniza en ambos sentidos: gana la versión modificada más recientemente.
 * Si los dos dispositivos cambiaron algo, se usa la más nueva y la otra queda guardada como copia de seguridad local.
 */
export async function syncOnce(local: AppData, replaceAll: (d: AppData) => void): Promise<SyncResult> {
  const dev = loadDevice();
  const { url, id, key, lastPushedAt, lastPulledAt } = dev.sync;
  if (!dev.sync.enabled || !url || !id || !key) return 'al-dia';
  try {
    const remote = await pullRemote(url, id, key);
    const lastSynced = [lastPushedAt, lastPulledAt].filter(Boolean).sort().pop() ?? '';
    const localChanged = local.updatedAt > lastSynced;
    let result: SyncResult = 'al-dia';

    if (!remote || remote.updatedAt < local.updatedAt) {
      if (!remote || localChanged) {
        await pushRemote(url, id, key, local);
        saveDevice((d) => ({ ...d, sync: { ...d.sync, lastPushedAt: local.updatedAt } }));
        result = 'subido';
      }
    } else if (remote.updatedAt > local.updatedAt) {
      if (localChanged) {
        try { localStorage.setItem(CONFLICT_KEY, JSON.stringify(local)); } catch { /* */ }
        result = 'conflicto';
      } else {
        result = 'bajado';
      }
      replaceAll(remote.data);
      saveDevice((d) => ({ ...d, sync: { ...d.sync, lastPulledAt: remote.updatedAt } }));
    }
    saveDevice((d) => ({ ...d, sync: { ...d.sync, lastSyncAt: new Date().toISOString(), lastError: null } }));
    return result;
  } catch (e) {
    saveDevice((d) => ({ ...d, sync: { ...d.sync, lastError: (e as Error).message } }));
    throw e;
  }
}

export const conflictBackup = (): AppData | null => {
  try { return JSON.parse(localStorage.getItem(CONFLICT_KEY) ?? 'null'); } catch { return null; }
};
