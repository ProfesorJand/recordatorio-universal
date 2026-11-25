import type { TourStep } from '../components/Tour';

/**
 * Tutoriales por página. Se muestran solos la primera vez que alguien entra
 * a esa página y se pueden repetir desde "Ayuda".
 * Para agregar un paso: ponle data-tour="algo" a un elemento y agrégalo aquí.
 */
export const TOURS: Record<string, TourStep[]> = {
  tareas: [
    { title: '¡Bienvenido! 👋', text: 'Esta app te recuerda lo que tienes que hacer y le avisa a tu supervisor cuando terminas. Te muestro lo básico en 1 minuto.' },
    { target: 'nav', title: 'El menú', text: 'Aquí cambias entre tus tareas, los proyectos, tus estadísticas, tu perfil y la ayuda.' },
    { target: 'scope', title: 'Qué tareas ver', text: '"Mis tareas" son las asignadas a ti. "Superviso" son las que tú pediste o supervisas. "Todas" muestra todo lo de tus proyectos.' },
    { target: 'list', title: 'Ordenadas por importancia', text: 'Arriba siempre van las vencidas, luego las urgentes, luego las que vencen en menos de 48 h y después por Tier S, A, B, C.' },
    { target: 'checkin', title: '¿Cómo va?', text: 'En tus tareas tienes estos botones: "Ya lo hice", "Sigo en eso" o "Aplazar". La app te irá preguntando y también te llegarán al correo.' },
    { target: 'bell', title: 'Avisos', text: 'En la campanita ves tus avisos. Si no respondes una alerta en 30 minutos, te la mandamos también por correo.' },
    { target: 'profile-link', title: 'Tu horario', text: 'En tu perfil elige tu zona horaria y tu horario de trabajo: fuera de ese horario no te llegan avisos.' },
  ],
  tarea: [
    { target: 'task-head', title: 'La tarea', text: 'Aquí ves la prioridad, el estado y la fecha límite en tu hora (y en la hora de quien la fijó, si está en otro país).' },
    { target: 'checkin', title: 'Responde aquí', text: 'Marca si ya la hiciste, si sigues o aplázala para que te lo recuerde después.' },
    { target: 'people', title: 'Personas', text: 'Quién la tiene asignada, quién la supervisa (recibe el aviso al terminar) y quién la creó.' },
    { target: 'linked', title: '¿Necesitas a alguien más?', text: 'Si para terminar necesitas que otra persona haga algo, pídele una tarea vinculada. Tu tarea queda "esperando" y te avisamos cuando la terminen.' },
    { target: 'comments', title: 'Comentarios', text: 'Deja comentarios con enlaces o imágenes. Le avisamos al supervisor y a la persona asignada.' },
  ],
  proyectos: [
    { target: 'projects', title: 'Proyectos', text: 'Cada tarea pertenece a un proyecto. Solo ves los proyectos donde eres miembro.' },
    { target: 'new-project', title: 'Crear proyecto (admin)', text: 'Los administradores crean proyectos y eligen quiénes participan.' },
  ],
  proyecto: [
    { target: 'resources', title: 'Material de apoyo', text: 'Enlaces e imágenes generales del proyecto para que cualquiera del equipo los consulte.' },
    { target: 'project-tasks', title: 'Tareas del proyecto', text: 'Todas las tareas del proyecto, ordenadas por prioridad.' },
  ],
  estadisticas: [
    { target: 'filters', title: 'Filtros', text: 'Elige el rango de fechas y el proyecto.' },
    { target: 'chart-users', title: 'Tareas por persona', text: 'Cada barra es una persona y cada color un estado. Pasa el mouse por encima para ver los números. También puedes ver la tabla.' },
    { target: 'chart-weekly', title: 'Ritmo semanal', text: 'Cuántas tareas se completaron cada semana.' },
  ],
  admin_usuarios: [
    { target: 'add-user', title: 'Autorizar correos', text: 'Solo pueden entrar los correos que agregues aquí. Elige su rol desde ya: cuando inicien sesión con Google por primera vez entran directo.' },
    { target: 'users-table', title: 'Cambiar roles', text: 'Cambia el rol de cualquiera o quítale el acceso. "Suspendido" bloquea la entrada sin borrar su historial.' },
  ],
  admin_roles: [
    { target: 'roles', title: 'Permisos por rol', text: 'Marca qué puede hacer cada rol. Los cambios aplican de inmediato a todos los usuarios con ese rol.' },
  ],
};
