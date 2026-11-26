import { atom } from 'nanostores';
import { api } from '../lib/api';
import { toast, toastError, bumpRefresh } from './app';

/**
 * Estado del cronómetro de la persona (uno solo a la vez).
 * El servidor es quien manda: aquí solo guardamos lo último que respondió
 * y la hora en que lo recibimos, para que el reloj avance en pantalla.
 */
export interface TimerState {
  running: boolean;
  entry_id?: number;
  task?: { id: number; title: string };
  started_at?: string;
  out_of_hours?: boolean;
  task_seconds?: number; // total trabajado en esa tarea al momento de la respuesta
  prompt?: { kind: 'horario' | 'seguir'; pause_at: string; deadline: string } | null;
  notice?: string | null;
}

export const $timer = atom<TimerState & { fetchedAt: number }>({ running: false, fetchedAt: Date.now() });

export function setTimer(s: TimerState) {
  $timer.set({ ...s, fetchedAt: Date.now() });
  if (s.notice) toast('⏱ ' + s.notice);
}

export async function loadTimer(heartbeat = false) {
  try {
    setTimer(await api<TimerState>(heartbeat ? '/timer/heartbeat' : '/timer', heartbeat ? { method: 'POST' } : {}));
  } catch {
    /* sin conexión: se reintenta */
  }
}

export async function startTimer(taskId: number) {
  try {
    const r = await api<TimerState & { paused: { id: number; title: string } | null }>('/timer/start', { method: 'POST', body: { task_id: taskId } });
    setTimer(r);
    toast(r.paused ? `⏱ Pausamos "${r.paused.title}" y empezamos a contar esta` : '⏱ Cronómetro iniciado');
    bumpRefresh();
  } catch (e) {
    toastError(e);
  }
}

export async function stopTimer() {
  try {
    setTimer(await api<TimerState>('/timer/stop', { method: 'POST' }));
    toast('⏸ Cronómetro pausado');
    bumpRefresh();
  } catch (e) {
    toastError(e);
  }
}

export async function confirmTimer(yes: boolean) {
  try {
    setTimer(await api<TimerState>('/timer/confirm', { method: 'POST', body: { answer: yes ? 'si' : 'no' } }));
    bumpRefresh();
  } catch (e) {
    toastError(e);
  }
}

/** Segundos que muestra el reloj ahora mismo */
export function liveSeconds(t: TimerState & { fetchedAt: number }): number {
  return (t.task_seconds || 0) + (t.running ? (Date.now() - t.fetchedAt) / 1000 : 0);
}
