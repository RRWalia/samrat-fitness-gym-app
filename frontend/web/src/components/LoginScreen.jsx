import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  Crown,
  Dumbbell,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRound
} from 'lucide-react';

const roleCards = [
  { icon: Crown, label: 'Owner / Manager', detail: 'Financials, members & settings', color: 'text-amber-300 bg-amber-400/10 border-amber-400/20' },
  { icon: Building2, label: 'Front Desk', detail: 'Check-ins & assisted lookup', color: 'text-sky-300 bg-sky-400/10 border-sky-400/20' },
  { icon: Dumbbell, label: 'Trainer', detail: 'Assigned PT clients only', color: 'text-violet-300 bg-violet-400/10 border-violet-400/20' }
];

const demoAccounts = import.meta.env.DEV ? [
  { label: 'Owner', username: 'Ashish', password: 'Owner@2026!Gym' },
  { label: 'Manager', username: 'Parmar', password: 'Manager@2026!' },
  { label: 'Front Desk', username: 'frontdesk', password: 'Desk@2026!Gym' },
  { label: 'Trainer · Sona Walia', username: 'sona.walia', password: 'Trainer@2026!' }
] : [];

export default function LoginScreen({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await onLogin({ username: username.trim(), password, rememberMe });
      if (!result?.success) setError(result?.error || 'Unable to sign in. Please try again.');
    } catch {
      setError('Unable to reach the secure server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (account) => {
    setUsername(account.username);
    setPassword(account.password);
    setError('');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b12] text-slate-100 selection:bg-amber-400 selection:text-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -right-52 bottom-[-15rem] h-[38rem] w-[38rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="login-grid absolute inset-0 opacity-30" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-12 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 text-slate-950 shadow-2xl shadow-amber-500/20">
              <Crown className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-black tracking-[0.08em] text-white">SAMRAT FITNESS KING</p>
              <p className="text-xs font-medium tracking-[0.22em] text-amber-300/80">SECURE STAFF PORTAL</p>
            </div>
          </div>

          <div className="mb-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Protected operations workspace
            </div>
            <h1 className="max-w-lg text-5xl font-black leading-[1.08] tracking-tight text-white">
              The right access for every member of your team.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
              Customer records, payment data, and gym performance stay behind authenticated, role-scoped sessions.
            </p>
          </div>

          <div className="grid gap-3">
            {roleCards.map(({ icon: Icon, label, detail, color }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-sm">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
                </div>
                <Check className="h-4 w-4 text-slate-600" />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-black tracking-wide text-white">SAMRAT FITNESS KING</p>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-amber-300">SECURE STAFF PORTAL</p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/[0.09] bg-slate-900/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-400">Sign in with your staff User ID and password.</p>
            </div>

            {notice && (
              <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3.5 py-3 text-xs leading-5 text-amber-200" role="status">
                {notice}
              </div>
            )}
            {error && (
              <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-xs leading-5 text-red-200" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-bold text-slate-300">User ID</label>
                <div className="relative">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    autoFocus
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter your User ID"
                    className="h-12 w-full rounded-xl border border-slate-700/80 bg-slate-950/70 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400/70 focus:ring-4 focus:ring-amber-400/10"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-bold text-slate-300">Password</label>
                  <span className="text-[10px] font-medium text-slate-600">Case-sensitive</span>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-xl border border-slate-700/80 bg-slate-950/70 pl-10 pr-12 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400/70 focus:ring-4 focus:ring-amber-400/10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-amber-400"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-300">Remember me on this device</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-600">Extends this session to 30 days. Use only on a trusted staff device.</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Verifying secure access…' : 'Sign in securely'}
                {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            {demoAccounts.length > 0 && (
              <div className="mt-6 border-t border-slate-800 pt-5">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Development demo accounts</p>
                <div className="flex flex-wrap gap-2">
                  {demoAccounts.map(account => (
                    <button
                      type="button"
                      key={account.username}
                      onClick={() => fillDemo(account)}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-amber-400/30 hover:text-amber-300"
                    >
                      Use {account.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-800 pt-5 text-[10px] font-medium text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
              Passwords are bcrypt-hashed · Sessions expire automatically
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] leading-4 text-slate-700">
            Authorized Samrat Fitness King staff only. Access is logged for security and accountability.
          </p>
        </section>
      </div>
    </main>
  );
}
