import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $timer, confirmTimer, liveSeconds, stopTimer } from '../stores/timer';
import { fmtClock } from '../lib/time';
import { go } from '../lib/nav';
import { playNotify } from '../lib/sound';
import { Modal } from './ui';

/** Fuerza un re-render cada segundo (para que el reloj avance) */
function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** Cronómetro de la barra superior: "⏱ 1:23:45 · Tarea  ⏸" */
export function TimerBadge({ compact }: { compact?: boolean }) {
  const t = useStore($timer);
  useTick(t.running);
  if (!t.running || !t.task) return null;
  return (
    <span className="timer-badge" title={t.out_of_hours ? 'Contando fuera de tu horario' : 'Tiempo trabajado en esta tarea'}>
      <button className="btn sm ghost" style={{ padding: '2px 6px', fontVariantNumeric: 'tabular-nums' }} onClick={() => go(`/tarea/?id=${t.task!.id}`)}>
        ⏱ {fmtClock(liveSeconds(t))}{t.out_of_hours ? ' 🌙' : ''}
        {!compact && <span className="timer-title"> · {t.task.title}</span>}
      </button>
      <button className="btn sm ghost" style={{ padding: '2px 6px' }} onClick={stopTimer} aria-label="Pausar cronómetro" title="Pausar">⏸</button>
    </span>
  );
}

/** "¿Sigues trabajando?" (fin del horario o cada 2 horas) */
export function TimerPrompt() {
  const t = useStore($timer);
  const p = t.running ? t.prompt : null;
  const announced = useRef<string | null>(null);
  useTick(!!p);

  useEffect(() => {
    if (p && announced.current !== p.pause_at) {
      announced.current = p.pause_at;
      playNotify();
    }
  }, [p]);

  if (!p || !t.task) return null;
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const left = Math.max(0, Math.round((new Date(p.deadline).getTime() - Date.now()) / 60000));
  return (
    <Modal title={p.kind === 'horario' ? '🌙 Terminó tu horario de trabajo' : '⏱ ¿Sigues con esta tarea?'} onClose={() => {}}>
      <p style={{ marginTop: 0 }}>
        {p.kind === 'horario'
          ? <>Tu horario terminó a las <strong>{hhmm(p.pause_at)}</strong> y el cronómetro sigue corriendo en <strong>{t.task.title}</strong>. ¿Sigues trabajando?</>
          : <>Llevas 2 horas con el cronómetro en <strong>{t.task.title}</strong>. ¿Sigues trabajando en ella?</>}
      </p>
      <p className="small muted">
        Si no respondes en {left} min, se pausa solo y se cuenta hasta las {hhmm(p.pause_at)}.
        {p.kind === 'horario' && ' Si dices que sí, lo que sigas trabajando se marca como fuera de horario.'}
      </p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => confirmTimer(false)}>⏸ No, pausar</button>
        <button className="btn primary" onClick={() => confirmTimer(true)}>Sí, sigo trabajando</button>
      </div>
    </Modal>
  );
}
