<?php
declare(strict_types=1);
/** @var Router $router */

function roles_out(): array
{
    $roles = Db::all('SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.active = 1) AS users_count FROM roles r ORDER BY r.id');
    foreach ($roles as &$r) {
        $r = [
            'id'          => (int)$r['id'],
            'slug'        => $r['slug'],
            'name'        => $r['name'],
            'can_login'   => (bool)$r['can_login'],
            'is_system'   => (bool)$r['is_system'],
            'users_count' => (int)$r['users_count'],
            'permissions' => Auth::permissionsForRole((int)$r['id']),
        ];
    }
    return $roles;
}

$router->get('/roles', function () {
    Auth::require();
    json_out([
        'roles'       => roles_out(),
        'permissions' => Db::all('SELECT perm_key AS `key`, description FROM permissions ORDER BY perm_key'),
    ]);
});

$router->post('/roles', function () {
    Auth::requirePerm('roles.gestionar');
    $d = body();
    $name = str_field($d, 'name', 100, true);
    $slug = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', $name) ?: $name)), '_');
    if (Db::value('SELECT 1 FROM roles WHERE slug = ?', [$slug])) {
        throw new HttpError(409, 'Ya existe un rol con ese nombre');
    }
    Db::insert('roles', ['slug' => $slug, 'name' => $name, 'can_login' => !empty($d['can_login']) || !array_key_exists('can_login', $d) ? 1 : 0]);
    json_out(['roles' => roles_out()], 201);
});

// Editar nombre, si puede entrar y sus permisos
$router->patch('/roles/{id}', function (array $p) {
    $me = Auth::requirePerm('roles.gestionar');
    $id = (int)$p['id'];
    $role = Db::one('SELECT * FROM roles WHERE id = ?', [$id]);
    if (!$role) {
        throw new HttpError(404, 'Rol no encontrado');
    }
    $d = body();
    $upd = [];
    if (array_key_exists('name', $d)) {
        $upd['name'] = str_field($d, 'name', 100, true);
    }
    if (array_key_exists('can_login', $d)) {
        if ($id === 1 && !$d['can_login']) {
            throw new HttpError(403, 'El rol Admin no puede quedar sin acceso');
        }
        $upd['can_login'] = $d['can_login'] ? 1 : 0;
    }
    Db::update('roles', $id, $upd);

    if (array_key_exists('permissions', $d)) {
        $keys = array_values(array_filter((array)$d['permissions'], 'is_string'));
        if ($id === 1) {
            // Protección: el admin nunca pierde la gestión de usuarios y roles
            $keys = array_values(array_unique(array_merge($keys, ['usuarios.gestionar', 'roles.gestionar'])));
        }
        Db::query('DELETE FROM role_permissions WHERE role_id = ?', [$id]);
        if ($keys) {
            Db::query(
                'INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE perm_key IN (' . Db::placeholders($keys) . ')',
                array_merge([$id], $keys)
            );
        }
    }
    json_out(['roles' => roles_out()]);
});

$router->delete('/roles/{id}', function (array $p) {
    Auth::requirePerm('roles.gestionar');
    $role = Db::one('SELECT * FROM roles WHERE id = ?', [(int)$p['id']]);
    if (!$role) {
        throw new HttpError(404, 'Rol no encontrado');
    }
    if ((int)$role['is_system']) {
        throw new HttpError(403, 'Los roles del sistema no se pueden borrar');
    }
    if (Db::value('SELECT COUNT(*) FROM users WHERE role_id = ?', [$role['id']])) {
        throw new HttpError(409, 'Hay usuarios con este rol. Cámbialos de rol antes de borrarlo.');
    }
    Db::query('DELETE FROM roles WHERE id = ?', [$role['id']]);
    json_out(['roles' => roles_out()]);
});
