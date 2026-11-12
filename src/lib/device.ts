/** Configuración propia de este dispositivo: no se sincroniza ni va en los backups */

export interface DeviceSettings {
  lock: {
    enabled: boolean;
    pinHash: string;
    pinSalt: string;
    credentialId: string | null; // huella / rostro (WebAuthn)
    autoLockMinutes: number;
  };
  sync: {
    enabled: boolean;
    url: string; // dirección del puente (Cloudflare Worker)
    id: string;
    key: string;
    lastPushedAt: string | null; // updatedAt de los datos que subimos por última vez
    lastPulledAt: string | null; // updatedAt de los datos que bajamos por última vez
    lastSyncAt: string | null; // cuándo se sincronizó (reloj de este dispositivo)
    lastError: string | null;
  };
  lastBackupAt: string | null;
  backupReminderSnoozedAt: string | null;
}

const KEY = 'mis-finanzas:device';

export const defaultDevice = (): DeviceSettings => ({
  lock: { enabled: false, pinHash: '', pinSalt: '', credentialId: null, autoLockMinutes: 5 },
  sync: { enabled: false, url: '', id: '', key: '', lastPushedAt: null, lastPulledAt: null, lastSyncAt: null, lastError: null },
  lastBackupAt: null,
  backupReminderSnoozedAt: null,
});

export function loadDevice(): DeviceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const d = defaultDevice();
    if (!raw) return d;
    return { ...d, ...raw, lock: { ...d.lock, ...raw.lock }, sync: { ...d.sync, ...raw.sync } };
  } catch {
    return defaultDevice();
  }
}

type Listener = (d: DeviceSettings) => void;
const listeners = new Set<Listener>();

export function saveDevice(patch: Partial<DeviceSettings> | ((d: DeviceSettings) => DeviceSettings)) {
  const cur = loadDevice();
  const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
  listeners.forEach((l) => l(next));
  return next;
}

export function onDeviceChange(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
