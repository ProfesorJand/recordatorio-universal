import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import { Loading } from '../ui';
import { api } from '../../lib/api';
import { url } from '../../lib/config';
import type { Task } from '../../lib/types';
import { isOverdue, priorityInfo, sortTasks } from '../../lib/priority';
import { formatDateTime, toLocalInput } from '../../lib/time';
import { $refresh, toastError } from '../../stores/app';
import { myTz } from '../../stores/session';

type Scope = 'mine' | 'supervising' | 'all';
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** "2026-12-17" del día en que vence la tarea, en la zona de quien mira */
const dayKey = (iso: string, tz: string) => toLocalInput(iso, tz).slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

function CalendarContent() {
  const refresh = useStore($refresh);
  const tz = myTz();
  const todayKey = dayKey(new Date().toISOString(), tz);
  const [year, setYear] = useState(+todayKey.slice(0, 4));
  const [month, setMonth] = useState(+todayKey.slice(5, 7)); // 1-12
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('ru_cal_scope') as Scope) || 'mine');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('ru_cal_scope', scope);
    api<{ tasks: Task[] }>(`/tasks?scope=${scope}&include_completed=1`).then((r) => setTasks(r.tasks)).catch(toastError);
  }, [scope, refresh]);

  // Tareas agrupadas por día
  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks || []) {
      if (!t.due_at) continue;
      (map[dayKey(t.due_at, tz)] ||= []).push(t);
    }
    for (const k in map) map[k] = sortTasks(map[k]);
    return map;
  }, [tasks, tz]);

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
    // si la última semana es entera del mes siguiente, se quita
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out;
  }, [year, month]);

  function move(delta: number) {
    const m = month - 1 + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12 + 1);
    setSelected(null);
  }

  const monthName = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const noDue = (tasks || []).filter((t) => !t.due_at && t.status !== 'completada').length;
  const monthKeys = cells.filter((c) => c.inMonth && byDay[c.key]).map((c) => c.key);
  const agendaKeys = selected ? [selected] : monthKeys;

  return (
    <>
      <div className="row between" style={{ marginBottom: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>Calendario de entregas</h1>
        <div className="row" data-tour="cal-nav">
          <button className="btn sm" onClick={() => move(-1)} aria-label="Mes anterior">←</button>
          <strong style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{monthName}</strong>
          <button className="btn sm" onClick={() => move(1)} aria-label="Mes siguiente">→</button>
          <button className="btn sm" onClick={() => { setYear(+todayKey.slice(0, 4)); setMonth(+todayKey.slice(5, 7)); setSelected(todayKey); }}>Hoy</button>
        </div>
      </div>

      <div className="tabs">
        <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>👤 Mis tareas</button>
        <button className={scope === 'supervising' ? 'active' : ''} onClick={() => setScope('supervising')}>👁 Superviso</button>
        <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>🌐 Todas</button>
      </div>

      {tasks === null ? <Loading /> : (
        <>
          <div className="cal" data-tour="calendar">
            {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {cells.map((c) => {
              const list = byDay[c.key] || [];
              return (
                <button key={c.key} type="button"
                  className={`cal-cell ${c.inMonth ? '' : 'out'} ${c.key === todayKey ? 'today' : ''} ${selected === c.key ? 'sel' : ''}`}
                  onClick={() => setSelected(selected === c.key ? null : c.key)}>
                  <span className="cal-day">{c.day}</span>
                  {list.slice(0, 3).map((t) => (
                    <span key={t.id} className={`cal-task ${t.status === 'completada' ? 'done' : ''} ${isOverdue(t) ? 'late' : ''}`}
                      style={{ borderLeftColor: priorityInfo(t.priority).color }} title={t.title}>
                      {t.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="tiny muted">+{list.length - 3} más</span>}
                </button>
              );
            })}
          </div>
          {noDue > 0 && <p className="tiny muted">{noDue} tareas abiertas no tienen fecha límite y no aparecen aquí.</p>}

          <h2>{selected ? formatDateTime(selected + 'T12:00:00Z', 'UTC').split(',')[0] + ' ' + selected.slice(8) + '/' + selected.slice(5, 7) : 'Entregas del mes'}</h2>
          {agendaKeys.length === 0 && <div className="empty card">No hay entregas {selected ? 'ese día' : 'este mes'}.</div>}
          {agendaKeys.map((k) => (
            <div key={k} style={{ marginBottom: '0.75rem' }}>
              {!selected && <div className="small" style={{ fontWeight: 600, margin: '0.5rem 0 0.35rem' }}>{k.slice(8)}/{k.slice(5, 7)}</div>}
              <div className="grid">
                {(byDay[k] || []).map((t) => (
                  <a key={t.id} href={url(`/tarea/?id=${t.id}`)} className={`card task p-${t.priority} ${t.status === 'completada' ? 'done' : ''}`} style={{ textDecoration: 'none', color: 'inherit', padding: '0.6rem 0.9rem' }}>
                    <div style={{ flex: 1 }}>
                      <div className="small"><strong>{t.status === 'completada' ? '✓ ' : ''}{t.title}</strong></div>
                      <div className="tiny muted">
                        {toLocalInput(t.due_at!, tz).slice(11)} · {priorityInfo(t.priority).label} · {t.assignee?.name || 'Sin asignar'} · {t.project.name}
                        {isOverdue(t) && <strong style={{ color: '#b22a2b' }}> · vencida</strong>}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </>
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
