import AppShell, { $tourRequest } from '../AppShell';
import { url } from '../../lib/config';
import { can } from '../../stores/session';

const GUIDES: { title: string; body: string[]; tour?: string; href?: string; perm?: string }[] = [
  {
    title: '✅ Mis tareas y el "¿cómo va?"',
    tour: 'tareas',
    href: '/tareas/',
    body: [
      'En "Mis tareas" ves lo que te asignaron, ordenado por importancia: primero las vencidas, luego las urgentes, después las que vencen en menos de 48 horas y al final por Tier S, A, B y C.',
      'Cada cierto tiempo la app te pregunta "¿cómo va?". Responde con un toque: Ya lo hice, Sigo en eso o Aplazar (1 hora, mañana, 3 días o la fecha que quieras).',
      'Si no respondes la alerta en 30 minutos, te llega también por correo con los mismos botones.',
    ],
  },
  {
    title: '📅 Fechas límite y zonas horarias',
    body: [
      'Cuando alguien pone una fecha límite, se guarda en SU hora. Tú la ves convertida a tu hora y, si estás en otro país, también ves la hora original.',
      'Te avisamos 24 horas y 1 hora antes. La fecha también llega como invitación de Google Calendar a tu Gmail, así tu celular te avisa.',
      'Si la fecha pasa y no terminaste, avisamos a tu supervisor para que te pregunte si necesitas ayuda.',
    ],
  },
  {
    title: '🔗 Pedir una tarea a otra persona',
    tour: 'tarea',
    body: [
      'Abre tu tarea y toca "Pedir a otra persona". Escribe qué necesitas y a quién.',
      'Tu tarea queda "esperando" y tú quedas como supervisor de la tarea pedida: cuando la terminen, te llega el aviso y tu tarea se desbloquea.',
    ],
  },
  {
    title: '👁 Supervisor',
    body: [
      'El supervisor es la persona que recibe el aviso cuando la tarea se termina, y también los comentarios.',
      'Es opcional: si se crea una tarea sin supervisor, la app avisa antes de guardarla.',
    ],
  },
  {
    title: '🌙 Mi horario de avisos',
    href: '/perfil/',
    body: [
      'En tu perfil elige tu zona horaria y tu horario de trabajo (por ejemplo, de lunes a viernes de 8:00 a 18:00).',
      'Fuera de ese horario no te llega nada: los avisos esperan y te llegan cuando empieza tu horario.',
    ],
  },
  {
    title: '📊 Estadísticas',
    tour: 'estadisticas',
    href: '/estadisticas/',
    body: ['Mira cuántas tareas completaste a tiempo, cuántas tarde y cuántas siguen abiertas. Los administradores ven las de todo el equipo.'],
  },
  {
    title: '👥 Administración (solo admin)',
    tour: 'admin_usuarios',
    href: '/admin/usuarios/',
    perm: 'usuarios.gestionar',
    body: [
      'Solo pueden entrar los correos que agregues en "Usuarios". Al agregarlos eliges su rol, y cuando inicien sesión con Google por primera vez entran directo.',
      'En "Roles" decides qué puede hacer cada rol. "Suspendido" no puede entrar.',
      'En "Proyectos" creas proyectos, eliges sus miembros y agregas material de apoyo (enlaces e imágenes).',
    ],
  },
];

function startTour(key: string, href?: string) {
  // El tutorial se muestra en su página: si no estamos ahí, vamos y se inicia solo
  if (href && !window.location.pathname.includes(href.replace(/\/$/, ''))) {
    sessionStorage.setItem('ru_tour', key);
    window.location.href = url(href);
    return;
  }
  $tourRequest.set(key);
}

function HelpContent() {
  return (
    <>
      <h1>Ayuda</h1>
      <p className="muted">Guías cortas para usar la aplicación. Toca "Ver tutorial" para que te lo muestre paso a paso en la pantalla.</p>
      <div className="grid grid-2">
        {GUIDES.filter((g) => !g.perm || can(g.perm)).map((g) => (
          <div key={g.title} className="card">
            <h3 style={{ marginTop: 0 }}>{g.title}</h3>
            {g.body.map((p, i) => <p key={i} className="small">{p}</p>)}
            {g.tour && g.href && <button className="btn sm primary" onClick={() => startTour(g.tour!, g.href)}>🎓 Ver tutorial</button>}
            {g.tour && !g.href && <p className="tiny muted">El tutorial aparece al abrir cualquier tarea.</p>}
          </div>
        ))}
      </div>
    </>
  );
}

export default function HelpPage() {
  return (
    <AppShell page="ayuda">
      <HelpContent />
    </AppShell>
  );
}
