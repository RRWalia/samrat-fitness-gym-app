import React, { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import OperatingLoopBanner from './components/OperatingLoopBanner';
import OwnerDashboard from './components/OwnerDashboard';
import MemberAppSimulator from './components/MemberAppSimulator';
import FrontDeskKiosk from './components/FrontDeskKiosk';
import TrainerView from './components/TrainerView';
import {
  clearStoredSession,
  fetchCurrentUser,
  getStoredSession,
  loginUser,
  logoutUser,
  storeSession
} from './api';

const fullAccessRoles = new Set(['owner', 'manager']);

function defaultViewForRole(role) {
  if (role === 'front_desk') return 'frontdesk';
  if (role === 'trainer') return 'trainer';
  return 'owner';
}

function viewsForRole(role) {
  if (fullAccessRoles.has(role)) return ['owner', 'member', 'frontdesk', 'trainer'];
  if (role === 'front_desk') return ['frontdesk'];
  if (role === 'trainer') return ['trainer'];
  return [];
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b12] text-slate-300">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-800 border-t-amber-400" />
        <p className="text-xs font-semibold tracking-wide">Validating secure session…</p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => getStoredSession());
  const [authLoading, setAuthLoading] = useState(Boolean(getStoredSession()));
  const [loginNotice, setLoginNotice] = useState('');
  const [activeRole, setActiveRole] = useState(() => defaultViewForRole(getStoredSession()?.user?.role));
  const [selectedMemberId, setSelectedMemberId] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const allowedViews = useMemo(() => viewsForRole(session?.user?.role), [session?.user?.role]);

  useEffect(() => {
    let cancelled = false;
    const validateSession = async () => {
      const saved = getStoredSession();
      if (!saved) {
        setAuthLoading(false);
        return;
      }
      try {
        const result = await fetchCurrentUser();
        if (cancelled) return;
        if (result.success) {
          const refreshed = storeSession({ ...saved, user: result.user, expiresAt: result.expiresAt }, saved.rememberMe);
          setSession(refreshed);
          setActiveRole(defaultViewForRole(result.user.role));
        } else {
          clearStoredSession();
          setSession(null);
        }
      } catch {
        if (!cancelled) {
          clearStoredSession();
          setSession(null);
          setLoginNotice('Your saved session could not be validated. Please sign in again.');
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    validateSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleUnauthorized = (event) => {
      clearStoredSession();
      setSession(null);
      setAuthLoading(false);
      setLoginNotice(
        event.detail?.code === 'SESSION_EXPIRED'
          ? 'Your session expired automatically. Sign in to continue.'
          : 'Your secure session ended. Please sign in again.'
      );
    };
    window.addEventListener('samrat:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('samrat:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    let timer;
    const checkExpiry = () => {
      const remaining = Date.parse(session.expiresAt) - Date.now();
      if (remaining <= 0) {
        clearStoredSession();
        setSession(null);
        setLoginNotice('Your session expired automatically. Sign in to continue.');
        return;
      }
      timer = window.setTimeout(checkExpiry, Math.min(remaining, 60 * 60 * 1000));
    };
    checkExpiry();
    return () => { if (timer) window.clearTimeout(timer); };
  }, [session?.expiresAt]);

  const handleLogin = async (credentials) => {
    const result = await loginUser(credentials);
    if (result.success) {
      const saved = getStoredSession();
      setSession(saved);
      setActiveRole(defaultViewForRole(result.user.role));
      setLoginNotice('');
    }
    return result;
  };

  const handleLogout = async () => {
    try { await logoutUser(); } catch { clearStoredSession(); }
    setSession(null);
    setLoginNotice('You have been signed out securely.');
  };

  const handlePasswordChanged = () => {
    clearStoredSession();
    setSession(null);
    setLoginNotice('Password updated. All sessions were revoked; sign in with your new password.');
  };

  const switchView = (view) => {
    if (allowedViews.includes(view)) setActiveRole(view);
  };

  const handleSwitchToMember = (memberId) => {
    if (!fullAccessRoles.has(session?.user?.role)) return;
    setSelectedMemberId(memberId);
    setActiveRole('member');
  };

  const handleStepClick = (stepId) => {
    if (!fullAccessRoles.has(session?.user?.role)) return;
    if (stepId === 'attendance') setActiveRole('frontdesk');
    else if (['risk', 'contact', 'return', 'roi'].includes(stepId)) setActiveRole('owner');
    else if (['renewal', 'addons'].includes(stepId)) setActiveRole('member');
  };

  if (authLoading) return <LoadingScreen />;
  if (!session) return <LoginScreen onLogin={handleLogin} notice={loginNotice} />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      <Header
        activeRole={activeRole}
        setActiveRole={switchView}
        allowedViews={allowedViews}
        user={session.user}
        expiresAt={session.expiresAt}
        onLogout={handleLogout}
        onPasswordChanged={handlePasswordChanged}
        onRefreshAll={() => setRefreshKey(value => value + 1)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {fullAccessRoles.has(session.user.role) && <OperatingLoopBanner onStepClick={handleStepClick} />}

        <div key={refreshKey}>
          {activeRole === 'owner' && fullAccessRoles.has(session.user.role) && (
            <OwnerDashboard onSwitchToMember={handleSwitchToMember} currentUser={session.user} />
          )}
          {activeRole === 'member' && fullAccessRoles.has(session.user.role) && (
            <MemberAppSimulator
              selectedMemberId={selectedMemberId}
              onMemberChange={setSelectedMemberId}
            />
          )}
          {activeRole === 'frontdesk' && allowedViews.includes('frontdesk') && (
            <FrontDeskKiosk currentUser={session.user} />
          )}
          {activeRole === 'trainer' && allowedViews.includes('trainer') && (
            <TrainerView currentUser={session.user} />
          )}
        </div>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-5 text-center text-xs text-slate-500">
        <p><strong className="text-slate-400">Samrat Fitness King</strong> · Authenticated staff workspace</p>
        <p className="mt-1 text-[10px] text-slate-700">Role-scoped access · bcrypt credentials · expiring JWT sessions · audited actions</p>
      </footer>
    </div>
  );
}
