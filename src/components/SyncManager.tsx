import { useEffect, useRef } from 'react';
import { useStore } from '../store/AppStore';
import { useDevice } from '../lib/useDevice';
import { syncOnce } from '../lib/sync';

/** Sincroniza automáticamente: al abrir, al volver a la app, cada 2 minutos y unos segundos después de cada cambio */
export function SyncManager({ onConflict }: { onConflict: () => void }) {
  const { data, replaceAll } = useStore();
  const device = useDevice();
  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const enabled = device.sync.enabled;

  const run = useRef(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    try {
      const r = await syncOnce(dataRef.current, replaceAll);
      if (r === 'conflicto') onConflict();
    } catch {
      /* el error queda guardado en la configuración del dispositivo */
    } finally {
      running.current = false;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    run.current();
    const t = setInterval(() => document.visibilityState === 'visible' && run.current(), 120_000);
    const onVis = () => document.visibilityState === 'visible' && run.current();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onVis); };
  }, [enabled]);

  // subir los cambios unos segundos después de que el usuario deja de editar
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => run.current(), 4000);
    return () => clearTimeout(t);
  }, [data.updatedAt, enabled]);

  return null;
}
