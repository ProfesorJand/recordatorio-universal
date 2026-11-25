<?php
declare(strict_types=1);
/** @var Router $router */

/**
 * Usuarios autorizados.
 * El admin agrega un correo + rol. Cuando esa persona inicia sesión con Google
 * por primera vez, entra directo con ese rol. Los correos que no están aquí
 * no pueden entrar.
 */

function user_row_out(array $r): array
{
    return [
        'id'             => (int)$r['id'],
        'email'          => $r['email'],
        'name'           => $r['name'],
        'picture'        => $r['picture'],
        'role'           => ['id' => (int)$r['role_id'], 'name' => $r['role_name'], 'slug' => $r['role_slug']],
        'is_owner'       => (bool)$r['is_owner'],
        'active'         => (bool)$r['active'],
        'timezone'       => $r['timezone'],
        'first_login_at' => Time::iso($r['first_login_at']),
        'last_login_at'  => Time::iso($r['last_login_at']),
    ];
}

const USERS_SELECT = 'SELECT u.*, r.name AS role_name, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id';

// Lista para elegir personas (asignar, supervisor). Cualquier usuario logueado.
$router->get('/users/directory', function () {
    Auth::require();
    $rows = Db::all("SELECT u.id, u.name, u.email, u.picture, u.timezone FROM users u JOIN roles r ON r.id = u.role_id WHERE u.active = 1 AND r.can_login = 1 ORDER BY COALESCE(u.name, u.email)");
    json_out(['users' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'] ?: $r['email'], 'email' => $r['email'], 'picture' => $r['picture'], 'timezone' => $r['timezone']], $rows)]);
});

$router->get('/users', function () {
    Auth::requirePerm('usuarios.gestionar');
    $rows = Db::all(USERS_SELECT . ' ORDER BY u.active DESC, COALESCE(u.name, u.email)');
    json_out(['users' => array_map('user_row_out', $rows)]);
});

// Agregar correo autorizado
$router->post('/users', function () {
    $admin = Auth::requirePerm('usuarios.gestionar');
    $d = body();
    $email = strtolower((string)str_field($d, 'email', 190, true));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new HttpError(422, 'Correo inválido');
    }
    $roleId = int_field($d, 'role_id') ?? 2;
    if (!Db::value('SELECT 1 FROM roles WHERE id = ?', [$roleId])) {
        throw new HttpError(422, 'Rol inválido');
    }
    $existing = Db::one('SELECT * FROM users WHERE email = ?', [$email]);
    if ($existing) {
        if ((int)$existing['active']) {
            throw new HttpError(409, 'Ese correo ya está autorizado');
        }
        // Estaba quitado: se reactiva
        Db::update('users', (int)$existing['id'], ['active' => 1, 'role_id' => $roleId]);
        $id = (int)$existing['id'];
    } else {
        $id = Db::insert('users', [
            'email'    => $email,
            'name'     => str_field($d, 'name', 150),
            'role_id'  => $roleId,
            'added_by' => $admin['id'],
            'timezone' => Time::isValidTz($d['timezone'] ?? null) ? $d['timezone'] : null,
        ]);
    }
    json_out(['user' => user_row_out(Db::one(USERS_SELECT . ' WHERE u.id = ?', [$id]))], 201);
});

// Cambiar rol / nombre / activar
$router->patch('/users/{id}', function (array $p) {
    $admin = Auth::requirePerm('usuarios.gestionar');
    $target = Db::one('SELECT * FROM users WHERE id = ?', [(int)$p['id']]);
    if (!$target) {
        throw new HttpError(404, 'Usuario no encontrado');
    }
    $d = body();
    $upd = [];
    if (array_key_exists('role_id', $d)) {
        $roleId = (int)$d['role_id'];
        if ((int)$target['is_owner'] && $roleId !== 1) {
            throw new HttpError(403, 'No se puede cambiar el rol del administrador principal');
        }
        if (!Db::value('SELECT 1 FROM roles WHERE id = ?', [$roleId])) {
            throw new HttpError(422, 'Rol inválido');
        }
        $upd['role_id'] = $roleId;
    }
    if (array_key_exists('name', $d)) {
        $upd['name'] = str_field($d, 'name', 150);
    }
    if (array_key_exists('active', $d)) {
        if ((int)$target['is_owner'] && !$d['active']) {
            throw new HttpError(403, 'No se puede quitar al administrador principal');
        }
        if ((int)$target['id'] === (int)$admin['id'] && !$d['active']) {
            throw new HttpError(403, 'No puedes quitarte a ti mismo');
        }
        $upd['active'] = $d['active'] ? 1 : 0;
    }
    Db::update('users', (int)$target['id'], $upd);
    if (isset($upd['active']) && !$upd['active']) {
        Db::query('DELETE FROM sessions WHERE user_id = ?', [$target['id']]); // lo saca de inmediato
    }
    if (isset($upd['role_id']) && !Db::value('SELECT can_login FROM roles WHERE id = ?', [$upd['role_id']])) {
        Db::query('DELETE FROM sessions WHERE user_id = ?', [$target['id']]); // suspendido
    }
    json_out(['user' => user_row_out(Db::one(USERS_SELECT . ' WHERE u.id = ?', [$target['id']]))]);
});
