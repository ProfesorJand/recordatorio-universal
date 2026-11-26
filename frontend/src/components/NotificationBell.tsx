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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

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
          {list.length === 0 && <div className="empty small">No tienes avisos 🎉</div>}
          {list.map((n) => (
            <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
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
        </div>
      )}
    </div>
  );
}
