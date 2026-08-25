import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X
} from 'lucide-react';
import { createStaffUser, fetchStaffUsers, resetStaffPassword, updateStaffUser } from '../api';
import PasswordPolicyChecklist from './PasswordPolicyChecklist';
import { passwordPolicyErrors } from '../utils/passwordPolicy';

const roleLabels = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front Desk',
  trainer: 'Trainer'
};

const emptyForm = {
  fullName: '',
  username: '',
  password: '',
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
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [createPolicyErrors, setCreatePolicyErrors] = useState([]);
  const [resetPolicyErrors, setResetPolicyErrors] = useState([]);

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
      .catch(() => {
        if (active) setError('Unable to reach the secure staff directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const flashSuccess = (message) => {
    setSuccess(message);
    setError('');
    window.setTimeout(() => setSuccess(''), 3500);
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    const policy = passwordPolicyErrors(form.password);
    setCreatePolicyErrors(policy);
    if (policy.length) return;

    setSaving(true);
    setError('');
    try {
      const result = await createStaffUser({
        ...form,
        trainerId: form.role === 'trainer' ? Number(form.trainerId) : null
      });
      if (result.success) {
        flashSuccess('Staff account created with role-scoped access.');
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

  const submitReset = async (event) => {
    event.preventDefault();
    const policy = passwordPolicyErrors(resetPassword);
    setResetPolicyErrors(policy);
    if (policy.length) return;

    setSaving(true);
    setError('');
    try {
      const result = await resetStaffPassword(resetTarget.id, resetPassword);
      if (result.success) {
        flashSuccess(`Password reset for ${resetTarget.fullName}; existing sessions were revoked.`);
        setResetTarget(null);
        setResetPassword('');
        await loadUsers();
      } else setError(result.error || 'Unable to reset password.');
    } catch {
      setError('Unable to reach the secure staff directory.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-amber-400" /> Staff Access & Credentials
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">Create role-based users, revoke access, and reset bcrypt-protected passwords.</p>
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
            <UserRoundCheck className="h-4 w-4" /> New staff credential
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-slate-400">
              Full name
              <input
                required
                maxLength={100}
                value={form.fullName}
                onChange={event => setForm({ ...form, fullName: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
                placeholder="e.g. Priya Shah"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-400">
              User ID
              <input
                required
                minLength={3}
                maxLength={40}
                value={form.username}
                onChange={event => setForm({ ...form, username: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
                placeholder="e.g. priya.shah"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-400">
              Mobile number (optional)
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={event => setForm({ ...form, phone: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
                placeholder="e.g. 98250 11223 — enables mobile login"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-400">
              Access role
              <select
                value={form.role}
                onChange={event => setForm({ ...form, role: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
              >
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {form.role === 'trainer' && (
              <label className="text-[11px] font-semibold text-slate-400">
                Trainer ID
                <input
                  required
                  type="number"
                  min="1"
                  value={form.trainerId}
                  onChange={event => setForm({ ...form, trainerId: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400/60"
                  placeholder="e.g. 102"
                />
              </label>
            )}
            <div className={form.role === 'trainer' ? 'sm:col-span-2' : ''}>
              <label className="block text-[11px] font-semibold text-slate-400">
                Temporary password
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={event => {
                    setForm({ ...form, password: event.target.value });
                    if (createPolicyErrors.length) setCreatePolicyErrors(passwordPolicyErrors(event.target.value));
                  }}
                  aria-invalid={createPolicyErrors.length > 0 || undefined}
                  className={`mt-1.5 w-full rounded-xl border bg-slate-900 p-2.5 text-xs text-white outline-none ${
                    createPolicyErrors.length ? 'border-red-400/60 focus:border-red-400' : 'border-slate-700 focus:border-amber-400/60'
                  }`}
                  placeholder="12+ chars with upper, lower, number & symbol"
                />
              </label>
              <PasswordPolicyChecklist password={form.password} />
              {createPolicyErrors.length > 0 && (
                <ul className="mt-1.5 space-y-1 rounded-xl border border-red-400/20 bg-red-400/10 p-2.5 text-[10px] leading-4 text-red-300" role="alert">
                  {createPolicyErrors.map(message => <li key={message}>{message}</li>)}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <p className="text-[10px] leading-4 text-slate-600">Passwords are hashed with bcrypt and are never displayed again.</p>
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
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3">Sessions</th>
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
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                    @{user.username}{user.phone && <span className="text-slate-600"> · {formatPhone(user.phone)}</span>}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{roleLabels[user.role]}</span>
                  <p className="mt-1.5 text-[10px] text-slate-600">{user.role === 'trainer' ? `Trainer ID #${user.trainerId}` : user.role === 'front_desk' ? 'Kiosk + lookup only' : 'Full access'}</p>
                </td>
                <td className="px-4 py-3.5 font-mono text-[10px] text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-IN') : 'Never'}</td>
                <td className="px-4 py-3.5"><span className="font-mono font-bold text-sky-300">{user.activeSessions}</span> <span className="text-[10px] text-slate-600">active</span></td>
                <td className="px-4 py-3.5">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{user.active ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setResetTarget(user); setResetPassword(''); setResetPolicyErrors([]); setError(''); }}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:border-amber-400/30 hover:text-amber-300"
                    >
                      <KeyRound className="h-3 w-3" /> Reset password
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

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <form onSubmit={submitReset} className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><LockKeyhole className="h-5 w-5" /></span>
                <div><h4 className="text-sm font-bold text-white">Reset password</h4><p className="mt-1 text-[10px] text-slate-500">{resetTarget.fullName} · @{resetTarget.username}</p></div>
              </div>
              <button type="button" onClick={() => setResetTarget(null)} className="p-1 text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400">
                New password
                <input
                  required
                  autoFocus
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={event => {
                    setResetPassword(event.target.value);
                    if (resetPolicyErrors.length) setResetPolicyErrors(passwordPolicyErrors(event.target.value));
                  }}
                  aria-invalid={resetPolicyErrors.length > 0 || undefined}
                  className={`mt-1.5 w-full rounded-xl border bg-slate-950 p-3 text-xs text-white outline-none ${
                    resetPolicyErrors.length ? 'border-red-400/60 focus:border-red-400' : 'border-slate-700 focus:border-amber-400/60'
                  }`}
                  placeholder="Upper, lower, number & symbol"
                />
              </label>
              <PasswordPolicyChecklist password={resetPassword} />
              {resetPolicyErrors.length > 0 && (
                <ul className="mt-1.5 space-y-1 rounded-xl border border-red-400/20 bg-red-400/10 p-2.5 text-[10px] leading-4 text-red-300" role="alert">
                  {resetPolicyErrors.map(message => <li key={message}>{message}</li>)}
                </ul>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-600">All existing sessions for this user will be revoked immediately.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setResetTarget(null)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-300">Cancel</button>
              <button disabled={saving} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{saving ? 'Resetting…' : 'Reset & revoke'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
