import type { Task } from './types';
import { url } from './config';
import { formatDateTime } from './time';
import { myTz } from '../stores/session';

/**
 * Enlace https://wa.me/<número>?text=... que abre WhatsApp con el mensaje ya escrito.
 * Ojo: no se envía solo; quien lo abre tiene que tocar "Enviar".
 * El número debe tener código de país, sin "+" ni espacios (ej: 5491122334455).
 */
export function waLink(task: Task): string | null {
  const phone = task.assignee?.whatsapp_phone?.replace(/\D/g, '');
  if (!phone) return null;
  const tz = task.assignee?.timezone || myTz();
  const desc = (task.description || '')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '$1') // imágenes -> solo la URL
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .trim();
  const lines = [
    `${task.priority === 'urgente' ? '🔥 *Tarea URGENTE*' : '📋 *Tarea*'}: ${task.title}`,
    desc ? '\n' + (desc.length > 600 ? desc.slice(0, 600) + '…' : desc) : '',
    task.due_at ? `\n📅 Fecha límite (tu hora): ${formatDateTime(task.due_at, tz, true)}` : '',
    `\nVer en la app: ${window.location.origin}${url(`/tarea/?id=${task.id}`)}`,
  ];
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
}
