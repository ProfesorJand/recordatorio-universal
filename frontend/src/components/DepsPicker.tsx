import { useMemo, useState } from 'react';
import type { Task } from '../lib/types';
import { STATUS_ICON, priorityInfo } from '../lib/priority';

/**
 * Elegir de qué tareas depende esta (las que deben terminarse ANTES).
 * Lista con buscador y casillas; las elegidas se ven arriba como chips.
 */
export default function DepsPicker({ tasks, value, onChange, excludeId }: {
  tasks: Task[];
  value: number[];
  onChange: (ids: number[]) => void;
  excludeId?: number;
}) {
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => t.id !== excludeId)
      // no ofrecer tareas que ya esperan a esta (se formaría un círculo; el servidor igual lo valida)
      .filter((t) => !(excludeId && t.depends_on_ids?.includes(excludeId)))
      .filter((t) => !needle || t.title.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.status === 'completada') - Number(b.status === 'completada') || b.id - a.id)
      .slice(0, 60);
  }, [tasks, q, excludeId]);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="field">
      <label>🔗 Antes deben terminarse estas tareas (opcional)</label>
      {value.length > 0 && (
        <div className="row" style={{ gap: 4, marginBottom: 6 }}>
          {value.map((id) => (
            <span key={id} className="chip" style={{ paddingRight: 2 }}>
              {byId.get(id)?.title || `#${id}`}
              <button type="button" className="btn sm ghost" style={{ padding: '0 4px' }} onClick={() => toggle(id)} aria-label="Quitar">✕</button>
            </span>
          ))}
        </div>
      )}
      <input type="text" placeholder="Buscar tarea del proyecto…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card" style={{ maxHeight: 170, overflowY: 'auto', padding: '0.4rem', marginTop: 4 }}>
        {options.length === 0 && <div className="tiny muted">No hay otras tareas en este proyecto.</div>}
        {options.map((t) => (
          <label key={t.id} className="check" style={{ display: 'flex', margin: '0 0 4px' }}>
            <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} />
            <span>{STATUS_ICON[t.status]}</span>
            <span style={{ textDecoration: t.status === 'completada' ? 'line-through' : undefined }}>{t.title}</span>
            <span className="tiny" style={{ color: priorityInfo(t.priority).color }}>{priorityInfo(t.priority).label}</span>
            <span className="tiny muted">{t.assignee?.name || ''}</span>
          </label>
        ))}
      </div>
      <div className="hint">Mientras alguna no esté completa, esta tarea queda 🔒 bloqueada. Al terminarse la última, se desbloquea y se avisa a la persona asignada.</div>
    </div>
  );
}
