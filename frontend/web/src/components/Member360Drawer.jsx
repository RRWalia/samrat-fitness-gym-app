import React, { useEffect, useState } from 'react';
import {
  X, Flame, Calendar, CreditCard, AlertTriangle, TrendingDown,
  Clock, Activity, Award, ShoppingBag, Receipt, Phone, Mail,
  UserCheck, Timer, BarChart3, ShieldAlert, Sparkles, ArrowRight,
  CheckCircle2, Eye
} from 'lucide-react';
import { fetchMemberProfile } from '../api';

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr.split(' ')[0] || dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function RiskMeter({ score, level, factors }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = level === 'high' ? 'from-red-500 to-orange-500' : level === 'medium' ? 'from-amber-400 to-orange-400' : 'from-emerald-400 to-teal-400';
  const bgColor = level === 'high' ? 'bg-red-500/10 border-red-500/30 text-red-300' : level === 'medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
  const label = level === 'high' ? 'High churn risk' : level === 'medium' ? 'Medium risk' : 'Low risk';

  return (
    <div className={`rounded-2xl border p-4 ${bgColor} bg-opacity-50`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Churn Risk</span>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${bgColor}`}>
          {label} · {score}/100
        </span>
      </div>

      <div className="relative h-2.5 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {factors && factors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {factors.map((f, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border font-medium ${
                f.severity === 'critical' ? 'bg-red-500/20 border-red-500/30 text-red-300' :
                f.severity === 'high' ? 'bg-orange-500/15 border-orange-500/25 text-orange-300' :
                f.severity === 'medium' ? 'bg-amber-500/15 border-amber-500/25 text-amber-300' :
                'bg-slate-700/50 border-slate-600/50 text-slate-300'
              }`}
              title={`+${f.points} points`}
            >
              <span className="font-mono font-bold">+{f.points}</span>
              <span className="truncate max-w-[180px]">{f.label}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No risk factors — member is engaged and active.</p>
      )}
    </div>
  );
}

