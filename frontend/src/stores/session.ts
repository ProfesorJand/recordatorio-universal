import { atom, computed } from 'nanostores';
import type { User } from '../lib/types';
import { browserTz } from '../lib/time';

/**
 * Sesión global con nanostores. Se guarda en localStorage para que al
 * recargar la página no haya que iniciar sesión de nuevo.
 */
interface Session {
  token: string | null;
  user: User | null;
}

const KEY = 'ru_session';

function load(): Session {
  if (typeof localStorage === 'undefined') return { token: null, user: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignorar */
  }
  return { token: null, user: null };
}

export const $session = atom<Session>(load());

$session.listen((s) => {
  try {
    if (s.token) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado, etc. */
  }
});

export const $user = computed($session, (s) => s.user);

export function setSession(token: string, user: User) {
  $session.set({ token, user });
}

export function setUser(user: User) {
  $session.set({ ...$session.get(), user });
}

export function clearSession() {
  $session.set({ token: null, user: null });
}

/** ¿El usuario actual tiene este permiso? */
export function can(perm: string): boolean {
  return !!$session.get().user?.permissions.includes(perm);
}

/** Zona horaria del usuario (o la del navegador si todavía no la eligió). */
export function myTz(): string {
  return $session.get().user?.timezone || browserTz();
}
