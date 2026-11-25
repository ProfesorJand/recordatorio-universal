import { atom } from 'nanostores';
import { api } from '../lib/api';
import type { AppNotification, Person } from '../lib/types';

/** Se incrementa después de cada cambio para que las listas se recarguen. */
export const $refresh = atom(0);
export function bumpRefresh() {
  $refresh.set($refresh.get() + 1);
}

// ------------------------------------------------------------ notificaciones
export const $notifications = atom<AppNotification[]>([]);
export const $unread = atom(0);

const shown = new Set<number>();

export async function loadNotifications() {
  try {
    const r = await api<{ notifications: AppNotification[]; unread: number }>('/notifications');
    $notifications.set(r.notifications);
    $unread.set(r.unread);
    // Aviso del navegador (solo si el usuario lo permitió y la pestaña está abierta)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const n of r.notifications) {
        if (!n.read && !shown.has(n.id)) {
          shown.add(n.id);
          if (document.hidden) new Notification(n.title, { body: n.body || undefined });
        }
      }
    } else {
      r.notifications.forEach((n) => shown.add(n.id));
    }
  } catch {
    /* sin conexión: se reintenta en el próximo ciclo */
  }
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
