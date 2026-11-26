import { useEffect, useRef, useState, type ReactNode } from 'react';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { api } from '../lib/api';
import { url } from '../lib/config';
import type { User } from '../lib/types';
import { TOURS } from '../lib/tours';
import { $session, $user, can, clearSession, setUser } from '../stores/session';
import { $notifications, $unread, loadNotifications } from '../stores/app';
import { $snoozeUntil, alarmTick, isUrgentAlarm, snooze, unsnooze } from '../stores/alarm';
import { unlockAudio } from '../lib/sound';
import { Avatar, Spinner, Toasts } from './ui';
import NotificationBell from './NotificationBell';
import { FloatingBellButton, closePip } from './FloatingBell';
import { go } from '../lib/nav';
import CheckinButtons from './CheckinButtons';
import TimezoneModal from './TimezoneModal';
import Tour from './Tour';

/** Para iniciar un tutorial desde cualquier parte (ej: página de Ayuda) */
export const $tourRequest = atom<string | null>(null);

const NAV: { key: string; href: string; label: string; perm?: string | string[] }[] = [
  { key: 'tareas', href: '/tareas/', label: '✅ Tareas' },
  { key: 'calendario', href: '/calendario/', label: '📅 Calendario' },
  { key: 'proyectos', href: '/proyectos/', label: '📁 Proyectos' },
  { key: 'estadisticas', href: '/estadisticas/', label: '📊 Estadísticas', perm: ['estadisticas.ver_individual', 'estadisticas.ver_todos'] },
  { key: 'admin_usuarios', href: '/admin/usuarios/', label: '👥 Usuarios', perm: 'usuarios.gestionar' },
  { key: 'admin_roles', href: '/admin/roles/', label: '🔐 Roles', perm: 'roles.gestionar' },
  { key: 'ayuda', href: '/ayuda/', label: '❓ Ayuda' },
];

export default function AppShell({ page, children }: { page: string; children: ReactNode }) {
  const session = useStore($session);
  const user = useStore($user);
  const notifications = useStore($notifications);
  useStore($unread);
  const tourReq = useStore($tourRequest);
  const snoozeUntil = useStore($snoozeUntil);
  const [snoozeMenu, setSnoozeMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tour, setTour] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 1) Verificar la sesión
  useEffect(() => {
    if (!session.token) {
      window.location.href = url('/');
      return;
    }
    api<{ user: User }>('/me')
      .then((r) => {
        setUser(r.user);
        setReady(true);
      })
      .catch(() => {
        /* api() ya redirige si la sesión no es válida */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Avisos cada 60 s
  useEffect(() => {
    if (!ready) return;
    loadNotifications();
    const id = setInterval(loadNotifications, 60_000);
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready]);

  // 2b) Sonido: desbloquear audio en el primer clic y revisar la alarma urgente cada 15 s
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const id = setInterval(() => alarmTick($notifications.get()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (ready) alarmTick(notifications);
  }, [ready, notifications]);

  // 3) Tutorial automático la primera vez
  useEffect(() => {
    if (!ready || !user?.timezone) return;
    const requested = sessionStorage.getItem('ru_tour'); // pedido desde la página de Ayuda
    if (requested === page) sessionStorage.removeItem('ru_tour');
    if (TOURS[page] && (requested === page || !user.tutorials_seen.includes(page))) {
      const t = setTimeout(() => setTour(page), 900);
      return () => clearTimeout(t);
    }
  }, [ready, user?.timezone, page]);

  useEffect(() => {
    if (tourReq) {
      setTour(tourReq);
      $tourRequest.set(null);
    }
  }, [tourReq]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  async function finishTour() {
    const key = tour;
    setTour(null);
    if (key && user && !user.tutorials_seen.includes(key)) {
      try {
        const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { tutorial_seen: key } });
        setUser(r.user);
      } catch {
        /* no es grave */
      }
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* igual cerramos */
    }
    clearSession();
    closePip();
    window.google?.accounts?.id?.disableAutoSelect?.();
    window.location.href = url('/');
  }

  if (!ready || !user) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }

  const alert = notifications.find(isUrgentAlarm) || notifications.find((n) => n.actionable && n.task);
  const alarmOn = !!alert && isUrgentAlarm(alert);
  const snoozed = snoozeUntil > Date.now();
  const visibleNav = NAV.filter((n) => !n.perm || (Array.isArray(n.perm) ? n.perm.some(can) : can(n.perm)));

  return (
    <>
      <header className="topbar">
        <a className="brand" href={url('/tareas/')}>
          <img src={url('/favicon.svg')} alt="" /> Recordatorio
        </a>
        <nav className="nav" data-tour="nav">
          {visibleNav.map((n) => (
            <a key={n.key} href={url(n.href)} className={page === n.key || (page === 'tarea' && n.key === 'tareas') || (page === 'proyecto' && n.key === 'proyectos') ? 'active' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
        <FloatingBellButton />
        <NotificationBell />
        <div className="dropdown" ref={menuRef}>
          <button className="btn ghost" style={{ padding: 4 }} onClick={() => setMenu(!menu)} aria-label="Mi cuenta" data-tour="profile-link">
            <Avatar person={user} size={32} />
          </button>
          {menu && (
            <div className="menu">
              <div style={{ padding: '0.5rem 0.6rem' }}>
                <strong>{user.name || user.email}</strong>
                <div className="tiny muted">{user.email} · {user.role.name}</div>
              </div>
              <button onClick={() => go('/perfil/')}>⚙️ Mi perfil y horario</button>
              <button onClick={logout}>🚪 Cerrar sesión</button>
            </div>
          )}
        </div>
      </header>

      {alert && alert.task && (
        <div className={`alert-bar ${alarmOn ? 'urgent' : ''}`} role="alert">
          <div className="inner">
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>{alert.title}</strong>
              {alert.body && <span className="small muted"> — {alert.body}</span>}
            </span>
            <CheckinButtons taskId={alert.task.id} status={alert.task.status} />
            <a className="btn sm ghost" href={url(`/tarea/?id=${alert.task.id}`)}>Ver tarea</a>
            {alarmOn && (
              <div className="dropdown">
                <button className="btn sm" onClick={() => setSnoozeMenu(!snoozeMenu)} title="La alarma suena cada 2 minutos hasta que veas la tarea">
                  {snoozed ? `🔕 Silenciada hasta ${new Date(snoozeUntil).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : '🔔 Silenciar ▾'}
                </button>
                {snoozeMenu && (
                  <div className="menu">
                    {[5, 15, 30, 60].map((m) => (
                      <button key={m} onClick={() => { snooze(m); setSnoozeMenu(false); }}>Silenciar {m} minutos</button>
                    ))}
                    {snoozed && <button onClick={() => { unsnooze(); setSnoozeMenu(false); }}>🔔 Volver a activar</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="container">{children}</main>

      {!user.timezone && <TimezoneModal />}
      {tour && TOURS[tour] && <Tour steps={TOURS[tour]} onFinish={finishTour} />}
      <Toasts />
    </>
  );
}

declare global {
  interface Window {
    google?: any;
  }
}
