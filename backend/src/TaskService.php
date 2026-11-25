<?php
declare(strict_types=1);

/**
 * Lógica de tareas: permisos, creación, edición, chequeos y finalización.
 */
class TaskService
{
    public const PRIORITIES = ['urgente', 'S', 'A', 'B', 'C'];
    public const STATUSES   = ['pendiente', 'en_progreso', 'aplazada', 'bloqueada', 'completada'];

    public const SELECT = "SELECT t.*, p.name AS project_name, p.color AS project_color,
            a.name AS a_name, a.email AS a_email, a.picture AS a_picture, a.timezone AS a_tz,
            s.name AS s_name, s.email AS s_email, s.picture AS s_picture, s.timezone AS s_tz,
            c.name AS c_name, c.email AS c_email, c.picture AS c_picture, c.timezone AS c_tz,
            (SELECT COUNT(*) FROM tasks ch WHERE ch.parent_task_id = t.id AND ch.status <> 'completada') AS children_open
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users s ON s.id = t.supervisor_id
       JOIN users c ON c.id = t.created_by";

    public static function find(int $id): array
    {
        $t = Db::one(self::SELECT . ' WHERE t.id = ?', [$id]);
        if (!$t) {
            throw new HttpError(404, 'La tarea no existe');
        }
        return $t;
    }

    public static function isMember(int $userId, int $projectId): bool
    {
        return (bool)Db::value('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', [$projectId, $userId]);
    }

    public static function canViewProject(array $user, int $projectId): bool
    {
        return in_array('proyectos.ver_todos', $user['permissions'], true) || self::isMember((int)$user['id'], $projectId);
    }

    public static function canView(array $user, array $task): bool
    {
        $uid = (int)$user['id'];
        return self::canViewProject($user, (int)$task['project_id'])
            || (int)$task['assignee_id'] === $uid || (int)$task['supervisor_id'] === $uid || (int)$task['created_by'] === $uid;
    }

    public static function canEdit(array $user, array $task): bool
    {
        // Quien creó la tarea (o la pidió como vinculada) también puede editarla
        return in_array('tareas.editar_todas', $user['permissions'], true)
            || (int)$task['created_by'] === (int)$user['id'];
    }

    public static function isAssignee(array $user, array $task): bool
    {
        return (int)$task['assignee_id'] === (int)$user['id'];
    }

    public static function log(int $taskId, ?int $userId, string $action, ?string $detail = null): void
    {
        Db::insert('task_activity', ['task_id' => $taskId, 'user_id' => $userId, 'action' => $action, 'detail' => $detail ? mb_substr($detail, 0, 500) : null]);
    }

    private static function person($id, ?string $name, ?string $email, ?string $picture, ?string $tz = null): ?array
    {
        if (!$id) {
            return null;
        }
        return ['id' => (int)$id, 'name' => $name ?: $email, 'email' => $email, 'picture' => $picture, 'timezone' => $tz];
    }

    /** Formato que recibe el frontend. */
    public static function serialize(array $t): array
    {
        return [
            'id'                     => (int)$t['id'],
            'project'                => ['id' => (int)$t['project_id'], 'name' => $t['project_name'], 'color' => $t['project_color']],
            'parent_task_id'         => $t['parent_task_id'] ? (int)$t['parent_task_id'] : null,
            'title'                  => $t['title'],
            'description'            => $t['description'],
            'priority'               => $t['priority'],
            'status'                 => $t['status'],
            'assignee'               => self::person($t['assignee_id'], $t['a_name'], $t['a_email'], $t['a_picture'], $t['a_tz']),
            'supervisor'             => self::person($t['supervisor_id'], $t['s_name'], $t['s_email'], $t['s_picture'], $t['s_tz']),
            'created_by'             => self::person($t['created_by'], $t['c_name'], $t['c_email'], $t['c_picture'], $t['c_tz']),
            'due_at'                 => Time::iso($t['due_at']),
            'due_tz'                 => $t['due_tz'],
            'reminder_every_minutes' => $t['reminder_every_minutes'] !== null ? (int)$t['reminder_every_minutes'] : null,
            'next_checkin_at'        => Time::iso($t['next_checkin_at']),
            'deferred_until'         => Time::iso($t['deferred_until']),
            'last_checkin_response'  => $t['last_checkin_response'],
            'last_checkin_at'        => Time::iso($t['last_checkin_at']),
            'completed_at'           => Time::iso($t['completed_at']),
            'created_at'             => Time::iso($t['created_at']),
            'updated_at'             => Time::iso($t['updated_at']),
            'children_open'          => (int)$t['children_open'],
        ];
    }

    // ------------------------------------------------------------- validación

