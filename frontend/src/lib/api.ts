import { API_URL, url } from './config';
import { $session, clearSession } from '../stores/session';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
}

/** Llama a la API PHP agregando el token de sesión. */
export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const token = $session.get().token;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
    headers['X-Auth-Token'] = token; // respaldo si el hosting borra Authorization
  }
  let payload: BodyInit | undefined;
  if (opts.form) {
    payload = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: opts.method || 'GET', headers, body: payload });
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu internet.', 0);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearSession();
      window.location.href = url('/?expirada=1');
    }
    throw new ApiError(data?.error || `Error ${res.status}`, res.status);
  }
  return data as T;
}

/** Sube una imagen y devuelve su URL pública. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  // Ojo: no usar un nombre parecido a la carpeta "uploads/" (algunos Apache redirigen y rompe CORS)
  const r = await api<{ url: string }>('/subir-imagen', { method: 'POST', form });
  return r.url;
}
