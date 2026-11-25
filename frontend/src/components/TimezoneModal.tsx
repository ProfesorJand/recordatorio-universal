import { useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { setUser } from '../stores/session';
import { toastError } from '../stores/app';
import TimezoneSelect from './TimezoneSelect';
import { browserTz } from '../lib/time';

/** Se muestra la primera vez: hay que elegir la zona horaria antes de usar la app. */
export default function TimezoneModal() {
  const [tz, setTz] = useState(browserTz());
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { timezone: tz } });
      setUser(r.user);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back">
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>🌎 ¿En qué zona horaria estás?</h2>
        <p className="muted small">
          Las fechas límite se guardan según la hora de quien las escribe. Así, si alguien está en otro país,
          verá la hora convertida a la suya. Detectamos esta zona en tu dispositivo; cámbiala si no es correcta.
        </p>
        <div className="field">
          <TimezoneSelect value={tz} onChange={setTz} />
        </div>
        <button className="btn primary" disabled={busy} onClick={save} style={{ width: '100%' }}>Guardar y continuar</button>
        <p className="hint">Puedes cambiarla luego en tu perfil.</p>
      </div>
    </div>
  );
}
