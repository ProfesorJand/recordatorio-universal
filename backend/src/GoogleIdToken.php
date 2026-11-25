<?php
declare(strict_types=1);

/**
 * Verifica el "ID token" (JWT) que entrega el botón "Iniciar sesión con Google"
 * sin usar librerías: descarga las llaves públicas de Google y comprueba la
 * firma RS256 con openssl.
 */
class GoogleIdToken
{
    private const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    /** Devuelve los datos del usuario (email, name, picture, sub) o lanza HttpError. */
    public static function verify(string $jwt, string $clientId): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            throw new HttpError(401, 'Token de Google inválido');
        }
        [$h64, $p64, $s64] = $parts;
        $header  = json_decode(self::b64url($h64), true);
        $payload = json_decode(self::b64url($p64), true);
        $sig     = self::b64url($s64);

        if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256') {
            throw new HttpError(401, 'Token de Google inválido');
        }

        $pem = self::publicKeyFor((string)($header['kid'] ?? ''));
        $ok = openssl_verify("$h64.$p64", $sig, $pem, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw new HttpError(401, 'La firma del token de Google no es válida');
        }

        $now = time();
        if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) {
            throw new HttpError(401, 'Emisor del token inválido');
        }
        if (($payload['aud'] ?? '') !== $clientId) {
            throw new HttpError(401, 'El token no es para esta aplicación');
        }
        if (($payload['exp'] ?? 0) < $now - 60) {
            throw new HttpError(401, 'El token de Google expiró, vuelve a iniciar sesión');
        }
        if (empty($payload['email']) || empty($payload['email_verified'])) {
            throw new HttpError(401, 'La cuenta de Google no tiene un correo verificado');
        }
        return $payload;
    }

    private static function b64url(string $s): string
    {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        return (string)base64_decode($s);
    }

    private static function publicKeyFor(string $kid): string
    {
        $keys = self::loadKeys(false);
        if (!isset($keys[$kid])) {
            $keys = self::loadKeys(true); // Google rota sus llaves: recargar una vez
        }
        if (!isset($keys[$kid])) {
            throw new HttpError(401, 'No se encontró la llave de Google para este token');
        }
        return self::jwkToPem($keys[$kid]['n'], $keys[$kid]['e']);
    }

    /** Descarga (y guarda en caché) las llaves públicas de Google. */
    private static function loadKeys(bool $force): array
    {
        $dir = APP_ROOT . '/storage/cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $file = $dir . '/google_jwks.json';
        if (!$force && is_file($file)) {
            $cached = json_decode((string)file_get_contents($file), true);
            if (is_array($cached) && ($cached['expires'] ?? 0) > time()) {
                return $cached['keys'];
            }
        }

        $ch = curl_init(self::CERTS_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HEADER         => true,
        ]);
        $resp = curl_exec($ch);
        $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!$resp || $code !== 200) {
            throw new HttpError(502, 'No se pudo contactar a Google para validar el inicio de sesión');
        }
        $headers = substr($resp, 0, $headerSize);
        $json = json_decode(substr($resp, $headerSize), true);

        $maxAge = 3600;
        if (preg_match('/max-age=(\d+)/i', $headers, $m)) {
            $maxAge = (int)$m[1];
        }
        $keys = [];
        foreach ($json['keys'] ?? [] as $k) {
            $keys[$k['kid']] = ['n' => $k['n'], 'e' => $k['e']];
        }
        @file_put_contents($file, json_encode(['expires' => time() + $maxAge, 'keys' => $keys]));
        return $keys;
    }

    /** Convierte una llave JWK (n, e) al formato PEM que entiende openssl. */
    public static function jwkToPem(string $n64, string $e64): string
    {
        $n = self::b64url($n64);
        $e = self::b64url($e64);

        $int = function (string $bytes): string {
            if (ord($bytes[0]) > 0x7f) {
                $bytes = "\x00" . $bytes; // los enteros ASN.1 son con signo
            }
            return "\x02" . self::derLen(strlen($bytes)) . $bytes;
        };
        $seq = fn(string $c) => "\x30" . self::derLen(strlen($c)) . $c;

        $rsaKey   = $seq($int($n) . $int($e));
        $bitStr   = "\x03" . self::derLen(strlen($rsaKey) + 1) . "\x00" . $rsaKey;
        $algo     = $seq("\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00"); // rsaEncryption + NULL
        $der      = $seq($algo . $bitStr);

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function derLen(int $len): string
    {
        if ($len < 0x80) {
            return chr($len);
        }
        $out = '';
        while ($len > 0) {
            $out = chr($len & 0xff) . $out;
            $len >>= 8;
        }
        return chr(0x80 | strlen($out)) . $out;
    }
}
