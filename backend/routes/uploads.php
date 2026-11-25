<?php
declare(strict_types=1);
/** @var Router $router */

// Subir una imagen (para descripciones, comentarios o material de apoyo)
$router->post('/uploads', function () {
    $u = Auth::require();
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        throw new HttpError(422, 'No llegó ninguna imagen (o pesa demasiado para el servidor)');
    }
    $f = $_FILES['file'];
    $max = (int)config('max_upload_mb', 8) * 1024 * 1024;
    if ($f['size'] > $max) {
        throw new HttpError(422, 'La imagen pesa más de ' . config('max_upload_mb', 8) . ' MB');
    }
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset($allowed[$mime]) || @getimagesize($f['tmp_name']) === false) {
        throw new HttpError(422, 'Solo se permiten imágenes JPG, PNG, GIF o WEBP');
    }

    $sub = gmdate('Y/m');
    $dir = APP_ROOT . '/uploads/' . $sub;
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        throw new HttpError(500, 'No se pudo crear la carpeta de subidas');
    }
    $name = random_token(16) . '.' . $allowed[$mime];
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) {
        throw new HttpError(500, 'No se pudo guardar la imagen');
    }
    Db::insert('uploads', [
        'stored_name' => "$sub/$name",
        'original'    => mb_substr((string)$f['name'], 0, 255),
        'mime'        => $mime,
        'size_bytes'  => (int)$f['size'],
        'uploaded_by' => $u['id'],
    ]);
    json_out(['url' => rtrim((string)config('api_url'), '/') . "/uploads/$sub/$name", 'name' => $f['name']], 201);
});
