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

function TasksContent() {
  const refresh = useStore($refresh);
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('ru_scope') as Scope) || 'mine');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [toReview, setToReview] = useState<Task[]>([]);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)).catch(toastError);
  }, []);

  useEffect(() => {
    localStorage.setItem('ru_scope', scope);
    const qs = new URLSearchParams({ scope });
    if (projectId) qs.set('project_id', projectId);
    api<{ tasks: Task[] }>(`/tasks?${qs}`).then((r) => setTasks(r.tasks)).catch(toastError);
  }, [scope, projectId, refresh]);

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

      {tasks === null ? <Loading /> : (
        <div data-tour="list">
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

          {toReview.length > 0 && (
            <div data-tour="to-review">
              <h2>🔍 Para revisar ({toReview.length})</h2>
              <div className="grid">{toReview.map((t) => <TaskCard key={t.id} task={t} />)}</div>
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
          {groups.review.filter((t) => !toReview.some((r) => r.id === t.id)).length > 0 && (
            <>
              <h2>🔍 Entregadas, esperando revisión</h2>
              <div className="grid">{groups.review.filter((t) => !toReview.some((r) => r.id === t.id)).map((t) => <TaskCard key={t.id} task={t} />)}</div>
            </>
          )}
          {groups.deferred.length > 0 && (
            <>
              <h2>⏸ Aplazadas ({groups.deferred.length})</h2>
              <div className="grid">{groups.deferred.map((t) => <TaskCard key={t.id} task={t} />)}</div>
            </>
          )}
          {groups.done.length > 0 && (
            <>
              <h2>✓ Completadas (últimos 7 días)</h2>
              <div className="grid">{groups.done.map((t) => <TaskCard key={t.id} task={t} />)}</div>
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
