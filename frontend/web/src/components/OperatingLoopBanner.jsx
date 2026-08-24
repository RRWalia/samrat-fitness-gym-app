import React from 'react';
import { 
  QrCode, 
  AlertTriangle, 
  PhoneCall, 
  RotateCcw, 
  CreditCard, 
  ShoppingBag, 
  TrendingUp, 
  ChevronRight 
} from 'lucide-react';

export default function OperatingLoopBanner({ activeStep = 'overview', onStepClick }) {
  const steps = [
    { id: 'attendance', step: 1, title: '1. QR Attendance', subtitle: 'Dynamic session code', icon: QrCode, color: 'emerald' },
    { id: 'risk', step: 2, title: '2. Detect 10d Risk', subtitle: 'Silent churn alert', icon: AlertTriangle, color: 'amber' },
    { id: 'contact', step: 3, title: '3. Early Contact', subtitle: 'Follow-up queue', icon: PhoneCall, color: 'orange' },
    { id: 'return', step: 4, title: '4. Member Return', subtitle: 'Streak auto-resumed', icon: RotateCcw, color: 'teal' },
    { id: 'renewal', step: 5, title: '5. Auto Renewal', subtitle: '7d timely reminder', icon: CreditCard, color: 'blue' },
    { id: 'addons', step: 6, title: '6. Useful Add-ons', subtitle: 'PT & Diet opt-in', icon: ShoppingBag, color: 'purple' },
    { id: 'roi', step: 7, title: '7. Owner ROI', subtitle: '8 Core KPI Metrics', icon: TrendingUp, color: 'amber' }
  ];

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800/80">
        <div>
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            The Connected Gym Retention Loop
          </h2>
          <p className="text-xs text-slate-400">
            Click any node below to simulate or inspect that phase in real-time
          </p>
        </div>
        <span className="text-[11px] font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20 self-start sm:self-auto">
          Loop Active & Monitored
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => onStepClick && onStepClick(s.id)}
              className="flex flex-col items-start p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/40 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <span className="w-6 h-6 rounded-lg bg-slate-700/80 flex items-center justify-center text-slate-300 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition-colors">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-[10px] font-mono text-slate-400">0{s.step}</span>
              </div>
              <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors line-clamp-1">
                {s.title}
              </span>
              <span className="text-[10px] text-slate-400 line-clamp-1">
                {s.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
