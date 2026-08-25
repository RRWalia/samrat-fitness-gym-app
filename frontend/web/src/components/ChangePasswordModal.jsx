import React, { useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { changePassword } from '../api';
import PasswordPolicyChecklist from './PasswordPolicyChecklist';
import { passwordPolicyErrors } from '../utils/passwordPolicy';

export default function ChangePasswordModal({ onClose, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [policyErrors, setPolicyErrors] = useState([]);
  const [matchError, setMatchError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const policy = passwordPolicyErrors(newPassword);
    setPolicyErrors(policy);
    setMatchError(policy.length === 0 && newPassword !== confirmPassword ? 'New password and confirmation do not match.' : '');
    if (policy.length || newPassword !== confirmPassword) return;

    setSaving(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) onChanged();
      else setError(result.error || 'Unable to change your password.');
    } catch {
      setError('Unable to reach the secure server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNewPassword = (event) => {
    setNewPassword(event.target.value);
    if (policyErrors.length) setPolicyErrors(passwordPolicyErrors(event.target.value));
    if (matchError && event.target.value === confirmPassword) setMatchError('');
  };

  const handleConfirmPassword = (event) => {
    setConfirmPassword(event.target.value);
    if (matchError && event.target.value === newPassword) setMatchError('');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Change your password</h3>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">All active sessions will be revoked after this change.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300" role="alert">{error}</div>}

        <div className="space-y-3">
          <label className="block text-[11px] font-semibold text-slate-400">
            Current password
            <input
              required
              autoFocus
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-amber-400/60"
            />
          </label>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400">
              New password
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={newPassword}
                onChange={handleNewPassword}
                aria-invalid={policyErrors.length > 0 || undefined}
                className={`mt-1.5 h-11 w-full rounded-xl border bg-slate-950 px-3 text-xs text-white outline-none ${
                  policyErrors.length ? 'border-red-400/60 focus:border-red-400' : 'border-slate-700 focus:border-amber-400/60'
                }`}
              />
            </label>

            <PasswordPolicyChecklist password={newPassword} />

            {policyErrors.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-xl border border-red-400/20 bg-red-400/10 p-2.5 text-[10px] leading-4 text-red-300" role="alert">
                {policyErrors.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400">
              Confirm new password
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={handleConfirmPassword}
                aria-invalid={Boolean(matchError) || undefined}
                className={`mt-1.5 h-11 w-full rounded-xl border bg-slate-950 px-3 text-xs text-white outline-none ${
                  matchError ? 'border-red-400/60 focus:border-red-400' : 'border-slate-700 focus:border-amber-400/60'
                }`}
              />
            </label>
            {matchError && (
              <p className="mt-2 rounded-xl border border-red-400/20 bg-red-400/10 p-2.5 text-[10px] leading-4 text-red-300" role="alert">{matchError}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3 text-[10px] leading-4 text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          Use at least 12 characters with uppercase, lowercase, a number, and a symbol. Your new password is stored only as a bcrypt hash.
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300">Cancel</button>
          <button disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
            <KeyRound className="h-3.5 w-3.5" /> {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}
