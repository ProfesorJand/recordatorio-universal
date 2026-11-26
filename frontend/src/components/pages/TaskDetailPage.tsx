import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import TaskForm from '../TaskForm';
import TaskCard from '../TaskCard';
import RichText from '../RichText';
import ImageUpload from '../ImageUpload';
import CheckinButtons from '../CheckinButtons';
import { Avatar, Confirm, DueDate, Empty, Loading, PriorityChip, StatusChip } from '../ui';
import { api } from '../../lib/api';
import { queryParam, url } from '../../lib/config';
import type { Person, Task } from '../../lib/types';
import { reminderLabel } from '../../lib/priority';
import { formatDateTime, relative, shortTz, tzDifference } from '../../lib/time';
import { $refresh, bumpRefresh, markTaskSeen, toast, toastError } from '../../stores/app';
import { $user, myTz } from '../../stores/session';
import { waLink } from '../../lib/whatsapp';

interface Detail {
  task: Task;
  parent: Task | null;
  children: Task[];
  comments: { id: number; body: string; created_at: string; user: { id: number; name: string; picture: string | null } }[];
  activity: { action: string; detail: string | null; created_at: string; user: string }[];
  can: { edit: boolean; checkin: boolean; link: boolean; comment: boolean; delete: boolean };
}

const ACTION_LABEL: Record<string, string> = {
  creada: 'creó la tarea', creada_vinculada: 'pidió esta tarea', editada: 'editó', completada: 'la completó',
  aplazada: 'la aplazó', sigue: 'dijo que sigue en eso', empezada: 'la empezó', comentario: 'comentó',
  bloqueada: 'quedó esperando', fecha_cambiada: 'cambió la fecha límite', desbloqueada: 'se desbloqueó', aviso: 'aviso',
};

function PersonRow({ label, p }: { label: string; p: Person | null }) {
  const tz = myTz();
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <Avatar person={p} size={30} />
      <div>
        <div className="tiny muted">{label}</div>
        <div className="small">{p ? p.name : '—'}</div>
        {p?.timezone && p.timezone !== tz && (
          <div className="tiny muted">🌎 {shortTz(p.timezone)} ({tzDifference(tz, p.timezone)})</div>
        )}
      </div>
    </div>
  );
}