    private static function validate(array $user, array $data, int $projectId, bool $partial): array
    {
        $out = [];
        if (!$partial || array_key_exists('title', $data)) {
            $out['title'] = str_field($data, 'title', 200, true);
        }
        if (array_key_exists('description', $data)) {
            $out['description'] = str_field($data, 'description', 20000);
        }
        if (!$partial || array_key_exists('priority', $data)) {
            $p = $data['priority'] ?? 'B';
            if (!in_array($p, self::PRIORITIES, true)) {
                throw new HttpError(422, 'Prioridad inválida');
            }
            $out['priority'] = $p;
        }
        if (array_key_exists('assignee_id', $data)) {
            $aid = int_field($data, 'assignee_id');
            if ($aid !== null && !self::isMember($aid, $projectId)) {
                throw new HttpError(422, 'La persona asignada debe ser miembro del proyecto');
            }
            $out['assignee_id'] = $aid;
        }
        if (array_key_exists('supervisor_id', $data)) {
            $sid = int_field($data, 'supervisor_id');
            if ($sid !== null && !Db::value('SELECT 1 FROM users WHERE id = ? AND active = 1', [$sid])) {
                throw new HttpError(422, 'El supervisor no existe');
            }
            $out['supervisor_id'] = $sid;
        }
        if (array_key_exists('due_local', $data)) {
            // La fecha llega en la hora local de quien la escribe (según su perfil)
            if ($data['due_local'] === null || $data['due_local'] === '') {
                $out['due_at'] = null;
                $out['due_tz'] = null;
            } else {
                $tz = Time::userTz($user);
                $out['due_at'] = Time::localToUtc((string)$data['due_local'], $tz);
                $out['due_tz'] = $tz;
            }
        }
        if (array_key_exists('reminder_every_minutes', $data)) {
            $r = int_field($data, 'reminder_every_minutes');
            if ($r !== null && ($r < 15 || $r > 60 * 24 * 30)) {
                throw new HttpError(422, 'La frecuencia de recordatorio debe estar entre 15 minutos y 30 días');
            }
            $out['reminder_every_minutes'] = $r;
        }
        return $out;
    }

    // ---------------------------------------------------------------- crear

    public static function create(array $user, array $data, ?array $parent = null): array
    {
        $projectId = $parent ? (int)$parent['project_id'] : (int)int_field($data, 'project_id');
        $project = Db::one('SELECT * FROM projects WHERE id = ? AND archived = 0', [$projectId]);
        if (!$project) {
            throw new HttpError(404, 'El proyecto no existe o está archivado');
        }
        if (!self::canViewProject($user, $projectId)) {
            throw new HttpError(403, 'No eres miembro de este proyecto');
        }

        $fields = self::validate($user, $data, $projectId, false);
        if ($parent) {
            // Tarea vinculada: quien la pide es el supervisor
            $fields['supervisor_id'] = (int)$user['id'];
            $fields['parent_task_id'] = (int)$parent['id'];
            if (empty($fields['assignee_id'])) {
                throw new HttpError(422, 'Elige a quién le pides esta tarea');
            }
        }
        $fields['project_id'] = $projectId;
        $fields['created_by'] = (int)$user['id'];
        $fields['updated_by'] = (int)$user['id'];
        if (!empty($fields['reminder_every_minutes'])) {
            $fields['next_checkin_at'] = Time::addMinutes(now_utc(), (int)$fields['reminder_every_minutes']);
        }

        $id = Db::insert('tasks', $fields);
        self::log($id, (int)$user['id'], $parent ? 'creada_vinculada' : 'creada', $fields['title']);
        $task = self::find($id);

        if ($parent) {
            Db::update('tasks', (int)$parent['id'], ['status' => 'bloqueada', 'updated_by' => (int)$user['id']]);
            self::log((int)$parent['id'], (int)$user['id'], 'bloqueada', 'Esperando la tarea #' . $id . ': ' . $task['title']);
        }

        self::notifyAssigned($task, $user, $parent !== null);
        return $task;
    }

    private static function notifyAssigned(array $task, array $by, bool $linked): void
    {
        if (!$task['assignee_id'] || (int)$task['assignee_id'] === (int)$by['id']) {
            if ($task['assignee_id'] && $task['due_at']) {
                Notifier::queueCalendar((int)$task['assignee_id'], (int)$task['id'], 'REQUEST');
            }
            return;
        }
        $byName = $by['name'] ?: $by['email'];
        $title = $linked ? "$byName te pidió una tarea: {$task['title']}" : "Nueva tarea asignada: {$task['title']}";
        $body = $linked
            ? "$byName necesita que completes esta tarea para poder terminar la suya. Cuando la termines, le avisaremos."
            : "$byName te asignó una tarea con prioridad " . self::priorityLabel($task['priority']) . '.';
        Notifier::notify((int)$task['assignee_id'], (int)$task['id'], $linked ? 'vinculada' : 'asignada', $title, $body, ['reply_to' => $by['email']]);
        if ($task['due_at']) {
            Notifier::queueCalendar((int)$task['assignee_id'], (int)$task['id'], 'REQUEST');
        }
    }

