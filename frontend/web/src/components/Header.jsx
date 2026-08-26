import React, { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Crown,
  Dumbbell,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import UpdatePhoneModal from './UpdatePhoneModal';

const viewDefinitions = {
  owner: { label: 'Management Dashboard', icon: Crown, badge: 'Full control' },
  member: { label: 'Member App Simulator', icon: Smartphone, badge: 'Owner tool' },
  frontdesk: { label: 'Front-Desk Kiosk', icon: Building2, badge: 'Check-in' },
  trainer: { label: 'Trainer Workspace', icon: Dumbbell, badge: 'PT clients' }
};

export default function Header({
  activeRole,
  setActiveRole,
  allowedViews,
  user,
  expiresAt,
  onLogout,
  onRefreshAll
}) {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneOverride, setPhoneOverride] = useState(undefined); // undefined = not yet overridden this session

  const displayPhone = phoneOverride === undefined ? (user.phone ?? null) : phoneOverride;
  const formattedPhone = /^\+91\d{10}$/.test(displayPhone || '')
    ? `+91 ${displayPhone.slice(3, 8)} ${displayPhone.slice(8)}`
    : displayPhone;

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const sessionExpiry = new Date(expiresAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-20 items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-amber-600 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Crown className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">SAMRAT FITNESS KING</span>
                <span className="hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 sm:flex">
                  <ShieldCheck className="h-3 w-3" /> Secure
                </span>
              </div>
              <p className="truncate text-[10px] text-slate-500 sm:text-xs">Authenticated gym operations & retention workspace</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-800/70 px-3 py-2 text-xs text-slate-300 xl:flex">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-mono">{time}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">Session until {sessionExpiry}</span>
            </div>

            <button
              onClick={onRefreshAll}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
              title="Refresh workspace data"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <div className="group relative">
              <button className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-left transition hover:border-slate-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-xs font-black text-amber-300">
                  {user.fullName?.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'SF'}
                </span>
                <span className="hidden max-w-36 sm:block">
                  <span className="block truncate text-xs font-bold text-white">{user.fullName}</span>
                  <span className="block truncate text-[10px] font-medium text-amber-300">{user.roleLabel}</span>
                </span>
              </button>

              <div className="invisible absolute right-0 top-full z-50 w-64 translate-y-1 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
                  <div className="border-b border-slate-800 px-1 pb-3">
                    <p className="text-xs font-bold text-white">{user.fullName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{user.email ?? 'No Gmail linked yet'} · {user.roleLabel}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {formattedPhone ? <span className="font-mono text-slate-500">{formattedPhone}</span> : 'No contact mobile set'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPhoneModal(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    <Smartphone className="h-3.5 w-3.5 text-sky-300" /> {displayPhone ? 'Update mobile number' : 'Set mobile number'}
                  </button>
                  <button
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/10"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out securely
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none">
          <span className="mr-1 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 sm:inline">Workspace</span>
          {allowedViews.map((viewId) => {
            const view = viewDefinitions[viewId];
            const Icon = view.icon;
            const isActive = activeRole === viewId;
            return (
              <button
                key={viewId}
                onClick={() => setActiveRole(viewId)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-amber-500/40 bg-amber-400/10 text-amber-200 shadow-sm shadow-amber-500/5'
                    : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-300'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-amber-400' : ''}`} />
                {view.label}
                {allowedViews.length > 1 && (
                  <span className={`rounded px-1.5 py-0.5 text-[9px] ${isActive ? 'bg-amber-400/10 text-amber-300' : 'bg-slate-800 text-slate-600'}`}>
                    {view.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showPhoneModal && (
        <UpdatePhoneModal
          user={user}
          onClose={() => setShowPhoneModal(false)}
          onSaved={setPhoneOverride}
        />
      )}
    </header>
  );
}
