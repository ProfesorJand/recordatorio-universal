<?php
declare(strict_types=1);
/** @var Router $router */

$router->get('/', function () {
    json_out(['ok' => true, 'app' => 'Recordatorio Universal API', 'time' => gmdate('c')]);
});

// Configuración pública para el frontend
$router->get('/config', function () {
    json_out(['google_client_id' => config('google_client_id')]);
});

// Recibe el "credential" del botón de Google y devuelve un token de sesión
$router->post('/auth/google', function () {
    $credential = str_field(body(), 'credential', 5000, true);
    json_out(Auth::loginWithGoogle($credential));
});

$router->post('/auth/logout', function () {
    Auth::logout();
    json_out(['ok' => true]);
});
