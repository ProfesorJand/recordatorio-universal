<?php
declare(strict_types=1);
/** @var Router $router */

$router->get('/me', function () {
    json_out(['user' => Auth::publicUser(Auth::require())]);
});

// Perfil: zona horaria, horario laboral, avisos
$router->patch('/me', function () {
    $u = Auth::require();
    $d = body();
    $upd = [];

    if (array_key_exists('timezone', $d)) {
        if (!Time::isValidTz((string)$d['timezone'])) {
            throw new HttpError(422, 'Zona horaria inválida');
        }
        $upd['timezone'] = $d['timezone'];
    }
    if (array_key_exists('name', $d)) {
        $upd['name'] = str_field($d, 'name', 150, true);
    }
    foreach (['work_start', 'work_end'] as $k) {
        if (array_key_exists($k, $d)) {
            $v = $d[$k];
            if ($v === null || $v === '') {
                $upd[$k] = null;
            } elseif (preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$v)) {
                $upd[$k] = $v . ':00';
            } else {
                throw new HttpError(422, 'Hora inválida (usa HH:MM)');
            }
        }
    }
    if (array_key_exists('work_days', $d)) {
        $days = array_values(array_unique(array_filter(array_map('intval', (array)$d['work_days']), fn($x) => $x >= 1 && $x <= 7)));
        sort($days);
        $upd['work_days'] = implode(',', $days);
    }
    if (array_key_exists('notify_email', $d)) {
        $upd['notify_email'] = $d['notify_email'] ? 1 : 0;
    }
    if (array_key_exists('whatsapp_phone', $d)) {
        $phone = preg_replace('/[^\d+]/', '', (string)$d['whatsapp_phone']);
        $upd['whatsapp_phone'] = $phone ?: null;
    }
    if (array_key_exists('tutorial_seen', $d)) {
        $seen = array_filter(explode(',', (string)$u['tutorials_seen']));
        $key = preg_replace('/[^a-z0-9_-]/i', '', (string)$d['tutorial_seen']);
        if ($key && !in_array($key, $seen, true)) {
            $seen[] = $key;
        }
        if (!empty($d['reset_tutorials'])) {
            $seen = [];
        }
        $upd['tutorials_seen'] = substr(implode(',', $seen), 0, 500);
    }

    Db::update('users', (int)$u['id'], $upd);

    // Si cambió el horario, re-programamos sus avisos pendientes
    if (array_intersect(array_keys($upd), ['timezone', 'work_start', 'work_end', 'work_days'])) {
        $fresh = Db::one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        foreach (Db::all("SELECT id, scheduled_at FROM notifications WHERE user_id = ? AND status = 'pendiente' AND channel <> 'app'", [$u['id']]) as $n) {
            Db::update('notifications', (int)$n['id'], ['scheduled_at' => Time::nextWorkTime($fresh, now_utc())]);
        }
    }

    $fresh = Db::one('SELECT u.*, r.slug AS role_slug, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [$u['id']]);
    $fresh['permissions'] = $u['permissions'];
    json_out(['user' => Auth::publicUser($fresh)]);
});

// Lista de zonas horarias válidas
$router->get('/timezones', function () {
    json_out(['timezones' => DateTimeZone::listIdentifiers()]);
});
