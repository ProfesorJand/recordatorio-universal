import { atom } from 'nanostores';
import { api } from '../lib/api';
import type { AppNotification, Person } from '../lib/types';
import { playNotify } from '../lib/sound';
import { isUrgentAlarm } from './alarm';

/** Se incrementa después de cada cambio para que las listas se recarguen. */
export const $refresh = atom(0);
export function bumpRefresh() {
  $refresh.set($refresh.get() + 1);
}

// ------------------------------------------------------------ notificaciones
export const $notifications = atom<AppNotification[]>([]);
export const $unread = atom(0);

/** Avisos que ya sonaron (se guarda entre páginas para no repetir al navegar) */
function heard(): Set<number> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('ru_heard') || '[]'));
  } catch {
    return new Set();
  }
}
let firstLoad = true;

export async function loadNotifications() {
  try {
    const r = await api<{ notifications: AppNotification[]; unread: number }>('/notifications');
    $notifications.set(r.notifications);
    $unread.set(r.unread);

    const seen = heard();
    const fresh = r.notifications.filter((n) => !n.read && !seen.has(n.id));
    // En la primera carga de la sesión no sonamos por avisos viejos
    const isFirstEver = firstLoad && !sessionStorage.getItem('ru_heard');
    firstLoad = false;
    if (fresh.length && !isFirstEver) {
      const urgent = fresh.some(isUrgentAlarm);
      if (!urgent) playNotify(); // lo urgente suena con la alarma (AppShell)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        for (const n of fresh) {
          new Notification(n.title, { body: n.body || undefined, requireInteraction: isUrgentAlarm(n), tag: 'ru-' + n.id });
        }
      }
    }
    fresh.forEach((n) => seen.add(n.id));
    sessionStorage.setItem('ru_heard', JSON.stringify([...seen].slice(-300)));
  } catch {
    /* sin conexión: se reintenta en el próximo ciclo */
  }
}

/** Marca como leídos los avisos de una tarea (al abrirla): detiene su alarma. */
export async function markTaskSeen(taskId: number) {
  if (!$notifications.get().length) await loadNotifications();
  const pending = $notifications.get().filter((n) => n.task?.id === taskId && !n.read);
  if (!pending.length) return;
  await Promise.all(pending.map((n) => api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})));
  loadNotifications();
}

// --------------------------------------------------------------- directorio
export const $directory = atom<Person[]>([]);
let dirLoaded = false;
export async function loadDirectory(force = false) {
  if (dirLoaded && !force) return;
  dirLoaded = true;
  const r = await api<{ users: Person[] }>('/users/directory');
  $directory.set(r.users);
}

// ------------------------------------------------------------------- toasts
export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}
export const $toasts = atom<Toast[]>([]);
let toastId = 0;
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  const t = { id: ++toastId, text, kind };
  $toasts.set([...$toasts.get(), t]);
  setTimeout(() => $toasts.set($toasts.get().filter((x) => x.id !== t.id)), 4500);
}
export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : 'Ocurrió un error', 'error');
}