    public static function priorityLabel(string $p): string
    {
        return $p === 'urgente' ? 'URGENTE' : 'Tier ' . $p;
    }

    // --------------------------------------------------------------- editar

    public static function update(array $user, array $task, array $data): array
    {
        $fields = self::validate($user, $data, (int)$task['project_id'], true);

        if (array_key_exists('status', $data)) {
            $st = (string)$data['status'];
            if (!in_array($st, self::STATUSES, true)) {
                throw new HttpError(422, 'Estado inválido');
            }
            if ($st === 'completada' && $task['status'] !== 'completada') {
                Db::update('tasks', (int)$task['id'], $fields + ['updated_by' => (int)$user['id']]);
                self::complete(self::find((int)$task['id']), $user);
                return self::find((int)$task['id']);
            }
            $fields['status'] = $st;
            if ($task['status'] === 'completada' && $st !== 'completada') {
                $fields['completed_at'] = null; // reabierta
            }
        }

        $dueChanged = array_key_exists('due_at', $fields) && $fields['due_at'] !== $task['due_at'];
        if ($dueChanged) {
            $fields['due_24h_notified_at'] = null;
            $fields['due_1h_notified_at'] = null;
            $fields['overdue_notified_at'] = null;
            $fields['ics_sequence'] = (int)$task['ics_sequence'] + 1;
        }
        if (array_key_exists('reminder_every_minutes', $fields)) {
            $fields['next_checkin_at'] = $fields['reminder_every_minutes']
                ? Time::addMinutes(now_utc(), (int)$fields['reminder_every_minutes'])
                : null;
        }
        $fields['updated_by'] = (int)$user['id'];
        Db::update('tasks', (int)$task['id'], $fields);

        $changed = array_diff(array_keys($fields), ['updated_by', 'due_24h_notified_at', 'due_1h_notified_at', 'overdue_notified_at', 'ics_sequence', 'next_checkin_at', 'due_tz']);
        self::log((int)$task['id'], (int)$user['id'], 'editada', implode(', ', $changed));
        $new = self::find((int)$task['id']);

        // Cambio de asignado
        $assigneeChanged = array_key_exists('assignee_id', $fields) && (int)$fields['assignee_id'] !== (int)$task['assignee_id'];
        if ($assigneeChanged) {
            if ($task['assignee_id'] && $task['due_at']) {
                Notifier::queueCalendar((int)$task['assignee_id'], (int)$task['id'], 'CANCEL');
            }
            self::notifyAssigned($new, $user, false);
        } elseif ($dueChanged && $new['assignee_id']) {
            if ($new['due_at']) {
                Notifier::queueCalendar((int)$new['assignee_id'], (int)$new['id'], 'REQUEST');
                if ((int)$new['assignee_id'] !== (int)$user['id']) {
                    Notifier::notify((int)$new['assignee_id'], (int)$new['id'], 'fecha_cambiada',
                        'Cambió la fecha límite de: ' . $new['title'],
                        'Nueva fecha límite: ' . Time::human($new['due_at'], (string)($new['a_tz'] ?: config('default_timezone'))),
                        ['reply_to' => $user['email']]);
                }
            } else {
                Notifier::queueCalendar((int)$new['assignee_id'], (int)$new['id'], 'CANCEL');
            }
        }
        return $new;
    }

    // ------------------------------------------------------------- chequeo

    /**
     * Respuesta al "¿cómo va?": hecho | sigo | aplazar | empezar
     * Para aplazar: $until = '1h' | 'manana' | '3d' | '1w' | 'AAAA-MM-DDTHH:MM' (hora local del usuario)
     */
    public static function checkin(array $user, array $task, string $response, ?string $until = null): array
    {
        if (!self::isAssignee($user, $task) && !self::canEdit($user, $task)) {
            throw new HttpError(403, 'Solo la persona asignada puede responder el chequeo');
        }
        if ($task['status'] === 'completada') {
            throw new HttpError(409, 'Esta tarea ya está completada');
        }
        $uid = (int)$user['id'];
        $tid = (int)$task['id'];
        $now = now_utc();
        Notifier::closeCheckins($tid, $uid);

        switch ($response) {
            case 'hecho':
                self::complete($task, $user);
                break;

            case 'sigo':
            case 'empezar':
                $next = $task['reminder_every_minutes'] ? Time::addMinutes($now, (int)$task['reminder_every_minutes']) : null;
                Db::update('tasks', $tid, [
                    'status' => (int)$task['children_open'] > 0 ? 'bloqueada' : 'en_progreso',
                    'deferred_until' => null,
                    'next_checkin_at' => $next,
                    'last_checkin_response' => $response,
                    'last_checkin_at' => $now,
                    'updated_by' => $uid,
                ]);
                self::log($tid, $uid, $response === 'empezar' ? 'empezada' : 'sigue', null);
                break;

            case 'aplazar':
                $untilUtc = self::resolveUntil($user, (string)$until);
                if ($task['due_at'] && $untilUtc > $task['due_at']) {
                    // Se permite, pero queda registrado
                    self::log($tid, $uid, 'aviso', 'Aplazada más allá de la fecha límite');
                }
                Db::update('tasks', $tid, [
                    'status' => 'aplazada',
                    'deferred_until' => $untilUtc,
                    'next_checkin_at' => $untilUtc,
                    'last_checkin_response' => 'aplazar',
                    'last_checkin_at' => $now,
                    'updated_by' => $uid,
                ]);
                self::log($tid, $uid, 'aplazada', 'Hasta ' . Time::human($untilUtc, Time::userTz($user)));
                break;

            default:
                throw new HttpError(422, 'Respuesta inválida');
        }
        return self::find($tid);
    }

