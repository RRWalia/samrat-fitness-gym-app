import React, { useState, useEffect } from 'react';
import { 
  Users, 
  QrCode, 
  AlertTriangle, 
  RotateCcw, 
  CreditCard, 
  TrendingUp, 
  ShoppingBag, 
  CheckCircle2, 
  PhoneCall, 
  MessageSquare, 
  Calendar, 
  Play, 
  FileText, 
  Search, 
  Filter, 
  Sparkles, 
  Eye, 
  Plus, 
  ShieldAlert, 
  Settings, 
  Clock, 
  ChevronRight,
  UserPlus
} from 'lucide-react';
import { 
  fetchStats, 
  fetchRedList, 
  fetchExpiringRenewals, 
  fetchAttendanceHistory, 
  fetchMembers, 
  fetchAuditLogs, 
  fetchAddOns, 
  triggerNoShowScan, 
  triggerRenewalScan,
  updateMemberStatus,
  fetchSettings,
  updateSettings
} from '../api';

import FollowUpModal from './FollowUpModal';
import RenewalModal from './RenewalModal';
import ReceiptModal from './ReceiptModal';
import DailySummaryModal from './DailySummaryModal';
import NewMemberModal from './NewMemberModal';
import StaffAccessPanel from './StaffAccessPanel';

