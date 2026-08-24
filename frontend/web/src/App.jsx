import React, { useState } from 'react';
import Header from './components/Header';
import OperatingLoopBanner from './components/OperatingLoopBanner';
import OwnerDashboard from './components/OwnerDashboard';
import MemberAppSimulator from './components/MemberAppSimulator';
import FrontDeskKiosk from './components/FrontDeskKiosk';
import TrainerView from './components/TrainerView';

export default function App() {
  const [activeRole, setActiveRole] = useState('owner'); // 'owner', 'member', 'frontdesk', 'trainer'
  const [selectedMemberId, setSelectedMemberId] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshAll = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleSwitchToMember = (memberId) => {
    setSelectedMemberId(memberId);
    setActiveRole('member');
  };

  const handleStepClick = (stepId) => {
    if (stepId === 'attendance') {
      setActiveRole('frontdesk');
    } else if (stepId === 'risk' || stepId === 'contact' || stepId === 'return' || stepId === 'roi') {
      setActiveRole('owner');
    } else if (stepId === 'renewal' || stepId === 'addons') {
      setActiveRole('member');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      
      {/* Top Header */}
      <Header
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        onRefreshAll={handleRefreshAll}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Operating Loop Interactive Flow Banner */}
        <OperatingLoopBanner onStepClick={handleStepClick} />

        {/* Dynamic Views */}
        <div key={refreshKey}>
          {activeRole === 'owner' && (
            <OwnerDashboard onSwitchToMember={handleSwitchToMember} />
          )}

          {activeRole === 'member' && (
            <MemberAppSimulator
              selectedMemberId={selectedMemberId}
              onMemberChange={(id) => setSelectedMemberId(id)}
            />
          )}

          {activeRole === 'frontdesk' && (
            <FrontDeskKiosk />
          )}

          {activeRole === 'trainer' && (
            <TrainerView />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <p>
          <strong className="text-slate-400">Samrat Fitness King</strong> Retention System &copy; 2026. Built with Node.js, Express, SQLite, React & Tailwind CSS.
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          QR Attendance • Churn Detection Engine • 7-Day Auto Renewal • Opt-In Add-on Marketplace
        </p>
      </footer>

    </div>
  );
}
