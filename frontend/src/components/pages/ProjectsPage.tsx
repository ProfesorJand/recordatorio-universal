import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import ProjectForm from '../ProjectForm';
import { Empty, Loading } from '../ui';
import { api } from '../../lib/api';
import { url } from '../../lib/config';
import { go } from '../../lib/nav';
import type { Project } from '../../lib/types';
import { toastError } from '../../stores/app';
import { can } from '../../stores/session';

function ProjectsContent() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => api<{ projects: Project[] }>(`/projects${archived ? '?archived=1' : ''}`).then((r) => setProjects(r.projects)).catch(toastError);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archived]);

  return (
    <>
      <div className="row between" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Proyectos</h1>
        <div className="row">
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Ver archivados
          </label>
          {can('proyectos.crear') && <button className="btn primary" data-tour="new-project" onClick={() => setCreating(true)}>+ Nuevo proyecto</button>}
        </div>
      </div>
      {projects === null ? <Loading /> : projects.length === 0 ? (
        <Empty>{can('proyectos.crear') ? 'Crea tu primer proyecto para empezar a asignar tareas.' : 'Todavía no eres miembro de ningún proyecto.'}</Empty>
      ) : (
        <div className="grid grid-2" data-tour="projects">
          {projects.map((p) => (
            <a key={p.id} href={url(`/proyecto/?id=${p.id}`)} className="card" style={{ textDecoration: 'none', color: 'inherit', borderTop: `4px solid ${p.color}` }}>
              <h3 style={{ marginTop: 0 }}>{p.name}</h3>
              {p.description && <p className="small muted" style={{ margin: '0 0 0.5rem' }}>{p.description.slice(0, 140)}</p>}
              <div className="row">
                <span className="chip">👥 {p.members_count} miembros</span>
                <span className="chip">📋 {p.open_tasks} tareas abiertas</span>
              </div>
            </a>
          ))}
        </div>
      )}
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => go(`/proyecto/?id=${p.id}`)} />}
    </>
  );
}

export default function ProjectsPage() {
  return (
    <AppShell page="proyectos">
      <ProjectsContent />
    </AppShell>
  );
}
