import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { bumpRefresh, loadNotifications, toast, toastError } from '../stores/app';
import { myTz } from '../stores/session';
import type { Status } from '../lib/types';

/**
 * Respuesta al "¿cómo va?": Empezar / Ya lo hice / Sigo en eso / Aplazar.
 */
export default function CheckinButtons({ taskId, status, onDone, size = 'sm' }: {
  taskId: number; status: Status; onDone?: () => void; size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (status === 'completada') return null;

  async function send(response: string, until?: string) {
    setBusy(true);
    try {
      await api(`/tasks/${taskId}/checkin`, { method: 'POST', body: { response, until } });
      toast(
        response === 'hecho' ? '✅ ¡Tarea completada!' :
        response === 'aplazar' ? '⏰ Te lo recordaremos más tarde' :
        response === 'empezar' ? '▶ ¡A darle!' : '🔄 Perfecto, seguimos',
      );
      setOpen(false);
      bumpRefresh();
      loadNotifications();
      onDone?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const cls = `btn ${size === 'sm' ? 'sm' : ''}`;
  return (
    <div className="row" style={{ gap: '0.35rem' }} data-tour="checkin">
      {status === 'pendiente' && (
        <button className={cls} disabled={busy} onClick={() => send('empezar')}>▶ Empezar</button>
      )}
      <button className={`${cls} ok`} disabled={busy} onClick={() => send('hecho')}>✅ Ya lo hice</button>
      {status !== 'pendiente' && status !== 'bloqueada' && (
        <button className={cls} disabled={busy} onClick={() => send('sigo')}>🔄 Sigo en eso</button>
      )}
      <div className="dropdown" ref={ref}>
        <button className={cls} disabled={busy} onClick={() => setOpen(!open)}>⏰ Aplazar ▾</button>
        {open && (
          <div className="menu">
            <button onClick={() => send('aplazar', '1h')}>En 1 hora</button>
            <button onClick={() => send('aplazar', '3h')}>En 3 horas</button>
            <button onClick={() => send('aplazar', 'manana')}>Mañana (al empezar mi horario)</button>
            <button onClick={() => send('aplazar', '3d')}>En 3 días</button>
            <button onClick={() => send('aplazar', '1w')}>En 1 semana</button>
            <div style={{ padding: '0.5rem' }}>
              <label className="tiny">Elegir fecha (tu hora: {myTz()})</label>
              <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn sm primary" style={{ marginTop: 6, width: '100%' }} disabled={!custom} onClick={() => send('aplazar', custom)}>
                Aplazar hasta esa fecha
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
