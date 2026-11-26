import { useState } from 'react';
import { api } from '../lib/api';
import { bumpRefresh, loadNotifications, toast, toastError } from '../stores/app';
import { Modal } from './ui';
import { useImagePaste } from './ImageUpload';

/**
 * Botones del supervisor:
 *  - Aprobar (solo si la tarea está En revisión) -> Completada
 *  - Devolver (En revisión o Completada) -> vuelve a la persona con un comentario
 */
export default function ReviewButtons({ taskId, status, onDone }: { taskId: number; status: string; onDone?: () => void }) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const paste = useImagePaste((u, n) => setComment((x) => (x ? x + '\n' : '') + `![${n}](${u})`));

  async function send(action: 'aprobar' | 'devolver') {
    setBusy(true);
    try {
      await api(`/tasks/${taskId}/review`, { method: 'POST', body: { action, comment: action === 'devolver' ? comment : undefined } });
      toast(action === 'aprobar' ? '✅ Entrega aprobada' : '↩ Devuelta con tu comentario');
      setReturning(false);
      setComment('');
      bumpRefresh();
      loadNotifications();
      onDone?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: '0.35rem' }}>
      {status === 'en_revision' && <button className="btn sm ok" disabled={busy} onClick={() => send('aprobar')}>✅ Aprobar</button>}
      <button className="btn sm danger" disabled={busy} onClick={() => setReturning(true)}>↩ Devolver</button>
      {returning && (
        <Modal title="↩ Devolver tarea" onClose={() => setReturning(false)}>
          <p className="small" style={{ marginTop: 0 }}>Explica qué hay que cambiar o completar. La tarea vuelve a "En progreso" y le avisamos a la persona.</p>
          <textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ej: falta el gráfico de diciembre y revisar los totales (puedes pegar capturas con Ctrl+V)" {...paste.handlers} />
          {paste.busy && <div className="tiny muted">Subiendo imagen…</div>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={() => setReturning(false)}>Cancelar</button>
            <button className="btn primary" disabled={busy || comment.trim().length < 3} onClick={() => send('devolver')}>Devolver</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
