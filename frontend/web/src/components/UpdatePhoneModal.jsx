import React, { useState } from 'react';
import { CheckCircle2, Smartphone, X } from 'lucide-react';
import { updateMyPhone } from '../api';

function formatPhone(phone) {
  if (!phone) return null;
  if (/^\+91\d{10}$/.test(phone)) return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  return phone;
}

export default function UpdatePhoneModal({ user, onClose, onSaved }) {
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await updateMyPhone(phone.trim());
      if (result.success) {
        setSaved(true);
        window.setTimeout(() => {
          onSaved(result.data?.phone ?? (phone.trim() ? phone.trim() : null));
          onClose();
        }, 900);
      } else {
        setError(result.error || 'Unable to update your mobile number.');
      }
    } catch {
      setError('Unable to reach the secure server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Your mobile number</h3>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                Stored as your contact number for the gym team. Sign-in always happens with Google — no password involved.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300" role="alert">{error}</div>}
        {saved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs text-emerald-300" role="status">
            <CheckCircle2 className="h-4 w-4" /> Mobile number updated.
          </div>
        )}

        <label className="block text-[11px] font-semibold text-slate-400">
          Mobile number (optional — leave blank to remove)
          <input
            autoFocus
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={event => setPhone(event.target.value)}
            placeholder="e.g. 98250 11223 or +91 98250 11223"
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-sky-400/60"
          />
        </label>
        <p className="mt-2 text-[10px] leading-4 text-slate-600">
          {user.phone
            ? `Currently registered: ${formatPhone(user.phone)}`
            : 'No mobile number is registered for this account yet.'}
        </p>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300">Cancel</button>
          <button
            type="submit"
            disabled={saving || saved}
            className="rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save mobile number'}
          </button>
        </div>
      </form>
    </div>
  );
}
