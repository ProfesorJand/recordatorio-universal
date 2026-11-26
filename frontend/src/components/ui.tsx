import { useEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { $toasts } from '../stores/app';
import { myTz } from '../stores/session';
import type { Priority, Status, Task } from '../lib/types';
import { priorityInfo, STATUS_ICON, STATUS_LABEL, isOverdue, isDueSoon } from '../lib/priority';
import { formatDateTime, relative, shortTz, tzDifference } from '../lib/time';

export function Spinner() {
  return <div className="spinner" aria-label="Cargando" />;
}

export function Loading() {
  return (
    <div className="empty">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title} style={wide ? { maxWidth: 860 } : undefined}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, text, confirmLabel = 'Continuar', onConfirm, onCancel }: {
  title: string; text: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ marginBottom: '1rem' }}>{text}</div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Volver</button>
        <button className="btn primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

type AvatarPerson = { name?: string | null; email?: string | null; picture?: string | null };

export function Avatar({ person, size = 26 }: { person: AvatarPerson | null | undefined; size?: number }) {
  if (!person) return <span className="avatar" style={{ width: size, height: size }}>?</span>;
  const initials = (person.name || person.email || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size }} title={person.name || person.email || ''}>
      {person.picture ? <img src={person.picture} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

/** Chip de prioridad. Si la prioridad subió por la cercanía de la fecha límite, lo indica con ⬆ */
export function PriorityChip({ p, original }: { p: Priority; original?: Priority }) {
  const info = priorityInfo(p);
  const raised = !!original && original !== p;
  return (
    <span className="chip solid" style={{ background: info.color }}
      title={raised ? `Era ${priorityInfo(original!).label}; subió porque se acerca la fecha límite` : undefined}>
      {p === 'urgente' ? '🔥 ' : ''}{info.label}{raised ? ' ⬆' : ''}
    </span>
  );
}

export function StatusChip({ s }: { s: Status }) {
  return <span className="chip">{STATUS_ICON[s]} {STATUS_LABEL[s]}</span>;
}

/**
 * Muestra la fecha límite en la hora de quien mira, y si quien la fijó
 * está en otra zona horaria, también su hora.
 */
export function DueDate({ task, compact }: { task: Pick<Task, 'due_at' | 'due_tz' | 'status' | 'priority' | 'created_at'>; compact?: boolean }) {
  if (!task.due_at) return null;
  const tz = myTz();
  const overdue = isOverdue(task as Task);
  const soon = isDueSoon(task as Task);
  const cls = overdue ? 'chip overdue' : soon ? 'chip soon' : 'chip';
  const other = task.due_tz && task.due_tz !== tz ? task.due_tz : null;
  return (
    <span className={cls} title={other ? `Fijada en ${other}: ${formatDateTime(task.due_at, other)} (${tzDifference(tz, other)} respecto a ti)` : undefined}>
      📅 {formatDateTime(task.due_at, tz)}
      {task.status !== 'completada' && <> · {overdue ? 'venció ' : ''}{relative(task.due_at)}</>}
      {!compact && other && <span style={{ fontWeight: 400 }}> · {formatDateTime(task.due_at, other)} en {shortTz(other)}</span>}
    </span>
  );
}

export function Toasts() {
  const toasts = useStore($toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty card">{children}</div>;
}