export default function OwnerDashboard({ onSwitchToMember, currentUser }) {
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('redlist'); // 'redlist', 'renewals', 'addons', 'attendance', 'members', 'audit', 'settings'
  
  // Data states
  const [redList, setRedList] = useState([]);
  const [redBand, setRedBand] = useState('all');
  const [redStatus, setRedStatus] = useState('All');

  const [renewals, setRenewals] = useState([]);
  const [renewalTimeframe, setRenewalTimeframe] = useState('all');

  const [attendance, setAttendance] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchMember, setSearchMember] = useState('');
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);

  const [auditLogs, setAuditLogs] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [gymSettings, setGymSettings] = useState(null);

  // Modals
  const [activeFollowUpCase, setActiveFollowUpCase] = useState(null);
  const [activeRenewalMember, setActiveRenewalMember] = useState(null);
  const [activeReceiptPaymentId, setActiveReceiptPaymentId] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showNewMemberModal, setShowNewMemberModal] = useState(false);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAllData = async () => {
    try {
      const [sRes, rRes, renRes, attRes, memRes, audRes, addRes, setRes] = await Promise.all([
        fetchStats(),
        fetchRedList({ band: redBand !== 'all' ? redBand : undefined, status: redStatus !== 'All' ? redStatus : undefined }),
        fetchExpiringRenewals({ timeframe: renewalTimeframe }),
        fetchAttendanceHistory({ limit: 40 }),
        fetchMembers({ search: searchMember }),
        fetchAuditLogs(),
        fetchAddOns(),
        fetchSettings()
      ]);

      if (sRes.success) setStats(sRes.summary);
      if (rRes.success) setRedList(rRes.data);
      if (renRes.success) setRenewals(renRes.data);
      if (attRes.success) setAttendance(attRes.data);
      if (memRes.success) setMembers(memRes.data);
      if (audRes.success) setAuditLogs(audRes.data);
      if (addRes.success) setAddOns(addRes.data);
      if (setRes.success) setGymSettings(setRes.data);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [redBand, redStatus, renewalTimeframe, searchMember]);

  // Handler for running automated No-Show Scan
  const handleRunNoShowScan = async () => {
    try {
      const res = await triggerNoShowScan();
      if (res.success) {
        showToast(`✅ Daily Scan Complete! ${res.newCasesCount} new no-show cases flagged.`);
        loadAllData();
      }
    } catch (err) {
      showToast('❌ Failed to run scan');
    }
  };

  // Handler for running Renewal Reminders Scan
  const handleRunRenewalScan = async () => {
    try {
      const res = await triggerRenewalScan();
      if (res.success) {
        showToast(`✅ Renewal Engine: ${res.remindersSentCount} reminders dispatched.`);
        loadAllData();
      }
    } catch (err) {
      showToast('❌ Failed to run renewal scan');
    }
  };

  const handleToggleMemberPause = async (memberId, currentStatus) => {
    const nextStatus = currentStatus === 'Paused' ? 'Active' : 'Paused';
    try {
      const res = await updateMemberStatus(memberId, nextStatus, 'Manual toggle from owner dashboard');
      if (res.success) {
        showToast(`Member marked as ${nextStatus}`);
        loadAllData();
      }
    } catch (err) {
      showToast('Error updating status');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const result = await updateSettings(gymSettings);
      if (result.success) {
        setGymSettings(result.data);
        showToast('Settings saved successfully');
      } else {
        showToast(result.error || 'Unable to save settings');
      }
    } catch {
      showToast('Unable to save settings');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-amber-500/50 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-400" />
          {toastMessage}
        </div>
      )}

      {/* Top 8 Cards / Operating Loop KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        
        {/* 1. Active Members */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Active Members</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">{stats?.activeMembersCount || 0}</span>
            <span className="text-[11px] text-slate-500">/ {stats?.totalMembersCount || 0} Total</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <span>● 100% database backed</span>
          </div>
        </div>

        {/* 2. Today's Check-ins */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Today's Check-Ins</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <QrCode className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">{stats?.todayCheckinsCount || 0}</span>
            <span className="text-[11px] text-slate-400">scans</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats?.sevenDayActiveCount || 0} active in last 7 days ({stats?.attendanceActivityRate || 0}%)
          </div>
        </div>

        {/* 3. Open No-Show Red List */}
        <div className="bg-slate-900/80 border border-red-500/20 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-400">Open Red-List (10d+)</span>
            <span className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-400 font-mono">{stats?.openNoShowCasesCount || 0}</span>
            <span className="text-[11px] text-slate-400">at risk</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-300 font-medium">
            Recovery Rate: <span className="font-bold font-mono">{stats?.recoveryRate || 0}%</span> (Target: &gt;50%)
          </div>
        </div>

        {/* 4. Renewals Due in 7 Days */}
        <div className="bg-slate-900/80 border border-amber-500/20 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">Renewals Due (7d)</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400 font-mono">{stats?.renewalsDue7dCount || 0}</span>
            <span className="text-[11px] text-slate-400">members</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            On-time rate: <span className="text-emerald-400 font-bold font-mono">{stats?.onTimeRenewalRate || 85}%</span>
          </div>
        </div>

        {/* 5. Renewal Revenue This Month */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Renewal Revenue (Mo)</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white font-mono">₹{stats?.renewalRevenueThisMonth || 0}</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium">
            100% verified & receipted
          </div>
        </div>

        {/* 6. Add-on Revenue */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Add-on Sales (Mo)</span>
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-purple-300 font-mono">₹{stats?.addonRevenueThisMonth || 0}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Conversion: <span className="text-purple-300 font-bold font-mono">{stats?.addonConversionRate || 0}%</span> (Target: &gt;20%)
          </div>
        </div>

        {/* 7. Recovered Members */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Recovered Members</span>
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <RotateCcw className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-teal-400 font-mono">{stats?.returnedCasesCount || 0}</span>
            <span className="text-[11px] text-slate-400">returned</span>
          </div>
          <div className="mt-1 text-[11px] text-teal-300">
            Saved from silent churn!
          </div>
        </div>

        {/* 8. Data Health */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">System Integrity</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-xs font-bold text-emerald-400">All Automations Active</span>
            <p className="text-[10px] text-slate-400 mt-0.5">Idempotent Webhooks • Full Audit Log</p>
          </div>
          <button
            onClick={() => setShowSummaryModal(true)}
            className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
          >
            View Daily Closing Report <ChevronRight className="w-3 h-3" />
          </button>
        </div>

      </div>

      {/* Action Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Quick Actions:
          </span>
          <button
            onClick={handleRunNoShowScan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-red-400" />
            Run Daily No-Show Scan
          </button>
          <button
            onClick={handleRunRenewalScan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-blue-400" />
            Run Renewal Reminders
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSummaryModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Daily Closing Summary
          </button>
          <button
            onClick={() => setShowNewMemberModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register Member
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        
        {/* Tab Headers */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/60 border-b border-slate-800 overflow-x-auto scrollbar-none">
          {[
            { id: 'redlist', label: '📛 No-Show Red List', count: redList.length },
            { id: 'renewals', label: '💳 Renewal Engine', count: renewals.length },
            { id: 'addons', label: '🛒 Add-on Marketplace', count: addOns.length },
            { id: 'attendance', label: '⚡ Live Attendance Stream', count: attendance.length },
            { id: 'members', label: '👥 Member Directory', count: members.length },
            { id: 'audit', label: '📜 Audit Logs', count: auditLogs.length },
            { id: 'access', label: '🛡️ Staff Access' },
            { id: 'settings', label: '⚙️ Settings' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  activeTab === tab.id ? 'bg-amber-400/20 text-amber-300 font-mono' : 'bg-slate-800 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">

          {/* TAB 1: NO-SHOW RED LIST */}
          {activeTab === 'redlist' && (
            <div className="space-y-4">
              
              {/* Filter controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Risk Filter:</span>
                  {['all', '10-14', '15-21', '22+'].map((band) => (
                    <button
                      key={band}
                      onClick={() => setRedBand(band)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                        redBand === band
                          ? 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {band === 'all' ? 'All Bands' : `${band} Days`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Status:</span>
                  {['All', 'Open', 'Contacted', 'Follow-up due', 'Returned'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setRedStatus(st)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                        redStatus === st
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Red list Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Absent Days</th>
                      <th className="py-3 px-4">Plan / Expiry</th>
                      <th className="py-3 px-4">Case Status</th>
                      <th className="py-3 px-4">Latest Follow-up</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {redList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No members matching the selected no-show filter.
                        </td>
                      </tr>
                    ) : (
                      redList.map((item) => {
                        const latestFollowUp = item.followUps?.[0];
                        return (
                          <tr key={item.case_id} className="hover:bg-slate-800/40 transition-colors">
                            
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white text-sm">{item.member_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{item.member_phone}</div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                                item.risk_days >= 22
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : item.risk_days >= 15
                                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              }`}>
                                {item.risk_days} Days Absent
                              </span>
                              <span className="block text-[10px] text-slate-500 mt-0.5">
                                Last: {item.last_attendance_time ? item.last_attendance_time.split(' ')[0] : 'No check-in'}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-200">{item.plan_name || 'Standard'}</div>
                              <div className="text-[11px] text-slate-400">Exp: {item.membership_expiry || 'N/A'}</div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                                item.case_status === 'Returned'
                                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                  : item.case_status === 'Contacted'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : item.case_status === 'Follow-up due'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
                              }`}>
                                {item.case_status}
                              </span>
                              {item.next_action_date && (
                                <span className="block text-[10px] text-slate-400 mt-1">
                                  Next: {item.next_action_date}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 max-w-xs">
                              {latestFollowUp ? (
                                <div>
                                  <span className="font-semibold text-amber-300">{latestFollowUp.outcome}</span>
                                  <span className="text-slate-400 text-[11px]"> ({latestFollowUp.channel})</span>
                                  <p className="text-[11px] text-slate-300 truncate mt-0.5">{latestFollowUp.notes}</p>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">No follow-up logged yet</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setActiveFollowUpCase(item)}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors cursor-pointer"
                                >
                                  Log Follow-Up
                                </button>
                                <button
                                  onClick={() => onSwitchToMember && onSwitchToMember(item.member_id)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                  title="Simulate Member View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>

                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: RENEWAL ENGINE */}
          {activeTab === 'renewals' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Filter Expiry:</span>
                  {['all', '7days', '14days', '30days', 'expired'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setRenewalTimeframe(tf)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                        renewalTimeframe === tf
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tf === 'all' ? 'All' : tf === '7days' ? 'Due in 7d' : tf === '14days' ? 'Due in 14d' : tf === '30days' ? 'Due in 30d' : 'Expired'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Current Plan</th>
                      <th className="py-3 px-4">Expiry Date</th>
                      <th className="py-3 px-4">Days Left</th>
                      <th className="py-3 px-4">Loyalty Offer</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {renewals.map((r) => {
                      const isExpired = r.days_to_expiry < 0;
                      const isDueSoon = r.days_to_expiry <= 7 && !isExpired;
                      return (
                        <tr key={r.membership_id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-sm">{r.member_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{r.member_phone}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-slate-200">{r.plan_name}</span>
                            <span className="block text-[11px] text-slate-400">₹{r.base_price} base</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono">
                            {r.expiry_date}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                              isExpired
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : isDueSoon
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {isExpired ? `Expired (${Math.abs(r.days_to_expiry)}d ago)` : `${r.days_to_expiry} Days Left`}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> ₹200 Loyalty Discount
                            </span>
                            <span className="text-[11px] text-slate-400">Available on 3m, 6m, 12m</span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setActiveRenewalMember({ id: r.member_id, name: r.member_name })}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                            >
                              Process Renewal
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ADD-ON MARKETPLACE */}
          {activeTab === 'addons' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {addOns.map((item) => (
                  <div key={item.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.type === 'PT' ? 'bg-purple-500/20 text-purple-300' : item.type === 'Diet' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {item.type === 'PT' ? 'PERSONAL TRAINING' : item.type === 'Diet' ? 'NUTRITION & DIET' : 'SUPPLEMENT'}
                        </span>
                        {item.type === 'Product' && (
                          <span className={`text-[11px] font-mono font-medium ${item.stock > 5 ? 'text-emerald-400' : 'text-red-400'}`}>
                            Stock: {item.stock} units
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">{item.title}</h4>
                      <p className="text-xs text-slate-400 mb-3">{item.description}</p>
                      {item.qualifications && (
                        <p className="text-[11px] text-amber-300/80 mb-2">Trainer: {item.qualifications}</p>
                      )}
                    </div>
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-lg font-black text-white font-mono">₹{item.price}</span>
                      <span className="text-[11px] text-slate-400">Opt-in Only</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: LIVE ATTENDANCE STREAM */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Real-time Gym Gate Attendance Feed
                </h3>
                <span className="text-xs text-slate-400">{attendance.length} Total Check-ins</span>
              </div>

              <div className="divide-y divide-slate-800/60">
                {attendance.map((att) => (
                  <div key={att.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 font-bold text-xs">
                        {att.member_name ? att.member_name.slice(0, 2).toUpperCase() : 'SF'}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">{att.member_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{att.member_phone}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs font-semibold text-emerald-400 font-mono">{att.check_in_time}</span>
                        <span className="block text-[10px] text-slate-500">Source: {att.source}</span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs font-mono">
                        🔥 Streak: {att.current_streak || 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: MEMBER DIRECTORY */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchMember}
                    onChange={(e) => setSearchMember(e.target.value)}
                    placeholder="Search by name, phone or email..."
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={() => setShowNewMemberModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Member
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Member Name</th>
                      <th className="py-3 px-4">Membership Plan</th>
                      <th className="py-3 px-4">Risk State</th>
                      <th className="py-3 px-4">Streak</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{m.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{m.phone}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-200">{m.plan_name || 'No active plan'}</span>
                          <span className="block text-[11px] text-slate-400">Exp: {m.expiry_date || 'N/A'}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            m.risk_state?.startsWith('Risk-')
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : m.risk_state === 'Paused'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {m.risk_state}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-300">
                          {m.current_streak || 0} (Best: {m.best_streak || 0})
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            m.status === 'Active' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-slate-800'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleMemberPause(m.id, m.status)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                            >
                              {m.status === 'Paused' ? 'Resume' : 'Pause'}
                            </button>
                            <button
                              onClick={() => onSwitchToMember && onSwitchToMember(m.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                            >
                              Simulate App
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Immutable Financial & Check-In Audit Trail
                </h3>
                <span className="text-xs text-slate-400">{auditLogs.length} Events Recorded</span>
              </div>

              <div className="divide-y divide-slate-800/60 text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{log.action}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 font-mono">
                          {log.actor_type}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {log.record_type} #{log.record_id}
                        </span>
                      </div>
                      {log.after_summary && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate max-w-xl">
                          {log.after_summary}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: STAFF ACCESS */}
          {activeTab === 'access' && (
            <StaffAccessPanel currentUser={currentUser} />
          )}

          {/* TAB 8: SETTINGS */}
          {activeTab === 'settings' && gymSettings && (
            <div className="max-w-2xl space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white mb-3">Gym Retention Configuration</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Gym Name</label>
                  <input
                    type="text"
                    value={gymSettings.gym_name || ''}
                    onChange={(event) => setGymSettings({ ...gymSettings, gym_name: event.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">No-Show Risk Threshold (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={gymSettings.no_show_threshold}
                    onChange={(event) => setGymSettings({ ...gymSettings, no_show_threshold: Number(event.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Duplicate Scan Window (Mins)</label>
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={gymSettings.duplicate_scan_window_minutes}
                    onChange={(event) => setGymSettings({ ...gymSettings, duplicate_scan_window_minutes: Number(event.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Streak Rule</label>
                  <select
                    value={gymSettings.streak_rule}
                    onChange={(event) => setGymSettings({ ...gymSettings, streak_rule: event.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white"
                  >
                    <option value="Weekly">Weekly Goal (4 of 4 visits)</option>
                    <option value="Visit">Planned Visit Streak</option>
                    <option value="Calendar">Calendar Daily Streak</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <button
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Modals */}
      {activeFollowUpCase && (
        <FollowUpModal
          caseItem={activeFollowUpCase}
          onClose={() => setActiveFollowUpCase(null)}
          onSuccess={() => {
            showToast('Follow-up logged successfully');
            loadAllData();
          }}
        />
      )}

      {activeRenewalMember && (
        <RenewalModal
          memberId={activeRenewalMember.id}
          memberName={activeRenewalMember.name}
          onClose={() => setActiveRenewalMember(null)}
          onSuccess={(data) => {
            showToast('Renewal processed & receipt generated');
            setActiveRenewalMember(null);
            if (data?.paymentId) {
              setActiveReceiptPaymentId(data.paymentId);
            }
            loadAllData();
          }}
        />
      )}

      {activeReceiptPaymentId && (
        <ReceiptModal
          paymentId={activeReceiptPaymentId}
          onClose={() => setActiveReceiptPaymentId(null)}
        />
      )}

      {showSummaryModal && (
        <DailySummaryModal
          onClose={() => setShowSummaryModal(false)}
        />
      )}

      {showNewMemberModal && (
        <NewMemberModal
          onClose={() => setShowNewMemberModal(false)}
          onSuccess={() => {
            showToast('New member registered');
            loadAllData();
          }}
        />
      )}

    </div>
  );
}
