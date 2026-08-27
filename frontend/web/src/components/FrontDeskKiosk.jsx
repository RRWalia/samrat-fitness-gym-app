import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { fetchQrSession, performCheckIn, fetchMembers, fetchAttendanceHistory } from '../api';

export default function FrontDeskKiosk({ currentUser }) {
  const [qrToken, setQrToken] = useState('SFK_INIT');
  // Matches backend QR_WINDOW_MS (attendance.controller.js) so the on-screen
  // countdown/progress bar reflect the real token validity window.
  const QR_WINDOW_SECONDS = 120;
  const [timeLeft, setTimeLeft] = useState(QR_WINDOW_SECONDS);
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [reason, setReason] = useState('Forgot smartphone at home');
  const [customReason, setCustomReason] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [recentScans, setRecentScans] = useState([]);

  // The exact URL the camera scan opens — built from the live origin so it works
  // in any deployment (local, preview, or production) without hard-coding a domain.
  const scanUrl = useMemo(() => {
    if (typeof window === 'undefined' || !qrToken || qrToken === 'SFK_INIT') return '';
    return `${window.location.origin}/member-checkin?token=${qrToken}`;
  }, [qrToken]);

  const reasons = [
    'Forgot smartphone at home',
    'Phone battery drained',
    'Biometric hardware fallback',
    'Internet connectivity issue on member phone',
    'VIP / Guest assisted check-in',
    'Other (specified below)'
  ];

  const loadData = async () => {
    const [memRes, attRes] = await Promise.all([
      fetchMembers(),
      fetchAttendanceHistory({ limit: 10 })
    ]);
    if (memRes.success) {
      setMembers(memRes.data);
      if (memRes.data.length > 0 && !selectedMemberId) {
        setSelectedMemberId(memRes.data[0].id);
      }
    }
    if (attRes.success) {
      setRecentScans(attRes.data);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchMembers(), fetchAttendanceHistory({ limit: 10 })])
      .then(([memRes, attRes]) => {
        if (!active) return;
        if (memRes.success) {
          setMembers(memRes.data);
          if (memRes.data.length > 0) setSelectedMemberId(memRes.data[0].id);
        }
        if (attRes.success) setRecentScans(attRes.data);
      })
      .catch(error => console.error('Unable to load front-desk data:', error));
    return () => { active = false; };
  }, []);

  // Dynamic QR generator rotation
  useEffect(() => {
    const updateQR = () => {
      fetchQrSession().then(res => {
        if (res.success) {
          setQrToken(res.qrToken);
          setTimeLeft(res.expiresInSeconds);
        }
      });
    };

    updateQR();
    const interval = setInterval(updateQR, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAssistedCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedMemberId) return;

    setCheckingIn(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const finalReason = reason === 'Other (specified below)' ? customReason : reason;

    try {
      const res = await performCheckIn({
        member_id: Number(selectedMemberId),
        source: 'Assisted',
        correction_reason: finalReason
      });

      if (res.success) {
        setSuccessMsg(res.message);
        try {
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        } catch {}
        loadData();
      } else {
        setErrorMsg(res.error || 'Assisted check-in failed');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error occurred');
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Front-Desk Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Front-Desk Gate Terminal & Assisted Check-In</h2>
            <p className="text-xs text-slate-400">
              Restricted workspace • Check-in and assisted member lookup only • Financial data hidden
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-slate-300">Kiosk Active</span>
          <span className="text-slate-500">|</span>
          <span className="font-mono text-amber-400">{currentUser?.fullName || 'Front Desk'} · ID #{currentUser?.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Giant Rotating QR Display */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center flex flex-col items-center justify-between shadow-2xl">
          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
              Entrance Gate QR Code
            </span>
            <h3 className="text-lg font-bold text-white mt-2">Scan to Check-In</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Members point their phone camera at this code and check in on the page it opens. Token refreshes every 2 minutes to limit screenshot sharing while leaving enough time to scan and type a mobile number.
            </p>
          </div>

          <div className="my-6 p-4 rounded-3xl bg-white shadow-2xl border-4 border-amber-400/80">
            {scanUrl ? (
              <QRCodeSVG
                value={scanUrl}
                size={208}
                level="M"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#0f172a"
                title="Scan to check in"
              />
            ) : (
              <div className="h-[208px] w-[208px] animate-pulse rounded bg-slate-200" />
            )}
            <div className="mt-2 text-center text-xs font-mono font-bold text-slate-900">
              {qrToken}
            </div>
          </div>

          {scanUrl && (
            <p className="break-all rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-center text-[10px] font-mono text-amber-400/90">
              {scanUrl}
            </p>
          )}

          <div className="w-full space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400 px-4">
              <span>Next QR Rotation in:</span>
              <span className="font-mono text-amber-400 font-bold">{timeLeft}s</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-amber-400 h-full transition-all duration-1000"
                style={{ width: `${(timeLeft / QR_WINDOW_SECONDS) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Right Col: Assisted / Manual Check-In */}
        <div className="lg:col-span-6 space-y-6">
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <UserCheck className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Assisted / Manual Check-In Fallback</h3>
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {successMsg}
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAssistedCheckIn} className="space-y-3.5 text-xs">
              
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Select Member <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-medium focus:outline-none focus:border-amber-500"
                  required
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                      {m.name} ({m.phone}) — {m.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Reason for Assisted Check-In <span className="text-red-400">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  {reasons.map(r => (
                    <option key={r} value={r} className="bg-slate-900 text-slate-200">
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {reason === 'Other (specified below)' && (
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Enter specific check-in reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white"
                  />
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={checkingIn}
                  className="w-full py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  {checkingIn ? 'Recording Check-In...' : 'Record Assisted Check-In'}
                </button>
              </div>

            </form>

            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              All assisted check-ins are logged with staff ID and mandatory reason.
            </div>
          </div>

          {/* Live Recent Scans */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center justify-between">
              <span>Today's Recent Gate Scans</span>
              <span className="text-[11px] text-emerald-400 font-mono">Live</span>
            </h4>

            <div className="divide-y divide-slate-800/60 text-xs">
              {recentScans.slice(0, 5).map(s => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white">{s.member_name}</span>
                    <span className="block text-[10px] text-slate-500">{s.source} {s.correction_reason ? `(${s.correction_reason})` : ''}</span>
                  </div>
                  <span className="font-mono text-slate-400 text-[11px]">{s.check_in_time}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
