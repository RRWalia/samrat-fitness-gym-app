import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  QrCode, 
  Flame, 
  CreditCard, 
  ShoppingBag, 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  RotateCcw,
  Calendar,
  ChevronRight,
  ShieldCheck,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  fetchMembers, 
  fetchMemberDetails, 
  fetchQrSession, 
  performCheckIn, 
  fetchAddOns, 
  purchaseAddOn 
} from '../api';
import RenewalModal from './RenewalModal';
import ReceiptModal from './ReceiptModal';

export default function MemberAppSimulator({ selectedMemberId, onMemberChange }) {
  const [members, setMembers] = useState([]);
  const [currentMemberId, setCurrentMemberId] = useState(selectedMemberId || 1);
  const [profile, setProfile] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'renew', 'addons', 'notifications'
  
  // Dynamic QR
  const [qrToken, setQrToken] = useState(null);
  const [qrTimeLeft, setQrTimeLeft] = useState(15);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState(null);
  const [checkInError, setCheckInError] = useState(null);

  // Modals
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [activeReceiptPaymentId, setActiveReceiptPaymentId] = useState(null);
  const [purchasingAddonId, setPurchasingAddonId] = useState(null);

  // Load all members for simulator picker
  useEffect(() => {
    fetchMembers().then(res => {
      if (res.success && res.data.length > 0) {
        setMembers(res.data);
        if (!selectedMemberId) {
          setCurrentMemberId(res.data[0].id);
        }
      }
    });
    fetchAddOns().then(res => {
      if (res.success) setAddOns(res.data);
    });
  }, []);

  useEffect(() => {
    if (selectedMemberId) {
      setCurrentMemberId(selectedMemberId);
    }
  }, [selectedMemberId]);

  // Load Member Profile
  const loadProfile = () => {
    if (currentMemberId) {
      fetchMemberDetails(currentMemberId).then(res => {
        if (res.success) setProfile(res.data);
      });
    }
  };

  useEffect(() => {
    loadProfile();
    setCheckInResult(null);
    setCheckInError(null);
  }, [currentMemberId]);

  // Rotate QR code timer
  useEffect(() => {
    const fetchToken = () => {
      fetchQrSession().then(res => {
        if (res.success) {
          setQrToken(res.qrToken);
          setQrTimeLeft(res.expiresInSeconds);
        }
      });
    };

    fetchToken();
    const interval = setInterval(fetchToken, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle Scan QR Check-in
  const handleScanCheckIn = async () => {
    setCheckingIn(true);
    setCheckInResult(null);
    setCheckInError(null);

    try {
      const res = await performCheckIn({
        member_id: currentMemberId,
        source: 'QR',
        qr_session: qrToken
      });

      if (res.success) {
        setCheckInResult(res);
        try {
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
        } catch (e) {}
        loadProfile();
      } else {
        setCheckInError(res.error || 'Check-in failed');
      }
    } catch (err) {
      setCheckInError(err.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  // Handle Addon Purchase
  const handlePurchaseAddOn = async (addon) => {
    setPurchasingAddonId(addon.id);
    try {
      const res = await purchaseAddOn({
        member_id: currentMemberId,
        addon_id: addon.id
      });
      if (res.success) {
        try {
          confetti({ particleCount: 50, spread: 50 });
        } catch (e) {}
        if (res.data?.paymentId) {
          setActiveReceiptPaymentId(res.data.paymentId);
        }
        loadProfile();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPurchasingAddonId(null);
    }
  };

  const activeMembership = profile?.memberships?.find(m => m.status === 'Active') || profile?.memberships?.[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Simulator Switcher Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-200 block">Member Mobile App Simulator</span>
            <span className="text-[11px] text-slate-400">Test the member-facing retention loop</span>
          </div>
        </div>

        {/* Member Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Switch Member:</span>
          <select
            value={currentMemberId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setCurrentMemberId(id);
              onMemberChange && onMemberChange(id);
            }}
            className="bg-slate-800 border border-slate-700 text-amber-300 font-semibold text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            {members.map(m => (
              <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                {m.name} ({m.risk_state} • {m.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Phone Shell Container */}
      <div className="bg-slate-950 border-4 border-slate-800 rounded-[2.5rem] p-6 shadow-2xl max-w-md mx-auto relative overflow-hidden">
        
        {/* Phone Notch */}
        <div className="w-32 h-4 bg-slate-800 rounded-b-xl mx-auto mb-4"></div>

        {/* App Top Bar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[11px] text-slate-400">Welcome Back,</span>
            <h3 className="text-base font-extrabold text-white flex items-center gap-1.5">
              {profile?.name || 'Member'}
              {profile?.risk_state?.startsWith('Risk-') && (
                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  {profile.risk_state}
                </span>
              )}
            </h3>
          </div>

          <button
            onClick={() => setActiveTab('notifications')}
            className="relative p-2 rounded-xl bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
          >
            <Bell className="w-4 h-4" />
            {profile?.notifications?.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
            )}
          </button>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900/90 rounded-xl mb-4 text-xs font-semibold">
          {[
            { id: 'home', label: 'Check-In', icon: QrCode },
            { id: 'renew', label: 'Renew', icon: CreditCard },
            { id: 'addons', label: 'Add-Ons', icon: ShoppingBag },
            { id: 'notifications', label: 'Inbox', icon: Bell }
          ].map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`py-1.5 rounded-lg flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  isActive ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[10px]">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB: HOME / CHECK-IN */}
        {activeTab === 'home' && (
          <div className="space-y-4 text-xs">
            
            {/* Membership Status Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/70 rounded-2xl p-4 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400">
                  {activeMembership?.plan_name || 'Annual Pass'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  profile?.status === 'Active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {profile?.status}
                </span>
              </div>

              <div className="flex justify-between items-baseline mb-3">
                <span className="text-slate-300 font-mono text-[11px]">Valid Until: {activeMembership?.expiry_date}</span>
              </div>

              {/* Weekly Streak Ring */}
              <div className="bg-slate-950/60 rounded-xl p-3 flex items-center justify-between border border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    <Flame className="w-5 h-5" />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Streak: {profile?.current_streak || 0} Visits
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Weekly Goal: {Math.min(4, profile?.current_streak || 0)} / 4 Planned Visits
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">
                  Best: {profile?.best_streak || 0}
                </span>
              </div>
            </div>

            {/* Check-In Action Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center space-y-3">
              <span className="text-xs font-bold text-slate-200 block">
                Gate QR Check-In
              </span>
              
              <div className="w-24 h-24 mx-auto rounded-2xl bg-white p-2 shadow-lg flex items-center justify-center">
                <QrCode className="w-20 h-20 text-slate-950" />
              </div>

              <div className="text-[10px] text-slate-400">
                Rotating session: <span className="font-mono text-amber-400">{qrToken || 'SFK_VALID'}</span>
              </div>

              <button
                onClick={handleScanCheckIn}
                disabled={checkingIn}
                className="w-full py-3 rounded-xl font-extrabold text-xs text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                {checkingIn ? 'Scanning Gate...' : 'Scan & Check-In Now'}
              </button>

              {/* Feedback messages */}
              {checkInResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-left space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4" /> Check-in Verified!
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Checked in at {checkInResult.checkInTime}. Current streak: {checkInResult.streak?.current}
                  </p>
                  {checkInResult.noShowCaseResolved && (
                    <div className="text-[10px] text-teal-300 font-semibold bg-teal-500/20 p-1.5 rounded-lg mt-1">
                      🎉 Welcome back! Your absent alert has been resolved.
                    </div>
                  )}
                </div>
              )}

              {checkInError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-left text-xs">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Notice
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">{checkInError}</p>
                </div>
              )}
            </div>

            {/* Quick Renewal Prompt if expiring */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-300 text-xs block">Upcoming Renewal</span>
                <span className="text-[10px] text-slate-400">Lock in your ₹200 loyalty bonus</span>
              </div>
              <button
                onClick={() => setShowRenewalModal(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                Renew
              </button>
            </div>

          </div>
        )}

        {/* TAB: RENEW */}
        {activeTab === 'renew' && (
          <div className="space-y-3 text-xs">
            <div className="text-center pb-2 border-b border-slate-800">
              <h4 className="font-bold text-white text-sm">Renew Membership</h4>
              <p className="text-[11px] text-slate-400">Select duration with zero hidden charges</p>
            </div>

            <div className="space-y-2.5">
              {[
                { name: '3-Month Fitness Booster', price: 3300, orig: 3500, discount: 200, badge: 'Popular' },
                { name: '6-Month Transformation', price: 5800, orig: 6000, discount: 200, badge: 'Save 25%' },
                { name: '12-Month Annual Pass', price: 9800, orig: 10000, discount: 200, badge: 'Best Value' }
              ].map((p, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-[9px] font-bold bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded">{p.badge}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-extrabold text-white font-mono">₹{p.price}</span>
                      <span className="text-[10px] text-slate-500 line-through font-mono">₹{p.orig}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRenewalModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Verified Razorpay payment engine with instant receipt
            </div>
          </div>
        )}

        {/* TAB: ADD-ONS */}
        {activeTab === 'addons' && (
          <div className="space-y-3 text-xs">
            <div className="text-center pb-2 border-b border-slate-800">
              <h4 className="font-bold text-white text-sm">Add-On Marketplace</h4>
              <p className="text-[10px] text-slate-400">Opt-in training, diet plans & supplements</p>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {addOns.map(addon => (
                <div key={addon.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-white text-xs">{addon.title}</span>
                    <span className="font-mono font-bold text-emerald-400">₹{addon.price}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">{addon.description}</p>
                  <button
                    onClick={() => handlePurchaseAddOn(addon)}
                    disabled={purchasingAddonId === addon.id || (addon.type === 'Product' && addon.stock <= 0)}
                    className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {purchasingAddonId === addon.id ? 'Purchasing...' : (addon.type === 'Product' && addon.stock <= 0 ? 'Out of Stock' : 'Opt-In & Purchase')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="space-y-2.5 text-xs max-h-80 overflow-y-auto">
            <h4 className="font-bold text-white text-xs pb-1 border-b border-slate-800">
              Retention Messages Inbox
            </h4>
            {profile?.notifications?.length === 0 ? (
              <p className="text-slate-500 text-center py-6">No recent notifications</p>
            ) : (
              profile?.notifications?.map(n => (
                <div key={n.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="font-bold text-amber-300">{n.template}</span>
                    <span className="text-slate-500 font-mono">{n.scheduled_time?.split(' ')[0]}</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{n.message_content}</p>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* Modals */}
      {showRenewalModal && (
        <RenewalModal
          memberId={currentMemberId}
          memberName={profile?.name}
          onClose={() => setShowRenewalModal(false)}
          onSuccess={(data) => {
            setShowRenewalModal(false);
            if (data?.paymentId) {
              setActiveReceiptPaymentId(data.paymentId);
            }
            loadProfile();
          }}
        />
      )}

      {activeReceiptPaymentId && (
        <ReceiptModal
          paymentId={activeReceiptPaymentId}
          onClose={() => setActiveReceiptPaymentId(null)}
        />
      )}

    </div>
  );
}
