<?php
declare(strict_types=1);

/**
 * Sesiones y permisos.
 * El frontend (GitHub Pages) está en otro dominio, así que no usamos cookies:
 * el token de sesión viaja en el encabezado "Authorization: Bearer ...".
 * En la base solo guardamos el hash SHA-256 del token.
 */
class Auth
{
    private static ?array $user = null;
    private static bool $loaded = false;

    public static function tokenFromRequest(): ?string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+([a-f0-9]{64})/i', $h, $m)) {
            return $m[1];
        }
        $x = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        return preg_match('/^[a-f0-9]{64}$/i', $x) ? $x : null;
    }

    /** Usuario actual o null. */
    public static function user(): ?array
    {
        if (self::$loaded) {
            return self::$user;
        }
        self::$loaded = true;
        $token = self::tokenFromRequest();
        if (!$token) {
            return null;
        }
        $u = Db::one(
            'SELECT u.*, r.slug AS role_slug, r.name AS role_name, r.can_login
               FROM sessions s
               JOIN users u ON u.id = s.user_id
               JOIN roles r ON r.id = u.role_id
              WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()',
            [hash('sha256', $token)]
        );
        if (!$u || !(int)$u['active'] || !(int)$u['can_login']) {
            return null;
        }
        $u['permissions'] = self::permissionsForRole((int)$u['role_id']);
        self::$user = $u;
        return $u;
    }

    public static function require(): array
    {
        $u = self::user();
        if (!$u) {
            throw new HttpError(401, 'Tu sesión terminó o no tienes acceso. Vuelve a iniciar sesión.');
        }
        return $u;
    }

    public static function can(string $perm): bool
    {
        $u = self::user();
        return $u !== null && in_array($perm, $u['permissions'], true);
    }

    public static function requirePerm(string $perm): array
    {
        $u = self::require();
        if (!in_array($perm, $u['permissions'], true)) {
            throw new HttpError(403, 'No tienes permiso para esto (' . $perm . ')');
        }
        return $u;
    }

    public static function permissionsForRole(int $roleId): array
    {
        return array_column(Db::all(
            'SELECT p.perm_key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?',
            [$roleId]
        ), 'perm_key');
    }

    /**
     * Inicio de sesión con el token de Google.
     * Solo entran los correos que el admin agregó antes en "Usuarios".
     */
    public static function loginWithGoogle(string $credential): array
    {
        $payload = GoogleIdToken::verify($credential, (string)config('google_client_id'));
        $email = strtolower(trim($payload['email']));

        $u = Db::one(
            'SELECT u.*, r.can_login FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?',
            [$email]
        );
        if (!$u || !(int)$u['active']) {
            app_log("Acceso rechazado: $email");
            throw new HttpError(403, 'Tu correo (' . $email . ') no está autorizado para usar esta aplicación. Pídele acceso al administrador.');
        }
        if (!(int)$u['can_login']) {
            throw new HttpError(403, 'Tu cuenta está suspendida. Habla con el administrador.');
        }

        $update = [
            'google_sub'    => $payload['sub'],
            'name'          => $u['name'] ?: ($payload['name'] ?? null),
            'picture'       => $payload['picture'] ?? $u['picture'],
            'last_login_at' => now_utc(),
        ];
        if (!$u['first_login_at']) {
            $update['first_login_at'] = now_utc();
            // Si el admin no puso nombre, usamos el de Google
            $update['name'] = $payload['name'] ?? $u['name'];
        }
        Db::update('users', (int)$u['id'], $update);

        $token = random_token();
        Db::insert('sessions', [
            'user_id'    => $u['id'],
            'token_hash' => hash('sha256', $token),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 86400 * (int)config('session_days', 30)),
            'user_agent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);
        // Limpieza de sesiones vencidas
        Db::query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');

        self::$loaded = false;
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
        return ['token' => $token, 'user' => self::publicUser(self::require())];
    }

    public static function logout(): void
    {
        $t = self::tokenFromRequest();
        if ($t) {
            Db::query('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $t)]);
        }
    }

    /** Lo que se le envía al frontend sobre el usuario actual. */
    public static function publicUser(array $u): array
    {
        return [
            'id'             => (int)$u['id'],
            'email'          => $u['email'],
            'name'           => $u['name'],
            'picture'        => $u['picture'],
            'role'           => ['id' => (int)$u['role_id'], 'slug' => $u['role_slug'] ?? null, 'name' => $u['role_name'] ?? null],
            'is_owner'       => (bool)$u['is_owner'],
            'timezone'       => $u['timezone'],
            'work_start'     => $u['work_start'] ? substr($u['work_start'], 0, 5) : null,
            'work_end'       => $u['work_end'] ? substr($u['work_end'], 0, 5) : null,
            'work_days'      => array_values(array_filter(array_map('intval', explode(',', (string)$u['work_days'])))),
            'notify_email'   => (bool)$u['notify_email'],
            'whatsapp_phone' => $u['whatsapp_phone'],
            'tutorials_seen' => array_values(array_filter(explode(',', (string)$u['tutorials_seen']))),
            'permissions'    => $u['permissions'] ?? [],
        ];
    }
}
