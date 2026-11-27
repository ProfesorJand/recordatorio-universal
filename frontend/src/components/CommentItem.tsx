import { useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime, relative } from '../lib/time';
import { myTz } from '../stores/session';
import { toast, toastError } from '../stores/app';
import { Avatar } from './ui';
import RichText from './RichText';
import ImageUpload, { useImagePaste } from './ImageUpload';

export interface Comment {
  id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  edit_count: number;
  can_edit: boolean;
  user: { id: number; name: string; picture: string | null };
}

/** Un comentario, con la opción de editarlo si es tuyo */
export default function CommentItem({ c, onSaved }: { c: Comment; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const paste = useImagePaste((u, n) => setText((x) => (x ? x + '\n' : '') + `![${n}](${u})`));

  async function save() {
    setBusy(true);
    try {
      await api(`/comments/${c.id}`, { method: 'PATCH', body: { body: text } });
      toast('Comentario editado');
      setEditing(false);
      onSaved();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start', marginBottom: 12, flexWrap: 'nowrap' }}>
      <Avatar person={{ name: c.user.name, email: '', picture: c.user.picture }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small row" style={{ gap: 6 }}>
          <strong>{c.user.name}</strong>
          <span className="tiny muted">{relative(c.created_at)}</span>
          {c.edited_at && (
            <span className="tiny muted" title={`Editado ${formatDateTime(c.edited_at, myTz())}${c.edit_count > 1 ? ` (${c.edit_count} veces)` : ''}`}>
              · (editado)
            </span>
          )}
          {c.can_edit && !editing && (
            <button className="btn sm ghost" style={{ padding: '0 4px' }} onClick={() => { setText(c.body); setEditing(true); }} aria-label="Editar comentario">✏️</button>
          )}
        </div>
        {editing ? (
          <div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 70 }} autoFocus {...paste.handlers} />
            {paste.busy && <div className="tiny muted">Subiendo imagen…</div>}
            <div className="row between" style={{ marginTop: 6 }}>
              <ImageUpload onUploaded={(u, n) => setText((x) => (x ? x + '\n' : '') + `![${n}](${u})`)} />
              <div className="row">
                <button className="btn sm" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn sm primary" disabled={busy || !text.trim() || text === c.body} onClick={save}>Guardar</button>
              </div>
            </div>
            <div className="hint">Al guardar, se avisa a las otras personas de la tarea y queda en el historial.</div>
          </div>
        ) : (
          <RichText text={c.body} />
        )}
      </div>
    </div>
  );
}
