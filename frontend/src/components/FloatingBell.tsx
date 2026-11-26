import { useState } from 'react';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { createRoot, type Root } from 'react-dom/client';
import { $notifications, $unread } from '../stores/app';
import { $snoozeUntil, alertList, isUrgentAlarm, snooze, unsnooze } from '../stores/alarm';
import { go } from '../lib/nav';
import { relative } from '../lib/time';
import CheckinButtons from './CheckinButtons';
import { TimerBadge } from './Timer';
import { $timer, confirmTimer } from '../stores/timer';

/**
 * Ventana flotante con "Document Picture-in-Picture" (Chrome/Edge de escritorio).
 * Es una mini ventana que queda SIEMPRE encima de todo (otras pestañas y otros
 * programas). Se puede mover y cambiar de tamaño como cualquier ventana.
 * Renderizamos React dentro de ella; comparte los mismos stores (nanostores)
 * con la página, así que todo se actualiza solo.
 */
export const $pipOpen = atom(false);
let pipWin: Window | null = null;
let root: Root | null = null;

export function pipSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

export async function openPip() {
  if (pipWin && !pipWin.closed) {
    pipWin.focus();
    return;
  }
  const w: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 360, height: 230 });

  // Copiar los estilos de la página a la ventana flotante
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = w.document.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      w.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = w.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        w.document.head.appendChild(link);
      }
    }
  }
  w.document.title = 'Recordatorio';
  w.document.body.style.margin = '0';
  w.document.body.style.background = 'var(--bg)';
  const div = w.document.createElement('div');
  w.document.body.appendChild(div);

  root = createRoot(div);
  root.render(<PipPanel />);
  pipWin = w;
  $pipOpen.set(true);

  w.addEventListener('pagehide', () => {
    root?.unmount();
    root = null;
    pipWin = null;
    $pipOpen.set(false);
  });
}

export function closePip() {
  pipWin?.close();
}

/** Lo que se ve dentro de la ventana flotante */
function PipPanel() {
  const list = useStore($notifications);
  const unread = useStore($unread);
  const snoozeUntil = useStore($snoozeUntil);
  const [i, setI] = useState(0);
  const timer = useStore($timer);
  const alerts = alertList(list);
  const idx = Math.min(i, Math.max(0, alerts.length - 1));
  const alert = alerts[idx];
  const urgent = !!alert && isUrgentAlarm(alert);
  const snoozed = snoozeUntil > Date.now();
  const others = list.filter((n) => !n.read && n.id !== alert?.id).slice(0, 3);

  function openTask(id: number) {
    window.focus();
    go(`/tarea/?id=${id}`);
  }

  return (
    <div style={{ padding: '0.6rem 0.75rem', minHeight: '100vh', background: urgent ? '#fdecec' : 'var(--bg)', fontSize: 14 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <strong>🔔 {unread} {unread === 1 ? 'aviso' : 'avisos'}</strong>
        <TimerBadge compact />
        <button className="btn sm ghost" onClick={() => { window.focus(); go('/tareas/'); }}>Abrir app</button>
      </div>
      {timer.running && timer.prompt && (
        <div className="card" style={{ padding: '0.5rem', marginBottom: 6, background: '#fff8e6' }}>
          <div className="small"><strong>{timer.prompt.kind === 'horario' ? '🌙 Terminó tu horario.' : '⏱ Llevas 2 h.'}</strong> ¿Sigues con "{timer.task?.title}"?</div>
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            <button className="btn sm primary" onClick={() => confirmTimer(true)}>Sí, sigo</button>
            <button className="btn sm" onClick={() => confirmTimer(false)}>No, pausar</button>
          </div>
        </div>
      )}

      {alert && alert.task ? (
        <div className="card" style={{ padding: '0.6rem' }}>
          {alerts.length > 1 && (
            <div className="row" style={{ gap: 2, marginBottom: 4 }}>
              <button className="btn sm ghost" disabled={idx === 0} onClick={() => setI(idx - 1)}>‹</button>
              <span className="tiny">{idx + 1}/{alerts.length}</span>
              <button className="btn sm ghost" disabled={idx >= alerts.length - 1} onClick={() => setI(idx + 1)}>›</button>
            </div>
          )}
          <div className="small" style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => openTask(alert.task!.id)}>{alert.title}</div>
          {alert.body && <div className="tiny muted" style={{ margin: '2px 0 6px' }}>{alert.body.slice(0, 140)}</div>}
          <CheckinButtons taskId={alert.task.id} status={alert.task.status} />
          {urgent && (
            <div className="row" style={{ gap: 4, marginTop: 6 }}>
              {snoozed ? (
                <>
                  <span className="tiny">🔕 hasta {new Date(snoozeUntil).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                  <button className="btn sm ghost" onClick={unsnooze}>Reactivar</button>
                </>
              ) : (
                <>
                  <span className="tiny muted">Silenciar:</span>
                  {[5, 15, 30, 60].map((m) => <button key={m} className="btn sm" onClick={() => snooze(m)}>{m} min</button>)}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="small muted" style={{ padding: '0.5rem 0' }}>Todo al día ✅</div>
      )}

      {others.map((n) => (
        <div key={n.id} className="tiny" style={{ marginTop: 6, cursor: n.task ? 'pointer' : 'default' }} onClick={() => n.task && openTask(n.task.id)}>
          • {n.title} <span className="muted">({relative(n.created_at)})</span>
        </div>
      ))}
    </div>
  );
}

/** Botón para la barra superior */
export function FloatingBellButton() {
  const open = useStore($pipOpen);
  const [supported] = useState(pipSupported);
  if (!supported) return null;
  return (
    <button className="btn ghost" data-tour="pip" title={open ? 'Cerrar ventana flotante' : 'Abrir ventana flotante (siempre visible)'}
      onClick={() => (open ? closePip() : openPip().catch(() => {}))}>
      {open ? '📌✕' : '📌'}
    </button>
  );
}
