import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { useDevice } from '../lib/useDevice';
import { saveDevice } from '../lib/device';
import { hashPin, randomPhrase } from '../lib/crypto';
import { conflictBackup, connect, pushRemote, type RemoteData } from '../lib/sync';
import { registerBiometric, webauthnAvailable } from './LockGate';
import { exportBackup } from './BackupReminder';
import { Card, Field } from './ui';
import { IconCloud, IconDownload, IconLock } from './Icons';
import type { AppData } from '../types';

// ------------------------------------------------------------------ instalar

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallCard() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const done = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  const isFile = location.protocol === 'file:';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <Card title="Instalar como app" subtitle="Abre como una app más, con su ícono, y funciona sin conexión">
      {installed ? <span className="badge good">● Ya está instalada en este dispositivo</span>
        : isFile ? <p className="small muted" style={{ margin: 0 }}>Para instalarla, abrí la versión publicada: <a href="https://joafernandezdeharo-sys.github.io/Finanzas-e-invers/" target="_blank" rel="noreferrer">joafernandezdeharo-sys.github.io/Finanzas-e-invers</a></p>
        : evt ? <button className="btn btn-primary" onClick={async () => { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === 'accepted') setInstalled(true); setEvt(null); }}>Instalar app</button>
        : ios ? <p className="small" style={{ margin: 0 }}>En iPhone: tocá el botón <b>Compartir</b> de Safari y después <b>Agregar a inicio</b>.</p>
        : <p className="small" style={{ margin: 0 }}>Abrí el menú del navegador (⋮) y elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ bloqueo

