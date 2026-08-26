import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Crown,
  Dumbbell,
  ShieldCheck,
  TriangleAlert
} from 'lucide-react';
import { fetchAuthConfig } from '../api';

const ROLE_OPTIONS = [
  {
    id: 'owner_manager',
    icon: Crown,
    label: 'Owner / Manager',
    detail: 'Financials, members & settings',
    color: 'text-amber-300 bg-amber-400/10 border-amber-400/20'
  },
  {
    id: 'front_desk',
    icon: Building2,
    label: 'Front Desk',
    detail: 'Check-ins & assisted lookup',
    color: 'text-sky-300 bg-sky-400/10 border-sky-400/20'
  },
  {
    id: 'trainer',
    icon: Dumbbell,
    label: 'Trainer',
    detail: 'Assigned PT clients only',
    color: 'text-violet-300 bg-violet-400/10 border-violet-400/20'
  }
];

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const REMEMBER_ME_PREF_KEY = 'samrat_remember_me_pref';
const ROLE_PREF_KEY = 'samrat_selected_role_pref';

// Keep the "Remember me" choice between visits so it is already settled
// before the next sign-in (storage may be unavailable, so never throw).
function readRememberMePref() {
  try {
    return window.localStorage.getItem(REMEMBER_ME_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function readRolePref() {
  try {
    const saved = window.localStorage.getItem(ROLE_PREF_KEY);
    if (saved && ROLE_OPTIONS.some(option => option.id === saved)) {
      return saved;
    }
  } catch {
    /* storage unavailable */
  }
  return 'owner_manager';
}

export default function LoginScreen({ onLogin, notice }) {
  const [config, setConfig] = useState(null);
  const [rememberMe, setRememberMe] = useState(readRememberMePref);
  const [selectedRole, setSelectedRole] = useState(readRolePref);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const buttonRef = useRef(null);

  const isPreview = typeof window !== 'undefined' && window.location.hostname.endsWith('.e2b.app');

  const rememberRef = useRef(rememberMe);
  useEffect(() => { rememberRef.current = rememberMe; }, [rememberMe]);

  const selectedRoleRef = useRef(selectedRole);
  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);

  const onLoginRef = useRef(onLogin);
  useEffect(() => { onLoginRef.current = onLogin; }, [onLogin]);

  const handleRememberChange = (checked) => {
    setRememberMe(checked);
    try {
      window.localStorage.setItem(REMEMBER_ME_PREF_KEY, checked ? '1' : '0');
    } catch {
      /* storage unavailable — in-memory state still works for this session */
    }
  };

  const handleRoleChange = (roleId) => {
    setSelectedRole(roleId);
    try {
      window.localStorage.setItem(ROLE_PREF_KEY, roleId);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchAuthConfig()
      .then(result => { if (!cancelled) setConfig(result?.googleSignIn || null); })
      .catch(() => { if (!cancelled) setConfig({ configured: false, clientId: null }); });
    return () => { cancelled = true; };
  }, []);

  // Load Google Identity Services and render the official button once the
  // client id is known. The button hands us a signed ID token ("credential");
  // we exchange it server-side. There is no password involved.
  useEffect(() => {
    if (!config?.configured || !config.clientId || !buttonRef.current) return;
    let cancelled = false;

    const initButton = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      buttonRef.current.innerHTML = ''; // never render duplicate buttons
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: async (response) => {
          if (cancelled) return;

          if (!response.credential) {
            let msg = 'Google sign-in did not complete. Please try again.';
            if (response.error === 'popup_closed_by_user') {
              msg = 'You closed the Google sign-in window before it finished. Please try again.';
            } else if (response.error === 'popup_blocked_by_browser') {
              msg = 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
            } else if (response.error === 'origin_mismatch') {
              msg = 'Google does not recognize this page address. Sign-in is only allowed from the registered domain.';
            }
            setError(msg);
            return;
          }

          setLoading(true);
          setError('');
          try {
            const result = await onLoginRef.current({
              credential: response.credential,
              rememberMe: rememberRef.current,
              selectedRole: selectedRoleRef.current
            });
            if (!result?.success) setError(result?.error || 'Unable to sign in with Google. Please try again.');
          } catch {
            setError('Unable to reach the secure server. Check your connection and try again.');
          } finally {
            if (!cancelled) setLoading(false);
          }
        },
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        logo_alignment: 'left',
        text: 'continue_with_google',
        width: 320
      });
    };

    if (window.google?.accounts?.id) {
      initButton();
      return () => { cancelled = true; };
    }

    const existing = document.querySelector(`script[src="${GIS_SCRIPT}"]`);
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', initButton);
    script.addEventListener('error', () => { if (!cancelled) setError('Could not load Google sign-in. Check your connection and refresh.'); });
    return () => {
      cancelled = true;
      script.removeEventListener('load', initButton);
    };
  }, [config]);

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

          <div className="mb-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Google-secured staff workspace
            </div>
            <h1 className="max-w-lg text-5xl font-black leading-[1.08] tracking-tight text-white">
              The right access for every member of your team.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
              Sign in with the Gmail your gym administrator registered. No passwords to remember, no passwords to leak —
              access stays role-scoped and audited.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300/80">
              Select your role before signing in
            </p>
            <div className="grid gap-3" role="radiogroup" aria-label="Select role (desktop)">
              {ROLE_OPTIONS.map(({ id, icon: Icon, label, detail, color }) => {
                const isSelected = selectedRole === id;
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer select-none items-center gap-4 rounded-2xl border p-4 backdrop-blur-sm transition-all ${
                      isSelected
                        ? 'border-amber-400/80 bg-amber-400/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/30'
                        : 'border-white/[0.07] bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="staff-role-desktop"
                      value={id}
                      checked={isSelected}
                      onChange={() => handleRoleChange(id)}
                      className="sr-only"
                    />
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isSelected ? 'border-amber-400/40 bg-amber-400/20 text-amber-300' : color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>{label}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
                    </div>
                    <div
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/50'
                          : 'border-slate-700 bg-slate-900/60 text-slate-600'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                    </div>
                  </label>
                );
              })}
            </div>
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
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-400">Sign in with your registered Gmail.</p>
            </div>

            {isPreview && (
              <div className="mb-5 rounded-xl border border-sky-400/20 bg-sky-400/10 px-3.5 py-3 text-xs leading-5 text-sky-200" role="status">
                You are viewing a preview environment. Google sign-in only works from the registered deployed address.
              </div>
            )}
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

            {/* Compact mobile role selector (visible only on screens smaller than lg) */}
            <div className="mb-6 lg:hidden">
              <p className="mb-2 text-xs font-semibold text-slate-300">Select your role:</p>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Select role (mobile)">
                {ROLE_OPTIONS.map(({ id, icon: Icon, label }) => {
                  const isSelected = selectedRole === id;
                  return (
                    <label
                      key={id}
                      className={`relative flex cursor-pointer select-none flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-400/15 text-white shadow-sm shadow-amber-400/20 ring-1 ring-amber-400/30'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="staff-role-mobile"
                        value={id}
                        checked={isSelected}
                        onChange={() => handleRoleChange(id)}
                        className="sr-only"
                      />
                      <Icon className={`mb-1.5 h-4 w-4 ${isSelected ? 'text-amber-300' : 'text-slate-400'}`} />
                      <span className="text-[11px] font-bold leading-tight">{label}</span>
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow-sm"
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {config === null && (
              <div className="flex h-24 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-amber-400" />
              </div>
            )}

            {config && !config.configured && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-200" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Google sign-in is not configured on this server yet. Set the <code className="font-mono">GOOGLE_CLIENT_ID</code> environment
                  variable (a Web OAuth client id from the Google Cloud console) and restart, then this page will show the sign-in button.
                </p>
              </div>
            )}

            {config?.configured && (
              <div className="space-y-4">
                <div className="flex min-h-[48px] items-center justify-center" ref={buttonRef} />

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-amber-400" />
                    Verifying your Google account…
                  </div>
                )}

                <label className="relative z-10 flex cursor-pointer select-none items-start gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 transition-colors hover:border-amber-400/50 hover:bg-slate-900">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => handleRememberChange(event.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-slate-500 bg-slate-950 text-transparent transition-colors peer-checked:border-amber-400 peer-checked:bg-amber-400 peer-checked:text-slate-950 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-slate-200">Remember me on this device</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">Keeps your session for up to 30 days instead of 8 hours.</span>
                  </span>
                </label>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-800 pt-5 text-[10px] font-medium text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
              No passwords stored · Sessions expire automatically
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
