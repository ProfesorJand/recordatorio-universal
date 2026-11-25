import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import { Loading } from '../ui';
import { api } from '../../lib/api';
import { toast, toastError } from '../../stores/app';

interface Role { id: number; slug: string; name: string; can_login: boolean; is_system: boolean; users_count: number; permissions: string[] }
interface Perm { key: string; description: string }

function RolesContent() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    api<{ roles: Role[]; permissions: Perm[] }>('/roles').then((r) => { setRoles(r.roles); setPerms(r.permissions); }).catch(toastError);
  }, []);

  async function save(role: Role, body: Record<string, unknown>) {
    try {
      const r = await api<{ roles: Role[] }>(`/roles/${role.id}`, { method: 'PATCH', body });
      setRoles(r.roles);
      toast(`Rol "${role.name}" actualizado`);
    } catch (e) {
      toastError(e);
    }
  }

  function togglePerm(role: Role, key: string) {
    const next = role.permissions.includes(key) ? role.permissions.filter((p) => p !== key) : [...role.permissions, key];
    save(role, { permissions: next });
  }

  async function create() {
    if (!newName.trim()) return;
    try {
      const r = await api<{ roles: Role[] }>('/roles', { method: 'POST', body: { name: newName, can_login: true } });
      setRoles(r.roles);
      setNewName('');
    } catch (e) {
      toastError(e);
    }
  }

  async function remove(role: Role) {
    try {
      const r = await api<{ roles: Role[] }>(`/roles/${role.id}`, { method: 'DELETE' });
      setRoles(r.roles);
    } catch (e) {
      toastError(e);
    }
  }

  if (!roles) return <Loading />;
  return (
    <>
      <h1>Roles y permisos</h1>
      <p className="muted small">Marca lo que puede hacer cada rol. "Puede entrar" desmarcado = suspendido (no puede iniciar sesión).</p>
      <div className="card table-wrap" data-tour="roles">
        <table>
          <thead>
            <tr>
              <th>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} style={{ textAlign: 'center' }}>
                  {r.name}
                  <div className="tiny muted">{r.users_count} usuarios</div>
                  {!r.is_system && <button className="btn sm ghost" onClick={() => remove(r)} title="Borrar rol">🗑</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Puede entrar a la app</strong></td>
              {roles.map((r) => (
                <td key={r.id} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={r.can_login} disabled={r.slug === 'admin'} onChange={() => save(r, { can_login: !r.can_login })} />
                </td>
              ))}
            </tr>
            {perms.map((p) => (
              <tr key={p.key}>
                <td>
                  <div className="small">{p.description}</div>
                  <code className="tiny muted">{p.key}</code>
                </td>
                {roles.map((r) => {
                  const locked = r.slug === 'admin' && (p.key === 'usuarios.gestionar' || p.key === 'roles.gestionar');
                  return (
                    <td key={r.id} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={r.permissions.includes(p.key)} disabled={locked || !r.can_login} onChange={() => togglePerm(r, p.key)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card row" style={{ marginTop: '1rem' }}>
        <input type="text" placeholder="Nombre del nuevo rol (ej: Coordinador)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ maxWidth: 320 }} />
        <button className="btn primary" onClick={create}>+ Crear rol</button>
      </div>
    </>
  );
}

export default function AdminRolesPage() {
  return (
    <AppShell page="admin_roles">
      <RolesContent />
    </AppShell>
  );
}
