-- =====================================================================
--  Recordatorio Universal - Esquema MySQL
--  Importar desde cPanel > phpMyAdmin > (tu base de datos) > Importar
--  Todas las fechas se guardan en UTC. La zona horaria de cada usuario
--  está en users.timezone y la zona de quien fijó la fecha en tasks.due_tz
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- Roles y permisos
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  can_login   TINYINT(1)   NOT NULL DEFAULT 1,   -- 0 = suspendido
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,   -- los de sistema no se borran
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  perm_key    VARCHAR(80)  NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Usuarios (solo entran los correos que el admin agregó aquí)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL UNIQUE,
  name           VARCHAR(150) NULL,
  picture        VARCHAR(500) NULL,
  google_sub     VARCHAR(64)  NULL UNIQUE,
  role_id        INT UNSIGNED NOT NULL,
  is_owner       TINYINT(1)   NOT NULL DEFAULT 0,  -- admin principal, no se puede degradar
  active         TINYINT(1)   NOT NULL DEFAULT 1,  -- 0 = quitado de la app
  timezone       VARCHAR(64)  NULL,                -- ej: America/Argentina/Buenos_Aires
  work_start     TIME         NULL,                -- horario laboral (en su zona)
  work_end       TIME         NULL,
  work_days      VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5', -- 1=lunes ... 7=domingo
  notify_email   TINYINT(1)   NOT NULL DEFAULT 1,
  whatsapp_phone VARCHAR(30)  NULL,                -- para la fase de WhatsApp
  tutorials_seen VARCHAR(500) NOT NULL DEFAULT '', -- lista separada por comas
  added_by       INT UNSIGNED NULL,
  first_login_at DATETIME     NULL,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL UNIQUE,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent  VARCHAR(255) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------
CREATE TABLE projects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT NULL,
  color       VARCHAR(9)   NOT NULL DEFAULT '#257de0',
  archived    TINYINT(1)   NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_members (
  project_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material de apoyo del proyecto (enlaces o imágenes)
CREATE TABLE project_resources (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  type        ENUM('link','image') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  url         VARCHAR(1000) NOT NULL,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id             INT UNSIGNED NOT NULL,
  parent_task_id         INT UNSIGNED NULL,   -- si es una tarea vinculada: la tarea que espera por esta
  title                  VARCHAR(200) NOT NULL,
  description            TEXT NULL,           -- admite enlaces e imágenes (![](url))
  priority               ENUM('urgente','S','A','B','C') NOT NULL DEFAULT 'B',
  status                 ENUM('pendiente','en_progreso','aplazada','bloqueada','completada') NOT NULL DEFAULT 'pendiente',
  assignee_id            INT UNSIGNED NULL,   -- una sola persona
  supervisor_id          INT UNSIGNED NULL,   -- recibe el aviso al terminar (opcional)
  created_by             INT UNSIGNED NOT NULL,
  updated_by             INT UNSIGNED NULL,
  due_at                 DATETIME NULL,       -- UTC
  due_tz                 VARCHAR(64) NULL,    -- zona horaria de quien fijó la fecha
  reminder_every_minutes INT UNSIGNED NULL,   -- frecuencia de chequeo (opcional)
  next_checkin_at        DATETIME NULL,       -- UTC
  deferred_until         DATETIME NULL,       -- UTC, si está aplazada
  last_checkin_response  VARCHAR(20) NULL,
  last_checkin_at        DATETIME NULL,
  due_24h_notified_at    DATETIME NULL,
  due_1h_notified_at     DATETIME NULL,
  overdue_notified_at    DATETIME NULL,
  ics_sequence           INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at           DATETIME NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_project (project_id),
  INDEX idx_tasks_assignee (assignee_id),
  INDEX idx_tasks_checkin (next_checkin_at),
  INDEX idx_tasks_due (due_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  body        TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial (también alimenta las estadísticas)
CREATE TABLE task_activity (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(40)  NOT NULL,
  detail      VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_task (task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Archivos subidos (imágenes de tareas, proyectos, comentarios)
CREATE TABLE uploads (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stored_name VARCHAR(100) NOT NULL UNIQUE,
  original    VARCHAR(255) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  size_bytes  INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Notificaciones
--  channel=app   -> aparece en la campanita / alerta dentro de la app
--  channel=email -> la envía el cron por SMTP
--  escalate_at   -> si a esa hora no respondió la alerta, se manda por correo
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  task_id      INT UNSIGNED NULL,
  type         VARCHAR(30)  NOT NULL,  -- asignada, checkin, vence_24h, vence_1h, vencida, completada, comentario, desbloqueada, vinculada
  channel      ENUM('app','email','whatsapp') NOT NULL,
  title        VARCHAR(255) NOT NULL,
  body         TEXT NULL,
  actionable   TINYINT(1)   NOT NULL DEFAULT 0,  -- muestra botones Hecho / Sigo / Aplazar
  reply_to     VARCHAR(190) NULL,
  status       ENUM('pendiente','enviada','leida','respondida','cancelada','error') NOT NULL DEFAULT 'pendiente',
  scheduled_at DATETIME NOT NULL,   -- respeta el horario laboral del destinatario
  escalate_at  DATETIME NULL,
  escalated    TINYINT(1) NOT NULL DEFAULT 0,
  sent_at      DATETIME NULL,
  read_at      DATETIME NULL,
  error        VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, channel, status),
  INDEX idx_notif_sched (channel, status, scheduled_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlaces de un solo uso para responder desde el correo
CREATE TABLE action_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  task_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  Datos iniciales
-- =====================================================================
INSERT INTO roles (id, slug, name, can_login, is_system) VALUES
 (1, 'admin',      'Admin',      1, 1),
 (2, 'trabajador', 'Trabajador', 1, 1),
 (3, 'suspendido', 'Suspendido', 0, 1);

INSERT INTO permissions (perm_key, description) VALUES
 ('usuarios.gestionar',          'Agregar correos autorizados, cambiar roles y quitar usuarios'),
 ('roles.gestionar',             'Crear roles y editar los permisos de cada rol'),
 ('proyectos.crear',             'Crear, editar y archivar proyectos y elegir sus miembros'),
 ('proyectos.ver_todos',         'Ver todos los proyectos aunque no sea miembro'),
 ('proyectos.recursos',          'Agregar enlaces e imágenes de apoyo a un proyecto'),
 ('tareas.crear',                'Crear tareas directamente en un proyecto'),
 ('tareas.crear_vinculada',      'Pedir una tarea vinculada a otra persona desde su propia tarea'),
 ('tareas.editar_todas',         'Editar cualquier tarea'),
 ('tareas.eliminar',             'Eliminar tareas'),
 ('tareas.comentar',             'Comentar en las tareas donde participa'),
 ('estadisticas.ver_individual', 'Ver sus propias estadísticas'),
 ('estadisticas.ver_todos',      'Ver las estadísticas de todos los usuarios');

-- Admin: todos los permisos
INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions;

-- Trabajador
INSERT INTO role_permissions (role_id, permission_id)
 SELECT 2, id FROM permissions WHERE perm_key IN
 ('tareas.crear_vinculada','tareas.comentar','estadisticas.ver_individual');

-- Suspendido: ninguno (y can_login = 0)

-- Admin principal
INSERT INTO users (email, name, role_id, is_owner) VALUES ('profesorjand@gmail.com', 'Profesor Jand', 1, 1);