export function SecurityCard() {
  const device = useDevice();
  const { lock } = device;
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const enable = async () => {
    if (!/^\d{4,12}$/.test(pin1)) return setMsg({ ok: false, text: 'El PIN tiene que tener entre 4 y 12 números.' });
    if (pin1 !== pin2) return setMsg({ ok: false, text: 'Los dos PIN no coinciden.' });
    const { hash, salt } = await hashPin(pin1);
    saveDevice((d) => ({ ...d, lock: { ...d.lock, enabled: true, pinHash: hash, pinSalt: salt } }));
    setPin1(''); setPin2('');
    setMsg({ ok: true, text: 'Bloqueo activado. La próxima vez que abras la app te va a pedir el PIN.' });
  };
  const disable = async () => {
    const p = prompt('Ingresá tu PIN actual para desactivar el bloqueo');
    if (p == null) return;
    const { hash } = await hashPin(p, lock.pinSalt);
    if (hash !== lock.pinHash) return setMsg({ ok: false, text: 'PIN incorrecto.' });
    saveDevice((d) => ({ ...d, lock: { ...d.lock, enabled: false, pinHash: '', pinSalt: '', credentialId: null } }));
    setMsg({ ok: true, text: 'Bloqueo desactivado.' });
  };
  const addBio = async () => {
    try {
      const id = await registerBiometric();
      saveDevice((d) => ({ ...d, lock: { ...d.lock, credentialId: id } }));
      setMsg({ ok: true, text: 'Listo: ya podés desbloquear con tu huella o rostro.' });
    } catch {
      setMsg({ ok: false, text: 'No se pudo registrar la huella en este dispositivo.' });
    }
  };

  return (
    <Card title={<><IconLock width={16} height={16} /> Bloqueo con PIN o huella</>} subtitle="Pide un PIN al abrir la app y después de un rato en segundo plano">
      {lock.enabled ? (
        <div className="form-grid">
          <div className="full filters">
            <span className="badge good">● Bloqueo activado</span>
            {webauthnAvailable() && (lock.credentialId
              ? <button className="btn btn-sm" onClick={() => saveDevice((d) => ({ ...d, lock: { ...d.lock, credentialId: null } }))}>Quitar huella</button>
              : <button className="btn btn-sm" onClick={addBio}>Usar también huella / rostro</button>)}
            <button className="btn btn-sm btn-danger" onClick={disable}>Desactivar</button>
          </div>
          <Field label="Bloquear después de">
            <select className="select" value={lock.autoLockMinutes} onChange={(e) => saveDevice((d) => ({ ...d, lock: { ...d.lock, autoLockMinutes: Number(e.target.value) } }))}>
              {[0, 1, 5, 15, 60].map((m) => <option key={m} value={m}>{m === 0 ? 'Apenas salgo de la app' : `${m} min en segundo plano`}</option>)}
            </select>
          </Field>
        </div>
      ) : (
        <form className="filters" onSubmit={(e) => { e.preventDefault(); enable(); }}>
          <input className="input num" style={{ maxWidth: 140 }} type="password" inputMode="numeric" placeholder="PIN nuevo" value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))} aria-label="PIN nuevo" />
          <input className="input num" style={{ maxWidth: 140 }} type="password" inputMode="numeric" placeholder="Repetir PIN" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} aria-label="Repetir PIN" />
          <button className="btn btn-primary" type="submit">Activar bloqueo</button>
        </form>
      )}
      {msg && <div className={`alert ${msg.ok ? 'good' : 'bad'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      <p className="small muted" style={{ marginBottom: 0 }}>
        El PIN se guarda cifrado y es solo para este dispositivo. Evita que alguien que agarre tu celular o compu vea tus finanzas,
        pero no cifra los datos guardados en el navegador. Si lo olvidás, podés borrar los datos del dispositivo y recuperarlos con la sincronización o un backup.
        {!webauthnAvailable() && ' La huella / rostro está disponible en la versión publicada (https).'}
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ sincronización

export function SyncCard() {
  const { data, replaceAll } = useStore();
  const device = useDevice();
  const { sync } = device;
  const [url, setUrl] = useState(sync.url || data.settings.yahooProxyUrl);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<{ id: string; key: string; remote: RemoteData } | null>(null);
  const backup = conflictBackup();

  const activate = (id: string, key: string, extra: Partial<typeof sync> = {}) =>
    saveDevice((d) => ({ ...d, sync: { ...d.sync, enabled: true, url: url.trim().replace(/\/+$/, ''), id, key, lastError: null, lastSyncAt: new Date().toISOString(), ...extra } }));

  const start = async () => {
    if (!/^https?:\/\//.test(url.trim())) return setMsg({ ok: false, text: 'Pegá la dirección de tu puente (https://…workers.dev).' });
    if (phrase.trim().split(/\s+/).length < 4 && phrase.trim().length < 20) return setMsg({ ok: false, text: 'Usá una frase de al menos 4 palabras (o tocá “Generar frase”).' });
    setBusy(true); setMsg({ ok: true, text: 'Conectando…' });
    try {
      const { id, key, remote } = await connect(url, phrase);
      if (!remote) {
        await pushRemote(url, id, key, data);
        activate(id, key, { lastPushedAt: data.updatedAt });
        setMsg({ ok: true, text: 'Sincronización activada. En tu otro dispositivo, entrá acá y escribí la misma frase.' });
      } else {
        setPending({ id, key, remote });
        setMsg(null);
      }
      setPhrase('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (which: 'nube' | 'local') => {
    if (!pending) return;
    if (which === 'nube') {
      replaceAll(pending.remote.data);
      activate(pending.id, pending.key, { lastPulledAt: pending.remote.updatedAt });
      setMsg({ ok: true, text: 'Listo: este dispositivo ahora tiene los datos de la nube.' });
    } else {
      await pushRemote(url, pending.id, pending.key, data);
      activate(pending.id, pending.key, { lastPushedAt: data.updatedAt });
      setMsg({ ok: true, text: 'Listo: se subieron los datos de este dispositivo.' });
    }
    setPending(null);
  };

  const count = (d: AppData) => `${d.transactions.length} movimientos, ${d.investments.length} inversiones`;

  return (
    <Card title={<><IconCloud width={16} height={16} /> Sincronizar entre dispositivos</>} subtitle="Tus datos en el celular y la compu, siempre iguales y con copia en la nube">
      <div id="sincronizacion" />
      {sync.enabled ? (
        <>
          <div className="filters">
            <span className={`badge ${sync.lastError ? 'bad' : 'good'}`}>● {sync.lastError ? 'Error al sincronizar' : 'Sincronización activada'}</span>
            <span className="small muted">{sync.lastSyncAt ? `Última vez: ${new Date(sync.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
            <button className="btn btn-sm btn-danger" onClick={() => confirm('¿Desactivar la sincronización en este dispositivo? Tus datos quedan acá y en la nube.') && saveDevice((d) => ({ ...d, sync: { ...d.sync, enabled: false, key: '', id: '' } }))}>Desactivar</button>
          </div>
          {sync.lastError && <div className="alert bad" style={{ marginTop: 10 }}>{sync.lastError}</div>}
        </>
      ) : pending ? (
        <div className="alert">
          <p style={{ marginTop: 0 }}>Ya hay datos guardados en la nube con esa frase ({count(pending.remote.data)}, modificados el {new Date(pending.remote.updatedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}). ¿Cuáles querés usar?</p>
          <div className="filters">
            <button className="btn btn-primary" onClick={() => choose('nube')}>Usar los de la nube</button>
            <button className="btn" onClick={() => confirm('Se van a reemplazar los datos de la nube por los de este dispositivo. ¿Seguro?') && choose('local')}>Subir los de este dispositivo ({count(data)})</button>
            <button className="btn" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <Field label="Dirección de tu puente" full hint={<>Es el mismo puente de Cloudflare que usás para Yahoo, con el espacio de datos vinculado. <Link to="/fuentes">Ver cómo prepararlo</Link></>}>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yahoo-finanzas.tu-usuario.workers.dev" />
          </Field>
          <Field label="Frase secreta" full hint="Usá la misma frase en todos tus dispositivos. Anotala en un lugar seguro: sin ella nadie puede leer los datos, ni siquiera Cloudflare.">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Ej. mate glaciar farol canela torre bondi 4821" autoComplete="off" />
              <button className="btn" type="button" onClick={() => setPhrase(randomPhrase())}>Generar frase</button>
            </div>
          </Field>
          <div className="full"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Activar sincronización'}</button></div>
        </form>
      )}
      {msg && <div className={`alert ${msg.ok ? 'good' : 'bad'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      {backup && (
        <p className="small" style={{ marginBottom: 0 }}>
          Hay una copia de la versión que se reemplazó en el último conflicto ({count(backup)}).{' '}
          <button className="btn btn-sm" onClick={() => exportBackup(backup)}><IconDownload width={12} />Descargarla</button>
        </p>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        Los datos se cifran en tu dispositivo con tu frase (AES-256) antes de salir: en la nube solo queda algo ilegible. Se sincroniza solo al abrir la app, cada 2 minutos y después de cada cambio.
      </p>
    </Card>
  );
}