function TaskDetailContent() {
  const id = Number(queryParam('id'));
  const refresh = useStore($refresh);
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const tz = myTz();

  const load = useCallback(() => {
    if (!id) return setNotFound('Falta el número de tarea');
    api<Detail>(`/tasks/${id}`).then(setD).catch((e) => setNotFound(e.message));
  }, [id]);

  useEffect(load, [load, refresh]);
  // Ver la tarea cuenta como "atendida": se apaga la alarma de sus avisos
  useEffect(() => {
    if (id) markTaskSeen(id);
  }, [id]);

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSending(true);
    try {
      await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment } });
      setComment('');
      load();
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    try {
      await api(`/tasks/${id}`, { method: 'DELETE' });
      toast('Tarea eliminada');
      window.location.href = url('/tareas/');
    } catch (e) {
      toastError(e);
    }
  }

  async function reopen() {
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: { status: 'en_progreso' } });
      bumpRefresh();
    } catch (e) {
      toastError(e);
    }
  }

  if (notFound) return <Empty>{notFound}. <a href={url('/tareas/')}>Volver a las tareas</a></Empty>;
  if (!d) return <Loading />;
  const t = d.task;
  const otherTz = t.due_tz && t.due_tz !== tz ? t.due_tz : null;
  const me = $user.get();
  const wa = waLink(t);

  return (
    <>
      <a href={url('/tareas/')} className="small">← Tareas</a>
      <div className="card" style={{ marginTop: 8 }} data-tour="task-head">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <PriorityChip p={t.priority} />
              <StatusChip s={t.status} />
              <a className="chip" href={url(`/proyecto/?id=${t.project.id}`)}>
                <span className="dot" style={{ background: t.project.color }} /> {t.project.name}
              </a>
            </div>
            <h1 style={{ margin: '0.25rem 0' }}>{t.title}</h1>
            {t.due_at && (
              <div className="small" style={{ marginTop: 6 }}>
                <DueDate task={t} compact />
                {t.due_changes > 0 && t.original_due_at && (
                  <div className="small" style={{ marginTop: 6, background: '#fff5e0', border: '1px solid #f7dca3', color: '#8a5a00', padding: '6px 10px', borderRadius: 8, display: 'inline-block' }}>
                    📅 La fecha límite se cambió {t.due_changes} {t.due_changes === 1 ? 'vez' : 'veces'}. Fecha original: {formatDateTime(t.original_due_at, tz, true)}
                  </div>
                )}
                {otherTz && (
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    Quien fijó la fecha está en {otherTz}: allí será {formatDateTime(t.due_at, otherTz)} ({tzDifference(tz, otherTz)} respecto a ti).
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="row">
            {d.can.edit && <button className="btn sm" onClick={() => setEditing(true)}>✏️ Editar</button>}
            {d.can.edit && t.status === 'completada' && <button className="btn sm" onClick={reopen}>↩ Reabrir</button>}
            {wa && t.status !== 'completada' && t.assignee?.id !== me?.id && (
              <a className="btn sm" href={wa} target="_blank" rel="noopener noreferrer" title={`Abrir WhatsApp con ${t.assignee?.name}`}>💬 WhatsApp</a>
            )}
            {d.can.delete && <button className="btn sm danger" onClick={() => setDeleting(true)}>🗑</button>}
          </div>
        </div>
        {d.can.checkin && (
          <div style={{ marginTop: 14 }}>
            <CheckinButtons taskId={t.id} status={t.status} size="md" onDone={load} />
          </div>
        )}
        {t.status === 'completada' && t.completed_at && (
          <p className="small" style={{ color: 'var(--ok)', marginBottom: 0 }}>✅ Completada {formatDateTime(t.completed_at, tz)}</p>
        )}
      </div>

      <div className="grid detail-grid" style={{ marginTop: '0.75rem' }}>
        <div className="stack">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Descripción</h3>
            <RichText text={t.description} />
          </div>

          {d.parent && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>🔗 Esta tarea la pidieron desde:</h3>
              <TaskCard task={d.parent} />
            </div>
          )}

          <div className="card" data-tour="linked">
            <div className="row between">
              <h3 style={{ margin: 0 }}>⛓ Tareas vinculadas ({d.children.length})</h3>
              {d.can.link && <button className="btn sm primary" onClick={() => setLinking(true)}>+ Pedir a otra persona</button>}
            </div>
            <p className="tiny muted">Si necesitas que alguien termine algo antes, pídeselo aquí. Te avisaremos cuando esté listo.</p>
            <div className="grid">{d.children.map((c) => <TaskCard key={c.id} task={c} showProject={false} />)}</div>
          </div>

          <div className="card" data-tour="comments">
            <h3 style={{ marginTop: 0 }}>💬 Comentarios</h3>
            {d.comments.length === 0 && <p className="small muted">Todavía no hay comentarios.</p>}
            {d.comments.map((c) => (
              <div key={c.id} className="row" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                <Avatar person={{ name: c.user.name, email: '', picture: c.user.picture }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small"><strong>{c.user.name}</strong> <span className="tiny muted">{relative(c.created_at)}</span></div>
                  <RichText text={c.body} />
                </div>
              </div>
            ))}
            {d.can.comment && (
              <form onSubmit={sendComment}>
                <textarea ref={commentRef} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escribe un comentario (se avisa al supervisor)…" style={{ minHeight: 70 }} />
                <div className="row between" style={{ marginTop: 6 }}>
                  <ImageUpload onUploaded={(u, n) => setComment((c) => (c ? c + '\n' : '') + `![${n}](${u})`)} />
                  <button className="btn primary sm" disabled={sending || !comment.trim()}>Comentar</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card" data-tour="people">
            <PersonRow label="Asignada a" p={t.assignee} />
            <PersonRow label="Supervisor (recibe el aviso al terminar)" p={t.supervisor} />
            <PersonRow label="Creada por" p={t.created_by} />
          </div>
          <div className="card small">
            <div className="tiny muted">Recordatorio</div>
            <div>{reminderLabel(t.reminder_every_minutes)}</div>
            {t.reminder_start_at && t.reminder_every_minutes && <div className="tiny muted">Desde {formatDateTime(t.reminder_start_at, tz)}</div>}
            {t.next_checkin_at && t.status !== 'completada' && <div className="tiny muted">Próximo: {relative(t.next_checkin_at)}</div>}
            {t.defer_count > 0 && <div className="tiny" style={{ marginTop: 6 }}>⏰ Aplazada {t.defer_count} {t.defer_count === 1 ? 'vez' : 'veces'}</div>}
            {t.status === 'aplazada' && t.deferred_until && <div className="tiny muted">Aplazada hasta {formatDateTime(t.deferred_until, tz)}</div>}
            {t.last_checkin_at && <div className="tiny muted" style={{ marginTop: 6 }}>Última respuesta: {t.last_checkin_response} ({relative(t.last_checkin_at)})</div>}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Historial</h3>
            {d.activity.map((a, i) => (
              <div key={i} className="tiny" style={{ marginBottom: 6 }}>
                <strong>{a.user}</strong> {ACTION_LABEL[a.action] || a.action}
                {a.detail && <span className="muted"> — {a.detail}</span>}
                <div className="muted">{formatDateTime(a.created_at, tz)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && <TaskForm mode="edit" task={t} onClose={() => setEditing(false)} onSaved={load} />}
      {linking && <TaskForm mode="linked" parent={t} onClose={() => setLinking(false)} onSaved={load} />}
      {deleting && (
        <Confirm title="Eliminar tarea" text={<p>¿Seguro que quieres eliminar <strong>{t.title}</strong>? Esto no se puede deshacer.</p>}
          confirmLabel="Eliminar" onConfirm={remove} onCancel={() => setDeleting(false)} />
      )}
    </>
  );
}

export default function TaskDetailPage() {
  return (
    <AppShell page="tarea">
      <TaskDetailContent />
    </AppShell>
  );
}
