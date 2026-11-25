<?php
declare(strict_types=1);
/** @var Router $router */

// Notificaciones dentro de la app (campanita + alertas "¿cómo va?")
$router->get('/notifications', function () {
    $u = Auth::require();
    $rows = Db::all(
        "SELECT n.*, t.title AS task_title, t.status AS task_status, t.due_at AS task_due_at, t.priority AS task_priority
           FROM notifications n LEFT JOIN tasks t ON t.id = n.task_id
          WHERE n.user_id = ? AND n.channel = 'app' AND n.scheduled_at <= UTC_TIMESTAMP() AND n.status <> 'cancelada'
          ORDER BY (n.status IN ('pendiente','enviada')) DESC, n.scheduled_at DESC
          LIMIT 60",
        [$u['id']]
    );
    $out = array_map(fn($n) => [
        'id'          => (int)$n['id'],
        'type'        => $n['type'],
        'title'       => $n['title'],
        'body'        => $n['body'],
        'actionable'  => (bool)$n['actionable'] && $n['status'] !== 'respondida' && $n['task_status'] !== 'completada',
        'read'        => in_array($n['status'], ['leida', 'respondida'], true),
        'created_at'  => Time::iso($n['scheduled_at']),
        'task'        => $n['task_id'] ? [
            'id' => (int)$n['task_id'], 'title' => $n['task_title'], 'status' => $n['task_status'],
            'due_at' => Time::iso($n['task_due_at']), 'priority' => $n['task_priority'],
        ] : null,
    ], $rows);
    json_out([
        'notifications' => $out,
        'unread' => count(array_filter($out, fn($n) => !$n['read'])),
    ]);
});

$router->post('/notifications/{id}/read', function (array $p) {
    $u = Auth::require();
    Db::query(
        "UPDATE notifications SET status = 'leida', read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND status IN ('pendiente','enviada')",
        [(int)$p['id'], $u['id']]
    );
    json_out(['ok' => true]);
});

// Marca como leídas las informativas (las de "¿cómo va?" siguen esperando respuesta)
$router->post('/notifications/read-all', function () {
    $u = Auth::require();
    Db::query(
        "UPDATE notifications SET status = 'leida', read_at = UTC_TIMESTAMP()
          WHERE user_id = ? AND channel = 'app' AND actionable = 0 AND status IN ('pendiente','enviada') AND scheduled_at <= UTC_TIMESTAMP()",
        [$u['id']]
    );
    json_out(['ok' => true]);
});