function Heatmap({ data }) {
  if (!data || data.length === 0) return <div className="text-xs text-slate-500">No attendance data</div>;

  // Group by weeks: 16 weeks, 7 days each
  const weeks = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  const getColor = (count) => {
    if (count === 0) return 'bg-slate-800 border-slate-700/50';
    if (count === 1) return 'bg-emerald-900/60 border-emerald-800 text-emerald-300';
    if (count === 2) return 'bg-emerald-700/70 border-emerald-600 text-emerald-200';
    if (count >= 3) return 'bg-emerald-400 border-emerald-300 text-emerald-950';
    return 'bg-slate-800';
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1.5 min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} check-in${day.count !== 1 ? 's' : ''}`}
                className={`w-3.5 h-3.5 rounded-sm border text-[8px] flex items-center justify-center font-mono transition-all hover:scale-110 cursor-pointer ${getColor(day.count)}`}
              >
                {day.count > 9 ? '•' : day.count > 0 ? day.count : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-slate-500">16 weeks · {data.filter(d => d.count > 0).length} active days</span>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700/50" />
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-900/60 border border-emerald-800" />
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-700/70 border border-emerald-600" />
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400 border border-emerald-300" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

export default function Member360Drawer({ memberId, onClose, onRenewal, onFollowUp, onReceipt }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMemberProfile(memberId)
      .then(res => {
        if (cancelled) return;
        if (res.success) setProfile(res.data);
        else setError(res.error || 'Failed to load profile');
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [memberId]);

  if (!memberId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-[520px] h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-sm">
              360°
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Member 360°
                {profile?.member && <span className="text-amber-300">· {profile.member.name}</span>}
              </h2>
              <p className="text-[11px] text-slate-400">Full journey, risk, payments, and attendance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="mx-auto w-8 h-8 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin mb-3" />
              <p className="text-xs text-slate-400">Loading member 360° profile…</p>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-300">{error}</div>
            </div>
          ) : profile ? (
            <div className="p-5 space-y-5">

              {/* Member header card */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold">
                      {profile.member.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{profile.member.name}</div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3" /> {profile.member.phone}
                      </div>
                      {profile.member.email && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" /> {profile.member.email}
                        </div>
                      )}
                      {profile.trainer && (
                        <div className="text-[11px] text-amber-300/80 flex items-center gap-1 mt-1">
                          <UserCheck className="w-3 h-3" /> Trainer: {profile.trainer.full_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                      profile.member.status === 'Active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'
                    }`}>
                      {profile.member.status}
                    </span>
                    <div className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                      profile.member.risk_state?.startsWith('Risk-') ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    }`}>
                      {profile.member.risk_state}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Join Date</div>
                    <div className="text-xs font-mono text-slate-200 mt-1">{formatDate(profile.member.join_date)}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Current Streak</div>
                    <div className="text-xs font-bold text-amber-300 mt-1 flex items-center gap-1"><Flame className="w-3 h-3" /> {profile.streak?.current || 0} / {profile.streak?.target || 4}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Best Streak</div>
                    <div className="text-xs font-bold text-white mt-1 flex items-center gap-1"><Award className="w-3 h-3 text-amber-400" /> {profile.streak?.best || 0}</div>
                  </div>
                </div>
              </div>

              {/* Risk meter */}
              {profile.churnRisk && (
                <RiskMeter score={profile.churnRisk.score} level={profile.churnRisk.level} factors={profile.churnRisk.factors} />
              )}

              {/* Membership card */}
              {profile.membership ? (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
                  <div className="flex items-center justify-between mb-3 relative">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{profile.membership.plan_name}</div>
                        <div className="text-[11px] text-slate-400">{profile.membership.duration_months} months · {formatCurrency(profile.membership.base_price)}</div>
                      </div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${
                      (profile.membership.daysLeft ?? 0) < 0 ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                      (profile.membership.daysLeft ?? 0) <= 7 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {profile.membership.daysToExpiryLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs relative">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Start</div>
                      <div className="font-mono text-slate-200 mt-1">{formatDate(profile.membership.start_date)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Expiry</div>
                      <div className="font-mono text-amber-300 mt-1">{formatDate(profile.membership.expiry_date)}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => onRenewal && onRenewal({ id: profile.member.id, name: profile.member.name })}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Renew / Extend Membership
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-xs text-slate-400">No active membership found.</div>
              )}

              {/* No-show banner */}
              {profile.noShow?.openCase && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-red-300">Open No-Show Case</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-mono">
                      {profile.noShow.openCase.risk_days} days absent · {profile.noShow.openCase.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mb-3">
                    Member last seen {profile.churnRisk?.daysSinceLast ?? '?'} days ago. Case opened on {formatDate(profile.noShow.openCase.created_at)}.
                    {profile.noShow.openCase.next_action_date && ` Next action: ${formatDate(profile.noShow.openCase.next_action_date)}.`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onFollowUp && onFollowUp(profile.noShow.openCase)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                    >
                      Log Follow-Up
                    </button>
                    {profile.noShow.followUps?.[0] && (
                      <span className="text-[11px] text-slate-400 self-center">
                        Last: {profile.noShow.followUps[0].outcome} ({profile.noShow.followUps[0].channel}) — {profile.noShow.followUps[0].notes?.slice(0, 60)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Pulse stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                    <Activity className="w-3 h-3" /> Total Visits
                  </div>
                  <div className="text-lg font-black text-white font-mono">{profile.attendance?.total ?? 0}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Lifetime check-ins</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                    <BarChart3 className="w-3 h-3" /> Last 30 Days
                  </div>
                  <div className="text-lg font-black text-emerald-400 font-mono">{profile.attendance?.last30 ?? 0}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{profile.attendance?.avgPerWeek ?? 0} / week avg</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                    <Timer className="w-3 h-3" /> Days Since Last
                  </div>
                  <div className="text-lg font-black text-amber-300 font-mono">{profile.churnRisk?.daysSinceLast ?? '—'}</div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">{profile.attendance?.lastTime ? formatDate(profile.attendance.lastTime) : 'No record'}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                    <Clock className="w-3 h-3" /> Last 7 Days
                  </div>
                  <div className="text-lg font-black text-white font-mono">{profile.attendance?.last7 ?? 0}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Recent momentum</div>
                </div>
              </div>

              {/* Heatmap */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    Attendance Heatmap · 16 weeks
                  </h4>
                  <span className="text-[10px] text-slate-500">{profile.attendance?.total ?? 0} total</span>
                </div>
                <Heatmap data={profile.attendance?.heatmap} />
              </div>

              {/* Payment timeline */}
              {(profile.payments?.timeline?.length > 0 || profile.payments?.addOns?.length > 0) && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2 mb-3">
                    <ShoppingBag className="w-4 h-4 text-purple-400" />
                    Payment Timeline
                    {profile.payments?.timeline && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{profile.payments.timeline.length}</span>}
                  </h4>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {(profile.payments.timeline || []).map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-colors">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border text-[11px] ${
                          item.kind === 'renewal' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' :
                          item.kind === 'addon' ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' :
                          'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}>
                          {item.kind === 'renewal' ? <CreditCard className="w-3.5 h-3.5" /> : item.kind === 'addon' ? <ShoppingBag className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white truncate">{item.title}</span>
                            <span className="text-xs font-mono font-bold text-white">{formatCurrency(item.amount)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-mono">{formatDate(item.date)}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${
                              item.status === 'Paid' || item.status === 'Active' || item.status === 'Completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-slate-700 border-slate-600 text-slate-300'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                          {item.meta?.usage !== undefined && (
                            <div className="text-[10px] text-slate-400 mt-1">Usage: {item.meta.usage}/{item.meta.max_usage}</div>
                          )}
                        </div>
                        {item.payment_id && onReceipt && (
                          <button
                            onClick={() => onReceipt(item.payment_id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="View receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent attendance */}
              {profile.attendance?.recent?.length > 0 && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Recent Check-ins
                  </h4>
                  <div className="space-y-1.5">
                    {profile.attendance.recent.slice(0, 10).map((att) => (
                      <div key={att.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/50">
                        <span className="font-mono text-slate-300">{att.check_in_time}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{att.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Profile ID: {memberId} · {profile?.accessScope || ''}</span>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
            Close 360°
          </button>
        </div>
      </div>
    </div>
  );
}
