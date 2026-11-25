import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '@nanostores/react';
import { api } from '../lib/api';
import type { Project } from '../lib/types';
import { $directory, loadDirectory, toast, toastError } from '../stores/app';
import { Modal } from './ui';

const COLORS = ['#257de0', '#008a17', '#6a4ce2', '#f47230', '#ec4647', '#00b894', '#f2a600', '#ee7fac'];

export default function ProjectForm({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: (p: Project) => void }) {
  const directory = useStore($directory);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? COLORS[0]);
  const [members, setMembers] = useState<number[]>(project?.members?.map((m) => m.id) ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDirectory().catch(toastError);
  }, []);

  function toggle(id: number) {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, description, color, member_ids: members };
      const r = project
        ? await api<{ project: Project }>(`/projects/${project.id}`, { method: 'PATCH', body })
        : await api<{ project: Project }>('/projects', { method: 'POST', body });
      toast(project ? 'Proyecto actualizado' : 'Proyecto creado');
      onSaved(r.project);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Nombre</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 70 }} />
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={c}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, border: color === c ? '3px solid #191919' : '1px solid #ddd', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div className="field">
          <label>Miembros (pueden recibir tareas de este proyecto)</label>
          <div className="card" style={{ maxHeight: 220, overflowY: 'auto', padding: '0.6rem' }}>
            {directory.map((u) => (
              <label key={u.id} className="check" style={{ display: 'flex' }}>
                <input type="checkbox" checked={members.includes(u.id)} onChange={() => toggle(u.id)} />
                {u.name} <span className="tiny muted">{u.email}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{project ? 'Guardar' : 'Crear proyecto'}</button>
        </div>
      </form>
    </Modal>
  );
}
