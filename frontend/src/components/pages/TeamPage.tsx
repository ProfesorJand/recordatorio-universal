import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import { Avatar, Empty, Loading, PriorityChip } from '../ui';
import { useTick } from '../Timer';
import { api } from '../../lib/api';
import { url } from '../../lib/config';
import type { Priority } from '../../lib/types';
import { fmtClock, fmtDuration, formatDateTime, relative, shortTz } from '../../lib/time';
import { toastError } from '../../stores/app';

interface Person {
  user: { id: number; name: string; email: string; picture: string | null };
  timezone: string;
  online: boolean;
  last_seen_at: string | null;
  in_work_hours: boolean;
  has_hours: boolean;
  work_start: string | null;
  work_end: string | null;
  timer: null | { private: true } | { task_id: number; title: string; priority: Priority; started_at: string; task_seconds: number; out_of_hours: boolean };
  today_seconds: number;
  counts: { abiertas: number; en_progreso: number; bloqueadas: number; en_revision: number; vencidas: number };
}

function TeamContent() {
  const [data, setData] = useState<{ scope: string; people: Person[] } | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  useTick(true); // para que los cronómetros avancen en pantalla

  useEffect(() => {
    const load = () => api<{ scope: string; people: Person[] }>('/team').then((r) => { setData(r); setFetchedAt(Date.now()); }).catch(toastError);
    load();
    const id = setInterval(load, 30_000); // se actualiza cada 30 s
    return () => clearInterval(id);
  }, []);

  if (!data) return <Loading />;
  const elapsed = (Date.now() - fetchedAt) / 1000;
  const working = data.people.filter((p) => p.timer).length;
  const online = data.people.filter((p) => p.online).length;

  return (
    <>
      <h1>Equipo</h1>
      <p className="muted small" style={{ marginTop: -8 }}>
        {data.scope === 'todos' ? 'Todas las personas de la app.' : 'Las personas a las que supervisas (solo se cuentan las tareas que supervisas).'}
        {' '}Se actualiza cada 30 segundos.
      </p>
      <div className="tiles" style={{ marginBottom: '1rem' }}>
        <div className="tile"><div className="num">{working}</div><div className="lbl">⏱ Trabajando ahora</div></div>
        <div className="tile"><div className="num">{online}</div><div className="lbl"><span className="dot" style={{ background: 'var(--ok)', borderRadius: '50%' }} /> En línea</div></div>
        <div className="tile"><div className="num">{data.people.length}</div><div className="lbl">👥 Personas</div></div>
      </div>

      {data.people.length === 0 ? (
        <Empty>Todavía no supervisas a nadie. Cuando seas supervisor de una tarea asignada a otra persona, aparecerá aquí.</Empty>
      ) : (
        <div className="grid grid-2" data-tour="team">
          {data.people.map((p) => (
            <div key={p.user.id} className={`card ${p.timer ? 'task running' : ''}`} style={{ display: 'block' }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span style={{ position: 'relative' }}>
                  <Avatar person={p.user} size={40} />
                  <span className="presence" style={{ background: p.online ? 'var(--ok)' : '#c3c6cc' }} title={p.online ? 'En línea' : 'Desconectado'} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{p.user.name}</strong>
                  <div className="tiny muted">
                    {p.online ? <span style={{ color: 'var(--ok)', fontWeight: 600 }}>● En línea</span> : p.last_seen_at ? `Visto ${relative(p.last_seen_at)}` : 'Nunca conectado'}
                    {' · '}{shortTz(p.timezone)}, {formatDateTime(new Date().toISOString(), p.timezone).split(' ').pop()}
                    {p.has_hours && (p.in_work_hours ? ` · en horario (${p.work_start}–${p.work_end})` : ' · fuera de horario')}
                  </div>
                </div>
              </div>

              <div style={{ margin: '0.75rem 0' }}>
                {!p.timer && <div className="small muted">Sin cronómetro en marcha.</div>}
                {p.timer && 'private' in p.timer && <div className="small">⏱ Trabajando en una tarea que no supervisas.</div>}
                {p.timer && !('private' in p.timer) && (
                  <div className="small">
                    <div className="row" style={{ gap: 6 }}>
                      <span className="chip live">⏱ {fmtClock(p.timer.task_seconds + elapsed)}{p.timer.out_of_hours ? ' 🌙' : ''}</span>
                      <PriorityChip p={p.timer.priority} />
                    </div>
                    <a href={url(`/tarea/?id=${p.timer.task_id}`)} style={{ fontWeight: 600, display: 'inline-block', marginTop: 4 }}>{p.timer.title}</a>
                    <div className="tiny muted">Este tramo empezó {relative(p.timer.started_at)}</div>
                  </div>
                )}
              </div>

              <div className="row" style={{ gap: 4 }}>
                <span className="chip">Hoy: {fmtDuration(p.today_seconds + (p.timer && !('private' in p.timer) ? elapsed : 0))}</span>
                <span className="chip">📋 {p.counts.abiertas} abiertas</span>
                {p.counts.vencidas > 0 && <span className="chip overdue">⚠️ {p.counts.vencidas} vencidas</span>}
                {p.counts.en_revision > 0 && <span className="chip">🔍 {p.counts.en_revision} en revisión</span>}
                {p.counts.bloqueadas > 0 && <span className="chip">🔒 {p.counts.bloqueadas} bloqueadas</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: '1rem' }}>
        "En línea" = tiene la app abierta (en los últimos 3 minutos). El cronómetro solo cuenta mientras la persona tiene la app abierta.
      </p>
    </>
  );
}

export default function TeamPage() {
  return (
    <AppShell page="equipo">
      <TeamContent />
    </AppShell>
  );
}
