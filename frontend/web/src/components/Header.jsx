import React, { useState, useEffect } from 'react';
import { 
  Dumbbell, 
  Crown, 
  Smartphone, 
  Building2, 
  UserCheck, 
  Clock, 
  Sparkles,
  RefreshCw
} from 'lucide-react';

export default function Header({ activeRole, setActiveRole, onRefreshAll }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const roles = [
    { id: 'owner', label: 'Owner Dashboard', icon: Crown, badge: 'Full Control', color: 'from-amber-500 to-amber-700' },
    { id: 'member', label: 'Member Mobile App', icon: Smartphone, badge: 'QR & Renew', color: 'from-emerald-500 to-teal-700' },
    { id: 'frontdesk', label: 'Front-Desk Kiosk', icon: Building2, badge: 'Gate QR & Check-in', color: 'from-blue-500 to-indigo-700' },
    { id: 'trainer', label: 'Trainer View', icon: Dumbbell, badge: 'PT Sessions', color: 'from-purple-500 to-pink-700' }
  ];

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-600 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950">
              <Crown className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent">
                  SAMRAT FITNESS KING
                </span>
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Retention Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Operating Loop: QR Attendance • Churn Detection • Timely Renewals • Add-on Market
              </p>
            </div>
          </div>

          {/* Time & Refresh */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="font-mono font-medium">{time}</span>
              <span className="text-slate-500">|</span>
              <span className="text-emerald-400 font-medium">IST (Ahmedabad)</span>
            </div>

            <button 
              onClick={onRefreshAll}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Role Navigation Bar */}
        <div className="flex items-center gap-2 pb-3 overflow-x-auto scrollbar-none">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2 hidden sm:inline">
            Role View:
          </span>
          {roles.map((role) => {
            const Icon = role.icon;
            const isActive = activeRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-white border border-amber-500/50 shadow-md shadow-amber-500/10'
                    : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{role.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {role.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
