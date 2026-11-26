import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { loadGis, requestCalendarCode } from '../lib/google';
import { toast, toastError } from '../stores/app';
import { $user } from '../stores/session';

export interface GoogleStatus {
  connected: boolean;
  email?: string;
  calendar?: boolean;
  tasks?: boolean;
}

/**
 * Barra para vincular Google Calendar. Si la conexión vence, simplemente
 * aparece de nuevo el botón "Vincular" y se vuelve a tocar.
 */
export default function GoogleCalendarBar({ status, onChange }: { status: GoogleStatus | null; onChange: (s: GoogleStatus) => void }) {
  const [gisReady, setGisReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadGis().then(() => setGisReady(true)).catch(() => {});
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const code = await requestCalendarCode($user.get()?.email); // ventana de Google
      const s = await api<GoogleStatus>('/google/connect', { method: 'POST', body: { code } });
      onChange(s);
      toast(s.calendar ? '✅ Google Calendar vinculado' : 'Vinculado, pero no diste permiso al calendario');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      onChange(await api<GoogleStatus>('/google/disconnect', { method: 'POST' }));
      toast('Google Calendar desvinculado');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  return (
    <div className="card row between" style={{ marginBottom: '0.75rem', padding: '0.7rem 1rem' }} data-tour="google">
      {status.connected ? (
        <>
          <span className="small">
            🗓 Google vinculado{status.email ? ` (${status.email})` : ''}: ves tus eventos, cumpleaños{status.tasks ? ' y Google Tasks' : ''}.
            {!status.calendar && <strong> Falta el permiso del calendario: vuelve a vincular y marca la casilla.</strong>}
          </span>
          <div className="row">
            {!status.calendar && <button className="btn sm primary" disabled={!gisReady || busy} onClick={connect}>Volver a vincular</button>}
            <button className="btn sm" disabled={busy} onClick={disconnect}>Desvincular</button>
          </div>
        </>
      ) : (
        <>
          <span className="small">
            🗓 <strong>¿Quieres ver tus eventos, cumpleaños y tareas de Google Calendar aquí?</strong>
            <span className="muted"> Solo lectura: la app no cambia nada en tu Google. Si la conexión vence, solo vuelve a tocar el botón.</span>
          </span>
          <button className="btn sm primary" disabled={!gisReady || busy} onClick={connect}>{busy ? 'Conectando…' : 'Vincular Google Calendar'}</button>
        </>
      )}
    </div>
  );
}
