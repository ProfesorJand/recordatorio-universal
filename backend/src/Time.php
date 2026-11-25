<?php
declare(strict_types=1);

/**
 * Manejo de zonas horarias.
 *  - En la base todo se guarda en UTC ("Y-m-d H:i:s").
 *  - Cada usuario tiene su zona (users.timezone).
 *  - Cuando alguien fija una fecha, la escribe en SU hora y aquí se convierte a UTC.
 */
class Time
{
    public static function isValidTz(?string $tz): bool
    {
        if (!$tz) {
            return false;
        }
        if (in_array($tz, DateTimeZone::listIdentifiers(), true)) {
            return true;
        }
        // Acepta también los alias antiguos que usan algunos navegadores (ej: America/Buenos_Aires)
        if (!preg_match('#^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){1,2}$#', $tz)) {
            return false;
        }
        try {
            new DateTimeZone($tz);
            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    public static function userTz(?array $user): string
    {
        $tz = $user['timezone'] ?? null;
        return self::isValidTz($tz) ? $tz : (string)config('default_timezone', 'UTC');
    }

    /** "2026-11-30T18:00" en la zona $tz  ->  "2026-11-30 21:00:00" UTC */
    public static function localToUtc(string $local, string $tz): string
    {
        $local = str_replace('T', ' ', trim($local));
        if (strlen($local) === 16) {
            $local .= ':00';
        }
        $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $local, new DateTimeZone($tz));
        if (!$dt) {
            throw new HttpError(422, 'Fecha inválida, usa el formato AAAA-MM-DDTHH:MM');
        }
        return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** UTC de la base -> ISO 8601 con Z para el frontend. */
    public static function iso(?string $utc): ?string
    {
        if (!$utc) {
            return null;
        }
        return str_replace(' ', 'T', $utc) . 'Z';
    }

    /** Texto legible en la zona de un usuario (para correos). */
    public static function human(?string $utc, string $tz): string
    {
        if (!$utc) {
            return '';
        }
        $dt = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
        $dt = $dt->setTimezone(new DateTimeZone($tz));
        $dias = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
        return $dias[(int)$dt->format('N')] . ' ' . $dt->format('d/m/Y H:i') . ' (' . $tz . ')';
    }

    public static function utcNow(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    public static function addMinutes(string $utc, int $minutes): string
    {
        $dt = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
        return $dt->modify(($minutes >= 0 ? '+' : '') . $minutes . ' minutes')->format('Y-m-d H:i:s');
    }

    /**
     * Devuelve el primer momento (UTC) >= $fromUtc que cae dentro del horario
     * laboral del usuario. Si no configuró horario, devuelve $fromUtc.
     * Soporta horarios que cruzan la medianoche (ej: 22:00 a 06:00).
     */
    public static function nextWorkTime(array $user, string $fromUtc): string
    {
        $start = $user['work_start'] ?? null;
        $end   = $user['work_end'] ?? null;
        if (!$start || !$end || $start === $end) {
            return $fromUtc;
        }
        $days = array_filter(array_map('intval', explode(',', (string)($user['work_days'] ?? ''))));
        if (!$days) {
            return $fromUtc;
        }

        $tz   = new DateTimeZone(self::userTz($user));
        $from = (new DateTimeImmutable($fromUtc, new DateTimeZone('UTC')))->setTimezone($tz);
        $best = null;

        // Revisamos desde ayer (por si hay un turno nocturno en curso) hasta 8 días adelante
        for ($i = -1; $i <= 8; $i++) {
            $day = $from->setTime(0, 0)->modify(($i >= 0 ? '+' : '') . $i . ' day');
            if (!in_array((int)$day->format('N'), $days, true)) {
                continue;
            }
            [$sh, $sm] = array_map('intval', explode(':', $start));
            [$eh, $em] = array_map('intval', explode(':', $end));
            $winStart = $day->setTime($sh, $sm);
            $winEnd   = $day->setTime($eh, $em);
            if ($winEnd <= $winStart) {
                $winEnd = $winEnd->modify('+1 day');
            }
            if ($from >= $winStart && $from < $winEnd) {
                return $fromUtc; // ya está dentro del horario
            }
            if ($winStart > $from && ($best === null || $winStart < $best)) {
                $best = $winStart;
            }
        }
        if ($best === null) {
            return $fromUtc;
        }
        return $best->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** "3 h 20 min", "2 días" */
    public static function humanDiff(string $fromUtc, string $toUtc): string
    {
        $mins = (int)round((strtotime($toUtc . ' UTC') - strtotime($fromUtc . ' UTC')) / 60);
        $abs = abs($mins);
        if ($abs < 60) {
            $txt = $abs . ' min';
        } elseif ($abs < 60 * 24) {
            $txt = intdiv($abs, 60) . ' h' . ($abs % 60 ? ' ' . ($abs % 60) . ' min' : '');
        } else {
            $d = intdiv($abs, 60 * 24);
            $txt = $d . ($d === 1 ? ' día' : ' días');
        }
        return $txt;
    }
}
