# Recordatorio Universal

Tareas compartidas con recordatorios. Cada persona responde "¿cómo va?" (Ya lo hice / Sigo en eso / Aplazar) y al supervisor le llega un aviso cuando la tarea se termina o se vence.

| Parte | Tecnología | Dónde vive |
|---|---|---|
| Frontend | Astro + React + nanostores | GitHub Pages → `https://profesorjand.github.io/recordatorio-universal/` |
| Backend | PHP 8.2 puro (sin Composer) | GoDaddy → `https://api.guiadeparche.com/recordatorio/` |
| Base de datos | MySQL | GoDaddy / cPanel |
| Login | Google Identity Services | Google Cloud Console |
| Correos | SMTP de `jupeson@guiadeparche.com` | cPanel |
| Calendario | Invitaciones `.ics` por correo (Gmail las agrega a Google Calendar) | — |
| Recordatorios | Cron cada 5 min (`apiGuiadeparche/recordatorio/cron/run.php`) | cPanel |

```
recordatorio-universal/
├─ frontend/          ← Astro (npm run dev / build)
│  └─ src/
│     ├─ pages/       ← una página .astro por pantalla
│     ├─ components/  ← React (pages/, charts/ con canvas, Tour.tsx = tutoriales)
│     ├─ stores/      ← nanostores (sesión, avisos, refresco)
│     └─ lib/         ← api, zonas horarias, orden de prioridad, tutoriales
├─ apiGuiadeparche/recordatorio/           ← se sube tal cual a cPanel
│  ├─ index.php       ← API (enrutador)
│  ├─ routes/         ← endpoints
│  ├─ src/            ← lógica (Auth, Google, Mailer SMTP, Ics, Notifier, TaskService)
│  ├─ cron/run.php    ← motor de recordatorios
│  └─ sql/schema.sql  ← tablas + datos iniciales
└─ .github/workflows/deploy.yml  ← publica el frontend en GitHub Pages
```

---

## 1. Google Cloud Console (login)

1. Entra a https://console.cloud.google.com/ y crea un proyecto: **Recordatorio Universal**.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**
   - Tipo de usuario: **Externo**
   - Nombre de la app, correo de soporte (`profesorjand@gmail.com`).
   - Permisos (scopes): **no agregues ninguno**. Solo usamos los básicos (correo, nombre y foto), que no requieren verificación de Google.
   - **Publica la app** ("Publicar aplicación" / "En producción"). Así puede entrar cualquier Gmail sin estar en la lista de "usuarios de prueba". Igual, solo entra quien tú autorices en la app.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo: **Aplicación web**
   - **Orígenes autorizados de JavaScript**:
     - `https://profesorjand.github.io`
     - `http://localhost:4321`
     - `http://localhost`
   - (No hace falta "URI de redireccionamiento".)
4. Copia el **ID de cliente** (`xxxx.apps.googleusercontent.com`). El "secreto" **no** se usa.

## 2. GoDaddy / cPanel (backend)

### Carpeta
Sube el backend a una **carpeta nueva dentro de `api.guiadeparche.com`**, llamada `recordatorio`:

```
/home/TU_USUARIO/api.guiadeparche.com/recordatorio/   ← aquí va el contenido de apiGuiadeparche/recordatorio/
```

La URL queda `https://api.guiadeparche.com/recordatorio`. Así no se mezcla con lo que ya tienes en esa API, usa el mismo SSL y el correo `jupeson@guiadeparche.com` es del mismo dominio, lo que ayuda a que los correos no caigan en spam. `tatimonteroyoga.com` queda intacto.

> Para saber la ruta real: cPanel → **Domains** → mira la columna "Document Root" de `api.guiadeparche.com`.

### Pasos
1. **cPanel → MySQL® Databases**: crea la base `recordatorio`, un usuario y dale **ALL PRIVILEGES**.
2. **cPanel → phpMyAdmin**: elige la base → **Importar** → `apiGuiadeparche/recordatorio/sql/schema.sql`.
   Esto crea las tablas, los roles (Admin, Trabajador, Suspendido), los permisos y a `profesorjand@gmail.com` como admin principal.
3. **cPanel → File Manager**: dentro de la carpeta de `api.guiadeparche.com` crea `recordatorio` y sube todo el contenido de `apiGuiadeparche/recordatorio/` (puedes comprimirlo en .zip, subirlo y usar "Extract"). Revisa que se subieron los `.htaccess` (en File Manager: Settings → "Show Hidden Files").
4. Copia `config.example.php` como **`config.php`** y complétalo:
   - datos de la base,
   - `google_client_id`,
   - contraseña del correo `jupeson@guiadeparche.com` (cPanel → Email Accounts → Connect Devices muestra el servidor y el puerto; normalmente `mail.guiadeparche.com`, puerto 465 SSL),
   - un `cron_key` largo y aleatorio.
