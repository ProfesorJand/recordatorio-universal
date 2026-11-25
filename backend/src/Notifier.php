<?php
declare(strict_types=1);

/**
 * Crea y envía notificaciones.
 *
 *  - Toda notificación se programa para el próximo momento dentro del
 *    horario laboral del destinatario (para no despertar a nadie).
 *  - Las alertas "accionables" (¿ya lo hiciste?) aparecen primero en la app
 *    (y en WhatsApp cuando se active). Si en 30 min no responde, se manda
 *    por correo con botones Hecho / Sigo / Aplazar.
 */
class Notifier
{
    /**
     * @param array $opts channels: ['app','email'], actionable: bool, reply_to: ?string
     */
    public static function notify(int $userId, ?int $taskId, string $type, string $title, string $body = '', array $opts = []): void
    {
        $user = Db::one('SELECT * FROM users WHERE id = ? AND active = 1', [$userId]);
        if (!$user) {
            return;
        }
        $channels   = $opts['channels'] ?? ['app', 'email'];
        $actionable = !empty($opts['actionable']);
        $scheduled  = Time::nextWorkTime($user, now_utc());

        if (in_array('app', $channels, true)) {
            Db::insert('notifications', [
                'user_id'      => $userId,
                'task_id'      => $taskId,
                'type'         => $type,
                'channel'      => 'app',
                'title'        => $title,
                'body'         => $body,
                'actionable'   => $actionable ? 1 : 0,
                'scheduled_at' => $scheduled,
                // si es accionable y no responde, se escala a correo
                'escalate_at'  => $actionable ? Time::addMinutes($scheduled, (int)config('escalate_minutes', 30)) : null,
            ]);
        }

        // WhatsApp (fase futura): aquí se insertaría channel='whatsapp' si
        // el usuario tiene whatsapp_phone y la integración está activa.

        if (in_array('email', $channels, true) && (int)$user['notify_email']) {
            self::queueEmail($userId, $taskId, $type, $title, $body, $actionable, $opts['reply_to'] ?? null, $scheduled);
        }
    }

    public static function queueEmail(int $userId, ?int $taskId, string $type, string $title, string $body, bool $actionable, ?string $replyTo, string $scheduled): void
    {
        Db::insert('notifications', [
            'user_id'      => $userId,
            'task_id'      => $taskId,
            'type'         => $type,
            'channel'      => 'email',
            'title'        => $title,
            'body'         => $body,
            'actionable'   => $actionable ? 1 : 0,
            'reply_to'     => $replyTo,
            'scheduled_at' => $scheduled,
        ]);
    }

    /** Invitación de calendario (crear/actualizar o cancelar). Se genera al enviar. */
    public static function queueCalendar(int $userId, int $taskId, string $method): void
    {
        $user = Db::one('SELECT * FROM users WHERE id = ? AND active = 1', [$userId]);
        if (!$user || !(int)$user['notify_email']) {
            return;
        }
        // Si había otra invitación pendiente para la misma tarea, se reemplaza
        Db::query(
            "UPDATE notifications SET status = 'cancelada'
              WHERE user_id = ? AND task_id = ? AND channel = 'email' AND status = 'pendiente' AND type IN ('calendario_request','calendario_cancel')",
            [$userId, $taskId]
        );
        self::queueEmail(
            $userId, $taskId,
            $method === 'CANCEL' ? 'calendario_cancel' : 'calendario_request',
            $method === 'CANCEL' ? 'Evento quitado del calendario' : 'Fecha límite agregada a tu calendario',
            '', false, null,
            Time::nextWorkTime($user, now_utc())
        );
    }

    /** El usuario respondió el chequeo: se cierran las alertas abiertas de esa tarea. */
    public static function closeCheckins(int $taskId, int $userId): void
    {
        Db::query(
            "UPDATE notifications SET status = 'respondida', read_at = COALESCE(read_at, UTC_TIMESTAMP())
              WHERE task_id = ? AND user_id = ? AND actionable = 1 AND channel = 'app' AND status IN ('pendiente','enviada','leida')",
            [$taskId, $userId]
        );
        Db::query(
            "UPDATE notifications SET status = 'cancelada'
              WHERE task_id = ? AND user_id = ? AND actionable = 1 AND channel IN ('email','whatsapp') AND status = 'pendiente'",
            [$taskId, $userId]
        );
    }

    /** Alertas en la app sin respuesta después de 30 min -> correo. */
    public static function escalate(): int
    {
        $rows = Db::all(
            "SELECT n.*, u.notify_email FROM notifications n JOIN users u ON u.id = n.user_id
              WHERE n.channel = 'app' AND n.actionable = 1 AND n.escalated = 0
                AND n.status IN ('pendiente','enviada','leida')
                AND n.escalate_at IS NOT NULL AND n.escalate_at <= UTC_TIMESTAMP()
              LIMIT 100"
        );
        foreach ($rows as $n) {
            Db::update('notifications', (int)$n['id'], ['escalated' => 1]);
            if ((int)$n['notify_email']) {
                self::queueEmail((int)$n['user_id'], $n['task_id'] ? (int)$n['task_id'] : null, $n['type'], $n['title'], (string)$n['body'], true, null, now_utc());
            }
        }
        return count($rows);
    }

