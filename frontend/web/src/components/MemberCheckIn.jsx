import React, { useState, useEffect, useMemo } from 'react';
import { QrCode, CheckCircle2, AlertCircle, Smartphone, Loader2, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { memberCheckIn } from '../api';

// Lightweight, unauthenticated landing page reached by scanning the front-desk
// kiosk QR (/member-checkin?token=SFK_xxxxx). The member enters their registered
// mobile number and completes a self-service check-in. It deliberately bypasses
// the staff auth flow so it can be opened from any camera.
export default function MemberCheckIn() {
  const token = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('token') || '';
  }, []);

  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { status: 'success'|'error', ... }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await memberCheckIn({ token, phone: phone.trim() });
      if (res.success) {
        setResult({ status: 'success', data: res });
        try {
          confetti({ particleCount: 90, spread: 78, origin: { y: 0.4 } });
        } catch {
          /* confetti is non-essential */
        }
      } else {
        setResult({ status: 'error', message: res.error || 'Check-in could not be completed. Please try again.' });
      }
    } catch {
      setResult({ status: 'error', message: 'Network error. Please try again or visit the front desk.' });
    } finally {
      setSubmitting(false);
    }
  };

  const hasToken = Boolean(token);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      {/* Top brand bar */}
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <QrCode className="h-5 w-5" />
          </div>
          <span className="text-sm font-extrabold tracking-wide text-white">
            SAMRAT <span className="text-amber-400">FITNESS KING</span>
          </span>
        </div>
        <a
          href="/"
          className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          Staff? Open portal
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-10">
        {!hasToken ? (
          <InvalidLink />
        ) : result?.status === 'success' ? (
          <SuccessCard data={result.data} />
        ) : (
          <CheckInForm
            phone={phone}
            setPhone={setPhone}
            submitting={submitting}
            onSubmit={handleSubmit}
            error={result?.status === 'error' ? result.message : null}
          />
        )}
      </main>

      <footer className="px-5 pb-6 text-center text-[10px] text-slate-700">
        Samrat Fitness King · Entrance self check-in · Your number is used only to match your membership.
      </footer>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center shadow-xl">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-red-400">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h1 className="text-lg font-bold text-white">Invalid check-in link</h1>
      <p className="mt-2 text-sm text-slate-400">
        This QR link is missing its check-in code. Please scan the current code displayed at the
        front-desk kiosk.
      </p>
    </div>
  );
}

function CheckInForm({ phone, setPhone, submitting, onSubmit, error }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl">
      <div className="mb-5 text-center">
        <h1 className="text-xl font-bold text-white">Member Check-In</h1>
        <p className="mt-1 text-xs text-slate-400">
          Scan matched. Enter your registered mobile number to mark your visit.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="member-phone" className="mb-1.5 block text-xs font-semibold text-slate-300">
            Registered Mobile Number <span className="text-amber-400">*</span>
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 focus-within:border-amber-500">
            <Smartphone className="h-4 w-4 text-slate-500" />
            <input
              id="member-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="+91 98250 11223"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Use the same number on file with your membership.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || phone.trim().length < 6}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:from-amber-300 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking in…
            </>
          ) : (
            'Check In'
          )}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-[10px] text-slate-400">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-400" />
        Self check-in is logged with your membership and the scanned QR code.
      </div>
    </div>
  );
}

function SuccessCard({ data }) {
  const member = data.member || {};
  const streak = data.streak || {};
  return (
    <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center shadow-2xl">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="text-2xl font-extrabold text-white">You're Checked In!</h1>
      <p className="mt-1 text-sm text-slate-300">
        Welcome to Samrat Fitness King, <span className="font-semibold text-white">{member.name}</span> 🎉
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 text-left">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Check-in time</p>
          <p className="mt-1 text-lg font-bold text-amber-400">{data.checkInTime}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Current streak</p>
          <p className="mt-1 text-lg font-bold text-white">
            {streak.current} <span className="text-xs font-normal text-slate-500">/ best {streak.best}</span>
          </p>
        </div>
      </div>

      {data.noShowCaseResolved && (
        <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
          Great to have you back — your absence follow-up has been closed.
        </p>
      )}

      <p className="mt-5 text-[11px] text-slate-500">
        Show this screen to the front desk if asked. Have a great workout!
      </p>
    </div>
  );
}
