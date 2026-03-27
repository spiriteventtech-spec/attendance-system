// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// UI_VERSION: 1.0.2 - REFRESH_FORCE
import { Toaster } from 'react-hot-toast';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Menu } from 'lucide-react';
import { useAuthStore } from './store/authStore';
import Sidebar from './components/Sidebar';
import { Spinner } from './components/ui';
import Logo from './assets/logo-premium.png';

const LoginPage      = React.lazy(() => import('./pages/LoginPage'));
const DashboardPage  = React.lazy(() => import('./pages/DashboardPage'));
const LiveMapPage    = React.lazy(() => import('./pages/LiveMapPage'));
const AttendancePage = React.lazy(() => import('./pages/AttendancePage'));
const StaffPage      = React.lazy(() => import('./pages/StaffPage'));
const SitesPage      = React.lazy(() => import('./pages/SitesPage'));
const ReportsPage    = React.lazy(() => import('./pages/ReportsPage'));
const SettingsPage   = React.lazy(() => import('./pages/SettingsPage'));
const AnnouncementsPage  = React.lazy(() => import('./pages/AnnouncementsPage'));
const PersonalDashboard  = React.lazy(() => import('./pages/PersonalDashboard'));
const PersonalHistory    = React.lazy(() => import('./pages/PersonalHistory'));
const SecurityAuditPage  = React.lazy(() => import('./pages/SecurityAuditPage'));
const SchedulingPage     = React.lazy(() => import('./pages/SchedulingPage'));

import { Outlet } from 'react-router-dom';

function Layout() {
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
          <React.Suspense fallback={<div className="animate-pulse bg-black/[0.02] rounded-[32px] w-full h-[600px]" />}>
            <Outlet />
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ roles }: { roles?: string[] }) {
  const { user, loading } = useAuthStore();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  
  return <Layout />;
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
        
        {/* Main App Shell with persistent Sidebar/Layout */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={user?.role === 'admin' ? <DashboardPage /> : <PersonalDashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          
          {/* Admin Restricted Section */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/live-map"      element={<LiveMapPage />} />
            <Route path="/attendance"    element={<AttendancePage />} />
            <Route path="/staff"         element={<StaffPage />} />
            <Route path="/sites"         element={<SitesPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/reports"       element={<ReportsPage />} />
            <Route path="/security"      element={<SecurityAuditPage />} />
            <Route path="/scheduling"    element={<SchedulingPage />} />
          </Route>
          
          {/* Staff Restricted Section */}
          <Route element={<ProtectedRoute roles={['staff']} />}>
            <Route path="/history"       element={<PersonalHistory />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
