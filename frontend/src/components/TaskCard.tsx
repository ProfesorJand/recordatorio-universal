import { useStore } from '@nanostores/react';
import { url } from '../lib/config';
import { $user } from '../stores/session';
import type { Task } from '../lib/types';
import { Avatar, DueDate, PriorityChip, StatusChip } from './ui';
import CheckinButtons from './CheckinButtons';
import { fmtClock, fmtDuration, relative } from '../lib/time';
import { $timer, liveSeconds, stopTimer } from '../stores/timer';
import { useTick } from './Timer';

export default function TaskCard({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const me = useStore($user);
  const mine = task.assignee?.id === me?.id;
  const timer = useStore($timer);
  const running = timer.running && timer.task?.id === task.id;
  useTick(running);
  return (
    <div className={`card task p-${task.effective_priority || task.priority} ${task.status === 'completada' ? 'done' : ''} ${running ? 'running' : ''}`}>
      <Avatar person={task.assignee} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <a className="task-title" href={url(`/tarea/?id=${task.id}`)}>
          {task.status === 'completada' ? '✓ ' : ''}{task.title}
        </a>
        <div className="task-meta">
          <PriorityChip p={task.effective_priority || task.priority} original={task.priority} />
          <StatusChip s={task.status} />
          <DueDate task={task} compact />
          {showProject && (
            <span className="chip" style={{ borderColor: task.project.color }}>
              <span className="dot" style={{ background: task.project.color }} /> {task.project.name}
            </span>
          )}
          {task.parent_task_id && <span className="chip" title="La pidieron desde otra tarea">🔗 vinculada</span>}
          {task.children_open > 0 && <span className="chip">⛓ espera {task.children_open}</span>}
          {running ? (
            <span className="chip live" title="Cronómetro corriendo en esta tarea">
              ⏱ {fmtClock(liveSeconds(timer))}
              <button type="button" className="btn sm ghost" style={{ padding: '0 4px', fontSize: '0.75rem' }} onClick={stopTimer} aria-label="Pausar">⏸</button>
            </span>
          ) : task.worked_seconds > 0 && <span className="chip" title="Tiempo trabajado">⏱ {fmtDuration(task.worked_seconds)}</span>}
          {task.due_changes > 0 && (
            <span className="chip soon" title="Veces que se cambió la fecha límite">📅 fecha cambiada {task.due_changes}×</span>
          )}
          {task.defer_count >= 3 && task.status !== 'completada' && (
            <span className="chip" title="Veces que se aplazó el recordatorio">⏰ aplazada {task.defer_count}×</span>
          )}
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          {task.assignee ? (mine ? 'Asignada a ti' : `Asignada a ${task.assignee.name}`) : 'Sin asignar'}
          {task.supervisor && ` · Supervisa ${task.supervisor.id === me?.id ? 'tú' : task.supervisor.name}`}
          {task.status === 'aplazada' && task.deferred_until && ` · vuelve ${relative(task.deferred_until)}`}
        </div>
        {mine && task.status !== 'completada' && (
          <div style={{ marginTop: 8 }}>
            <CheckinButtons taskId={task.id} status={task.status} />
          </div>
        )}
      </div>
    </div>
  );
}
