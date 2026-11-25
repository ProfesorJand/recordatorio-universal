<?php
declare(strict_types=1);
/** @var Router $router */

function load_task_for(array $user, int $id): array
{
    $t = TaskService::find($id);
    if (!TaskService::canView($user, $t)) {
        throw new HttpError(403, 'No tienes acceso a esta tarea');
    }
    return $t;
}

// Lista. scope: mine (asignadas a mí) | supervising (yo superviso) | created | all
$router->get('/tasks', function () {
    $u = Auth::require();
    $uid = (int)$u['id'];
    $where = [];
    $params = [];

    if (!Auth::can('proyectos.ver_todos')) {
        $where[] = '(t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?) OR t.assignee_id = ? OR t.supervisor_id = ? OR t.created_by = ?)';
        array_push($params, $uid, $uid, $uid, $uid);
    }
    $scope = $_GET['scope'] ?? 'all';
    if ($scope === 'mine') {
        $where[] = 't.assignee_id = ?';
        $params[] = $uid;
    } elseif ($scope === 'supervising') {
        $where[] = 't.supervisor_id = ?';
        $params[] = $uid;
    } elseif ($scope === 'created') {
        $where[] = 't.created_by = ?';
        $params[] = $uid;
    }
    if (!empty($_GET['project_id'])) {
        $where[] = 't.project_id = ?';
        $params[] = (int)$_GET['project_id'];
    }
    if (!empty($_GET['assignee_id'])) {
        $where[] = 't.assignee_id = ?';
        $params[] = (int)$_GET['assignee_id'];
    }
    if (empty($_GET['include_completed'])) {
        // completadas solo de los últimos 7 días
        $where[] = "(t.status <> 'completada' OR t.completed_at > UTC_TIMESTAMP() - INTERVAL 7 DAY)";
    }
    $where[] = 'p.archived = 0';

    $sql = TaskService::SELECT . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY t.id DESC LIMIT 1000';
    json_out(['tasks' => array_map([TaskService::class, 'serialize'], Db::all($sql, $params))]);
});

$router->post('/tasks', function () {
    $u = Auth::requirePerm('tareas.crear');
    $t = TaskService::create($u, body());
    json_out(['task' => TaskService::serialize($t)], 201);
});

$router->get('/tasks/{id}', function (array $p) {
    $u = Auth::require();
    $t = load_task_for($u, (int)$p['id']);
    $tid = (int)$t['id'];

    $children = Db::all(TaskService::SELECT . ' WHERE t.parent_task_id = ? ORDER BY t.id', [$tid]);
    $parent = $t['parent_task_id'] ? Db::one(TaskService::SELECT . ' WHERE t.id = ?', [$t['parent_task_id']]) : null;
    $comments = Db::all('SELECT c.*, u.name, u.email, u.picture FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at', [$tid]);
    $activity = Db::all('SELECT a.*, u.name, u.email FROM task_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = ? ORDER BY a.id DESC LIMIT 50', [$tid]);

    $isAssignee = TaskService::isAssignee($u, $t);
    $canEdit = TaskService::canEdit($u, $t);
    json_out([
        'task'     => TaskService::serialize($t),
        'parent'   => $parent ? TaskService::serialize($parent) : null,
        'children' => array_map([TaskService::class, 'serialize'], $children),
        'comments' => array_map(fn($c) => [
            'id' => (int)$c['id'], 'body' => $c['body'], 'created_at' => Time::iso($c['created_at']),
            'user' => ['id' => (int)$c['user_id'], 'name' => $c['name'] ?: $c['email'], 'picture' => $c['picture']],
        ], $comments),
        'activity' => array_map(fn($a) => [
            'action' => $a['action'], 'detail' => $a['detail'], 'created_at' => Time::iso($a['created_at']),
            'user' => $a['user_id'] ? ($a['name'] ?: $a['email']) : 'Sistema',
        ], $activity),
        'can' => [
            'edit'    => $canEdit,
            'checkin' => ($isAssignee || $canEdit) && $t['status'] !== 'completada',
            'link'    => ($isAssignee || $canEdit) && Auth::can('tareas.crear_vinculada') && $t['status'] !== 'completada',
            'comment' => Auth::can('tareas.comentar') || $canEdit,
            'delete'  => Auth::can('tareas.eliminar'),
        ],
    ]);
});

