import type { AppNotification } from '../lib/types';
import CheckinButtons from './CheckinButtons';
import ReviewButtons from './ReviewButtons';

/** Botones de una alerta: revisión (supervisor) o "¿cómo va?" (persona asignada) */
export const isReviewAlert = (n: AppNotification) =>
  (n.type === 'revision' || n.type === 'revision_pendiente') && n.task?.status === 'en_revision';

export default function AlertActions({ n }: { n: AppNotification }) {
  if (!n.task) return null;
  return isReviewAlert(n) ? <ReviewButtons taskId={n.task.id} status={n.task.status} /> : <CheckinButtons taskId={n.task.id} status={n.task.status} />;
}
