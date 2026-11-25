<?php
declare(strict_types=1);

/**
 * Invitaciones de calendario (.ics).
 * Gmail reconoce la invitación y la agrega al Google Calendar del usuario,
 * así el celular vinculado recibe la alerta. No requiere permisos especiales
 * de Google ni verificación de la app.
 */
class Ics
{
    /**
     * @param string $method REQUEST (crear/actualizar) o CANCEL (quitar del calendario)
     */
    public static function forTask(array $task, string $attendeeEmail, string $attendeeName, string $method = 'REQUEST'): string
    {
        $from = config('mail.from_email');
        $dueTs = strtotime($task['due_at'] . ' UTC');
        $start = gmdate('Ymd\THis\Z', $dueTs - 30 * 60);
        $end   = gmdate('Ymd\THis\Z', $dueTs);
        $uid   = 'tarea-' . $task['id'] . '@' . parse_url((string)config('api_url'), PHP_URL_HOST);
        $url   = rtrim((string)config('frontend_url'), '/') . '/tarea/?id=' . $task['id'];

        $lines = [
            'BEGIN:VCALENDAR',
            'PRODID:-//Recordatorio Universal//ES',
            'VERSION:2.0',
            'CALSCALE:GREGORIAN',
            'METHOD:' . $method,
            'BEGIN:VEVENT',
            'UID:' . $uid,
            'SEQUENCE:' . (int)$task['ics_sequence'],
            'DTSTAMP:' . gmdate('Ymd\THis\Z'),
            'DTSTART:' . $start,
            'DTEND:' . $end,
            'SUMMARY:' . self::esc('Entrega: ' . $task['title']),
            'DESCRIPTION:' . self::esc('Fecha límite de la tarea "' . $task['title'] . '". Ver: ' . $url),
            'URL:' . $url,
            'ORGANIZER;CN=' . self::esc((string)config('mail.from_name')) . ':mailto:' . $from,
            'ATTENDEE;CN=' . self::esc($attendeeName ?: $attendeeEmail) . ';ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:' . $attendeeEmail,
            'STATUS:' . ($method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'),
            'TRANSP:OPAQUE',
        ];
        if ($method !== 'CANCEL') {
            foreach (['-P1D' => 'Falta 1 día', '-PT1H' => 'Falta 1 hora', '-PT10M' => 'Faltan 10 minutos'] as $trigger => $label) {
                $lines[] = 'BEGIN:VALARM';
                $lines[] = 'TRIGGER:' . $trigger;
                $lines[] = 'ACTION:DISPLAY';
                $lines[] = 'DESCRIPTION:' . self::esc($label . ' para entregar: ' . $task['title']);
                $lines[] = 'END:VALARM';
            }
        }
        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", array_map([self::class, 'fold'], $lines)) . "\r\n";
    }

    private static function esc(string $s): string
    {
        return str_replace(["\\", ';', ',', "\r\n", "\n"], ["\\\\", '\;', '\,', '\n', '\n'], $s);
    }

    /** Las líneas de un .ics no pueden pasar de 75 bytes */
    private static function fold(string $line): string
    {
        $out = '';
        while (strlen($line) > 75) {
            $cut = 75;
            // no cortar a la mitad un carácter UTF-8
            while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) {
                $cut--;
            }
            $out .= substr($line, 0, $cut) . "\r\n ";
            $line = substr($line, $cut);
        }
        return $out . $line;
    }
}
