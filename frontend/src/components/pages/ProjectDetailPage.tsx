import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import ProjectForm from '../ProjectForm';
import TaskCard from '../TaskCard';
import TaskForm from '../TaskForm';
import RichText from '../RichText';
import ImageUpload from '../ImageUpload';
import { Avatar, Empty, Loading } from '../ui';
import { api } from '../../lib/api';
import { queryParam, url } from '../../lib/config';
import type { Project, Task } from '../../lib/types';
import { sortTasks } from '../../lib/priority';
import { $refresh, toast, toastError } from '../../stores/app';
import { can } from '../../stores/session';

function ProjectContent() {
  const id = Number(queryParam('id'));
  const refresh = useStore($refresh);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');

  const load = useCallback(() => {
    if (!id) return setError('Falta el número de proyecto');
    api<{ project: Project }>(`/projects/${id}`).then((r) => setProject(r.project)).catch((e) => setError(e.message));
    api<{ tasks: Task[] }>(`/tasks?scope=all&project_id=${id}`).then((r) => setTasks(r.tasks)).catch(() => {});
  }, [id]);

  useEffect(load, [load, refresh]);

  async function addResource(type: 'link' | 'image', u: string, title: string) {
    try {
      const r = await api<{ project: Project }>(`/projects/${id}/resources`, { method: 'POST', body: { type, url: u, title } });
      setProject(r.project);
      setResTitle('');
      setResUrl('');
      toast('Material agregado');
    } catch (e) {
      toastError(e);
    }
  }

  async function removeResource(rid: number) {
    try {
      const r = await api<{ project: Project }>(`/resources/${rid}`, { method: 'DELETE' });
      setProject(r.project);
    } catch (e) {
      toastError(e);
    }
  }

  async function toggleArchive() {
    if (!project) return;
    try {
      const r = await api<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: { archived: !project.archived } });
      setProject(r.project);
      toast(r.project.archived ? 'Proyecto archivado' : 'Proyecto reactivado');
    } catch (e) {
      toastError(e);
    }
  }

  function submitLink(e: FormEvent) {
    e.preventDefault();
    const isImg = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(resUrl);
    addResource(isImg ? 'image' : 'link', resUrl, resTitle);
  }

  if (error) return <Empty>{error}. <a href={url('/proyectos/')}>Volver</a></Empty>;
  if (!project) return <Loading />;
  const open = sortTasks(tasks.filter((t) => t.status !== 'completada'));
  const done = tasks.filter((t) => t.status === 'completada');
  const images = (project.resources || []).filter((r) => r.type === 'image');
  const links = (project.resources || []).filter((r) => r.type === 'link');

  return (
    <>
      <a href={url('/proyectos/')} className="small">← Proyectos</a>
      <div className="card" style={{ marginTop: 8, borderTop: `4px solid ${project.color}` }}>
        <div className="row between">
          <h1 style={{ margin: 0 }}>{project.name} {project.archived && <span className="chip">Archivado</span>}</h1>
          {can('proyectos.crear') && (
            <div className="row">
              <button className="btn sm" onClick={() => setEditing(true)}>✏️ Editar / miembros</button>
              <button className="btn sm" onClick={toggleArchive}>{project.archived ? 'Reactivar' : 'Archivar'}</button>
            </div>
          )}
        </div>
        {project.description && <div style={{ marginTop: 8 }}><RichText text={project.description} /></div>}
        <div className="row" style={{ marginTop: 10 }}>
          {(project.members || []).map((m) => (
            <span key={m.id} className="chip" style={{ paddingLeft: 3 }}><Avatar person={m} size={20} /> {m.name}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '0.75rem' }} data-tour="resources">
        <h3 style={{ marginTop: 0 }}>📎 Material de apoyo</h3>
        {links.length === 0 && images.length === 0 && <p className="small muted">Todavía no hay material.</p>}
        {links.length > 0 && (
          <ul>
            {links.map((r) => (
              <li key={r.id} className="small">
                <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                {can('proyectos.recursos') && <button className="btn sm ghost" onClick={() => removeResource(r.id)} aria-label="Quitar">✕</button>}
              </li>
            ))}
          </ul>
        )}
        {images.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {images.map((r) => (
              <div key={r.id} style={{ position: 'relative' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  <img src={r.url} alt={r.title} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                </a>
                <div className="tiny muted">{r.title}</div>
                {can('proyectos.recursos') && (
                  <button className="btn sm" style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => removeResource(r.id)} aria-label="Quitar">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
        {can('proyectos.recursos') && (
          <form onSubmit={submitLink} className="row" style={{ marginTop: 10 }}>
            <input type="text" placeholder="Título (opcional)" value={resTitle} onChange={(e) => setResTitle(e.target.value)} style={{ maxWidth: 200 }} />
            <input type="url" placeholder="https://…" required value={resUrl} onChange={(e) => setResUrl(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="btn sm primary">Agregar enlace</button>
            <ImageUpload onUploaded={(u, n) => addResource('image', u, resTitle || n)} />
          </form>
        )}
      </div>

      <div data-tour="project-tasks">
        <div className="row between">
          <h2>Tareas abiertas ({open.length})</h2>
          {can('tareas.crear') && !project.archived && <button className="btn primary sm" onClick={() => setCreating(true)}>+ Nueva tarea</button>}
        </div>
        {open.length === 0 ? <Empty>No hay tareas abiertas.</Empty> : <div className="grid">{open.map((t) => <TaskCard key={t.id} task={t} showProject={false} />)}</div>}
        {done.length > 0 && (
          <>
            <h2>Completadas recientes</h2>
            <div className="grid">{done.map((t) => <TaskCard key={t.id} task={t} showProject={false} />)}</div>
          </>
        )}
      </div>

      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} onSaved={setProject} />}
      {creating && <TaskForm mode="create" projectId={id} onClose={() => setCreating(false)} />}
    </>
  );
}

export default function ProjectDetailPage() {
  return (
    <AppShell page="proyecto">
      <ProjectContent />
    </AppShell>
  );
}
