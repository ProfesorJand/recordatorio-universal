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

type Scope = 'mine' | 'supervising' | 'all';

function TasksContent() {
  const refresh = useStore($refresh);
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem('ru_scope') as Scope) || 'mine');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)).catch(toastError);
  }, []);

  useEffect(() => {
    localStorage.setItem('ru_scope', scope);
    const qs = new URLSearchParams({ scope });
    if (projectId) qs.set('project_id', projectId);
    api<{ tasks: Task[] }>(`/tasks?${qs}`).then((r) => setTasks(r.tasks)).catch(toastError);
  }, [scope, projectId, refresh]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (tasks || []).filter((t) => !q || t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    return {
      active: sortTasks(list.filter((t) => t.status === 'pendiente' || t.status === 'en_progreso')),
      blocked: sortTasks(list.filter((t) => t.status === 'bloqueada')),
      deferred: sortTasks(list.filter((t) => t.status === 'aplazada')),
      done: list.filter((t) => t.status === 'completada').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    };
  }, [tasks, search]);

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
