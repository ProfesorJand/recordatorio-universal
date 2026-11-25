<?php
declare(strict_types=1);
/** @var Router $router */

/**
 * Estadísticas por usuario.
 *  - Con "estadisticas.ver_todos": todos los usuarios.
 *  - Con "estadisticas.ver_individual": solo las propias.
 * Rango por defecto: últimos 30 días (para completadas). El resto es el estado actual.
 */
$router->get('/stats', function () {
    $u = Auth::require();
    $all = Auth::can('estadisticas.ver_todos');
    if (!$all && !Auth::can('estadisticas.ver_individual')) {
        throw new HttpError(403, 'No tienes permiso para ver estadísticas');
    }
    $tz = new DateTimeZone(Time::userTz($u));
    $from = isset($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'])
        ? Time::localToUtc($_GET['from'] . ' 00:00', $tz->getName())
        : gmdate('Y-m-d H:i:s', time() - 30 * 86400);
    $to = isset($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'])
        ? Time::localToUtc($_GET['to'] . ' 23:59', $tz->getName())
        : now_utc();

    $where = ['t.assignee_id IS NOT NULL', 'p.archived = 0'];
    $params = [];
    if (!$all) {
        $where[] = 't.assignee_id = ?';
        $params[] = $u['id'];
    } elseif (!empty($_GET['user_id'])) {
        $where[] = 't.assignee_id = ?';
        $params[] = (int)$_GET['user_id'];
    }
    if (!empty($_GET['project_id'])) {
        $where[] = 't.project_id = ?';
        $params[] = (int)$_GET['project_id'];
    }

    $rows = Db::all(
        'SELECT t.id, t.status, t.due_at, t.completed_at, t.assignee_id, u.name, u.email, u.picture
           FROM tasks t JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = t.assignee_id
          WHERE ' . implode(' AND ', $where),
        $params
    );

    $now = now_utc();
    $empty = ['a_tiempo' => 0, 'tarde' => 0, 'en_progreso' => 0, 'pendiente' => 0, 'aplazada' => 0, 'bloqueada' => 0, 'vencida' => 0];
    $byUser = [];
    $weekly = [];

    foreach ($rows as $r) {
        $id = (int)$r['assignee_id'];
        if (!isset($byUser[$id])) {
            $byUser[$id] = ['user' => ['id' => $id, 'name' => $r['name'] ?: $r['email'], 'picture' => $r['picture']], 'counts' => $empty];
        }
        if ($r['status'] === 'completada') {
            if ($r['completed_at'] < $from || $r['completed_at'] > $to) {
                continue;
            }
            $late = $r['due_at'] && $r['completed_at'] > $r['due_at'];
            $byUser[$id]['counts'][$late ? 'tarde' : 'a_tiempo']++;
            // semana (lunes) en la zona del que consulta
            $d = (new DateTimeImmutable($r['completed_at'], new DateTimeZone('UTC')))->setTimezone($tz);
            $week = $d->modify('monday this week')->format('Y-m-d');
            $weekly[$week] = ($weekly[$week] ?? 0) + 1;
        } elseif ($r['due_at'] && $r['due_at'] < $now) {
            $byUser[$id]['counts']['vencida']++;
        } else {
            $byUser[$id]['counts'][$r['status']]++;
        }
    }

    // Rellenar semanas vacías para que la línea no salte
    $series = [];
    $cursor = (new DateTimeImmutable($from, new DateTimeZone('UTC')))->setTimezone($tz)->modify('monday this week');
    $end = (new DateTimeImmutable($to, new DateTimeZone('UTC')))->setTimezone($tz);
    while ($cursor <= $end) {
        $k = $cursor->format('Y-m-d');
        $series[] = ['week' => $k, 'completed' => $weekly[$k] ?? 0];
        $cursor = $cursor->modify('+7 days');
    }

    usort($byUser, fn($a, $b) => strcmp((string)$a['user']['name'], (string)$b['user']['name']));
    json_out([
        'scope'  => $all ? 'todos' : 'individual',
        'from'   => Time::iso($from),
        'to'     => Time::iso($to),
        'users'  => array_values($byUser),
        'weekly' => $series,
    ]);
});
