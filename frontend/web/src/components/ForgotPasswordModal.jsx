import React, { useState } from 'react';
import { KeyRound, Search, ShieldCheck, Smartphone, X } from 'lucide-react';
import { requestForgotPassword } from '../api';

export default function ForgotPasswordModal({ onClose }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await requestForgotPassword(identifier.trim());
      if (response.success) setResult(response);
      else setError(response.error || 'Unable to check that account. Please try again.');
    } catch {
      setError('Unable to reach the secure server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const found = result?.found === true;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Recover your password</h3>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">Enter your User ID or registered mobile number to identify your account.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300" role="alert">{error}</div>}

        <div>
          <label className="block text-[11px] font-semibold text-slate-400">
            User ID or mobile number
            <input
              required
              autoFocus
              autoComplete="username"
              spellCheck="false"
              value={identifier}
              onChange={event => { setIdentifier(event.target.value); setResult(null); setError(''); }}
              placeholder="e.g. ashish or 98250 11223"
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-sky-400/60"
            />
          </label>
        </div>

        {result && (
          <div
            className={`mt-4 rounded-xl border p-3.5 text-xs leading-5 ${
              found && result.account?.hasRecoveryMobile
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                : found
                  ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400'
            }`}
            role="status"
          >
            {found ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 font-bold text-white">
                  <Smartphone className={`h-4 w-4 ${result.account?.hasRecoveryMobile ? 'text-emerald-300' : 'text-amber-300'}`} />
                  {result.account.fullName} · @{result.account.username}
                  {result.account.phoneMasked && <span className="font-mono font-medium text-slate-400">{result.account.phoneMasked}</span>}
                </p>
                <p>{result.message}</p>
                <ul className="list-disc space-y-1 pl-4 text-slate-400">
                  <li>Open <strong className="text-slate-300">Management Dashboard → Staff Access</strong> as Owner/Manager.</li>
                  <li>Select <strong className="text-slate-300">Reset password</strong> for this account and set a new one.</li>
                  <li>All of that account's sessions are revoked; it can sign in right away.</li>
                </ul>
                <p className="text-[10px] text-slate-500">Are you the administrator? Reset it from Staff Access now — the policy checklist will guide you.</p>
              </div>
            ) : (
              <p>{result.message || 'No matching staff account was found.'}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 text-[10px] leading-4 text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>
            This portal is not connected to an SMS/email provider, so no automatic OTP is sent — recovery completes as a
            one-click administrator reset from <strong className="text-slate-400">Staff Access</strong>. No password data is shown here.
          </span>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300">Close</button>
          <button
            type="submit"
            disabled={loading || !identifier.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" /> {loading ? 'Checking…' : 'Check account'}
          </button>
        </div>
      </form>
    </div>
  );
}
