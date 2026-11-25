<?php
declare(strict_types=1);

/**
 * Punto de entrada de la API.
 * URL base: https://api.guiadeparche.com/recordatorio
 */
require __DIR__ . '/src/bootstrap.php';

// ---------------------------------------------------------------- CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, (array)config('allowed_origins', []), true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ------------------------------------------------- ruta relativa a esta carpeta
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && strpos($uriPath, $base) === 0) {
    $uriPath = substr($uriPath, strlen($base));
}

$router = new Router();
foreach (['auth', 'me', 'users', 'roles', 'projects', 'tasks', 'notifications', 'uploads', 'stats', 'actions'] as $file) {
    require __DIR__ . '/routes/' . $file . '.php';
}

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $uriPath);
} catch (HttpError $e) {
    json_out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    app_log('ERROR ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['error' => config('debug') ? $e->getMessage() : 'Error interno del servidor'], 500);
}
