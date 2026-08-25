import React from 'react';
import { Check, Minus } from 'lucide-react';
import { passwordChecks } from '../utils/passwordPolicy';

/**
 * Inline, real-time password policy checklist. Renders one chip per
 * requirement (length, lowercase, uppercase, number, symbol) and highlights
 * each as soon as the entered password satisfies it.
 */
export default function PasswordPolicyChecklist({ password, compact = false }) {
  const checks = passwordChecks(password);

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-2'}`} aria-label="Password requirements">
      {checks.map(({ id, label, met }) => (
        <span
          key={id}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            met
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-slate-700/80 bg-slate-950/40 text-slate-500'
          }`}
        >
          {met ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {label}
        </span>
      ))}
    </div>
  );
}
