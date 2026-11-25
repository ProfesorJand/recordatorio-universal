<?php
declare(strict_types=1);
/** @var Router $router */

function project_out(array $p, bool $full = false): array
{
    $out = [
        'id'          => (int)$p['id'],
        'name'        => $p['name'],
        'description' => $p['description'],
        'color'       => $p['color'],
        'archived'    => (bool)$p['archived'],
        'created_at'  => Time::iso($p['created_at']),
        'members_count' => (int)Db::value('SELECT COUNT(*) FROM project_members WHERE project_id = ?', [$p['id']]),
        'open_tasks'  => (int)Db::value("SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status <> 'completada'", [$p['id']]),
    ];
    if ($full) {
        $out['members'] = array_map(fn($m) => [
            'id' => (int)$m['id'], 'name' => $m['name'] ?: $m['email'], 'email' => $m['email'], 'picture' => $m['picture'], 'timezone' => $m['timezone'],
        ], Db::all('SELECT u.id, u.name, u.email, u.picture, u.timezone FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? AND u.active = 1 ORDER BY COALESCE(u.name, u.email)', [$p['id']]));
        $out['resources'] = array_map(fn($r) => [
            'id' => (int)$r['id'], 'type' => $r['type'], 'title' => $r['title'], 'url' => $r['url'], 'created_at' => Time::iso($r['created_at']),
        ], Db::all('SELECT * FROM project_resources WHERE project_id = ? ORDER BY created_at DESC', [$p['id']]));
    }
    return $out;
}

function load_project_for(array $user, int $id): array
{
    $p = Db::one('SELECT * FROM projects WHERE id = ?', [$id]);
    if (!$p) {
        throw new HttpError(404, 'Proyecto no encontrado');
    }
    if (!TaskService::canViewProject($user, $id)) {
        throw new HttpError(403, 'No eres miembro de este proyecto');
    }
    return $p;
}

function set_members(int $projectId, array $ids): void
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    Db::query('DELETE FROM project_members WHERE project_id = ?', [$projectId]);
    foreach ($ids as $uid) {
        if (Db::value('SELECT 1 FROM users WHERE id = ? AND active = 1', [$uid])) {
            Db::query('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)', [$projectId, $uid]);
        }
    }
}

$router->get('/projects', function () {
    $u = Auth::require();
    $archived = !empty($_GET['archived']) ? 1 : 0;
    if (Auth::can('proyectos.ver_todos')) {
        $rows = Db::all('SELECT * FROM projects WHERE archived = ? ORDER BY name', [$archived]);
    } else {
        $rows = Db::all('SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? AND p.archived = ? ORDER BY p.name', [$u['id'], $archived]);
    }
    json_out(['projects' => array_map('project_out', $rows)]);
});

$router->post('/projects', function () {
    $u = Auth::requirePerm('proyectos.crear');
    $d = body();
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string)($d['color'] ?? '')) ? $d['color'] : '#257de0';
    $id = Db::insert('projects', [
        'name'        => str_field($d, 'name', 150, true),
        'description' => str_field($d, 'description', 5000),
        'color'       => $color,
        'created_by'  => $u['id'],
    ]);
    set_members($id, array_merge((array)($d['member_ids'] ?? []), [$u['id']]));
    json_out(['project' => project_out(Db::one('SELECT * FROM projects WHERE id = ?', [$id]), true)], 201);
});

$router->get('/projects/{id}', function (array $p) {
    $u = Auth::require();
    json_out(['project' => project_out(load_project_for($u, (int)$p['id']), true)]);
});

$router->patch('/projects/{id}', function (array $p) {
    Auth::requirePerm('proyectos.crear');
    $proj = Db::one('SELECT * FROM projects WHERE id = ?', [(int)$p['id']]);
    if (!$proj) {
        throw new HttpError(404, 'Proyecto no encontrado');
    }
    $d = body();
    $upd = [];
    if (array_key_exists('name', $d)) {
        $upd['name'] = str_field($d, 'name', 150, true);
    }
    if (array_key_exists('description', $d)) {
        $upd['description'] = str_field($d, 'description', 5000);
    }
    if (array_key_exists('color', $d) && preg_match('/^#[0-9a-f]{6}$/i', (string)$d['color'])) {
        $upd['color'] = $d['color'];
    }
    if (array_key_exists('archived', $d)) {
        $upd['archived'] = $d['archived'] ? 1 : 0;
    }
    Db::update('projects', (int)$proj['id'], $upd);
    if (array_key_exists('member_ids', $d)) {
        set_members((int)$proj['id'], (array)$d['member_ids']);
    }
    json_out(['project' => project_out(Db::one('SELECT * FROM projects WHERE id = ?', [$proj['id']]), true)]);
});

// Material de apoyo
$router->post('/projects/{id}/resources', function (array $p) {
    $u = Auth::requirePerm('proyectos.recursos');
    $proj = load_project_for($u, (int)$p['id']);
    $d = body();
    $type = ($d['type'] ?? 'link') === 'image' ? 'image' : 'link';
    $url = (string)str_field($d, 'url', 1000, true);
    if (!preg_match('#^https?://#i', $url)) {
        throw new HttpError(422, 'El enlace debe empezar con http:// o https://');
    }
    Db::insert('project_resources', [
        'project_id' => $proj['id'],
        'type'       => $type,
        'title'      => str_field($d, 'title', 200) ?? $url,
        'url'        => $url,
        'created_by' => $u['id'],
    ]);
    json_out(['project' => project_out($proj, true)], 201);
});

$router->delete('/resources/{id}', function (array $p) {
    $u = Auth::requirePerm('proyectos.recursos');
    $r = Db::one('SELECT * FROM project_resources WHERE id = ?', [(int)$p['id']]);
    if (!$r) {
        throw new HttpError(404, 'No encontrado');
    }
    $proj = load_project_for($u, (int)$r['project_id']);
    Db::query('DELETE FROM project_resources WHERE id = ?', [$r['id']]);
    json_out(['project' => project_out($proj, true)]);
});
