<?php
declare(strict_types=1);

/**
 * Motor de recordatorios. Ejecutar cada 5 minutos desde cPanel > Cron Jobs:
 *
 *   /usr/local/bin/php /home/TU_USUARIO/api.guiadeparche.com/recordatorio/cron/run.php
 *
 * (o por URL: https://api.guiadeparche.com/recordatorio/cron/run.php?key=CRON_KEY)
 */
require dirname(__DIR__) . '/src/bootstrap.php';

$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    if (!hash_equals((string)config('cron_key'), (string)($_GET['key'] ?? ''))) {
        http_response_code(403);
        exit('No autorizado');
    }
    header('Content-Type: text/plain; charset=utf-8');
}

// Evitar que dos ejecuciones se pisen
$lockDir = APP_ROOT . '/storage';
if (!is_dir($lockDir)) {
    @mkdir($lockDir, 0775, true);
}
$lock = fopen($lockDir . '/cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit("Ya hay un cron en ejecución\n");
}

$report = [];
$now = now_utc();

function out_line(string $s): void
{
    echo $s . "\n";
}

function due_text(array $t, array $u): string
{
    if (!$t['due_at']) {
        return '';
    }
    $tz = Time::userTz($u);
    $now = now_utc();
    if ($t['due_at'] < $now) {
        return 'Venció hace ' . Time::humanDiff($t['due_at'], $now) . ' (' . Time::human($t['due_at'], $tz) . ').';
    }
    return 'Fecha límite en ' . Time::humanDiff($now, $t['due_at']) . ': ' . Time::human($t['due_at'], $tz) . '.';
}

function has_open_checkin(int $taskId, int $userId): bool
{
    return (bool)Db::value(
        "SELECT 1 FROM notifications WHERE task_id = ? AND user_id = ? AND channel = 'app' AND actionable = 1 AND status IN ('pendiente','enviada','leida') LIMIT 1",
        [$taskId, $userId]
    );
}

