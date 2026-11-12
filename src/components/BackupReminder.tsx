import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { useDevice } from '../lib/useDevice';
import { saveDevice } from '../lib/device';
import { downloadFile, todayISO } from '../lib/util';

const DAYS = 14;

export function exportBackup(data: unknown) {
  downloadFile(`mis-finanzas-backup-${todayISO()}.json`, JSON.stringify(data, null, 2));
  saveDevice({ lastBackupAt: new Date().toISOString() });
}

/** Aviso cuando hace mucho que no hay backup ni sincronización */
export function BackupReminder() {
  const { data } = useStore();
  const device = useDevice();
  const hasData = data.transactions.length + data.investments.length + data.savings.length > 0;
  if (!hasData || device.sync.enabled) return null;
  const last = [device.lastBackupAt, device.backupReminderSnoozedAt].filter(Boolean).sort().pop();
  const days = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : Infinity;
  if (days < DAYS) return null;
  return (
    <div className="alert warn-box">
      <b>{device.lastBackupAt ? `Hace ${Math.floor(days)} días que no hacés un backup.` : 'Todavía no hiciste ningún backup.'}</b>{' '}
      Tus datos están solo en este dispositivo: si se borran los datos del navegador, se pierden.{' '}
      <button className="btn btn-sm" onClick={() => exportBackup(data)}>Descargar backup</button>{' '}
      <Link to="/configuracion#sincronizacion" className="small">o activá la sincronización</Link>{' '}
      <button className="btn btn-sm" onClick={() => saveDevice({ backupReminderSnoozedAt: new Date().toISOString() })}>Recordarme después</button>
    </div>
  );
}
