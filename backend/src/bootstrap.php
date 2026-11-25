<?php
declare(strict_types=1);

/**
 * Carga la configuración y todas las clases. Sin Composer: solo require.
 */

define('APP_ROOT', dirname(__DIR__));

if (!file_exists(APP_ROOT . '/config.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Falta config.php (copia config.example.php y complétalo)']);
    exit;
}

$GLOBALS['CONFIG'] = require APP_ROOT . '/config.php';
date_default_timezone_set('UTC');

require_once __DIR__ . '/HttpError.php';
require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Router.php';
require_once __DIR__ . '/Time.php';
require_once __DIR__ . '/GoogleIdToken.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Mailer.php';
require_once __DIR__ . '/Ics.php';
require_once __DIR__ . '/Notifier.php';
require_once __DIR__ . '/TaskService.php';

function config(string $key, $default = null)
{
    $value = $GLOBALS['CONFIG'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

/** Responde JSON y termina. */
function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Lee el cuerpo JSON de la petición. */
function body(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $raw = file_get_contents('php://input');
    $data = $raw ? json_decode($raw, true) : [];
    $cache = is_array($data) ? $data : [];
    return $cache;
}

function str_field(array $data, string $key, int $max = 255, bool $required = false): ?string
{
    $v = isset($data[$key]) ? trim((string)$data[$key]) : '';
    if ($v === '') {
        if ($required) {
            throw new HttpError(422, "El campo '$key' es obligatorio");
        }
        return null;
    }
    if (mb_strlen($v) > $max) {
        throw new HttpError(422, "El campo '$key' es demasiado largo (máx. $max)");
    }
    return $v;
}

function int_field(array $data, string $key): ?int
{
    if (!isset($data[$key]) || $data[$key] === '' || $data[$key] === null) {
        return null;
    }
    if (!is_numeric($data[$key])) {
        throw new HttpError(422, "El campo '$key' debe ser numérico");
    }
    return (int)$data[$key];
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function random_token(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

function app_log(string $msg): void
{
    $dir = APP_ROOT . '/storage/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    @file_put_contents($dir . '/app-' . gmdate('Y-m') . '.log', '[' . now_utc() . '] ' . $msg . "\n", FILE_APPEND);
}

/** Escapa texto para HTML (correos y páginas simples). */
function e(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}