try {
    // 1) Tareas aplazadas que ya llegaron a su fecha -> vuelven a pendiente
    $back = Db::query(
        "UPDATE tasks SET status = 'pendiente', deferred_until = NULL, next_checkin_at = COALESCE(next_checkin_at, UTC_TIMESTAMP())
          WHERE status = 'aplazada' AND deferred_until IS NOT NULL AND deferred_until <= UTC_TIMESTAMP()"
    )->rowCount();
    $report[] = "Aplazadas reactivadas: $back";

    // 2) Fechas límite: aviso 24 h y 1 h antes
    $soon = Db::all(
        "SELECT t.*, u.timezone, u.work_start, u.work_end, u.work_days FROM tasks t JOIN users u ON u.id = t.assignee_id
          WHERE t.status <> 'completada' AND t.due_at IS NOT NULL AND t.due_at > UTC_TIMESTAMP()
            AND ((t.due_at <= UTC_TIMESTAMP() + INTERVAL 1 HOUR AND t.due_1h_notified_at IS NULL)
              OR (t.due_at <= UTC_TIMESTAMP() + INTERVAL 24 HOUR AND t.due_24h_notified_at IS NULL))"
    );
    foreach ($soon as $t) {
        $oneHour = strtotime($t['due_at'] . ' UTC') - time() <= 3600;
        Notifier::closeCheckins((int)$t['id'], (int)$t['assignee_id']); // reemplaza el chequeo abierto
        Notifier::notify((int)$t['assignee_id'], (int)$t['id'], $oneHour ? 'vence_1h' : 'vence_24h',
            ($oneHour ? '🚨 Falta menos de 1 hora: ' : '⏰ Vence pronto: ') . $t['title'],
            due_text($t, $t) . ' ¿Cómo vas?',
            ['actionable' => true]);
        Db::update('tasks', (int)$t['id'], $oneHour
            ? ['due_1h_notified_at' => $now, 'due_24h_notified_at' => $t['due_24h_notified_at'] ?: $now]
            : ['due_24h_notified_at' => $now]);
    }
    $report[] = 'Avisos de fecha límite: ' . count($soon);

    // 3) Vencidas: aviso a la persona asignada y al supervisor (o a quien la creó). Se repite cada 24 h.
    $overdue = Db::all(
        "SELECT t.*, a.name AS a_name, a.email AS a_email, a.timezone FROM tasks t LEFT JOIN users a ON a.id = t.assignee_id
          WHERE t.status <> 'completada' AND t.due_at IS NOT NULL AND t.due_at <= UTC_TIMESTAMP()
            AND (t.overdue_notified_at IS NULL OR t.overdue_notified_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR)"
    );
    foreach ($overdue as $t) {
        $who = $t['a_name'] ?: ($t['a_email'] ?: 'Nadie');
        if ($t['assignee_id']) {
            Notifier::closeCheckins((int)$t['id'], (int)$t['assignee_id']);
            Notifier::notify((int)$t['assignee_id'], (int)$t['id'], 'vencida',
                '⚠️ Tarea vencida: ' . $t['title'],
                due_text($t, $t) . ' Actualiza su estado o avisa a tu supervisor.',
                ['actionable' => true]);
        }
        $boss = $t['supervisor_id'] ?: $t['created_by'];
        if ($boss && (int)$boss !== (int)$t['assignee_id']) {
            Notifier::notify((int)$boss, (int)$t['id'], 'vencida_supervisor',
                "⚠️ $who aún no completa: {$t['title']}",
                "La fecha límite ya pasó y la tarea sigue en estado \"" . str_replace('_', ' ', $t['status']) . "\". Puede ser buen momento para preguntarle cómo va o si necesita ayuda.",
                ['reply_to' => $t['a_email'] ?: null]);
        }
        Db::update('tasks', (int)$t['id'], ['overdue_notified_at' => $now]);
    }
    $report[] = 'Vencidas avisadas: ' . count($overdue);

    // 4) Chequeo periódico "¿ya lo hiciste?"
    $checkins = Db::all(
        "SELECT t.*, u.timezone FROM tasks t JOIN users u ON u.id = t.assignee_id
          WHERE t.status IN ('pendiente','en_progreso') AND t.next_checkin_at IS NOT NULL AND t.next_checkin_at <= UTC_TIMESTAMP()"
    );
    $created = 0;
    foreach ($checkins as $t) {
        $next = $t['reminder_every_minutes'] ? Time::addMinutes($now, (int)$t['reminder_every_minutes']) : null;
        Db::update('tasks', (int)$t['id'], ['next_checkin_at' => $next]);
        if (has_open_checkin((int)$t['id'], (int)$t['assignee_id'])) {
            continue; // ya tiene una pregunta sin responder: no insistimos dos veces
        }
        $body = $t['status'] === 'pendiente' ? 'Todavía no la empezaste.' : 'La última vez dijiste que seguías en eso.';
        if ($t['due_at']) {
            $body .= ' ' . due_text($t, $t);
        }
        Notifier::notify((int)$t['assignee_id'], (int)$t['id'], 'checkin', '🤔 ¿Cómo va?: ' . $t['title'], $body, ['actionable' => true]);
        $created++;
    }
    $report[] = "Chequeos enviados: $created";

    // 5) Alertas sin respuesta -> correo
    $report[] = 'Escaladas a correo: ' . Notifier::escalate();

    // 6) Enviar correos
    $r = Notifier::sendPendingEmails();
    $report[] = "Correos enviados: {$r['sent']} (errores: {$r['failed']})";

    // 7) Limpieza
    Db::query("DELETE FROM notifications WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY");
    Db::query("DELETE FROM action_tokens WHERE expires_at < UTC_TIMESTAMP()");
} catch (Throwable $e) {
    app_log('CRON ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $report[] = 'ERROR: ' . $e->getMessage();
}

foreach ($report as $line) {
    out_line($line);
}
flock($lock, LOCK_UN);
