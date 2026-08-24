import React, { useEffect, useState } from 'react';
import { X, Calendar, DollarSign, Users, AlertCircle, Dumbbell, Award, Printer } from 'lucide-react';
import { fetchDailySummary } from '../api';

export default function DailySummaryModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailySummary()
      .then(res => {
        if (res.success) setData(res);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8 text-slate-200">
        
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Daily Owner Closing Summary</h3>
            <p className="text-xs text-slate-400">
              Samrat Fitness King • Date: {data?.date || new Date().toISOString().split('T')[0]}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Compiling gym closing report...</div>
        ) : data ? (
          <div className="space-y-4">
            
            {/* The 5 Key Numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-[11px] block">Today's Check-ins</span>
                <span className="text-xl font-extrabold text-emerald-400 font-mono">{data.todayCheckins}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Scanned at gym gate</span>
              </div>

              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-[11px] block">New Red-List Cases</span>
                <span className="text-xl font-extrabold text-red-400 font-mono">{data.newNoShow}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Absent &gt; 10 days</span>
              </div>

              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-[11px] block">Follow-ups Completed</span>
                <span className="text-xl font-extrabold text-blue-400 font-mono">{data.followUpsDone}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Calls & WhatsApp logs</span>
              </div>

              <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
                <span className="text-slate-400 text-[11px] block">Renewals Collected</span>
                <span className="text-xl font-extrabold text-amber-400 font-mono">₹{data.renewalsCollected}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Verified today</span>
              </div>
            </div>

            <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-400 block">Add-on Sales Today:</span>
                <span className="text-base font-bold text-purple-400 font-mono">₹{data.addonSold}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">Tomorrow's Expected PT Sessions:</span>
                <span className="text-base font-bold text-white font-mono">{data.tomorrowPtCount} Sessions</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Summary
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        ) : null}

      </div>
    </div>
  );
}
