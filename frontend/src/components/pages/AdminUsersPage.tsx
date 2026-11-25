import { useEffect, useState, type FormEvent } from 'react';
import AppShell from '../AppShell';
import { Avatar, Loading } from '../ui';
import { api } from '../../lib/api';
import { formatDateTime, shortTz } from '../../lib/time';
import { loadDirectory, toast, toastError } from '../../stores/app';
import { $user, myTz } from '../../stores/session';

interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: { id: number; name: string; slug: string };
  is_owner: boolean;
  active: boolean;
  timezone: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
}
interface Role { id: number; name: string; can_login: boolean }

function UsersContent() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(2);
  const [busy, setBusy] = useState(false);
  const me = $user.get();
  const tz = myTz();

  const load = () => api<{ users: AdminUser[] }>('/users').then((r) => setUsers(r.users)).catch(toastError);
  useEffect(() => {
    load();
    api<{ roles: Role[] }>('/roles').then((r) => setRoles(r.roles)).catch(toastError);
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: { email, name: name || null, role_id: roleId } });
      toast(`${email} ya puede entrar con su cuenta de Google`);
      setEmail('');
      setName('');
      load();
      loadDirectory(true);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function patch(u: AdminUser, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      toast(msg);
      load();
      loadDirectory(true);
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <>
      <h1>Usuarios autorizados</h1>
      <form className="card" onSubmit={add} data-tour="add-user">
        <h3 style={{ marginTop: 0 }}>Autorizar un correo</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Solo pueden entrar los correos de esta lista. Cuando la persona inicie sesión con Google por primera vez, entra directo con el rol que elijas.
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label>Correo de Google</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@gmail.com" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Nombre (opcional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label>Rol</label>
            <select value={roleId} onChange={(e) => setRoleId(+e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button className="btn primary" disabled={busy}>Autorizar</button>
        </div>
      </form>

      {users === null ? <Loading /> : (
        <div className="card table-wrap" style={{ marginTop: '1rem' }} data-tour="users-table">
          <table>
            <thead>
              <tr><th>Persona</th><th>Rol</th><th>Zona horaria</th><th>Último ingreso</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Avatar person={{ name: u.name || u.email, email: u.email, picture: u.picture }} />
                      <div>
                        <div>{u.name || '—'} {u.is_owner && <span className="chip">⭐ Principal</span>}</div>
                        <div className="tiny muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select value={u.role.id} disabled={u.is_owner || !u.active} style={{ minWidth: 130 }}
                      onChange={(e) => patch(u, { role_id: +e.target.value }, 'Rol actualizado')}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="small">{u.timezone ? shortTz(u.timezone) : '—'}</td>
                  <td className="small">{u.last_login_at ? formatDateTime(u.last_login_at, tz) : <span className="muted">Nunca entró</span>}</td>
                  <td>
                    {!u.is_owner && u.id !== me?.id && (
                      u.active
                        ? <button className="btn sm danger" onClick={() => patch(u, { active: false }, 'Acceso quitado')}>Quitar acceso</button>
                        : <button className="btn sm" onClick={() => patch(u, { active: true }, 'Acceso devuelto')}>Devolver acceso</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <AppShell page="admin_usuarios">
      <UsersContent />
    </AppShell>
  );
}
