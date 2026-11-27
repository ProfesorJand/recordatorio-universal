import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { api } from '../lib/api';
import { relative } from '../lib/time';
import { go } from '../lib/nav';
import { $notifications, $unread, loadNotifications } from '../stores/app';
import AlertActions, { isReviewAlert } from './AlertActions';

export default function NotificationBell() {
  const list = useStore($notifications);
  const unread = useStore($unread);
  const [open, setOpen] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Por defecto solo se ven los no leídos; los leídos quedan guardados 14 días
  const shown = showRead ? list : list.filter((n) => !n.read);
  const readCount = list.filter((n) => n.read).length;

  async function dismiss(id: number) {
    $notifications.set($notifications.get().map((n) => (n.id === id ? { ...n, read: true } : n))); // se quita al instante
    $unread.set(Math.max(0, $unread.get() - 1));
    await api(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    loadNotifications();
  }

  async function markAll() {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    loadNotifications();
  }

  async function openTask(id: number, taskId?: number) {
    await api(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    if (taskId) {
      setOpen(false);
      go(`/tarea/?id=${taskId}`);
    }
    else loadNotifications();
  }

  return (
    <div className="dropdown bell" ref={ref} data-tour="bell">
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-label={`Avisos (${unread} sin leer)`}>
        🔔
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="menu notif-panel">
          <div className="row between" style={{ padding: '0.25rem 0.4rem 0.5rem' }}>
            <strong>Avisos</strong>
            <button className="btn sm ghost" style={{ width: 'auto' }} onClick={markAll}>Marcar leídos</button>
          </div>
          {shown.length === 0 && <div className="empty small">{showRead ? 'No tienes avisos' : 'No tienes avisos sin leer 🎉'}</div>}
          {shown.map((n) => (
            <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} style={{ position: 'relative', paddingRight: 28 }}>
              {!n.read && (
                <button className="btn sm ghost" title="Quitar (marcar como leído)" aria-label="Quitar aviso"
                  style={{ position: 'absolute', top: 4, right: 2, width: 'auto', padding: '0 6px' }}
                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}>✕</button>
              )}
              <div style={{ cursor: 'pointer' }} onClick={() => openTask(n.id, n.task?.id)}>
                <div className="small"><strong>{n.title}</strong></div>
                {n.body && <div className="tiny muted" style={{ marginTop: 2 }}>{n.body.length > 160 ? n.body.slice(0, 160) + '…' : n.body}</div>}
                <div className="tiny muted" style={{ marginTop: 2 }}>{relative(n.created_at)}</div>
              </div>
              {n.task && (n.actionable || isReviewAlert(n)) && (
                <div style={{ marginTop: 6 }}>
                  <AlertActions n={n} />
                </div>
              )}
            </div>
          ))}
          <div style={{ textAlign: 'center', padding: '0.4rem 0 0.1rem' }}>
            <button className="btn sm ghost" style={{ width: 'auto', display: 'inline-block' }} onClick={() => setShowRead(!showRead)}>
              {showRead ? 'Ocultar los leídos' : `Ver también los leídos (${readCount})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
