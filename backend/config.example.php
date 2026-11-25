<?php
/**
 * Copia este archivo como "config.php" (en la misma carpeta) y completa los datos.
 * config.php NUNCA se sube a GitHub (está en .gitignore) y el .htaccess
 * impide que alguien lo abra desde el navegador.
 */
return [
    // --- Base de datos (cPanel > MySQL Databases) ---------------------------
    'db' => [
        'host'     => 'localhost',
        'name'     => 'cpaneluser_recordatorio',
        'user'     => 'cpaneluser_recordatorio',
        'password' => 'CAMBIAR',
    ],

    // --- Google (Google Cloud Console > APIs y servicios > Credenciales) ----
    // Solo hace falta el "ID de cliente". El secreto NO se usa.
    'google_client_id' => 'XXXXXXXXXXXX-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',

    // --- URLs ---------------------------------------------------------------
    // Dónde está publicado el frontend (GitHub Pages)
    'frontend_url' => 'https://profesorjand.github.io/recordatorio-universal',
    // Dónde está este backend
    'api_url'      => 'https://api.guiadeparche.com/recordatorio',
    // Orígenes que pueden llamar a la API (CORS)
    'allowed_origins' => [
        'https://profesorjand.github.io',
        'http://localhost:4321',
    ],

    // --- Correo saliente (cPanel > Email Accounts > Connect Devices) --------
    'mail' => [
        'from_email' => 'jupeson@guiadeparche.com',
        'from_name'  => 'Recordatorio Universal',
        // 'smtp' = usa usuario y contraseña; 'mail' = usa la función mail() del hosting
        'transport'  => 'smtp',
        'host'       => 'mail.guiadeparche.com',
        'port'       => 465,          // 465 = SSL, 587 = STARTTLS
        'secure'     => 'ssl',        // 'ssl' | 'tls' | ''
        'username'   => 'jupeson@guiadeparche.com',
        'password'   => 'CAMBIAR',
    ],

    // --- Cron ---------------------------------------------------------------
    // Clave para poder ejecutar el cron por URL si tu plan no permite "php" en el cron:
    // https://api.guiadeparche.com/recordatorio/cron/run.php?key=ESTA_CLAVE
    'cron_key' => 'cambia-esto-por-algo-largo-y-aleatorio',

    // --- Ajustes de recordatorios ------------------------------------------
    'escalate_minutes'   => 30,    // si no responde la alerta en la app, se manda por correo
    'session_days'       => 30,    // cuánto dura la sesión
    'default_timezone'   => 'America/Argentina/Buenos_Aires',
    'max_upload_mb'      => 8,
    'debug'              => false,
];