    /** Envía los correos que ya llegaron a su hora. */
    public static function sendPendingEmails(int $limit = 40): array
    {
        $sent = 0;
        $failed = 0;
        $rows = Db::all(
            "SELECT n.*, u.email, u.name, u.timezone FROM notifications n JOIN users u ON u.id = n.user_id
              WHERE n.channel = 'email' AND n.status = 'pendiente' AND n.scheduled_at <= UTC_TIMESTAMP()
              ORDER BY n.scheduled_at LIMIT " . (int)$limit
        );
        foreach ($rows as $n) {
            try {
                self::sendOne($n);
                Db::update('notifications', (int)$n['id'], ['status' => 'enviada', 'sent_at' => now_utc()]);
                $sent++;
            } catch (Throwable $e) {
                Db::update('notifications', (int)$n['id'], ['status' => 'error', 'error' => substr($e->getMessage(), 0, 500)]);
                app_log('Error de correo #' . $n['id'] . ': ' . $e->getMessage());
                $failed++;
            }
        }
        return ['sent' => $sent, 'failed' => $failed];
    }

    private static function sendOne(array $n): void
    {
        $task = $n['task_id'] ? Db::one('SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?', [$n['task_id']]) : null;
        $tz = Time::userTz($n);

        // Invitaciones de calendario
        if (in_array($n['type'], ['calendario_request', 'calendario_cancel'], true)) {
            if (!$task || !$task['due_at']) {
                return;
            }
            $method = $n['type'] === 'calendario_cancel' ? 'CANCEL' : 'REQUEST';
            $ics = Ics::forTask($task, $n['email'], (string)$n['name'], $method);
            $subject = ($method === 'CANCEL' ? 'Cancelado: ' : 'Entrega: ') . $task['title'] . ' - ' . Time::human($task['due_at'], $tz);
            $html = self::layout(
                $method === 'CANCEL' ? 'Quitamos esta entrega de tu calendario' : 'Agregamos la fecha límite a tu calendario',
                '<p><strong>' . e($task['title']) . '</strong><br>Fecha límite: ' . e(Time::human($task['due_at'], $tz)) . '</p>'
                . '<p style="color:#666;font-size:13px">Si no se agregó solo, abre la invitación y toca "Sí" / "Agregar al calendario".</p>',
                $task
            );
            Mailer::send($n['email'], $subject, $html, null, ['content' => $ics, 'method' => $method]);
            return;
        }

        $content = '<p>' . nl2br(e((string)$n['body'])) . '</p>';
        if ($task) {
            $content .= '<p style="margin:16px 0 4px"><strong>' . e($task['title']) . '</strong> <span style="color:#666">(' . e($task['project_name']) . ')</span></p>';
            if ($task['due_at']) {
                $content .= '<p style="margin:0;color:#444">Fecha límite (tu hora): ' . e(Time::human($task['due_at'], $tz)) . '</p>';
            }
        }
        if ((int)$n['actionable'] && $task && $task['status'] !== 'completada') {
            $content .= self::actionButtons((int)$task['id'], (int)$n['user_id']);
        }
        Mailer::send($n['email'], $n['title'], self::layout($n['title'], $content, $task), $n['reply_to'] ?: null);
    }

    private static function actionButtons(int $taskId, int $userId): string
    {
        $token = random_token(24);
        Db::insert('action_tokens', [
            'token_hash' => hash('sha256', $token),
            'task_id'    => $taskId,
            'user_id'    => $userId,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 7 * 86400),
        ]);
        $base = rtrim((string)config('api_url'), '/') . '/actions/' . $token;
        $btn = fn(string $label, string $do, string $color) =>
            '<a href="' . e($base . '?do=' . $do) . '" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:8px;background:' . $color . ';color:#fff;text-decoration:none;font-weight:600">' . $label . '</a>';
        return '<p style="margin-top:20px">¿Cómo va?</p><p>'
            . $btn('✅ Ya lo hice', 'hecho', '#008a17')
            . $btn('🔄 Sigo en eso', 'sigo', '#257de0')
            . $btn('⏰ Aplazar', 'aplazar', '#6a4ce2')
            . '</p>';
    }

    public static function layout(string $heading, string $content, ?array $task = null): string
    {
        $link = $task
            ? rtrim((string)config('frontend_url'), '/') . '/tarea/?id=' . $task['id']
            : rtrim((string)config('frontend_url'), '/') . '/tareas/';
        return '<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">'
            . '<div style="max-width:560px;margin:0 auto;padding:24px">'
            . '<div style="background:#fff;border-radius:12px;padding:24px;color:#191919">'
            . '<p style="margin:0 0 8px;color:#257de0;font-weight:700">Recordatorio Universal</p>'
            . '<h2 style="margin:0 0 12px;font-size:20px">' . e($heading) . '</h2>'
            . $content
            . '<p style="margin-top:24px"><a href="' . e($link) . '" style="color:#257de0">Abrir en la aplicación →</a></p>'
            . '</div><p style="color:#999;font-size:12px;text-align:center">Recibes este correo porque participas en una tarea. Puedes cambiar tu horario de avisos en tu perfil.</p>'
            . '</div></body></html>';
    }
}
