import { useEffect, useRef, useState } from 'react';
import DateTimeInput from './DateTimeInput';
import { api } from '../lib/api';
import { bumpRefresh, loadNotifications, toast, toastError } from '../stores/app';
import { myTz } from '../stores/session';
import type { Status } from '../lib/types';
import { Modal } from './ui';
import { setTimer, type TimerState } from '../stores/timer';
import ImageUpload, { useImagePaste } from './ImageUpload';

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
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const notePaste = useImagePaste((u, n) => setNote((x) => (x ? x + '\n' : '') + `![${n}](${u})`));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (status === 'completada') return null;
  if (status === 'en_revision') return <span className="chip" title="Ya la entregaste; el supervisor la está revisando">🔍 En revisión</span>;

  async function send(response: string, until?: string, finalNote?: string) {
    setBusy(true);
    try {
      const r = await api<{ timer?: TimerState; paused?: { title: string } | null }>(`/tasks/${taskId}/checkin`, { method: 'POST', body: { response, until, note: finalNote } });
      if (r.timer) setTimer(r.timer);
      if (r.paused) toast(`⏱ Pausamos el cronómetro de "${r.paused.title}" y empezamos a contar esta`);
      toast(
        response === 'hecho' ? '✅ ¡Tarea completada!' :
        response === 'aplazar' ? '⏰ Te lo recordaremos más tarde' :
        response === 'empezar' ? '▶ ¡A darle!' : '🔄 Perfecto, seguimos',
      );
      setOpen(false);
      setFinishing(false);
      setNote('');
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
      {status === 'bloqueada' && <span className="chip" title="Primero deben terminarse las tareas de las que depende">🔒 Esperando otras tareas</span>}
      {status === 'pendiente' && (
        <button className={cls} disabled={busy} onClick={() => send('empezar')}>▶ Empezar</button>
      )}
      {status !== 'bloqueada' && <button className={`${cls} ok`} disabled={busy} onClick={() => setFinishing(true)}>✅ Ya lo hice</button>}
      {finishing && (
        <Modal title="✅ Entregar tarea" onClose={() => setFinishing(false)}>
          <p className="small" style={{ marginTop: 0 }}>
            <strong>¿Dónde dejaste el trabajo terminado?</strong> Escribe el enlace, la carpeta o un detalle para que el supervisor lo pueda revisar.
          </p>
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Subí el informe a Drive: https://drive.google.com/… (puedes pegar capturas con Ctrl+V)" {...notePaste.handlers} />
          {notePaste.busy && <div className="tiny muted">Subiendo imagen…</div>}
          <div className="row between" style={{ marginTop: 8 }}>
            <ImageUpload label="🖼 Adjuntar captura" onUploaded={(u, n) => setNote((x) => (x ? x + '\n' : '') + `![${n}](${u})`)} />
            <div className="row">
              <button className="btn" onClick={() => setFinishing(false)}>Cancelar</button>
              <button className="btn ok" disabled={busy || note.trim().length < 3} onClick={() => send('hecho', undefined, note)}>Marcar como hecha</button>
            </div>
          </div>
        </Modal>
      )}
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
              <DateTimeInput value={custom} onChange={setCustom} />
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
