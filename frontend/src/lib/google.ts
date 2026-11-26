import { GOOGLE_CLIENT_ID } from './config';

/** Permisos de solo lectura que pedimos a Google */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
].join(' ');

let gisPromise: Promise<void> | null = null;

/** Carga el script de Google Identity Services (una sola vez). */
export function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('No se pudo cargar Google'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/**
 * Abre la ventana de Google para pedir permiso al calendario y devuelve un "code"
 * que el backend cambia por el token. Debe llamarse directo desde un clic
 * (y con loadGis() ya resuelto), si no el navegador bloquea la ventana.
 */
export function requestCalendarCode(email?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPES,
      ux_mode: 'popup',
      login_hint: email,
      callback: (r: { code?: string; error?: string }) => (r.code ? resolve(r.code) : reject(new Error(r.error || 'Cancelado'))),
      error_callback: (e: { type?: string }) =>
        reject(new Error(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google' : 'El navegador bloqueó la ventana de Google')),
    });
    client.requestCode();
  });
}
