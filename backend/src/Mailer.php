<?php
declare(strict_types=1);

/**
 * Envío de correos sin PHPMailer: un cliente SMTP pequeño (SSL o STARTTLS +
 * AUTH LOGIN) con respaldo a mail() del hosting.
 * Puede adjuntar una invitación de calendario (.ics) que Gmail agrega a
 * Google Calendar y que luego avisa en el celular.
 */
class Mailer
{
    /** @var resource|null */
    private $sock = null;

    /**
     * @param array|null $ics ['content' => string, 'method' => 'REQUEST'|'CANCEL']
     */
    public static function send(string $to, string $subject, string $html, ?string $replyTo = null, ?array $ics = null): void
    {
        $cfg = config('mail');
        $message = self::buildMessage($cfg, $to, $subject, $html, $replyTo, $ics);

        if (($cfg['transport'] ?? 'smtp') === 'mail') {
            // mail() necesita los encabezados aparte del cuerpo
            [$headers, $bodyPart] = explode("\r\n\r\n", $message, 2);
            $headers = preg_replace('/^(To|Subject):.*\r\n/mi', '', $headers . "\r\n");
            $ok = mail($to, self::encodeHeader($subject), $bodyPart, trim($headers), '-f' . $cfg['from_email']);
            if (!$ok) {
                throw new RuntimeException('mail() devolvió false');
            }
            return;
        }

        $m = new self();
        $m->smtpSend($cfg, $to, $message);
    }

    private static function encodeHeader(string $s): string
    {
        return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }

    private static function buildMessage(array $cfg, string $to, string $subject, string $html, ?string $replyTo, ?array $ics): string
    {
        $text = trim(html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/div|\/h\d|\/li)[^>]*>/i', "\n", $html)), ENT_QUOTES, 'UTF-8'));
        $domain = substr(strrchr($cfg['from_email'], '@'), 1);
        $alt = 'alt_' . bin2hex(random_bytes(8));
        $mix = 'mix_' . bin2hex(random_bytes(8));

        $h = [];
        $h[] = 'Date: ' . date('r');
        $h[] = 'From: ' . self::encodeHeader($cfg['from_name']) . ' <' . $cfg['from_email'] . '>';
        $h[] = 'To: <' . $to . '>';
        $h[] = 'Subject: ' . self::encodeHeader($subject);
        if ($replyTo) {
            $h[] = 'Reply-To: <' . $replyTo . '>';
        }
        $h[] = 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>';
        $h[] = 'MIME-Version: 1.0';

        $part = fn(string $type, string $content) =>
            "Content-Type: $type\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($content), 76, "\r\n");

        $altBody  = "--$alt\r\n" . $part('text/plain; charset=UTF-8', $text);
        $altBody .= "--$alt\r\n" . $part('text/html; charset=UTF-8', $html);
        if ($ics) {
            $altBody .= "--$alt\r\n" . $part('text/calendar; charset=UTF-8; method=' . $ics['method'], $ics['content']);
        }
        $altBody .= "--$alt--\r\n";

        if (!$ics) {
            $h[] = "Content-Type: multipart/alternative; boundary=\"$alt\"";
            return implode("\r\n", $h) . "\r\n\r\n" . $altBody;
        }

        $h[] = "Content-Type: multipart/mixed; boundary=\"$mix\"";
        $body  = "--$mix\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n" . $altBody;
        $body .= "--$mix\r\nContent-Type: application/ics; name=\"invitacion.ics\"\r\nContent-Disposition: attachment; filename=\"invitacion.ics\"\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($ics['content']), 76, "\r\n");
        $body .= "--$mix--\r\n";
        return implode("\r\n", $h) . "\r\n\r\n" . $body;
    }

    // ------------------------------------------------------------------ SMTP

    private function smtpSend(array $cfg, string $to, string $message): void
    {
        $secure = $cfg['secure'] ?? 'ssl';
        $host = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['host'] . ':' . (int)$cfg['port'];
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $this->sock = @stream_socket_client($host, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$this->sock) {
            throw new RuntimeException("No se pudo conectar al SMTP ($errstr)");
        }
        stream_set_timeout($this->sock, 20);

        try {
            $this->expect(220);
            $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
            $this->cmd($ehlo, 250);
            if ($secure === 'tls') {
                $this->cmd('STARTTLS', 220);
                if (!stream_socket_enable_crypto($this->sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('No se pudo activar TLS');
                }
                $this->cmd($ehlo, 250);
            }
            if (!empty($cfg['username'])) {
                $this->cmd('AUTH LOGIN', 334);
                $this->cmd(base64_encode($cfg['username']), 334);
                $this->cmd(base64_encode($cfg['password']), 235);
            }
            $this->cmd('MAIL FROM:<' . $cfg['from_email'] . '>', 250);
            $this->cmd('RCPT TO:<' . $to . '>', [250, 251]);
            $this->cmd('DATA', 354);
            // "dot-stuffing": las líneas que empiezan con punto se duplican
            $data = preg_replace('/^\./m', '..', $message);
            $this->cmd($data . "\r\n.", 250);
            $this->cmd('QUIT', 221);
        } finally {
            fclose($this->sock);
        }
    }

    /** @param int|int[] $expected */
    private function cmd(string $line, $expected): string
    {
        fwrite($this->sock, $line . "\r\n");
        return $this->expect($expected);
    }

    /** @param int|int[] $expected */
    private function expect($expected): string
    {
        $resp = '';
        while (($line = fgets($this->sock, 515)) !== false) {
            $resp .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break; // última línea de la respuesta
            }
        }
        $code = (int)substr($resp, 0, 3);
        if (!in_array($code, (array)$expected, true)) {
            throw new RuntimeException('SMTP respondió: ' . trim($resp));
        }
        return $resp;
    }
}
