import React, { useState, useEffect } from 'react';
import { X, CreditCard, Sparkles, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { fetchRenewalOffers, processRenewalPayment } from '../api';

export default function RenewalModal({ memberId, memberName, onClose, onSuccess }) {
  const [data, setData] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (memberId) {
      fetchRenewalOffers(memberId)
        .then(res => {
          if (res.success) {
            setData(res);
            if (res.offers && res.offers.length > 0) {
              // Default to 3-month or 6-month plan
              const defaultPlan = res.offers.find(o => o.durationMonths === 3) || res.offers[0];
              setSelectedPlanId(defaultPlan.planId);
            }
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [memberId]);

  const handleRenew = async () => {
    if (!selectedPlanId || !data) return;
    const selectedPlan = data.offers.find(o => o.planId === selectedPlanId);
    if (!selectedPlan) return;

    setProcessing(true);
    setError(null);

    try {
      const res = await processRenewalPayment({
        member_id: memberId,
        plan_id: selectedPlanId,
        amount: selectedPlan.finalPayable,
        payment_method: 'Razorpay UPI / Instant Simulation'
      });

      if (res.success) {
        onSuccess && onSuccess(res.data);
      } else {
        setError(res.error || 'Payment failed');
      }
    } catch (err) {
      setError(err.message || 'Payment processing error');
    } finally {
      setProcessing(false);
    }
  };

  if (!memberId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8 text-slate-200">
        
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Membership Renewal & Extension</h3>
            <p className="text-xs text-slate-400">
              For <span className="text-amber-300 font-semibold">{memberName || data?.member?.name}</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading available renewal packages...</div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">{error}</div>
        ) : (
          <div className="space-y-4">
            
            {/* Current Plan Status */}
            {data?.currentMembership && (
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Current Plan:</span>
                  <span className="font-semibold text-slate-200">{data.currentMembership.plan_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Current Expiry:</span>
                  <span className="font-mono text-amber-400 font-semibold">{data.currentMembership.expiry_date}</span>
                </div>
              </div>
            )}

            {/* Plan Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select Renewal Duration
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data?.offers?.map((plan) => {
                  const isSelected = selectedPlanId === plan.planId;
                  return (
                    <div
                      key={plan.planId}
                      onClick={() => setSelectedPlanId(plan.planId)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/50'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-white">{plan.name}</span>
                        {plan.durationMonths === 12 && (
                          <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded">
                            BEST VALUE
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-base font-extrabold text-white font-mono">₹{plan.finalPayable}</span>
                        {plan.standardDiscount + plan.loyaltyBonus > 0 && (
                          <span className="text-[11px] text-slate-500 line-through font-mono">₹{plan.basePrice}</span>
                        )}
                      </div>

                      <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Includes ₹{plan.loyaltyBonus} Loyalty Discount
                      </div>

                      <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">{plan.benefits}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Integrity Guarantee */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-[11px] space-y-1 text-slate-400">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <ShieldCheck className="w-4 h-4" />
                Verified Payment Guarantee
              </div>
              <p>
                Membership extends automatically upon verified payment webhook. Downloadable receipt generated instantly.
              </p>
            </div>

            {/* Action */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenew}
                disabled={processing || !selectedPlanId}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
              >
                {processing ? 'Processing Payment...' : 'Pay & Extend Membership'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
