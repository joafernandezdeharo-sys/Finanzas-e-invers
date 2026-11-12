import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { hashPin, fromB64, toB64 } from '../lib/crypto';
import { loadDevice, saveDevice } from '../lib/device';
import { useDevice } from '../lib/useDevice';
import { IconLock } from './Icons';

export const webauthnAvailable = () =>
  typeof window !== 'undefined' && !!window.PublicKeyCredential && location.protocol === 'https:';

/** Registra la huella / rostro del dispositivo (WebAuthn, autenticador del propio equipo) */
export async function registerBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Mis Finanzas' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'mis-finanzas', displayName: 'Mis Finanzas' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No se registró');
  return toB64(cred.rawId);
}

async function verifyBiometric(credentialId: string): Promise<boolean> {
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: fromB64(credentialId) as BufferSource }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return !!res;
}

const HIDDEN_AT = 'mis-finanzas:hidden-at';

/** Pantalla de bloqueo: tapa la app hasta que se ingrese el PIN o la huella */
export function LockGate({ children }: { children: ReactNode }) {
  const device = useDevice();
  const { lock } = device;
  const [locked, setLocked] = useState(() => loadDevice().lock.enabled);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  // al activar el bloqueo desde Configuración no bloqueamos de inmediato; al desactivarlo, desbloqueamos
  useEffect(() => { if (!lock.enabled) setLocked(false); }, [lock.enabled]);

  // bloqueo automático después de X minutos con la app en segundo plano
  useEffect(() => {
    if (!lock.enabled) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        sessionStorage.setItem(HIDDEN_AT, String(Date.now()));
      } else {
        const t = Number(sessionStorage.getItem(HIDDEN_AT) ?? 0);
        if (t && Date.now() - t > lock.autoLockMinutes * 60_000) { setLocked(true); tried.current = false; }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [lock.enabled, lock.autoLockMinutes]);

  const bio = useCallback(async () => {
    if (!lock.credentialId) return;
    try {
      if (await verifyBiometric(lock.credentialId)) { setLocked(false); setError(''); }
    } catch {
      setError('No se pudo verificar la huella. Usá el PIN.');
    }
  }, [lock.credentialId]);

  // ofrecemos la huella apenas aparece la pantalla de bloqueo
  useEffect(() => {
    if (locked && lock.credentialId && webauthnAvailable() && !tried.current) { tried.current = true; bio(); }
  }, [locked, lock.credentialId, bio]);

  const submit = async (value: string) => {
    if (value.length < 4) return;
    setBusy(true);
    const { hash } = await hashPin(value, lock.pinSalt);
    setBusy(false);
    if (hash === lock.pinHash) { setLocked(false); setPin(''); setError(''); }
    else { setError('PIN incorrecto'); setPin(''); }
  };

  if (!lock.enabled || !locked) return <>{children}</>;
  return (
    <div className="lock-screen">
      <div className="lock-box">
        <div className="lock-icon"><IconLock width={28} height={28} /></div>
        <h2>Mis Finanzas</h2>
        <p className="muted small" style={{ margin: 0 }}>Ingresá tu PIN para continuar</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(pin); }} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <input className="input num lock-pin" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={12}
            value={pin} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setPin(v); setError(''); }} aria-label="PIN" />
          <button className="btn btn-primary" type="submit" disabled={pin.length < 4 || busy}>{busy ? 'Verificando…' : 'Desbloquear'}</button>
        </form>
        {lock.credentialId && webauthnAvailable() && <button className="btn" onClick={bio}>Usar huella / rostro</button>}
        {error && <div className="bad small">{error}</div>}
        <button className="btn btn-sm btn-danger" style={{ marginTop: 12 }} onClick={() => {
          if (confirm('¿Olvidaste el PIN?\n\nPara entrar sin PIN hay que borrar los datos de este dispositivo. Si tenés la sincronización activada o un backup, después podés recuperarlos.\n\n¿Borrar los datos de este dispositivo?')) {
            localStorage.clear();
            saveDevice({});
            location.reload();
          }
        }}>Olvidé mi PIN</button>
      </div>
    </div>
  );
}