$router->patch('/tasks/{id}', function (array $p) {
    $u = Auth::require();
    $t = load_task_for($u, (int)$p['id']);
    if (!TaskService::canEdit($u, $t)) {
        throw new HttpError(403, 'No puedes editar esta tarea');
    }
    json_out(['task' => TaskService::serialize(TaskService::update($u, $t, body()))]);
});

$router->delete('/tasks/{id}', function (array $p) {
    $u = Auth::requirePerm('tareas.eliminar');
    $t = load_task_for($u, (int)$p['id']);
    if ($t['assignee_id'] && $t['due_at'] && $t['status'] !== 'completada') {
        // quitar el evento del calendario antes de borrar (se envía ya mismo)
        try {
            $a = Db::one('SELECT * FROM users WHERE id = ?', [$t['assignee_id']]);
            Mailer::send($a['email'], 'Cancelado: ' . $t['title'], Notifier::layout('Esta tarea fue eliminada', '<p>' . e($t['title']) . '</p>'), null,
                ['content' => Ics::forTask(array_merge($t, ['ics_sequence' => (int)$t['ics_sequence'] + 1]), $a['email'], (string)$a['name'], 'CANCEL'), 'method' => 'CANCEL']);
        } catch (Throwable $e) {
            app_log('No se pudo cancelar el evento: ' . $e->getMessage());
        }
    }
    Db::query('DELETE FROM tasks WHERE id = ?', [$t['id']]);
    if ($t['parent_task_id']) {
        $open = (int)Db::value("SELECT COUNT(*) FROM tasks WHERE parent_task_id = ? AND status <> 'completada'", [$t['parent_task_id']]);
        if ($open === 0) {
            Db::query("UPDATE tasks SET status = 'en_progreso' WHERE id = ? AND status = 'bloqueada'", [$t['parent_task_id']]);
        }
    }
    json_out(['ok' => true]);
});

// ¿Cómo va? -> hecho | sigo | aplazar | empezar
$router->post('/tasks/{id}/checkin', function (array $p) {
    $u = Auth::require();
    $t = load_task_for($u, (int)$p['id']);
    $d = body();
    $res = TaskService::checkin($u, $t, (string)($d['response'] ?? ''), isset($d['until']) ? (string)$d['until'] : null);
    json_out(['task' => TaskService::serialize($res)]);
});

// Pedir una tarea vinculada a otra persona (el que pide queda como supervisor)
$router->post('/tasks/{id}/linked', function (array $p) {
    $u = Auth::requirePerm('tareas.crear_vinculada');
    $parent = load_task_for($u, (int)$p['id']);
    if (!TaskService::isAssignee($u, $parent) && !TaskService::canEdit($u, $parent)) {
        throw new HttpError(403, 'Solo puedes pedir tareas vinculadas desde una tarea asignada a ti');
    }
    if ($parent['status'] === 'completada') {
        throw new HttpError(409, 'La tarea ya está completada');
    }
    $d = body();
    if ((int)($d['assignee_id'] ?? 0) === (int)$u['id']) {
        throw new HttpError(422, 'Pídesela a otra persona');
    }
    $t = TaskService::create($u, $d, $parent);
    json_out(['task' => TaskService::serialize($t)], 201);
});

$router->post('/tasks/{id}/comments', function (array $p) {
    $u = Auth::require();
    $t = load_task_for($u, (int)$p['id']);
    if (!Auth::can('tareas.comentar') && !TaskService::canEdit($u, $t)) {
        throw new HttpError(403, 'No puedes comentar');
    }
    $body = str_field(body(), 'body', 5000, true);
    Db::insert('task_comments', ['task_id' => $t['id'], 'user_id' => $u['id'], 'body' => $body]);
    TaskService::log((int)$t['id'], (int)$u['id'], 'comentario', mb_substr($body, 0, 120));

    // Avisar al supervisor y a la persona asignada (menos al autor)
    $who = $u['name'] ?: $u['email'];
    $targets = array_unique(array_filter([(int)$t['supervisor_id'], (int)$t['assignee_id']]));
    foreach ($targets as $target) {
        if ($target !== (int)$u['id']) {
            Notifier::notify($target, (int)$t['id'], 'comentario', "💬 $who comentó en: {$t['title']}", $body, ['reply_to' => $u['email']]);
        }
    }
    json_out(['ok' => true], 201);
});
