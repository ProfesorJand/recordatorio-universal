import type { Priority, Status, Task } from './types';

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'urgente', label: 'Urgente', color: '#dc3c3d' },
  { value: 'S', label: 'Tier S', color: '#6a4ce2' },
  { value: 'A', label: 'Tier A', color: '#257de0' },
  { value: 'B', label: 'Tier B', color: '#00876f' },
  { value: 'C', label: 'Tier C', color: '#666666' },
];

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  aplazada: 'Aplazada',
  bloqueada: 'Esperando a otra tarea',
  en_revision: 'En revisión',
  completada: 'Completada',
};

export const STATUS_ICON: Record<Status, string> = {
  pendiente: '○',
  en_progreso: '◐',
  aplazada: '⏸',
  bloqueada: '⛓',
  en_revision: '🔍',
  completada: '✓',
};

/** Prioridad efectiva (la que calcula el servidor según la fecha límite) */
export const eff = (t: Pick<Task, 'priority'> & { effective_priority?: Priority }): Priority => t.effective_priority || t.priority;

export function priorityInfo(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) || PRIORITIES[3];
}

/** Horas antes de la fecha límite en que una tarea "sube" al principio de la lista */
export const DUE_SOON_HOURS = 48;

export function isOverdue(t: Task, now = Date.now()): boolean {
  return t.status !== 'completada' && !!t.due_at && new Date(t.due_at).getTime() < now;
}

export function isDueSoon(t: Task, now = Date.now()): boolean {
  if (!t.due_at || t.status === 'completada') return false;
  const ms = new Date(t.due_at).getTime() - now;
  return ms >= 0 && ms <= DUE_SOON_HOURS * 3600 * 1000;
}

/**
 * Orden de prioridad:
 *  1. Vencidas
 *  2. Urgentes
 *  3. Cualquier tier con fecha límite en las próximas 48 h
 *  4. El resto por tier: S → A → B → C
 *  Dentro de cada grupo: la fecha límite más cercana primero; sin fecha, la más antigua primero.
 */
export function rank(t: Task, now = Date.now()): number[] {
  const tierOrder: Record<Priority, number> = { urgente: 0, S: 1, A: 2, B: 3, C: 4 };
  let group: number;
  if (isOverdue(t, now)) group = 0;
  else if (eff(t) === 'urgente') group = 1;
  else if (isDueSoon(t, now)) group = 2;
  else group = 3 + tierOrder[eff(t)];
  const due = t.due_at ? new Date(t.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  return [group, due, new Date(t.created_at).getTime()];
}

export function sortTasks(tasks: Task[]): Task[] {
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    const ra = rank(a, now);
    const rb = rank(b, now);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sin recordatorio periódico' },
  { value: 60, label: 'Cada 1 hora' },
  { value: 180, label: 'Cada 3 horas' },
  { value: 360, label: 'Cada 6 horas' },
  { value: 1440, label: 'Cada día' },
  { value: 2880, label: 'Cada 2 días' },
  { value: 10080, label: 'Cada semana' },
];

export function reminderLabel(min: number | null): string {
  const found = REMINDER_OPTIONS.find((o) => o.value === min);
  if (found) return found.label;
  if (!min) return 'Sin recordatorio periódico';
  return `Cada ${min} minutos`;
}
