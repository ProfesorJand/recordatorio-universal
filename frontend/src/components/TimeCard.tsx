import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '@nanostores/react';
import { api } from '../lib/api';
import type { Task } from '../lib/types';
import { fmtDuration, formatDateTime, toLocalInput } from '../lib/time';
import { $timer, startTimer, stopTimer } from '../stores/timer';
import { $user, myTz } from '../stores/session';
import { toast, toastError } from '../stores/app';
import { Confirm, Modal } from './ui';

interface Entry {
  id: number;
  source: 'timer' | 'manual';
  user: string;
  started_at: string | null;
  ended_at: string | null;
  seconds: number;
  out_of_hours: boolean;
  end_reason: string | null;
  note: string | null;
  created_at: string;
}
interface TimeData {
  entries: Entry[];
  totals: { normal: number; fuera: number; manual: number; total: number };
  can_adjust: boolean;
}

const REASON: Record<string, string> = {
  pausa: 'pausó', hecho: 'la terminó', aplazada: 'la aplazó', cambio: 'pasó a otra tarea',
  sin_conexion: 'app cerrada', sin_respuesta: 'no respondió', fin_horario: 'fin del horario', corregido: 'corregido',
};

/** Tiempo trabajado en la tarea: cronómetro, tramos y correcciones */
export default function TimeCard({ task }: { task: Task }) {
  const me = useStore($user);
  const timer = useStore($timer);
  const tz = myTz();
  const [data, setData] = useState<TimeData | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    api<TimeData>(`/tasks/${task.id}/time`).then(setData).catch(() => {});
  }, [task.id]);
  useEffect(load, [load, timer.running, timer.entry_id]);

  const isAssignee = task.assignee?.id === me?.id;
  const runningHere = timer.running && timer.task?.id === task.id;
  if (!data) return null;
  const entries = showAll ? data.entries : data.entries.slice(0, 6);

  async function remove(e: Entry) {
    try {
      setData(await api<TimeData>(`/time/${e.id}`, { method: 'DELETE' }));
      setDeleting(null);
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="card small" data-tour="time">
      <div className="row between">
        <h3 style={{ margin: 0 }}>⏱ Tiempo trabajado</h3>
        {isAssignee && task.status !== 'completada' && task.status !== 'bloqueada' && (
          runningHere
            ? <button className="btn sm" onClick={stopTimer}>⏸ Pausar</button>
            : <button className="btn sm primary" onClick={() => startTimer(task.id)}>▶ Iniciar</button>
        )}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.4rem 0' }}>{fmtDuration(data.totals.total)}</div>
      <div className="tiny muted">
        Horario normal: {fmtDuration(data.totals.normal)} · Fuera de horario: {fmtDuration(data.totals.fuera)}
        {data.totals.manual !== 0 && ` · Ajustes: ${data.totals.manual > 0 ? '+' : '−'}${fmtDuration(Math.abs(data.totals.manual))}`}
      </div>
      {isAssignee && !runningHere && task.status !== 'completada' && (
        <p className="tiny muted" style={{ marginBottom: 0 }}>"Empezar" y "Sigo en eso" también inician el cronómetro. Si cierras la app, se pausa solo.</p>
      )}

      {data.entries.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {entries.map((e) => (
            <div key={e.id} className="tiny" style={{ padding: '4px 0', borderTop: '1px solid var(--border)' }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}>
                <span>
                  {e.source === 'manual'
                    ? <>✏️ Ajuste {e.seconds >= 0 ? '+' : '−'}{fmtDuration(Math.abs(e.seconds))}</>
                    : <>{e.out_of_hours ? '🌙 ' : ''}{formatDateTime(e.started_at, tz)} → {e.ended_at ? toLocalInput(e.ended_at, tz).slice(11) : 'ahora'} · <strong>{fmtDuration(e.seconds)}</strong></>}
                  <span className="muted"> · {e.user}{e.end_reason ? ` · ${REASON[e.end_reason] || e.end_reason}` : ''}</span>
                </span>
                {data.can_adjust && (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {e.source === 'timer' && e.ended_at && <button className="btn sm ghost" style={{ padding: '0 4px' }} onClick={() => setEditing(e)} aria-label="Corregir">✏️</button>}
                    <button className="btn sm ghost" style={{ padding: '0 4px' }} onClick={() => setDeleting(e)} aria-label="Borrar">🗑</button>
                  </span>
                )}
              </div>
              {e.note && <div className="muted">“{e.note}”</div>}
            </div>
          ))}
          {data.entries.length > 6 && (
            <button className="btn sm ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `Ver los ${data.entries.length} tramos`}</button>
          )}
        </div>
      )}
      {data.can_adjust && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAdjusting(true)}>✏️ Ajustar tiempo</button>}

      {adjusting && <AdjustModal taskId={task.id} onClose={() => setAdjusting(false)} onSaved={setData} />}
      {editing && <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSaved={setData} />}
      {deleting && (
        <Confirm title="Borrar tramo" text={<p>¿Borrar este tramo de {fmtDuration(Math.abs(deleting.seconds))}? Queda registrado en el historial.</p>}
          confirmLabel="Borrar" onConfirm={() => remove(deleting)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

function AdjustModal({ taskId, onClose, onSaved }: { taskId: number; onClose: () => void; onSaved: (d: TimeData) => void }) {
  const [sign, setSign] = useState<1 | -1>(1);
  const [hours, setHours] = useState('');
  const [mins, setMins] = useState('');
  const [note, setNote] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const total = sign * ((parseInt(hours || '0', 10) || 0) * 60 + (parseInt(mins || '0', 10) || 0));
    try {
      onSaved(await api<TimeData>(`/tasks/${taskId}/time`, { method: 'POST', body: { minutes: total, note } }));
      toast('Tiempo ajustado');
      onClose();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <Modal title="Ajustar tiempo" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="row">
          <select value={sign} onChange={(e) => setSign(+e.target.value as 1 | -1)} style={{ maxWidth: 120 }}>
            <option value={1}>Sumar</option>
            <option value={-1}>Restar</option>
          </select>
          <input type="number" min={0} placeholder="Horas" value={hours} onChange={(e) => setHours(e.target.value)} style={{ maxWidth: 100 }} />
          <input type="number" min={0} max={59} placeholder="Min" value={mins} onChange={(e) => setMins(e.target.value)} style={{ maxWidth: 100 }} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Motivo (obligatorio)</label>
          <input type="text" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: olvidó pausar el viernes" />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!note.trim() || (!hours && !mins)}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function EditEntryModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: (d: TimeData) => void }) {
  const tz = myTz();
  const [start, setStart] = useState(toLocalInput(entry.started_at, tz));
  const [end, setEnd] = useState(toLocalInput(entry.ended_at, tz));
  const [note, setNote] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onSaved(await api<TimeData>(`/time/${entry.id}`, { method: 'PATCH', body: { started_local: start, ended_local: end, note } }));
      toast('Tramo corregido');
      onClose();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <Modal title="Corregir tramo" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="row">
          <div><label>Inicio (tu hora)</label><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><label>Fin (tu hora)</label><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Motivo (obligatorio)</label>
          <input type="text" required value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!note.trim()}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
