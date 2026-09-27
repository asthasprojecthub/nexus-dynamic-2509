import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, RotateCcw, Save, ShieldCheck, UserRoundCog } from 'lucide-react';
import { api } from '../api';
import { PageHeader, PrimaryButton, SecondaryButton, Select, Status, Toggle } from '../components/ui';

const ACTIONS = [
  ['VIEW', 'View'],
  ['CREATE', 'Create'],
  ['UPDATE', 'Edit'],
  ['STATUS_CHANGE', 'Status Change'],
  ['DELETE', 'Delete'],
];

export default function RolePermissionsPage() {
  const [model, setModel] = useState({ roles: [], users: [], pages: [], assignments: {}, role_defaults: {} });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [permissionKeys, setPermissionKeys] = useState([]);
  const [userActive, setUserActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async (keepUser = true) => {
    setLoading(true);
    setError('');
    try {
      const next = await api('/access-control');
      setModel(next);
      const nextUserId = keepUser && selectedUserId && next.users.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : (next.users[0]?.id || '');
      const user = next.users.find((item) => item.id === nextUserId);
      setSelectedUserId(nextUserId);
      setSelectedRoleId(user?.role_id || '');
      setPermissionKeys(next.assignments?.[nextUserId] || []);
      setUserActive(user?.is_active !== false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedUser = useMemo(() => model.users.find((user) => user.id === selectedUserId), [model.users, selectedUserId]);
  const selectedRole = useMemo(() => model.roles.find((role) => role.id === selectedRoleId), [model.roles, selectedRoleId]);
  const isAdminRole = selectedRole?.role_code === 'ADMIN';

  const selectUser = (id) => {
    const user = model.users.find((item) => item.id === id);
    setSelectedUserId(id);
    setSelectedRoleId(user?.role_id || '');
    setPermissionKeys(model.assignments?.[id] || []);
    setUserActive(user?.is_active !== false);
    setMessage('');
    setError('');
  };

  const selectRole = (id) => {
    setSelectedRoleId(id);
    setPermissionKeys(model.role_defaults?.[id] || []);
    setMessage('Role defaults loaded. You can now customize this person before saving.');
    setError('');
  };

  const applyRoleDefaults = () => {
    if (!selectedRoleId) return;
    setPermissionKeys(model.role_defaults?.[selectedRoleId] || []);
    setMessage('Role default permissions restored for this person. Save to apply them.');
  };

  const togglePermission = (key) => {
    if (isAdminRole) return;
    setPermissionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const save = async () => {
    if (!selectedUserId || !selectedRoleId) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api(`/access-control/users/${selectedUserId}`, {
        method: 'PUT',
        body: JSON.stringify({ role_id: selectedRoleId, permission_keys: permissionKeys, is_active: userActive }),
      });
      setMessage('User role and individual permissions saved.');
      await load(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="fade-in">
    <PageHeader
      title="User Role & Permissions"
      description="Manage access person by person. Select a user, assign a role, then allow or block actions for each page."
      action={<SecondaryButton type="button" onClick={() => load(true)} disabled={loading}><RefreshCcw size={15} /> Refresh</SecondaryButton>}
    />

    {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    {message && <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{message}</div>}

    <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(240px,1.2fr)_220px_minmax(220px,.8fr)_auto] xl:items-end">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Person</label>
        <Select value={selectedUserId} onChange={(e) => selectUser(e.target.value)} disabled={loading}>
          {model.users.map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.employee_no}</option>)}
        </Select>
        {selectedUser && <p className="mt-1 text-[11px] text-slate-400">{selectedUser.email}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
        <Select value={selectedRoleId} onChange={(e) => selectRole(e.target.value)} disabled={loading}>
          {model.roles.filter((role) => role.is_active !== false).map((role) => <option key={role.id} value={role.id}>{role.role_name}</option>)}
        </Select>
      </div>

      <div className="flex min-h-10 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">User Status</p>
          <p className="text-xs text-slate-400">Inactive users cannot be used normally.</p>
        </div>
        <div className="flex items-center gap-2"><Status value={userActive ? 'Active' : 'Inactive'} /><Toggle checked={userActive} onChange={setUserActive} /></div>
      </div>

      <PrimaryButton type="button" onClick={save} disabled={loading || saving || !selectedUserId}><Save size={15} /> {saving ? 'Saving...' : 'Save User Access'}</PrimaryButton>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <UserRoundCog size={18} className="mt-0.5 shrink-0 text-blue-600" />
        <div><p className="text-sm font-semibold text-slate-800">Individual permission matrix</p><p className="text-xs text-slate-500">The role gives a starting template. You can change any permission for this selected person without changing other users with the same role.</p></div>
      </div>
      <SecondaryButton type="button" onClick={applyRoleDefaults} disabled={!selectedRoleId || isAdminRole}><RotateCcw size={15} /> Use Role Defaults</SecondaryButton>
    </div>

    {isAdminRole && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Admin role always receives all available page permissions. Change the person's role if you need restricted access.</div>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Page</th>{ACTIONS.map(([key, label]) => <th key={key} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={ACTIONS.length + 1} className="px-4 py-12 text-center text-slate-400">Loading users and permissions...</td></tr> : model.pages.map((page) => <tr key={page.module} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="rounded-lg bg-blue-50 p-2 text-blue-700"><ShieldCheck size={15} /></div><div><p className="font-semibold text-slate-900">{page.label}</p><p className="text-[11px] text-slate-400">{page.module}</p></div></div></td>
              {ACTIONS.map(([action]) => {
                const applicable = page.actions.includes(action);
                const key = `${page.module}.${action}`;
                const checked = isAdminRole ? applicable : permissionKeys.includes(key);
                return <td key={action} className="px-3 py-3 text-center">{applicable ? <label className="inline-flex cursor-pointer items-center justify-center"><input type="checkbox" checked={checked} disabled={isAdminRole} onChange={() => togglePermission(key)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed" /></label> : <span className="text-slate-300">—</span>}</td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">Status Change remains separate from Edit, so a person can edit record details without being allowed to move the record to another workflow status.</div>
    </div>
  </div>;
}
