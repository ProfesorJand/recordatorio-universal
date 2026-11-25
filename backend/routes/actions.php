<?php
declare(strict_types=1);
/** @var Router $router */

/**
 * Botones del correo (Hecho / Sigo / Aplazar).
 * GET muestra una confirmación (los antivirus de correo abren los enlaces
 * automáticamente, así que la acción real se hace con POST).
 */

function action_page(string $title, string $content): void
{
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . e($title) . '</title><style>'
        . 'body{margin:0;background:#f4f5f7;font-family:system-ui,Arial,sans-serif;color:#191919}'
        . '.c{max-width:440px;margin:40px auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06)}'
        . 'h1{font-size:20px;margin:0 0 12px}p{line-height:1.5}'
        . 'button,.b{display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;color:#fff;text-align:center;text-decoration:none}'
        . '.g{background:#008a17}.bl{background:#257de0}.v{background:#6a4ce2}.n{background:#e9ebef;color:#191919}'
        . 'input{width:100%;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box}'
        . '</style></head><body><div class="c">' . $content . '</div></body></html>';
    exit;
}

function action_context(string $token): array
{
    $row = Db::one('SELECT * FROM action_tokens WHERE token_hash = ?', [hash('sha256', $token)]);
    if (!$row || $row['expires_at'] < now_utc()) {
        action_page('Enlace vencido', '<h1>Este enlace ya venció</h1><p>Abre la aplicación para actualizar la tarea.</p><a class="b bl" href="' . e(config('frontend_url')) . '/tareas/">Abrir la aplicación</a>');
    }
    $user = Db::one('SELECT u.*, r.can_login FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.active = 1', [$row['user_id']]);
    if (!$user || !(int)$user['can_login']) {
        action_page('Sin acceso', '<h1>Tu cuenta no tiene acceso</h1>');
    }
    $user['permissions'] = Auth::permissionsForRole((int)$user['role_id']);
    $task = Db::one(TaskService::SELECT . ' WHERE t.id = ?', [$row['task_id']]);
    if (!$task) {
        action_page('Tarea no encontrada', '<h1>La tarea ya no existe</h1>');
    }
    return [$row, $user, $task];
}

$router->get('/actions/{token}', function (array $p) {
    [, $user, $task] = action_context($p['token']);
    $do = $_GET['do'] ?? '';
    $tz = Time::userTz($user);
    $head = '<h1>' . e($task['title']) . '</h1>'
        . ($task['due_at'] ? '<p>Fecha límite: <strong>' . e(Time::human($task['due_at'], $tz)) . '</strong></p>' : '');

    if ($task['status'] === 'completada') {
        action_page('Completada', $head . '<p>✅ Esta tarea ya está completada.</p>');
    }
    $form = fn(string $inner) => '<form method="post">' . $inner . '</form>';

    if ($do === 'hecho') {
        action_page('Confirmar', $head . $form('<input type="hidden" name="do" value="hecho"><button class="g">✅ Sí, ya lo hice</button>'));
    }
    if ($do === 'sigo') {
        action_page('Confirmar', $head . $form('<input type="hidden" name="do" value="sigo"><button class="bl">🔄 Sigo trabajando en eso</button>'));
    }
    // aplazar (o cualquier otro): mostrar todas las opciones
    $opts = '';
    foreach (['1h' => 'En 1 hora', '3h' => 'En 3 horas', 'manana' => 'Mañana', '3d' => 'En 3 días', '1w' => 'En 1 semana'] as $k => $label) {
        $opts .= $form('<input type="hidden" name="do" value="aplazar"><input type="hidden" name="until" value="' . $k . '"><button class="v">⏰ ' . $label . '</button>');
    }
    action_page('¿Cómo va?', $head
        . $form('<input type="hidden" name="do" value="hecho"><button class="g">✅ Ya lo hice</button>')
        . $form('<input type="hidden" name="do" value="sigo"><button class="bl">🔄 Sigo en eso</button>')
        . '<p style="margin-top:20px"><strong>Aplazar el recordatorio:</strong></p>' . $opts
        . $form('<input type="hidden" name="do" value="aplazar"><p>O elige fecha y hora (tu hora, ' . e($tz) . '):</p><input type="datetime-local" name="until" required><button class="v">Aplazar hasta esa fecha</button>'));
});

$router->post('/actions/{token}', function (array $p) {
    [$row, $user, $task] = action_context($p['token']);
    $do = (string)($_POST['do'] ?? '');
    try {
        TaskService::checkin($user, $task, $do, isset($_POST['until']) ? (string)$_POST['until'] : null);
    } catch (HttpError $e) {
        action_page('No se pudo', '<h1>No se pudo actualizar</h1><p>' . e($e->getMessage()) . '</p>');
    }
    Db::update('action_tokens', (int)$row['id'], ['used_at' => now_utc()]);
    $msg = [
        'hecho'   => '✅ ¡Listo! Marcamos la tarea como completada.',
        'sigo'    => '🔄 Perfecto, te volveremos a preguntar más adelante.',
        'aplazar' => '⏰ Aplazada. Te recordaremos en la fecha elegida.',
    ][$do] ?? 'Actualizado.';
    action_page('Listo', '<h1>' . e($task['title']) . '</h1><p>' . $msg . '</p><a class="b n" href="' . e(rtrim((string)config('frontend_url'), '/')) . '/tarea/?id=' . (int)$task['id'] . '">Ver la tarea</a>');
});
