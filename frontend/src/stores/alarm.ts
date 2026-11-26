import { atom } from 'nanostores';
import type { AppNotification } from '../lib/types';
import { playUrgent } from '../lib/sound';

/**
 * Alarma para lo urgente: suena cada ALARM_EVERY_MS mientras haya una alerta
 * urgente sin atender. Se detiene cuando la persona:
 *  - abre la tarea (la alerta queda "leída"), o
 *  - responde Ya lo hice / Sigo / Aplazar, o
 *  - la silencia por unos minutos (snooze).
 */
export const ALARM_EVERY_MS = 2 * 60 * 1000;

/** Hasta cuándo está silenciada (timestamp ms). Se guarda para que valga en todas las páginas. */
export const $snoozeUntil = atom<number>(readNumber('ru_snooze_until'));

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export function snooze(minutes: number) {
  const until = Date.now() + minutes * 60 * 1000;
  $snoozeUntil.set(until);
  try {
    localStorage.setItem('ru_snooze_until', String(until));
  } catch {
    /* ignorar */
  }
}

export function unsnooze() {
  $snoozeUntil.set(0);
  try {
    localStorage.removeItem('ru_snooze_until');
  } catch {
    /* ignorar */
  }
}

/** ¿Esta notificación debe hacer sonar la alarma? */
export function isUrgentAlarm(n: AppNotification): boolean {
  if (n.read || !n.actionable || !n.task || n.task.status === 'completada') return false;
  return n.task.priority === 'urgente' || n.type === 'vencida' || n.type === 'vence_1h';
}

/** Se llama cada pocos segundos desde AppShell. */
export function alarmTick(list: AppNotification[]) {
  if (!list.some(isUrgentAlarm)) return;
  if (Date.now() < $snoozeUntil.get()) return;
  const last = readNumber('ru_alarm_last');
  if (Date.now() - last < ALARM_EVERY_MS) return;
  try {
    localStorage.setItem('ru_alarm_last', String(Date.now()));
  } catch {
    /* ignorar */
  }
  playUrgent();
}
