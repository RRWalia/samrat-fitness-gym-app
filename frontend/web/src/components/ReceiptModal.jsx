import React, { useEffect, useState } from 'react';
import { X, CheckCircle, Download, Printer, ShieldCheck, Crown } from 'lucide-react';
import { fetchReceipt } from '../api';

export default function ReceiptModal({ paymentId, onClose }) {
  const [receiptData, setReceiptData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (paymentId) {
      fetchReceipt(paymentId)
        .then(res => {
          if (res.success) setReceiptData(res.receipt);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [paymentId]);

  if (!paymentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative my-8 text-slate-200">
        
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Generating verified receipt...</div>
        ) : receiptData ? (
          <div className="space-y-4">
            
            {/* Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-700">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-white">Payment Verified</h3>
              <p className="text-xs text-amber-400 font-semibold">{receiptData.gym?.gym_name || 'Samrat Fitness King'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{receiptData.gym?.gym_address}</p>
            </div>

            {/* Receipt Summary */}
            <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/50 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Receipt No:</span>
                <span className="font-mono font-medium text-white">{receiptData.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date & Time:</span>
                <span className="text-slate-200">{receiptData.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Member:</span>
                <span className="font-medium text-amber-300">{receiptData.member?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="font-mono text-slate-200">{receiptData.member?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ref ID (UPI / Provider):</span>
                <span className="font-mono text-[11px] text-slate-300 truncate max-w-[180px]">{receiptData.providerReference}</span>
              </div>
            </div>

            {/* Item Breakdown */}
            <div className="border border-slate-800 rounded-xl p-3.5 bg-slate-950/40 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <p className="font-semibold text-white">{receiptData.itemDetails?.name}</p>
                  <p className="text-[11px] text-slate-400">{receiptData.itemDetails?.type} • {receiptData.itemDetails?.duration || receiptData.itemDetails?.category}</p>
                  {receiptData.itemDetails?.validity && (
                    <p className="text-[10px] text-emerald-400 mt-0.5">Validity: {receiptData.itemDetails?.validity}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-white font-mono">₹{receiptData.amount}</span>
                  <span className="block text-[10px] text-emerald-400">PAID</span>
                </div>
              </div>
            </div>

            {/* Security Badge */}
            <div className="flex items-center gap-2 p-2.5 bg-emerald-500/5 rounded-lg border border-emerald-500/20 text-[11px] text-emerald-400">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>Idempotent webhook verified. Membership extended on database.</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / PDF
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 font-semibold text-xs transition-colors"
              >
                Done
              </button>
            </div>

          </div>
        ) : (
          <div className="py-8 text-center text-red-400 text-xs">Receipt details unavailable.</div>
        )}

      </div>
    </div>
  );
}
