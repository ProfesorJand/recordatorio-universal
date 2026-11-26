/**
 * Utilidades de zona horaria SIN librerías, solo con Intl (incluido en el navegador).
 * - La API devuelve fechas en UTC ("2026-11-30T23:00:00Z").
 * - Se muestran en la zona del perfil de quien mira.
 * - Si quien fijó la fecha está en otra zona, también mostramos su hora.
 */

export function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function allTimezones(): string[] {
  const anyIntl = Intl as any;
  if (typeof anyIntl.supportedValuesOf === 'function') return anyIntl.supportedValuesOf('timeZone');
  return [browserTz()];
}

/** "lun 30/11 20:00" en la zona indicada */
export function formatDateTime(iso: string | null | undefined, tz: string, withYear = false): string {
  if (!iso) return '';
  const f = new Intl.DateTimeFormat('es', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: withYear ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return f.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es', { timeZone: tz, day: '2-digit', month: 'short' }).format(new Date(iso));
}

/** Partes de la fecha "de pared" en una zona (año, mes, día, hora, minuto). */
function wallParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** ISO UTC -> "2026-11-30T20:00" para un <input type="datetime-local"> en la zona tz */
export function toLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const p = wallParts(new Date(iso), tz);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/** Diferencia en minutos de la zona respecto a UTC en esa fecha (ej: Buenos Aires = -180) */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const p = wallParts(at, tz);
  const asUtc = Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.min);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** "UTC-03:00" */
export function tzLabel(tz: string): string {
  const off = tzOffsetMinutes(tz);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** "+2 h" / "-1 h 30 min" diferencia de la zona other respecto a mine */
export function tzDifference(mine: string, other: string): string {
  const diff = tzOffsetMinutes(other) - tzOffsetMinutes(mine);
  if (diff === 0) return 'misma hora';
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${diff > 0 ? '+' : '-'}${h ? h + ' h' : ''}${m ? ' ' + m + ' min' : ''}`.trim();
}

/** "en 3 h", "hace 2 días" */
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60000);
  const abs = Math.abs(diffMin);
  let txt: string;
  if (abs < 1) txt = 'un momento';
  else if (abs < 60) txt = `${abs} min`;
  else if (abs < 60 * 24) txt = `${Math.round(abs / 60)} h`;
  else {
    const d = Math.round(abs / 1440);
    txt = `${d} ${d === 1 ? 'día' : 'días'}`;
  }
  return diffMin >= 0 ? `en ${txt}` : `hace ${txt}`;
}

export function shortTz(tz: string): string {
  return tz.split('/').pop()!.replace(/_/g, ' ');
}

/** 7530 -> "2 h 05 min", 300 -> "5 min" */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 0 ? '0 min' : '< 1 min';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** 7530 -> "2:05:30" (para el cronómetro) */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
