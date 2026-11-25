// Se leen de .env (local) o de las variables del repositorio en GitHub Actions
export const API_URL: string = (import.meta.env.PUBLIC_API_URL || 'https://api.guiadeparche.com/recordatorio').replace(/\/$/, '');
export const GOOGLE_CLIENT_ID: string = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || '';

/** Arma una URL interna respetando el "base" de GitHub Pages (/recordatorio-universal). */
export function url(path: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : '/' + path);
}

/** Lee un parámetro de la URL (?id=5) */
export function queryParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}
