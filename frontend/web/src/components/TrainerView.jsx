import React, { useState, useEffect } from 'react';
import { 
  Dumbbell, 
  UserCheck, 
  CheckCircle2, 
  Flame, 
  Clock, 
  FileText, 
  Sparkles,
  Award 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { fetchActiveAddonOrders, logPtUsage } from '../api';

export default function TrainerView() {
  const [trainer, setTrainer] = useState('Coach Aryan');
  const [orders, setOrders] = useState([]);
  const [loggingId, setLoggingId] = useState(null);
  const [notes, setNotes] = useState('');
  const [activeModalOrder, setActiveModalOrder] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const trainers = [
    { id: '101', name: 'Coach Aryan', qual: 'ACE Certified Personal Trainer • 6+ Yrs Exp' },
    { id: '102', name: 'Coach Priya', qual: 'K11 Master Trainer • Functional & Fat Loss Spec' },
    { id: '103', name: 'Dietitian Rahul', qual: 'Registered Clinical & Sports Nutritionist' }
  ];

  const loadOrders = async () => {
    const res = await fetchActiveAddonOrders();
    if (res.success) {
      setOrders(res.data);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleLogSession = async (e) => {
    e.preventDefault();
    if (!activeModalOrder) return;

    setLoggingId(activeModalOrder.id);
    try {
      const res = await logPtUsage({
        order_id: activeModalOrder.id,
        notes: notes || 'Strength & Hypertrophy workout completed with trainer.',
        staff_id: 101
      });

      if (res.success) {
        setSuccessMsg(res.message);
        try {
          confetti({ particleCount: 50, spread: 60 });
        } catch (e) {}
        setActiveModalOrder(null);
        setNotes('');
        loadOrders();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoggingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Trainer & PT Session Management</h2>
            <p className="text-xs text-slate-400">
              Track 1-on-1 coaching packages and log session utilization
            </p>
          </div>
        </div>

        {/* Trainer Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Logged in as:</span>
          <select
            value={trainer}
            onChange={(e) => setTrainer(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-purple-300 font-semibold text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
          >
            {trainers.map(t => (
              <option key={t.id} value={t.name} className="bg-slate-900 text-slate-200">
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* PT Packages List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-500 text-xs">
            No active PT packages or add-on orders found.
          </div>
        ) : (
          orders.map((order) => {
            const isCompleted = order.usage >= order.max_usage;
            const progressPercent = Math.min(100, Math.round((order.usage / order.max_usage) * 100));

            return (
              <div
                key={order.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{order.member_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isCompleted ? 'bg-slate-800 text-slate-400' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    }`}>
                      {isCompleted ? 'Package Completed' : 'Active Package'}
                    </span>
                  </div>

                  <p className="text-xs text-amber-300 font-semibold mb-1">{order.title}</p>
                  <p className="text-[11px] text-slate-400 font-mono mb-3">Phone: {order.member_phone}</p>

                  {/* Progress bar */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Sessions Completed:</span>
                      <span className="font-mono font-bold text-white">{order.usage} / {order.max_usage}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Remaining: <span className="font-mono text-white font-bold">{Math.max(0, order.max_usage - order.usage)}</span> sessions
                  </span>
                  <button
                    onClick={() => setActiveModalOrder(order)}
                    disabled={isCompleted}
                    className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {isCompleted ? 'Completed' : 'Log 1 Session (+1)'}
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Log Session Modal */}
      {activeModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white">Log PT Workout Session</h3>
            <p className="text-slate-400">
              Recording 1 session for <span className="text-amber-300 font-semibold">{activeModalOrder.member_name}</span> ({activeModalOrder.title})
            </p>

            <form onSubmit={handleLogSession} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Trainer Notes / Workout Summary
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Chest & Triceps: 4x8 Bench Press @ 70kg, Incline Dumbbell 3x10. Good form..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModalOrder(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingId !== null}
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  {loggingId !== null ? 'Saving...' : 'Confirm Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
