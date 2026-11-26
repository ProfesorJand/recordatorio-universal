import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import TaskForm from '../TaskForm';
import GoogleCalendarBar, { type GoogleStatus } from '../GoogleCalendarBar';
import { Loading } from '../ui';
import { api } from '../../lib/api';
import { url } from '../../lib/config';
import type { Task } from '../../lib/types';
import { isOverdue, priorityInfo, sortTasks } from '../../lib/priority';
import { formatDateTime, toLocalInput } from '../../lib/time';
import { $refresh, toastError } from '../../stores/app';
import { can, myTz } from '../../stores/session';

type Scope = 'mine' | 'supervising' | 'all';
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Elemento que viene de Google (evento, cumpleaños o tarea de Google Tasks) */
interface GItem {
  id: string;
  kind: 'event' | 'birthday' | 'gtask';
  title: string;
  all_day: boolean;
  start: string; // "2026-12-17" si es de todo el día, ISO con hora si no
  end: string | null;
  calendar: string;
  color: string;
  location?: string | null;
  description?: string | null;
  link?: string | null;
  done?: boolean;
}

const ICON: Record<GItem['kind'], string> = { event: '🗓', birthday: '🎂', gtask: '☑' };

/** "2026-12-17" del día, en la zona de quien mira */
const dayKey = (iso: string, tz: string) => toLocalInput(iso, tz).slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Días que ocupa un elemento de Google (los de todo el día pueden durar varios días) */
function gDays(g: GItem, tz: string): string[] {
  if (!g.all_day) return [dayKey(g.start, tz)];
  const out = [g.start];
  if (g.end) {
    for (let k = addDays(g.start, 1); k < g.end && out.length < 31; k = addDays(k, 1)) out.push(k);
  }
  return out;
}