    private static function resolveUntil(array $user, string $until): string
    {
        $now = now_utc();
        switch ($until) {
            case '1h':
                return Time::addMinutes($now, 60);
            case '3h':
                return Time::addMinutes($now, 180);
            case '3d':
                return Time::nextWorkTime($user, Time::addMinutes($now, 3 * 1440));
            case '1w':
                return Time::nextWorkTime($user, Time::addMinutes($now, 7 * 1440));
            case 'manana':
            case '':
                // mañana al inicio de su horario (o 9:00 si no tiene)
                $tz = new DateTimeZone(Time::userTz($user));
                $start = $user['work_start'] ? substr($user['work_start'], 0, 5) : '09:00';
                $local = (new DateTimeImmutable('now', $tz))->modify('+1 day')->format('Y-m-d') . ' ' . $start;
                return Time::nextWorkTime($user, Time::localToUtc($local, Time::userTz($user)));
            default:
                $utc = Time::localToUtc($until, Time::userTz($user));
                if ($utc <= $now) {
                    throw new HttpError(422, 'La fecha para aplazar debe ser en el futuro');
                }
                return $utc;
        }
    }

    // ------------------------------------------------------------ completar

    public static function complete(array $task, array $by): void
    {
        $tid = (int)$task['id'];
        $now = now_utc();
        Db::update('tasks', $tid, [
            'status' => 'completada',
            'completed_at' => $now,
            'next_checkin_at' => null,
            'deferred_until' => null,
            'last_checkin_response' => 'hecho',
            'last_checkin_at' => $now,
            'updated_by' => (int)$by['id'],
        ]);
        $late = $task['due_at'] && $now > $task['due_at'];
        self::log($tid, (int)$by['id'], 'completada', $late ? 'Entregada tarde' : 'A tiempo');
        Notifier::closeCheckins($tid, (int)$task['assignee_id']);

        if ($task['assignee_id'] && $task['due_at']) {
            Notifier::queueCalendar((int)$task['assignee_id'], $tid, 'CANCEL');
        }

        $byName = $by['name'] ?: $by['email'];
        $notified = [];

        // Si era una tarea vinculada, ¿se desbloquea la tarea que esperaba?
        if ($task['parent_task_id']) {
            $parent = Db::one('SELECT * FROM tasks WHERE id = ?', [(int)$task['parent_task_id']]);
            if ($parent && $parent['status'] === 'bloqueada') {
                $open = (int)Db::value("SELECT COUNT(*) FROM tasks WHERE parent_task_id = ? AND status <> 'completada'", [(int)$parent['id']]);
                if ($open === 0) {
                    Db::update('tasks', (int)$parent['id'], ['status' => 'en_progreso']);
                    self::log((int)$parent['id'], null, 'desbloqueada', 'Se completó la tarea vinculada #' . $tid);
                    if ($parent['assignee_id']) {
                        Notifier::notify((int)$parent['assignee_id'], (int)$parent['id'], 'desbloqueada',
                            '🔓 Ya puedes continuar: ' . $parent['title'],
                            "$byName completó la tarea que pediste (\"{$task['title']}\"). Tu tarea quedó desbloqueada.");
                        $notified[] = (int)$parent['assignee_id'];
                    }
                }
            }
        }
        // Aviso al supervisor (si no recibió ya el aviso de desbloqueo)
        if ($task['supervisor_id'] && (int)$task['supervisor_id'] !== (int)$by['id'] && !in_array((int)$task['supervisor_id'], $notified, true)) {
            Notifier::notify((int)$task['supervisor_id'], $tid, 'completada',
                "✅ $byName terminó: {$task['title']}",
                $late ? 'Se entregó después de la fecha límite.' : 'Se entregó a tiempo.',
                ['reply_to' => $by['email']]);
        }
    }
}
