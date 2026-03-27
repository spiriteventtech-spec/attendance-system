// src/components/Sidebar.tsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, ClipboardList, Users, BarChart3, Settings, LogOut, Briefcase, Plus, Megaphone, Shield, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';

import Logo from '../assets/logo-premium.png';

const navItems = [
  { to: '/',           label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/live-map',   label: 'Live Map',    icon: MapPin,         roles: ['admin'] },
  { to: '/attendance', label: 'Attendance',  icon: ClipboardList,  roles: ['admin'] },
  { to: '/history',    label: 'My History',  icon: ClipboardList,  roles: ['staff'] },
  { to: '/staff',      label: 'Staff',       icon: Users,          roles: ['admin'] },
  { to: '/scheduling', label: 'Scheduling',  icon: Calendar,       roles: ['admin'] },
  { to: '/sites',      label: 'Sites',       icon: Briefcase,      roles: ['admin'] },
  { to: '/reports',    label: 'Reports',     icon: BarChart3,      roles: ['admin'] },
  { to: '/announcements', label: 'Broadcasts', icon: Megaphone,    roles: ['admin'] },
  { to: '/security',   label: 'Security',    icon: Shield,         roles: ['admin'] },
  { to: '/settings',   label: 'Settings',    icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const filteredItems = navItems.filter(item => 
    !item.roles || item.roles.includes(user?.role || '')
  );

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={clsx(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      <aside className={clsx(
        'w-64 min-h-screen bg-white/80 backdrop-blur-xl border-r border-black/[0.03] flex flex-col fixed left-0 top-0 bottom-0 z-50 transition-transform duration-300 lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="px-6 py-6 border-b border-black/[0.03] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-black/5 rounded-xl">
              <img src={Logo} className="w-5 h-5 object-contain" alt="EventsTrack Logo" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1D1D1F] tracking-tight">EventsTrack</p>
              <p className="text-[10px] text-[#86868B] font-medium tracking-wide uppercase mt-0.5">
                {user?.role === 'admin' ? 'Administration' : 'Member Portal'}
              </p>
            </div>
          </div>
          <button className="lg:hidden p-1.5 text-[#86868B] hover:text-[#1D1D1F]" onClick={onClose}>
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {filteredItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => { if (window.innerWidth < 1024) onClose(); }}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/20'
                    : 'text-[#86868B] hover:bg-black/5 hover:text-[#1D1D1F]'
                )
              }
            >
              <Icon className={clsx("w-4 h-4 flex-shrink-0")} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 py-6 border-t border-black/[0.03] space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-10 h-10 rounded-full bg-[#007AFF]/5 border border-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-sm font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1D1D1F] truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-[#86868B] truncate font-medium">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#FF3B30] hover:bg-[#FF3B30]/5 transition-all w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
