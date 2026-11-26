import { useEffect, useMemo, useState } from 'react';
import AppShell from '../AppShell';
import StackedBarChart, { type Series } from '../charts/StackedBarChart';
import LineChart from '../charts/LineChart';
import { Empty, Loading } from '../ui';
import { api } from '../../lib/api';
import type { Project } from '../../lib/types';
import { toastError } from '../../stores/app';
import { url } from '../../lib/config';
import { fmtDuration } from '../../lib/time';

type Counts = { a_tiempo: number; tarde: number; en_revision: number; en_progreso: number; pendiente: number; aplazada: number; bloqueada: number; vencida: number };
interface Stats {
  scope: 'todos' | 'individual';
  users: { user: { id: number; name: string; picture: string | null }; counts: Counts; time: { normal: number; fuera: number; manual: number } }[];
  tasks_time: { id: number; title: string; assignee: string | null; worked_seconds: number; elapsed_seconds: number; completed_at: string; late: boolean }[];
  weekly: { week: string; completed: number }[];
}

// Paleta validada para daltonismo (orden fijo, nunca se reasigna)
const SERIES: Series[] = [
  { key: 'a_tiempo', label: 'Completadas a tiempo', color: '#008a17' },
  { key: 'tarde', label: 'Completadas tarde', color: '#ee7fac' },
  { key: 'en_revision', label: 'En revisión', color: '#8a8d94' },
  { key: 'en_progreso', label: 'En progreso', color: '#257de0' },
  { key: 'pendiente', label: 'Pendientes', color: '#f2a600' },
  { key: 'aplazada', label: 'Aplazadas', color: '#6a4ce2' },
  { key: 'bloqueada', label: 'Esperando otra tarea', color: '#00b894' },
  { key: 'vencida', label: 'Vencidas', color: '#ec4647' },
];

const TIME_SERIES: Series[] = [
  { key: 'normal', label: 'Horario normal', color: '#257de0' },
  { key: 'fuera', label: 'Fuera de horario', color: '#f47230' },
  { key: 'manual', label: 'Ajustes manuales', color: '#00b894' },
];

