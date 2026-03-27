// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Menu } from 'lucide-react';
import { useAuthStore } from './store/authStore';
import Sidebar from './components/Sidebar';
import { Spinner } from './components/ui';

import LoginPage      from './pages/LoginPage';
import DashboardPage  from './pages/DashboardPage';
import LiveMapPage    from './pages/LiveMapPage';
import AttendancePage from './pages/AttendancePage';
import StaffPage      from './pages/StaffPage';
import SitesPage      from './pages/SitesPage';
import ReportsPage    from './pages/ReportsPage';
import SettingsPage   from './pages/SettingsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import PersonalDashboard from './pages/PersonalDashboard';
import PersonalHistory   from './pages/PersonalHistory';
import Logo from './assets/logo-premium.png';

function Layout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { user } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-[#F5F5F7]">
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
      
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-white/80 backdrop-blur-xl border-b border-black/[0.03] flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsOpen(true)}
              className="p-2 -ml-2 text-[#86868B] hover:text-[#1D1D1F] transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <img src={Logo} className="w-6 h-6 object-contain" alt="EventsTrack Logo" />
              <span className="font-bold text-[#1D1D1F] text-sm tracking-tight italic">EventsTrack</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#007AFF]/5 flex items-center justify-center text-[#007AFF] text-[10px] font-bold border border-[#007AFF]/10">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuthStore();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { restore, user } = useAuthStore();
  useEffect(() => { restore(); }, []);

  return (
    <BrowserRouter>
      <SpeedInsights />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#1D1D1F',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '14px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          },
          success: { iconTheme: { primary: '#34C759', secondary: '#FFFFFF' } },
          error:   { iconTheme: { primary: '#FF3B30', secondary: '#FFFFFF' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            {user?.role === 'admin' ? <DashboardPage /> : <PersonalDashboard />}
          </ProtectedRoute>
        } />

        <Route path="/live-map"   element={<ProtectedRoute roles={['admin']}><LiveMapPage /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute roles={['admin']}><AttendancePage /></ProtectedRoute>} />
        <Route path="/staff"      element={<ProtectedRoute roles={['admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="/sites"      element={<ProtectedRoute roles={['admin']}><SitesPage /></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute roles={['admin']}><AnnouncementsPage /></ProtectedRoute>} />
        <Route path="/reports"    element={<ProtectedRoute roles={['admin']}><ReportsPage /></ProtectedRoute>} />
        
        <Route path="/history"    element={<ProtectedRoute roles={['staff']}><PersonalHistory /></ProtectedRoute>} />
        
        <Route path="/settings"   element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