function CalendarContent() {
  const refresh = useStore($refresh);
  const tz = myTz();
  const todayKey = dayKey(new Date().toISOString(), tz);
  const [year, setYear] = useState(+todayKey.slice(0, 4));
  const [month, setMonth] = useState(+todayKey.slice(5, 7)); // 1-12
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('ru_cal_scope') as Scope) || 'mine');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [gStatus, setGStatus] = useState<GoogleStatus | null>(null);
  const [gItems, setGItems] = useState<GItem[]>([]);
  const [showGoogle, setShowGoogle] = useState(() => localStorage.getItem('ru_cal_google') !== 'off');
  const [converting, setConverting] = useState<GItem | null>(null);

  useEffect(() => {
    localStorage.setItem('ru_cal_scope', scope);
    api<{ tasks: Task[] }>(`/tasks?scope=${scope}&include_completed=1`).then((r) => setTasks(r.tasks)).catch(toastError);
  }, [scope, refresh]);

  useEffect(() => {
    api<GoogleStatus>('/google/status').then(setGStatus).catch(() => setGStatus({ connected: false }));
  }, []);

  // Celdas del mes: empieza en lunes, rellena con días del mes anterior/siguiente
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
    const start = new Date(Date.UTC(year, month - 1, 1 - offset));
    const out: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      out.push({ key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1 });
    }
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out;
  }, [year, month]);

  // Eventos de Google del rango visible (con 1 día de margen por las zonas horarias)
  useEffect(() => {
    if (!gStatus?.connected || !showGoogle) return setGItems([]);
    const from = addDays(cells[0].key, -1) + 'T00:00:00Z';
    const to = addDays(cells[cells.length - 1].key, 2) + 'T00:00:00Z';
    api<{ items: GItem[] }>(`/google/events?from=${from}&to=${to}`)
      .then((r) => setGItems(r.items))
      .catch((e) => {
        setGItems([]);
        if (e.status === 409) setGStatus({ connected: false }); // venció: mostrar el botón otra vez
        toastError(e);
      });
  }, [gStatus?.connected, showGoogle, cells]);

  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks || []) {
      if (!t.due_at) continue;
      (map[dayKey(t.due_at, tz)] ||= []).push(t);
    }
    for (const k in map) map[k] = sortTasks(map[k]);
    return map;
  }, [tasks, tz]);

  const gByDay = useMemo(() => {
    const map: Record<string, GItem[]> = {};
    for (const g of gItems) for (const k of gDays(g, tz)) (map[k] ||= []).push(g);
    for (const k in map) map[k].sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start));
    return map;
  }, [gItems, tz]);

  function move(delta: number) {
    const m = month - 1 + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12 + 1);
    setSelected(null);
  }

  function toggleGoogle(v: boolean) {
    setShowGoogle(v);
    localStorage.setItem('ru_cal_google', v ? 'on' : 'off');
  }

  const monthName = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const noDue = (tasks || []).filter((t) => !t.due_at && t.status !== 'completada').length;
  const monthKeys = cells.filter((c) => c.inMonth && (byDay[c.key] || gByDay[c.key])).map((c) => c.key);
  const agendaKeys = selected ? [selected] : monthKeys;
  const gTime = (g: GItem) => (g.all_day ? 'Todo el día' : toLocalInput(g.start, tz).slice(11));

  return (
    <>
      <div className="row between" style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>Calendario</h1>
        <div className="row" data-tour="cal-nav">
          <button className="btn sm" onClick={() => move(-1)} aria-label="Mes anterior">←</button>
          <strong style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{monthName}</strong>
          <button className="btn sm" onClick={() => move(1)} aria-label="Mes siguiente">→</button>
          <button className="btn sm" onClick={() => { setYear(+todayKey.slice(0, 4)); setMonth(+todayKey.slice(5, 7)); setSelected(todayKey); }}>Hoy</button>
        </div>
      </div>

      <GoogleCalendarBar status={gStatus} onChange={setGStatus} />

      <div className="row between">
        <div className="tabs" style={{ flex: 1 }}>
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>👤 Mis tareas</button>
          <button className={scope === 'supervising' ? 'active' : ''} onClick={() => setScope('supervising')}>👁 Superviso</button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>🌐 Todas</button>
        </div>
        {gStatus?.connected && (
          <label className="check small" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" checked={showGoogle} onChange={(e) => toggleGoogle(e.target.checked)} /> Mostrar Google
          </label>
        )}
      </div>

      {tasks === null ? <Loading /> : (
        <>
          <div className="cal" data-tour="calendar">
            {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {cells.map((c) => {
              const list = byDay[c.key] || [];
              const glist = gByDay[c.key] || [];
              const shownTasks = list.slice(0, 3);
              const room = Math.max(0, 4 - shownTasks.length);
              const hidden = list.length - shownTasks.length + Math.max(0, glist.length - room);
              return (
                <button key={c.key} type="button"
                  className={`cal-cell ${c.inMonth ? '' : 'out'} ${c.key === todayKey ? 'today' : ''} ${selected === c.key ? 'sel' : ''}`}
                  onClick={() => setSelected(selected === c.key ? null : c.key)}>
                  <span className="cal-day">{c.day}</span>
                  {shownTasks.map((t) => (
                    <span key={t.id} className={`cal-task ${t.status === 'completada' ? 'done' : ''} ${isOverdue(t) ? 'late' : ''}`}
                      style={{ borderLeftColor: priorityInfo(t.effective_priority || t.priority).color }} title={t.title}>
                      {t.title}
                    </span>
                  ))}
                  {glist.slice(0, room).map((g) => (
                    <span key={g.id} className={`cal-task cal-g ${g.done ? 'done' : ''}`} style={{ borderLeftColor: g.color }} title={`${g.calendar}: ${g.title}`}>
                      {ICON[g.kind]} {g.title}
                    </span>
                  ))}
                  {hidden > 0 && <span className="tiny muted">+{hidden} más</span>}
                </button>
              );
            })}
          </div>
          <p className="tiny muted">
            Borde de color = prioridad de la tarea. Fondo punteado = viene de Google (🗓 evento, 🎂 cumpleaños, ☑ Google Tasks).
            {noDue > 0 && ` ${noDue} tareas abiertas no tienen fecha límite y no aparecen aquí.`}
          </p>

          <h2>{selected ? formatDateTime(selected + 'T12:00:00Z', 'UTC').split(',')[0] + ' ' + selected.slice(8) + '/' + selected.slice(5, 7) : 'Este mes'}</h2>
          {agendaKeys.length === 0 && <div className="empty card">No hay nada {selected ? 'ese día' : 'este mes'}.</div>}
          {agendaKeys.map((k) => (
            <div key={k} style={{ marginBottom: '0.75rem' }}>
              {!selected && <div className="small" style={{ fontWeight: 600, margin: '0.5rem 0 0.35rem' }}>{k.slice(8)}/{k.slice(5, 7)}</div>}
              <div className="grid">
                {(byDay[k] || []).map((t) => (
                  <a key={t.id} href={url(`/tarea/?id=${t.id}`)} className={`card task p-${t.priority} ${t.status === 'completada' ? 'done' : ''}`} style={{ textDecoration: 'none', color: 'inherit', padding: '0.6rem 0.9rem' }}>
                    <div style={{ flex: 1 }}>
                      <div className="small"><strong>{t.status === 'completada' ? '✓ ' : ''}{t.title}</strong></div>
                      <div className="tiny muted">
                        {toLocalInput(t.due_at!, tz).slice(11)} · {priorityInfo(t.effective_priority || t.priority).label} · {t.assignee?.name || 'Sin asignar'} · {t.project.name}
                        {isOverdue(t) && <strong style={{ color: '#b22a2b' }}> · vencida</strong>}
                      </div>
                    </div>
                  </a>
                ))}
                {(gByDay[k] || []).map((g) => (
                  <div key={g.id + k} className={`card task cal-g ${g.done ? 'done' : ''}`} style={{ borderLeftColor: g.color, padding: '0.6rem 0.9rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small"><strong>{ICON[g.kind]} {g.title}</strong></div>
                      <div className="tiny muted">{gTime(g)} · {g.calendar}{g.location ? ` · 📍 ${g.location}` : ''}</div>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      {can('tareas.crear') && g.kind !== 'birthday' && <button className="btn sm" onClick={() => setConverting(g)}>➕ Convertir en tarea</button>}
                      {g.link && <a className="btn sm ghost" href={g.link} target="_blank" rel="noopener noreferrer">Abrir en Google</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {converting && (
        <TaskForm
          mode="create"
          initial={{
            title: converting.title,
            description: [converting.description, converting.location ? '📍 ' + converting.location : '', converting.link ? 'Google: ' + converting.link : ''].filter(Boolean).join('\n'),
            due_local: converting.all_day ? converting.start + 'T09:00' : toLocalInput(converting.start, tz),
          }}
          onClose={() => setConverting(null)}
        />
      )}
    </>
  );
}

export default function CalendarPage() {
  return (
    <AppShell page="calendario">
      <CalendarContent />
    </AppShell>
  );
}
