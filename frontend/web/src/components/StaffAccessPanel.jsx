import React, { useEffect, useState } from 'react';
import {
  AtSign,
  CheckCircle2,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X
} from 'lucide-react';
import { createStaffUser, fetchStaffUsers, updateStaffUser } from '../api';

const roleLabels = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front Desk',
  trainer: 'Trainer'
};

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  role: 'front_desk',
  trainerId: ''
};

function formatPhone(phone) {
  if (!phone) return null;
  if (/^\+91\d{10}$/.test(phone)) return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  return phone;
}

export default function StaffAccessPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await fetchStaffUsers();
      if (result.success) setUsers(result.data);
      else setError(result.error || 'Unable to load staff accounts.');
    } catch {
      setError('Unable to reach the secure staff directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchStaffUsers()
      .then(result => {
        if (!active) return;
        if (result.success) setUsers(result.data);
        else setError(result.error || 'Unable to load staff accounts.');
      })
      .catch(() => { if (active) setError('Unable to reach the secure staff directory.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const flashSuccess = (message) => {
    setSuccess(message);
    setError('');
    window.setTimeout(() => setSuccess(''), 3500);
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await createStaffUser({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        trainerId: form.role === 'trainer' ? Number(form.trainerId) : null
      });
      if (result.success) {
        flashSuccess('Staff account created. They can sign in with Google using that Gmail.');
        setForm(emptyForm);
        setShowCreate(false);
        await loadUsers();
      } else setError(result.error || 'Unable to create staff account.');
    } catch {
      setError('Unable to reach the secure staff directory.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user) => {
    setEditTarget(user);
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      trainerId: user.trainerId ?? ''
    });
    setError('');
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await updateStaffUser(editTarget.id, {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        trainerId: editForm.role === 'trainer' ? Number(editForm.trainerId) : null
      });
      if (result.success) {
        flashSuccess(result.message || 'Staff access updated.');
        setEditTarget(null);
        await loadUsers();
      } else setError(result.error || 'Unable to update staff access.');
    } catch {
      setError('Unable to reach the secure staff directory.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    setError('');
    try {
      const result = await updateStaffUser(user.id, { active: !user.active });
      if (result.success) {
        flashSuccess(`${user.fullName} is now ${user.active ? 'deactivated' : 'active'}.`);
        await loadUsers();
      } else setError(result.error || 'Unable to update staff access.');
    } catch {
      setError('Unable to reach the secure staff directory.');
    }
  };

  const accountForm = (value, setter) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-[11px] font-semibold text-slate-400">
        Full name
        <input
          required
          maxLength={100}
          value={value.fullName}
          onChange={event => setter({ ...value, fullName: event.target.value })}
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
          placeholder="e.g. Priya Shah"
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-400">
        Gmail address (sign-in identity)
        <input
          required
          type="email"
          value={value.email}
          onChange={event => setter({ ...value, email: event.target.value })}
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
          placeholder="e.g. priya.shah@gmail.com"
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-400">
        Contact mobile (optional)
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.phone}
          onChange={event => setter({ ...value, phone: event.target.value })}
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
          placeholder="e.g. 98250 11223"
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-400">
        Access role
        <select
          value={value.role}
          onChange={event => setter({ ...value, role: event.target.value })}
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
        >
          {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
        </select>
      </label>
      {value.role === 'trainer' && (
        <label className="text-[11px] font-semibold text-slate-400">
          Trainer ID
          <input
            required
            type="number"
            min="1"
            value={value.trainerId}
            onChange={event => setter({ ...value, trainerId: event.target.value })}
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
            placeholder="e.g. 102"
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-amber-400" /> Staff Access & Google Sign-in
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">Register a Gmail for each team member, set their role, and revoke access. There are no passwords.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white" title="Refresh staff users">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowCreate(value => !value)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
          >
            {showCreate ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showCreate ? 'Cancel' : 'Add Staff User'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{error}</div>}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300" role="status">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </div>
      )}

      {showCreate && (
        <form onSubmit={submitCreate} className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.035] p-4">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-amber-200">
            <UserRoundCheck className="h-4 w-4" /> New staff account
          </div>
          {accountForm(form, setForm)}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <p className="text-[10px] leading-4 text-slate-600">The person signs in with Google using exactly this Gmail. No password is created or stored.</p>
            <button disabled={saving} className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Staff user</th>
              <th className="px-4 py-3">Role & scope</th>
              <th className="px-4 py-3">Google link</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Security actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading secure staff directory…</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3.5">
                  <p className="font-bold text-white">{user.fullName} {user.id === currentUser.id && <span className="text-[9px] text-amber-300">(you)</span>}</p>
                  <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-500">
                    <AtSign className="h-3 w-3" />{user.email ?? 'no Gmail linked yet'}
                    {user.phone && <span className="text-slate-600"> · {formatPhone(user.phone)}</span>}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{roleLabels[user.role]}</span>
                  <p className="mt-1.5 text-[10px] text-slate-600">{user.role === 'trainer' ? `Trainer ID #${user.trainerId}` : user.role === 'front_desk' ? 'Kiosk + lookup only' : 'Full access'}</p>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${user.googleLinked ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}>
                    {user.googleLinked ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
                    {user.googleLinked ? 'Linked' : 'Awaiting first sign-in'}
                  </span>
                </td>
                <td className="px-4 py-3.5 font-mono text-[10px] text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-IN') : 'Never'}</td>
                <td className="px-4 py-3.5">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{user.active ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(user)}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:border-amber-400/30 hover:text-amber-300"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      disabled={user.id === currentUser.id}
                      onClick={() => toggleActive(user)}
                      className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-30 ${user.active ? 'bg-red-400/10 text-red-300 hover:bg-red-400/20' : 'bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20'}`}
                    >
                      {user.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <form onSubmit={submitEdit} className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Edit staff account</h4>
                <p className="mt-1 text-[10px] text-slate-500">Changing the Gmail or role re-points the account and revokes its existing sessions.</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1 text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {accountForm(editForm, setEditForm)}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditTarget(null)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-300">Cancel</button>
              <button disabled={saving} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
