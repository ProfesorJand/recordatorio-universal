// Tipos compartidos (lo que devuelve la API PHP)

export type Priority = 'urgente' | 'S' | 'A' | 'B' | 'C';
export type Status = 'pendiente' | 'en_progreso' | 'aplazada' | 'bloqueada' | 'en_revision' | 'completada';

export interface Person {
  id: number;
  name: string;
  email: string;
  picture?: string | null;
  timezone?: string | null;
  whatsapp_phone?: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: { id: number; slug: string | null; name: string | null };
  is_owner: boolean;
  timezone: string | null;
  work_start: string | null;
  work_end: string | null;
  work_days: number[];
  notify_email: boolean;
  whatsapp_phone: string | null;
  tutorials_seen: string[];
  permissions: string[];
  supervises?: number; // cuántas personas supervisa
}

export interface Task {
  id: number;
  project: { id: number; name: string; color: string };
  parent_task_id: number | null;
  title: string;
  description: string | null;
  priority: Priority;
  effective_priority: Priority; // sube sola a medida que se acerca la fecha límite
  status: Status;
  assignee: Person | null;
  supervisor: Person | null;
  created_by: Person;
  due_at: string | null; // ISO UTC
  due_tz: string | null; // zona de quien fijó la fecha
  reminder_every_minutes: number | null;
  reminder_start_at: string | null; // desde cuándo recordar
  original_due_at: string | null; // primera fecha límite
  due_changes: number; // cuántas veces se cambió la fecha límite
  defer_count: number; // cuántas veces se aplazó el recordatorio
  next_checkin_at: string | null;
  deferred_until: string | null;
  last_checkin_response: string | null;
  last_checkin_at: string | null;
  completed_at: string | null;
  requires_review: boolean; // el supervisor aprueba la entrega
  delivered_at: string | null; // cuándo la entregó la persona asignada
  returned_count: number; // veces que el supervisor la devolvió
  created_at: string;
  updated_at: string;
  children_open: number; // tareas de las que depende que siguen sin terminar
  depends_on_ids: number[];
  worked_seconds: number; // tiempo trabajado (cronómetro + ajustes) // tareas que deben terminarse antes
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  color: string;
  archived: boolean;
  created_at: string;
  members_count: number;
  open_tasks: number;
  members?: Person[];
  resources?: { id: number; type: 'link' | 'image'; title: string; url: string; created_at: string }[];
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  actionable: boolean;
  read: boolean;
  created_at: string;
  task: { id: number; title: string; status: Status; due_at: string | null; priority: Priority } | null;
}
