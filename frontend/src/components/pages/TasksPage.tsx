import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import TaskCard from '../TaskCard';
import TaskForm from '../TaskForm';
import { Empty, Loading } from '../ui';
import { api } from '../../lib/api';
import type { Project, Task } from '../../lib/types';
import { sortTasks } from '../../lib/priority';
import { $refresh, toastError } from '../../stores/app';
import { can } from '../../stores/session';
import { $timer } from '../../stores/timer';
import { url } from '../../lib/config';

type Scope = 'mine' | 'supervising' | 'all';
type View = 'todo' | 'returned' | 'review' | 'done';

function TasksContent() {
  const refresh = useStore($refresh);
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('ru_scope') as Scope) || 'mine');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [toReview, setToReview] = useState<Task[]>([]);
  const [view, setView] = useState<View>(() => (localStorage.getItem('ru_view') as View) || 'todo');
  const [doneAll, setDoneAll] = useState<Task[] | null>(null);
  const [doneLimit, setDoneLimit] = useState(30);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)).catch(toastError);
  }, []);

  useEffect(() => {
    localStorage.setItem('ru_scope', scope);
    const qs = new URLSearchParams({ scope });
    if (projectId) qs.set('project_id', projectId);
    api<{ tasks: Task[] }>(`/tasks?${qs}`).then((r) => setTasks(r.tasks)).catch(toastError);
  }, [scope, projectId, refresh]);

  // Pestaña Completadas: todas las completadas (no solo las de los últimos 7 días)
  useEffect(() => {
    localStorage.setItem('ru_view', view);
    if (view !== 'done') return;
    setDoneAll(null);
    const qs = new URLSearchParams({ scope, include_completed: '1' });
    if (projectId) qs.set('project_id', projectId);
    api<{ tasks: Task[] }>(`/tasks?${qs}`)
      .then((r) => setDoneAll(r.tasks.filter((t) => t.status === 'completada').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))))
      .catch(toastError);
  }, [view, scope, projectId, refresh]);

  // Entregas que yo tengo que revisar (sin importar la pestaña elegida)
  useEffect(() => {
    api<{ tasks: Task[] }>('/tasks?scope=supervising').then((r) => setToReview(r.tasks.filter((t) => t.status === 'en_revision'))).catch(() => {});
  }, [refresh]);

  const timer = useStore($timer);
  const currentId = timer.running ? timer.task?.id : undefined;
  const current = (tasks || []).find((t) => t.id === currentId);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (tasks || []).filter((t) => !q || t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    return {
      // la tarea con el cronómetro corriendo va aparte, arriba de todo
      active: sortTasks(list.filter((t) => (t.status === 'pendiente' || t.status === 'en_progreso') && t.id !== currentId)),
      blocked: sortTasks(list.filter((t) => t.status === 'bloqueada')),
      deferred: sortTasks(list.filter((t) => t.status === 'aplazada')),
      review: list.filter((t) => t.status === 'en_revision'),
      done: list.filter((t) => t.status === 'completada').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    };
  }, [tasks, search, currentId]);

  const q = search.trim().toLowerCase();
  const match = (t: Task) => !q || t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
  const myDelivered = groups.review.filter((t) => !toReview.some((r) => r.id === t.id)); // entregadas, esperando revisión de otro
  const reviewCount = toReview.length + myDelivered.length;
  // Devueltas por el supervisor y todavía sin volver a entregar
  const returned = sortTasks((tasks || []).filter((t) => t.returned_count > 0 && !['en_revision', 'completada'].includes(t.status)).filter(match));
  const doneList = (doneAll || []).filter(match);
  const todoCount = groups.active.length + groups.blocked.length + groups.deferred.length + (timer.running ? 1 : 0);

  return (
    <>
      <div className="row between" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Tareas</h1>
        {can('tareas.crear') && <button className="btn primary" onClick={() => setCreating(true)}>+ Nueva tarea</button>}
      </div>

      <div className="tabs" data-tour="scope">
        <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>👤 Mis tareas</button>
        <button className={scope === 'supervising' ? 'active' : ''} onClick={() => setScope('supervising')}>👁 Superviso</button>
        <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>🌐 Todas</button>
      </div>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="text" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
      </div>

      <div className="seg" role="tablist" data-tour="views">
        <button role="tab" className={view === 'todo' ? 'active' : ''} onClick={() => setView('todo')}>📋 Para hacer <span className="count">{todoCount}</span></button>
        <button role="tab" className={view === 'returned' ? 'active' : ''} onClick={() => setView('returned')}>
          ↩ Devueltas <span className={`count ${returned.length ? 'warn' : ''}`}>{returned.length}</span>
        </button>
        <button role="tab" className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}>
          🔍 En revisión <span className={`count ${toReview.length ? 'alert' : ''}`}>{reviewCount}</span>
        </button>
        <button role="tab" className={view === 'done' ? 'active' : ''} onClick={() => setView('done')}>✓ Completadas</button>
      </div>

      {tasks === null ? <Loading /> : view === 'returned' ? (
        <div>
          <h2>↩ Devueltas ({returned.length})</h2>
          <p className="tiny muted" style={{ marginTop: -6 }}>
            El supervisor pidió cambios y todavía no se volvieron a entregar. Abre cada una para ver su comentario (aparece como "↩ Devuelta").
          </p>
          {returned.length === 0 ? <Empty>No hay tareas devueltas. 🎉</Empty> : <div className="grid">{returned.map((t) => <TaskCard key={t.id} task={t} />)}</div>}
        </div>
      ) : view === 'review' ? (
        <div>
          <h2>🔍 Para revisar ({toReview.length})</h2>
          <p className="tiny muted" style={{ marginTop: -6 }}>Entregas de tareas que tú supervisas. Apruébalas o devuélvelas con un comentario.</p>
          {toReview.length === 0 ? <Empty>No tienes entregas pendientes de revisar.</Empty> : <div className="grid">{toReview.filter(match).map((t) => <TaskCard key={t.id} task={t} />)}</div>}

          <h2>📤 Entregadas, esperando revisión ({myDelivered.length})</h2>
          <p className="tiny muted" style={{ marginTop: -6 }}>Tareas ya entregadas que el supervisor todavía no aprobó.</p>
          {myDelivered.length === 0 ? <Empty>No hay entregas esperando a otro supervisor.</Empty> : <div className="grid">{myDelivered.map((t) => <TaskCard key={t.id} task={t} />)}</div>}
        </div>
      ) : view === 'done' ? (
        <div>
          {doneAll === null ? <Loading /> : doneList.length === 0 ? <Empty>No hay tareas completadas.</Empty> : (
            <>
              <h2>✓ Completadas ({doneList.length})</h2>
              <div className="grid">{doneList.slice(0, doneLimit).map((t) => <TaskCard key={t.id} task={t} />)}</div>
              {doneList.length > doneLimit && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <button className="btn" onClick={() => setDoneLimit(doneLimit + 30)}>Ver más ({doneList.length - doneLimit} restantes)</button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div data-tour="list">
          {returned.length > 0 && (
            <div className="card row between" style={{ background: '#fdecec', borderColor: '#f5c2c2', marginBottom: '0.5rem' }}>
              <span className="small">↩ Hay <strong>{returned.length}</strong> {returned.length === 1 ? 'tarea devuelta' : 'tareas devueltas'} con cambios pedidos por el supervisor.</span>
              <button className="btn sm" onClick={() => setView('returned')}>Ver devueltas</button>
            </div>
          )}
          {toReview.length > 0 && (
            <div className="card row between" style={{ background: '#fff8e6', borderColor: '#f3dfae', marginBottom: '0.5rem' }} data-tour="to-review">
              <span className="small">🔍 Tienes <strong>{toReview.length}</strong> {toReview.length === 1 ? 'entrega' : 'entregas'} esperando tu revisión.</span>
              <button className="btn sm primary" onClick={() => setView('review')}>Revisar ahora</button>
            </div>
          )}
          {timer.running && timer.task && (
            <div data-tour="current">
              <h2>▶ Haciendo ahora</h2>
              {current
                ? <TaskCard task={current} />
                : (
                  <div className="card task running">
                    <a className="task-title" href={url(`/tarea/?id=${timer.task.id}`)}>{timer.task.title}</a>
                    <span className="tiny muted" style={{ marginLeft: 8 }}>(no está en este filtro)</span>
                  </div>
                )}
            </div>
          )}

          <h2>Para hacer ({groups.active.length})</h2>
          {groups.active.length === 0
            ? <Empty>{scope === 'mine' ? '¡No tienes tareas pendientes! 🎉' : 'No hay tareas pendientes.'}</Empty>
            : <div className="grid">{groups.active.map((t) => <TaskCard key={t.id} task={t} />)}</div>}

          {groups.blocked.length > 0 && (
            <>
              <h2>⛓ Esperando otra tarea ({groups.blocked.length})</h2>
              <div className="grid">{groups.blocked.map((t) => <TaskCard key={t.id} task={t} />)}</div>
            </>
          )}
          {groups.deferred.length > 0 && (
            <>
              <h2>⏸ Aplazadas ({groups.deferred.length})</h2>
              <div className="grid">{groups.deferred.map((t) => <TaskCard key={t.id} task={t} />)}</div>
            </>
          )}
        </div>
      )}

      {creating && <TaskForm mode="create" projectId={projectId ? +projectId : undefined} onClose={() => setCreating(false)} />}
    </>
  );
}

export default function TasksPage() {
  return (
    <AppShell page="tareas">
      <TasksContent />
    </AppShell>
  );
}
