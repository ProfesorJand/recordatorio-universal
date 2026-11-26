import { useState, type FormEvent } from 'react';
import { TimeSelect } from '../DateTimeInput';
import { useStore } from '@nanostores/react';
import AppShell from '../AppShell';
import TimezoneSelect from '../TimezoneSelect';
import { Avatar } from '../ui';
import { api } from '../../lib/api';
import type { User } from '../../lib/types';
import { browserTz } from '../../lib/time';
import { $user, setUser } from '../../stores/session';
import { toast, toastError } from '../../stores/app';
import { playNotify, playUrgent, setSoundEnabled, soundEnabled, unlockAudio } from '../../lib/sound';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function ProfileContent() {
  const user = useStore($user)!;
  const [name, setName] = useState(user.name || '');
  const [tz, setTz] = useState(user.timezone || browserTz());
  const [useHours, setUseHours] = useState(!!(user.work_start && user.work_end));
  const [start, setStart] = useState(user.work_start || '08:00');
  const [end, setEnd] = useState(user.work_end || '18:00');
  const [days, setDays] = useState<number[]>(user.work_days.length ? user.work_days : [1, 2, 3, 4, 5]);
  const [notifyEmail, setNotifyEmail] = useState(user.notify_email);
  const [phone, setPhone] = useState(user.whatsapp_phone || '');
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const [browserPerm, setBrowserPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ user: User }>('/me', {
        method: 'PATCH',
        body: {
          name,
          timezone: tz,
          work_start: useHours ? start : null,
          work_end: useHours ? end : null,
          work_days: days,
          notify_email: notifyEmail,
          whatsapp_phone: phone,
        },
      });
      setUser(r.user);
      toast('Perfil guardado');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resetTutorials() {
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { tutorial_seen: '', reset_tutorials: true } });
      setUser(r.user);
      toast('Los tutoriales se mostrarán de nuevo');
    } catch (e) {
      toastError(e);
    }
  }

  async function askBrowser() {
    if (typeof Notification === 'undefined') return;
    setBrowserPerm(await Notification.requestPermission());
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 680 }}>
      <h1>Mi perfil</h1>
      <div className="card row" style={{ marginBottom: '1rem' }}>
        <Avatar person={user} size={48} />
        <div>
          <strong>{user.email}</strong>
          <div className="small muted">Rol: {user.role.name}</div>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Zona horaria</label>
          <TimezoneSelect value={tz} onChange={setTz} />
          <div className="hint">Las fechas que escribas se guardan en esta hora. Las de otros se te muestran convertidas.</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>🌙 Horario de avisos</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Fuera de este horario no te llegan correos ni alertas: quedan en espera y te llegan cuando empiece tu horario.
        </p>
        <label className="check">
          <input type="checkbox" checked={useHours} onChange={(e) => setUseHours(e.target.checked)} /> Usar horario de trabajo
        </label>
        {useHours && (
          <>
            <div className="row" style={{ marginTop: 8 }}>
              <div><label>Desde</label><TimeSelect value={start} onChange={setStart} /></div>
              <div><label>Hasta</label><TimeSelect value={end} onChange={setEnd} /></div>
            </div>
            <div style={{ marginTop: 10 }}>
              {DAYS.map((d, i) => (
                <label key={d} className="check">
                  <input type="checkbox" checked={days.includes(i + 1)} onChange={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])} /> {d}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>🔔 Canales de aviso</h3>
        <label className="check">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /> Recibir correos (a {user.email})
        </label>
        <p className="hint">Las fechas límite te llegan como invitación de Google Calendar, así tu celular te avisa.</p>
        <div className="field" style={{ marginTop: 10 }}>
          <label>WhatsApp</label>
          <input type="tel" placeholder="+54 9 11 2233 4455" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="hint">Con código de país. Se usa para que te avisen por WhatsApp de las tareas urgentes (botón "WhatsApp" en la tarea).</div>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundEnabled(e.target.checked); }} /> 🔊 Sonido en los avisos (en este dispositivo)
          </label>
          <button type="button" className="btn sm" onClick={() => { unlockAudio(); playNotify(true); }}>Probar aviso</button>
          <button type="button" className="btn sm" onClick={() => { unlockAudio(); playUrgent(true); }}>Probar alarma urgente</button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>Lo urgente suena cada 2 minutos hasta que abras la tarea, respondas o lo silencies. La app tiene que estar abierta en una pestaña.</p>
        <div className="row">
          <span className="small">Avisos del navegador: {browserPerm === 'granted' ? '✅ activados' : browserPerm === 'denied' ? '🚫 bloqueados' : 'sin activar'}</span>
          {browserPerm === 'default' && <button type="button" className="btn sm" onClick={askBrowser}>Activar</button>}
        </div>
      </div>

      <div className="row between" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn" onClick={resetTutorials}>🎓 Volver a ver los tutoriales</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <AppShell page="perfil">
      <ProfileContent />
    </AppShell>
  );
}
