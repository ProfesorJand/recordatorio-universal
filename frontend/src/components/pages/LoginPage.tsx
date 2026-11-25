import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { GOOGLE_CLIENT_ID, queryParam, url } from '../../lib/config';
import type { User } from '../../lib/types';
import { $session, clearSession, setSession } from '../../stores/session';

/**
 * Inicio de sesión con "Google Identity Services".
 * Google nos entrega un "credential" (un JWT firmado) y el backend PHP lo
 * verifica. Solo entran los correos que el admin autorizó.
 */
export default function LoginPage() {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(queryParam('expirada') ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ($session.get().token) {
      window.location.href = url('/tareas/');
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      setError('Falta configurar PUBLIC_GOOGLE_CLIENT_ID (ver README).');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          locale: 'es',
          width: 280,
        });
      }
    };
    script.onerror = () => setError('No se pudo cargar el botón de Google. Revisa tu conexión.');
    document.head.appendChild(script);
  }, []);

  async function onCredential(resp: { credential: string }) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/google', { method: 'POST', body: { credential: resp.credential } });
      setSession(r.token, r.user);
      window.location.href = url('/tareas/');
    } catch (e) {
      // Correo no autorizado o suspendido: lo dejamos fuera
      clearSession();
      window.google?.accounts?.id?.disableAutoSelect?.();
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
      setBusy(false);
    }
  }

  return (
    <div className="center-screen" style={{ background: 'linear-gradient(160deg,#e8f1fc,#f4f5f7 60%)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '2rem 1.5rem' }}>
        <img src={url('/favicon.svg')} alt="" width={56} height={56} />
        <h1 style={{ margin: '0.75rem 0 0.25rem' }}>Recordatorio Universal</h1>
        <p className="muted" style={{ marginTop: 0 }}>Tareas compartidas con recordatorios para que nada se olvide.</p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 1rem', minHeight: 44 }}>
          {busy ? <span className="muted">Entrando…</span> : <div ref={btnRef} />}
        </div>
        {error && (
          <div className="small" role="alert" style={{ background: '#fdecec', color: '#b22a2b', padding: '0.75rem', borderRadius: 10 }}>
            {error}
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: '1.25rem' }}>Solo pueden entrar los correos autorizados por el administrador.</p>
      </div>
    </div>
  );
}
