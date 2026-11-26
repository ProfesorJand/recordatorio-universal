import { url } from '../lib/config';
import type { Task } from '../lib/types';
import { STATUS_ICON, STATUS_LABEL, priorityInfo } from '../lib/priority';
import { DueDate } from './ui';

export interface DepNode {
  task: Task;
  children: DepNode[];
}

/** Cuenta cuántas tareas hay en la cadena y cuántas están completas */
export function countChain(nodes: DepNode[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const n of nodes) {
    total++;
    if (n.task.status === 'completada') done++;
    const c = countChain(n.children);
    total += c.total;
    done += c.done;
  }
  return { total, done };
}

/**
 * Muestra la cadena de tareas como un árbol con sangría:
 *   ✓ A  (completada)
 *   ○ B  (pendiente)
 *     └ ○ C  (B espera a C)
 */
export default function DepTree({ nodes, level = 0 }: { nodes: DepNode[]; level?: number }) {
  if (!nodes.length) return null;
  return (
    <ul className="dep-tree" style={{ marginLeft: level ? 18 : 0 }}>
      {nodes.map(({ task: t, children }) => {
        const done = t.status === 'completada';
        return (
          <li key={t.id} className={done ? 'done' : t.status === 'bloqueada' ? 'blocked' : ''}>
            <div className="dep-node">
              <span className="dep-icon" title={STATUS_LABEL[t.status]}>{done ? '✅' : t.status === 'bloqueada' ? '🔒' : STATUS_ICON[t.status]}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={url(`/tarea/?id=${t.id}`)} className="small" style={{ fontWeight: 600, textDecoration: done ? 'line-through' : undefined }}>{t.title}</a>
                <div className="tiny muted row" style={{ gap: 6, marginTop: 2 }}>
                  <span style={{ color: priorityInfo(t.effective_priority || t.priority).color, fontWeight: 600 }}>{priorityInfo(t.effective_priority || t.priority).label}</span>
                  <span>· {t.assignee ? t.assignee.name : 'Sin asignar'}</span>
                  <span>· {STATUS_LABEL[t.status]}</span>
                  {!done && t.due_at && <DueDate task={t} compact />}
                </div>
              </div>
            </div>
            <DepTree nodes={children} level={level + 1} />
          </li>
        );
      })}
    </ul>
  );
}