function StatsContent() {
  const [days, setDays] = useState(30);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)).catch(() => {});
  }, []);

  useEffect(() => {
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const qs = new URLSearchParams({ from });
    if (projectId) qs.set('project_id', projectId);
    setStats(null);
    api<Stats>(`/stats?${qs}`).then(setStats).catch(toastError);
  }, [days, projectId]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    SERIES.forEach((s) => (t[s.key] = 0));
    stats?.users.forEach((u) => SERIES.forEach((s) => (t[s.key] += (u.counts as any)[s.key] || 0)));
    return t;
  }, [stats]);

  const completed = (totals.a_tiempo || 0) + (totals.tarde || 0);
  const workedTotal = (stats?.users || []).reduce((s, u) => s + u.time.normal + u.time.fuera + u.time.manual, 0);
  const avgPerTask = stats && stats.tasks_time.length
    ? stats.tasks_time.reduce((s, t) => s + t.worked_seconds, 0) / stats.tasks_time.length : 0;
  const onTimePct = completed ? Math.round((totals.a_tiempo / completed) * 100) : null;

  return (
    <>
      <h1>Estadísticas</h1>
      <div className="row" style={{ marginBottom: '1rem' }} data-tour="filters">
        <select value={days} onChange={(e) => setDays(+e.target.value)} style={{ maxWidth: 200 }}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={365}>Último año</option>
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {stats?.scope === 'individual' && <span className="chip">Solo tus estadísticas</span>}
      </div>

      {!stats ? <Loading /> : (
        <>
          <div className="tiles">
            <div className="tile"><div className="num">{completed}</div><div className="lbl">✓ Completadas en el período</div></div>
            <div className="tile"><div className="num">{onTimePct === null ? '—' : onTimePct + '%'}</div><div className="lbl">⏱ Entregadas a tiempo</div></div>
            <div className="tile"><div className="num">{(totals.pendiente || 0) + (totals.en_progreso || 0)}</div><div className="lbl">◐ Abiertas ahora</div></div>
            <div className="tile"><div className="num">{fmtDuration(workedTotal)}</div><div className="lbl">⏱ Tiempo trabajado</div></div>
            <div className="tile"><div className="num">{avgPerTask ? fmtDuration(avgPerTask) : '—'}</div><div className="lbl">⌀ Por tarea completada</div></div>
            <div className="tile"><div className="num" style={{ color: totals.vencida ? '#b22a2b' : undefined }}>{totals.vencida || 0}</div><div className="lbl">⚠️ Vencidas</div></div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }} data-tour="chart-users">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Tareas por persona</h3>
              <button className="btn sm" onClick={() => setShowTable(!showTable)}>{showTable ? '📊 Ver gráfico' : '📋 Ver tabla'}</button>
            </div>
            {/* Leyenda: siempre visible, el color nunca va solo */}
            <div className="row" style={{ margin: '0.75rem 0', gap: '0.9rem' }}>
              {SERIES.map((s) => (
                <span key={s.key} className="small row" style={{ gap: 6 }}><span className="dot" style={{ background: s.color }} />{s.label}</span>
              ))}
            </div>
            {stats.users.length === 0 ? <Empty>No hay datos en este período.</Empty> : showTable ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Persona</th>{SERIES.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
                  <tbody>
                    {stats.users.map((u) => (
                      <tr key={u.user.id}><td>{u.user.name}</td>{SERIES.map((s) => <td key={s.key}>{(u.counts as any)[s.key]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StackedBarChart series={SERIES} rows={stats.users.map((u) => ({ label: u.user.name, values: u.counts as any }))} />
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }} data-tour="chart-time">
            <h3 style={{ marginTop: 0 }}>Horas trabajadas por persona</h3>
            <div className="row" style={{ margin: '0.5rem 0', gap: '0.9rem' }}>
              {TIME_SERIES.map((s) => <span key={s.key} className="small row" style={{ gap: 6 }}><span className="dot" style={{ background: s.color }} />{s.label}</span>)}
            </div>
            {workedTotal <= 0 ? <Empty>Todavía no hay tiempo registrado en este período.</Empty> : showTable ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Persona</th><th>Horario normal</th><th>Fuera de horario</th><th>Ajustes</th><th>Total</th></tr></thead>
                  <tbody>
                    {stats.users.map((u) => (
                      <tr key={u.user.id}>
                        <td>{u.user.name}</td><td>{fmtDuration(u.time.normal)}</td><td>{fmtDuration(u.time.fuera)}</td>
                        <td>{u.time.manual < 0 ? '−' : ''}{fmtDuration(Math.abs(u.time.manual))}</td>
                        <td><strong>{fmtDuration(u.time.normal + u.time.fuera + u.time.manual)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StackedBarChart series={TIME_SERIES} rows={stats.users.map((u) => ({
                label: u.user.name,
                // en horas con 1 decimal (los ajustes negativos no se dibujan; se ven en la tabla)
                values: { normal: +(u.time.normal / 3600).toFixed(1), fuera: +(u.time.fuera / 3600).toFixed(1), manual: +(Math.max(0, u.time.manual) / 3600).toFixed(1) },
              }))} />
            )}
            <p className="tiny muted">En horas. Usa "Ver tabla" arriba para ver los números exactos.</p>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>¿Cuánto llevó cada tarea?</h3>
            {stats.tasks_time.length === 0 ? <Empty>No hay tareas completadas en este período.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tarea</th><th>Persona</th><th title="Suma del cronómetro y ajustes">Tiempo trabajado</th><th title="Desde que la empezó (o se creó) hasta que la entregó">Tiempo total</th><th>Entrega</th></tr></thead>
                  <tbody>
                    {stats.tasks_time.map((t) => (
                      <tr key={t.id}>
                        <td><a href={url(`/tarea/?id=${t.id}`)}>{t.title}</a></td>
                        <td>{t.assignee || '—'}</td>
                        <td>{t.worked_seconds ? fmtDuration(t.worked_seconds) : <span className="muted">sin registrar</span>}</td>
                        <td>{fmtDuration(t.elapsed_seconds)}</td>
                        <td>{t.late ? '⚠️ Tarde' : '✓ A tiempo'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }} data-tour="chart-weekly">
            <h3 style={{ marginTop: 0 }}>Completadas por semana</h3>
            <LineChart
              unit="completadas"
              points={stats.weekly.map((w) => {
                const d = new Date(w.week + 'T12:00:00');
                return {
                  label: d.toLocaleDateString('es', { day: '2-digit', month: 'short' }),
                  hint: 'Semana del ' + d.toLocaleDateString('es', { day: 'numeric', month: 'long' }),
                  value: w.completed,
                };
              })}
            />
          </div>
        </>
      )}
    </>
  );
}

export default function StatsPage() {
  return (
    <AppShell page="estadisticas">
      <StatsContent />
    </AppShell>
  );
}