5. Verifica que la carpeta `storage/` y `uploads/` tengan permiso de escritura (755 o 775).
6. Abre `https://api.guiadeparche.com/recordatorio/`: debe responder `{"ok":true,...}`.
7. **cPanel → MultiPHP Manager**: confirma que `api.guiadeparche.com` usa **PHP 8.2**.

### Cron (los recordatorios)
**cPanel → Cron Jobs → Add New Cron Job**: "Once Per Five Minutes" (`*/5 * * * *`) con el comando:

```
/usr/local/bin/php /home/TU_USUARIO/api.guiadeparche.com/recordatorio/cron/run.php >/dev/null 2>&1
```

Si te da error, usa la versión por URL:

```
curl -s "https://api.guiadeparche.com/recordatorio/cron/run.php?key=TU_CRON_KEY" >/dev/null
```

Para probarlo a mano, abre esa URL en el navegador: muestra un resumen ("Correos enviados: 2…").

## 3. GitHub Pages (frontend)

1. En el repo → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**:
   - `PUBLIC_API_URL` = `https://api.guiadeparche.com/recordatorio`
   - `PUBLIC_GOOGLE_CLIENT_ID` = tu ID de cliente
3. Haz push a `main`. La acción "Deploy frontend" compila y publica. Queda en
   `https://profesorjand.github.io/recordatorio-universal/`

## 4. Trabajar en local

```bash
cd frontend
cp .env.example .env      # completa PUBLIC_API_URL y PUBLIC_GOOGLE_CLIENT_ID
npm install
npm run dev               # http://localhost:4321/recordatorio-universal/
```

El backend de GoDaddy ya acepta `http://localhost:4321` (está en `allowed_origins`), así que puedes desarrollar el frontend contra la API real.

Para el backend en local (opcional) necesitas PHP 8.2 + MySQL (por ejemplo XAMPP o Laragon): `php -S localhost:8000 index.php` dentro de `apiGuiadeparche/recordatorio/`.

---

## Cómo funciona

### Acceso
- Solo entran los correos que el admin agrega en **Usuarios**, con su rol elegido de antemano. La primera vez que esa persona inicia sesión con Google entra directo, sin esperar aprobación.
- Cualquier otro correo recibe "no autorizado" y queda fuera.
- **Suspendido** = rol sin permiso para entrar. Quitar acceso o suspender a alguien cierra su sesión al instante.
- `profesorjand@gmail.com` es el admin principal: nadie puede quitarle el rol de Admin.

### Permisos (editables en Roles)
| Permiso | Admin | Trabajador |
|---|:-:|:-:|
| `usuarios.gestionar`, `roles.gestionar` | ✓ | |
| `proyectos.crear`, `proyectos.ver_todos`, `proyectos.recursos` | ✓ | |
| `tareas.crear`, `tareas.editar_todas`, `tareas.eliminar` | ✓ | |
| `tareas.crear_vinculada` (pedir una tarea a otro desde la suya) | ✓ | ✓ |
| `tareas.comentar` | ✓ | ✓ |
| `estadisticas.ver_individual` | ✓ | ✓ |
| `estadisticas.ver_todos` | ✓ | |

### Tareas
- Una sola persona asignada. **Supervisor** opcional: recibe el aviso al terminar y los comentarios. Si creas una tarea sin supervisor, la app te pregunta antes de guardarla.
- **Tarea vinculada**: el trabajador, desde su tarea, le pide algo a otra persona. Su tarea queda "esperando", él pasa a ser el supervisor de la nueva tarea y, cuando la terminan, se le avisa y su tarea se desbloquea.
- Prioridades: Urgente, Tier S, A, B, C. **Orden**: vencidas → urgentes → cualquier tier que vence en menos de 48 h → S → A → B → C.
- La descripción y los comentarios aceptan enlaces e imágenes (`![nombre](url)`, el botón "Subir imagen" lo hace solo). Los proyectos tienen **material de apoyo** (enlaces e imágenes).

### Zonas horarias
- Todo se guarda en UTC. Cada usuario elige su zona al primer ingreso (y la puede cambiar en su perfil).
- La fecha límite se escribe en la hora de quien la crea o edita, y se guarda junto con su zona (`due_tz`).
- Cada persona la ve en su hora y, si está en otro país, también la hora original y la diferencia ("−2 h").

