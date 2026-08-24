import React, { useState } from 'react';
import { X, PhoneCall, MessageSquare, Send, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';
import { recordFollowUp } from '../api';

export default function FollowUpModal({ caseItem, onClose, onSuccess }) {
  const [channel, setChannel] = useState('WhatsApp');
  const [outcome, setOutcome] = useState('Will return');
  const [notes, setNotes] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!caseItem) return null;

  const outcomes = [
    { value: 'Will return', label: 'Will return', desc: 'Member promised to resume training' },
    { value: 'Injured', label: 'Injured / Health issue', desc: 'Temporary physical setback or doctor advice' },
    { value: 'Travelling', label: 'Travelling / Out of station', desc: 'On vacation, work trip, or family event' },
    { value: 'Timing issue', label: 'Timing / Work schedule', desc: 'Shift changes, exam schedule or office hours' },
    { value: 'Unhappy', label: 'Unhappy with service', desc: 'Trainer, equipment, crowding or cleanliness feedback' },
    { value: 'No response', label: 'No response / Ringing', desc: 'Could not connect on call or message' },
    { value: 'Cancelled', label: 'Cancelled / Discontinued', desc: 'Relocated or decided to stop permanently' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await recordFollowUp({
        case_id: caseItem.case_id,
        channel,
        outcome,
        notes,
        next_action_date: nextActionDate || null
      });

      if (res.success) {
        onSuccess && onSuccess(res);
        onClose();
      } else {
        setError(res.error || 'Failed to record follow-up');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickWhatsApp = () => {
    const text = encodeURIComponent(
      `Hi ${caseItem.member_name}, this is Samrat Fitness King. We noticed it's been ${caseItem.risk_days} days since your last check-in. Everything okay? Let us know if you need help with timing, a workout pause, or trainer support!`
    );
    window.open(`https://wa.me/${caseItem.member_phone?.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/30">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Record No-Show Follow-Up</h3>
            <p className="text-xs text-slate-400">
              Silent Churn Recovery Action for <span className="text-amber-300 font-semibold">{caseItem.member_name}</span>
            </p>
          </div>
        </div>

        {/* Member Quick Stats */}
        <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/60 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-400 block">Absent Days:</span>
            <span className="text-red-400 font-bold text-sm">{caseItem.risk_days} Days</span>
          </div>
          <div>
            <span className="text-slate-400 block">Phone:</span>
            <span className="text-slate-200 font-mono">{caseItem.member_phone}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Plan:</span>
            <span className="text-slate-200 font-medium">{caseItem.plan_name || 'Standard'}</span>
          </div>
          <button
            type="button"
            onClick={handleQuickWhatsApp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Open WhatsApp
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Channel Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Contact Channel
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['WhatsApp', 'Call', 'SMS', 'Email'].map((ch) => (
                <button
                  type="button"
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`py-2 px-3 text-xs rounded-xl font-medium border transition-all ${
                    channel === ch
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Outcome Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Follow-Up Outcome <span className="text-red-400">*</span>
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              required
            >
              {outcomes.map((o) => (
                <option key={o.value} value={o.value} className="bg-slate-900 text-slate-200">
                  {o.label} — ({o.desc})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Staff Notes & Insights
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Member had back spasm; offered free stretching session with Sona Walia..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Next Action Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Next Action / Follow-up Date (Optional)
            </label>
            <input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Follow-Up'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
