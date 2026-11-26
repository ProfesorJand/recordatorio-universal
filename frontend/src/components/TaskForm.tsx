import { useEffect, useRef, useState, type FormEvent } from 'react';
import DateTimeInput from './DateTimeInput';
import { useStore } from '@nanostores/react';
import { api } from '../lib/api';
import type { Person, Priority, Project, Task } from '../lib/types';
import { PRIORITIES, REMINDER_OPTIONS } from '../lib/priority';
import { $directory, bumpRefresh, loadDirectory, toast, toastError } from '../stores/app';
import { $user, myTz } from '../stores/session';
import { toLocalInput, tzLabel } from '../lib/time';
import { Confirm, Modal } from './ui';
import { waLink } from '../lib/whatsapp';
import ImageUpload, { useImagePaste } from './ImageUpload';
import DepsPicker from './DepsPicker';

type Mode = 'create' | 'edit' | 'linked';

/**
 * Formulario de tarea.
 *  - create: un admin crea la tarea en un proyecto
 *  - edit:   editar una tarea existente
 *  - linked: desde su tarea, el trabajador le pide una tarea a otra persona
 *            (el que la pide queda como supervisor automáticamente)
 */
export default function TaskForm({ mode, task, parent, projectId, initial, onClose, onSaved }: {
  mode: Mode;
  task?: Task;
  parent?: Task;
  projectId?: number;
  onClose: () => void;
  onSaved?: (t: Task) => void;
  /** Valores iniciales (ej: al convertir un evento de Google en tarea) */
  initial?: { title?: string; description?: string; due_local?: string };
}) {
  const me = useStore($user);
  const directory = useStore($directory);
  const tz = myTz();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [projId, setProjId] = useState<number | ''>(task?.project.id ?? parent?.project.id ?? projectId ?? '');
  const [title, setTitle] = useState(task?.title ?? initial?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? initial?.description ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? parent?.priority ?? 'B');
  const [assignee, setAssignee] = useState<number | ''>(task?.assignee?.id ?? '');
  const [supervisor, setSupervisor] = useState<number | ''>(task?.supervisor?.id ?? '');
  const [due, setDue] = useState(task?.due_at ? toLocalInput(task.due_at, tz) : initial?.due_local ?? '');
  const [reminder, setReminder] = useState<number | null>(task?.reminder_every_minutes ?? null);
  const [reminderStart, setReminderStart] = useState(task?.reminder_start_at ? toLocalInput(task.reminder_start_at, tz) : '');
  const [waTask, setWaTask] = useState<Task | null>(null);
  const [deps, setDeps] = useState<number[]>(task?.depends_on_ids ?? []);
  const [requiresReview, setRequiresReview] = useState<boolean>(task ? task.requires_review : false);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [askNoSupervisor, setAskNoSupervisor] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadDirectory().catch(() => {});
    if (mode !== 'linked') {
      api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)).catch(toastError);
    }
  }, [mode]);

  // Tareas del proyecto, para elegir de cuáles depende
  useEffect(() => {
    if (!projId || mode === 'linked') return setProjectTasks([]);
    api<{ tasks: Task[] }>(`/tasks?scope=all&project_id=${projId}&include_completed=1`).then((r) => setProjectTasks(r.tasks)).catch(() => {});
  }, [projId, mode]);

  // Si se cambia de proyecto y la persona asignada no es miembro, se deja sin asignar
  useEffect(() => {
    if (assignee && members.length && !members.some((m) => m.id === assignee)) setAssignee('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  // Miembros del proyecto (solo ellos pueden ser asignados)
  useEffect(() => {
    if (!projId) return setMembers([]);
    api<{ project: Project }>(`/projects/${projId}`).then((r) => setMembers(r.project.members || [])).catch(toastError);
  }, [projId]);

  function insertImage(imgUrl: string, name: string) {
    const md = `![${name}](${imgUrl})`;
    const el = descRef.current;
    if (!el) return setDescription((d) => (d ? d + '\n' : '') + md);
    const start = el.selectionStart ?? description.length;
    setDescription(description.slice(0, start) + md + description.slice(start));
  }
  const descPaste = useImagePaste(insertImage);


  function submit(e: FormEvent) {
    e.preventDefault();
    // Aviso si se crea sin supervisor (en tareas vinculadas el supervisor es quien la pide)
    if (mode === 'create' && !supervisor) {
      setAskNoSupervisor(true);
      return;
    }
    save();
  }

  async function save() {
    setAskNoSupervisor(false);
    setBusy(true);
    const body: Record<string, unknown> = {
      title,
      description,
      priority,
      assignee_id: assignee || null,
      due_local: due || null,
      reminder_every_minutes: reminder,
      reminder_start_local: reminder ? reminderStart || null : null,
    };
    if (mode !== 'linked') {
      body.supervisor_id = supervisor || null;
      body.depends_on = deps;
      body.requires_review = supervisor ? requiresReview : false;
    }
    try {
      let r: { task: Task };
      if (mode === 'create') r = await api('/tasks', { method: 'POST', body: { ...body, project_id: projId } });
      else if (mode === 'linked') r = await api(`/tasks/${parent!.id}/linked`, { method: 'POST', body });
      else r = await api(`/tasks/${task!.id}`, { method: 'PATCH', body: { ...body, project_id: projId } });
      toast(mode === 'edit' ? 'Tarea actualizada' : mode === 'linked' ? 'Tarea pedida. Te avisaremos cuando la terminen.' : 'Tarea creada');
      bumpRefresh();
      onSaved?.(r.task);
      // Urgente y con WhatsApp cargado: ofrecer avisarle por WhatsApp
      const assignedChanged = mode !== 'edit' || task?.assignee?.id !== r.task.assignee?.id || task?.priority !== 'urgente';
      if (r.task.priority === 'urgente' && r.task.assignee && r.task.assignee.id !== me?.id && waLink(r.task) && assignedChanged) {
        setWaTask(r.task);
        return;
      }
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === 'create' ? 'Nueva tarea' : mode === 'linked' ? 'Pedir una tarea vinculada' : 'Editar tarea';
  const assignable = mode === 'linked' ? members.filter((m) => m.id !== me?.id) : members;

  return (
    <Modal title={heading} onClose={onClose}>
      {mode === 'linked' && parent && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Necesitas que otra persona haga algo para terminar <strong>{parent.title}</strong>. Tu tarea quedará
          "esperando" hasta que la terminen, y <strong>tú serás el supervisor</strong>: te avisaremos cuando esté lista.
        </p>
      )}
      <form onSubmit={submit}>
        {mode !== 'linked' && (
          <div className="field">
            <label>Proyecto</label>
            <select required value={projId} onChange={(e) => { setProjId(e.target.value ? +e.target.value : ''); }}>
              <option value="">Elige un proyecto…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {mode === 'edit' && task && projId !== task.project.id && (
              <div className="hint">La tarea se moverá a este proyecto. Si la persona asignada no es miembro, elige a otra.</div>
            )}
          </div>
        )}
        <div className="field">
          <label>Título</label>
          <input type="text" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué hay que hacer?" />
        </div>
        <div className="field">
          <div className="row between">
            <label>Descripción</label>
            <ImageUpload onUploaded={insertImage} />
          </div>
          <textarea ref={descRef} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles, enlaces (https://...) o imágenes. Pega una captura con Ctrl+V o arrástrala aquí." {...descPaste.handlers} />
          {descPaste.busy && <div className="tiny muted">Subiendo imagen…</div>}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="field">
            <label>Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{mode === 'linked' ? '¿A quién se la pides?' : 'Asignada a'}</label>
            <select value={assignee} required={mode === 'linked'} onChange={(e) => setAssignee(e.target.value ? +e.target.value : '')}>
              <option value="">{mode === 'linked' ? 'Elige a alguien…' : 'Sin asignar'}</option>
              {assignable.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me?.id ? ' (yo)' : ''}</option>)}
            </select>
            {projId && members.length === 0 && <div className="hint">Este proyecto no tiene miembros todavía.</div>}
          </div>
          {mode !== 'linked' && (
            <div className="field">
              <label>Supervisor (recibe el aviso al terminar)</label>
              <select value={supervisor} onChange={(e) => {
                const v = e.target.value ? +e.target.value : '';
                // Por defecto, si hay supervisor, la entrega requiere su revisión
                if (v && !supervisor) setRequiresReview(true);
                if (!v) setRequiresReview(false);
                setSupervisor(v);
              }}>
                <option value="">Sin supervisor</option>
                {directory.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me?.id ? ' (yo)' : ''}</option>)}
              </select>
              {supervisor !== '' && (
                <label className="check" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} />
                  🔍 Requiere revisión (el supervisor aprueba la entrega)
                </label>
              )}
            </div>
          )}
          <div className="field">
            <label>Fecha límite (opcional)</label>
            <DateTimeInput value={due} onChange={setDue} defaultTime="18:00" />
            <div className="hint">En tu hora: {tz} ({tzLabel(tz)}). Los demás la verán convertida a su hora.</div>
          </div>
          <div className="field">
            <label>⏰ Empezar a recordar "¿cómo va?" desde (opcional)</label>
            <DateTimeInput value={reminderStart} onChange={(v) => { setReminderStart(v); if (v && reminder === null) setReminder(1440); }} />
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              <button type="button" className="btn sm" onClick={() => { setReminderStart(toLocalInput(new Date().toISOString(), tz)); if (reminder === null) setReminder(1440); }}>Desde ahora</button>
              {due && [1, 3, 7, 14].map((d) => (
                <button type="button" key={d} className="btn sm" onClick={() => { setReminderStart(daysBefore(due, d)); if (reminder === null) setReminder(1440); }}>
                  {d === 1 ? '1 día' : d === 7 ? '1 semana' : d === 14 ? '2 semanas' : `${d} días`} antes
                </button>
              ))}
              {(reminderStart || reminder !== null) && (
                <button type="button" className="btn sm ghost" onClick={() => { setReminderStart(''); setReminder(null); }}>Quitar recordatorio</button>
              )}
            </div>
            <div className="hint">Si tiene fecha límite, igual avisamos 24 h y 1 h antes aunque no pongas recordatorio.</div>
          </div>
          {(reminderStart || reminder !== null) && (
            <div className="field">
              <label>¿Cada cuánto recordar?</label>
              <select value={reminder ?? ''} onChange={(e) => setReminder(e.target.value ? +e.target.value : null)}>
                {REMINDER_OPTIONS.filter((o) => o.value !== null).map((o) => <option key={o.label} value={o.value ?? ''}>{o.label}</option>)}
                {reminder !== null && !REMINDER_OPTIONS.some((o) => o.value === reminder) && <option value={reminder}>Cada {reminder} min</option>}
              </select>
              <div className="hint">Ej: entrega el 1 de enero, recordar cada día desde el 25 de diciembre.</div>
            </div>
          )}
        </div>
        {mode !== 'linked' && projId !== '' && (
          <DepsPicker tasks={projectTasks} value={deps} onChange={setDeps} excludeId={task?.id} />
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : mode === 'linked' ? 'Pedir tarea' : 'Crear tarea'}</button>
        </div>
      </form>

      {waTask && (
        <Confirm
          title="¿Avisar también por WhatsApp?"
          text={<p>La tarea es <strong>urgente</strong>. Puedes abrir WhatsApp con el mensaje ya escrito para <strong>{waTask.assignee?.name}</strong>; solo tienes que tocar "Enviar".</p>}
          confirmLabel="💬 Abrir WhatsApp"
          onConfirm={() => { window.open(waLink(waTask)!, '_blank', 'noopener'); onClose(); }}
          onCancel={onClose}
        />
      )}

      {askNoSupervisor && (
        <Confirm
          title="¿Crear sin supervisor?"
          text={<p>Estás por crear la tarea <strong>sin supervisor</strong>. Nadie recibirá el aviso cuando se termine. ¿Quieres continuar así?</p>}
          confirmLabel="Crear sin supervisor"
          onConfirm={save}
          onCancel={() => setAskNoSupervisor(false)}
        />
      )}
    </Modal>
  );
}

/** "2027-01-01T10:00" menos N días (en la misma hora de pared) */
function daysBefore(local: string, days: number): string {
  const d = new Date(local + ':00Z'); // se trata como UTC solo para restar días sin efecto de zona
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 16);
}