### Recordatorios (cron cada 5 min)
1. **"¿Cómo va?"** según la frecuencia de la tarea (opcional).
2. **Fecha límite**: alerta 24 h y 1 h antes.
3. **Vencida**: alerta a la persona asignada y aviso al supervisor (o, si no hay, a quien la creó) para que le pregunte. Se repite cada 24 h.
4. Las alertas aparecen en la app (barra amarilla + campanita). **Si no responde en 30 min, se manda por correo** con botones que funcionan sin entrar a la app. (Cuando se active WhatsApp, irá primero por WhatsApp.)
5. **Horario laboral**: fuera del horario de cada persona no se envía nada; queda en cola hasta que empiece su horario.
6. **Google Calendar**: cuando una tarea con fecha límite se asigna, se envía una invitación `.ics` a su Gmail, que la agrega al calendario con alarmas (1 día, 1 hora y 10 min antes). Si se completa, cambia la fecha o se elimina, el evento se actualiza o se cancela.

### Por qué así (decisiones)
- **Google Calendar con invitaciones `.ics`** y no con la API de Calendar: la API exige el permiso `calendar.events`, que Google considera "sensible". Con usuarios de Gmail normales, eso obliga a pasar la verificación de Google (formularios, video y espera) o a dejar la app en "modo prueba", donde el acceso se vence cada 7 días. La invitación por correo no necesita nada de eso y el celular avisa igual. (Google Workspace es la versión de pago de Gmail para empresas, con correos propios como `nombre@empresa.com`. Si algún día lo usan, la API se podría activar como app "interna" sin verificación.)
- **Correos desde `jupeson@guiadeparche.com`** y no desde el Gmail de cada usuario: enviar desde la cuenta de cada persona requiere el permiso `gmail.send`, que es "restringido" y exige una auditoría de seguridad pagada. En su lugar, cada correo que dispara una persona (comentario, entrega, pedido) lleva **Reply-To** con su Gmail: al tocar "Responder", la respuesta le llega directo a ella.
- **Sin Composer**: el login de Google se verifica con `openssl` (las llaves públicas de Google se descargan y quedan en caché), y el SMTP es una clase propia pequeña.
- **Sin cookies**: el frontend (github.io) y la API (guiadeparche.com) están en dominios distintos y los navegadores bloquean las cookies entre dominios, así que la sesión viaja como token en el encabezado `Authorization`.

### Pendiente / siguientes pasos
- WhatsApp: requiere una cuenta de Meta Business verificada. El código ya guarda el teléfono de cada usuario y tiene el lugar marcado en `Notifier::notify()`.
- Versión de escritorio (opcional): envolver el sitio con Tauri o Electron, o simplemente "Instalar app" desde Chrome (ya tiene `manifest.webmanifest`).

---

## Google Calendar (eventos, cumpleaños y Google Tasks)

Cada persona puede vincular su Google Calendar desde la página **Calendario**. Es **solo lectura**: la app no modifica nada en Google.

### Configuración (una vez)
1. Google Cloud Console → **APIs y servicios → Biblioteca**: habilita **Google Calendar API** y **Google Tasks API**.
2. **Acceso a los datos → Agregar o quitar permisos**: agrega
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/tasks.readonly`
3. **Clientes** → tu cliente web → copia el **Secreto del cliente** (`GOCSPX-...`).
4. En `config.php` (solo en el servidor):
   - `'google_client_secret' => 'GOCSPX-...'`
   - `'app_key' => '...'` (64 caracteres al azar; cifra los tokens guardados. No la cambies después o habrá que volver a vincular).
5. Ejecuta `sql/migracion_003.sql` en phpMyAdmin.

### App "sin verificar"
Mientras la app esté **En producción** pero sin verificar por Google:
- Al vincular, Google muestra *"Google no verificó esta app"*. Se continúa con **Configuración avanzada → Ir a Recordatorio Universal (no seguro)**. Es normal: la app es tuya.
- Máximo **100 personas** pueden vincular su calendario.
- La conexión **no vence cada 7 días** (eso solo pasa en "modo de prueba"). Puede vencer si se cambia la contraseña de Google, se revoca el acceso o pasan 6 meses sin uso; en ese caso aparece de nuevo el botón **Vincular**.
- No hace falta dominio propio, página de privacidad ni video: eso solo se pide si algún día envías la app a verificación.
