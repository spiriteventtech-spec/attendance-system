// src/pages/SettingsPage.tsx
import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { authAPI } from '../services/api';
import { Spinner } from '../components/ui';
import { Shield, Key, Bell, Database } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.next.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSubmitting(true);
    try {
      await authAPI.changePassword(pwForm.current, pwForm.next);
      toast.success('Password changed successfully');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">Settings</h1>
        <p className="text-sm font-medium text-[#86868B] mt-1">Manage your {user?.role === 'admin' ? 'admin' : 'staff'} account</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-xl font-bold">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <p className="font-bold text-[#1D1D1F] text-lg tracking-tight">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm font-medium text-[#86868B]">{user?.email}</p>
            <span className={`inline-block px-2.5 py-0.5 mt-1.5 text-[11px] font-bold uppercase rounded-full tracking-widest ${user?.role === 'admin' ? 'bg-[#AF52DE]/10 text-[#AF52DE]' : 'bg-[#007AFF]/10 text-[#007AFF]'}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-[#007AFF]/10"><Key className="w-5 h-5 text-[#007AFF]" /></div>
          <h2 className="font-bold text-[#1D1D1F] tracking-tight text-lg">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="telemetry-label font-medium mb-1.5 block">Current Password</label>
            <input type="password" className="input bg-black/[0.02]" placeholder="••••••••"
              value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required />
          </div>
          <div>
            <label className="telemetry-label font-medium mb-1.5 block">New Password</label>
            <input type="password" className="input bg-black/[0.02]" placeholder="Min. 8 characters"
              value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required />
          </div>
          <div>
            <label className="telemetry-label font-medium mb-1.5 block">Confirm New Password</label>
            <input type="password" className="input bg-black/[0.02]" placeholder="Repeat new password"
              value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <div className="pt-4">
            <button type="submit" className="btn-apple bg-[#007AFF] text-white w-full justify-center" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : <><Key className="w-4 h-4" /> Update Password</>}
            </button>
          </div>
        </form>
      </div>

      {user?.role === 'admin' && (
        <>
          {/* System Info */}
          <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-[#5856D6]/10"><Database className="w-5 h-5 text-[#5856D6]" /></div>
              <h2 className="font-bold text-[#1D1D1F] tracking-tight text-lg">System Information</h2>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Application',    value: 'EventsTrack v1.0.0' },
                { label: 'Backend',        value: 'Node.js + Express' },
                { label: 'Database',       value: 'PostgreSQL 16 + PostGIS 3.4' },
                { label: 'Mobile App',     value: 'React Native (Expo SDK 50)' },
                { label: 'Location Poll',  value: 'Every 30 seconds' },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-3 border-b border-black/5 last:border-0">
                  <span className="font-medium text-[#86868B]">{row.label}</span>
                  <span className="text-[#1D1D1F] font-bold font-mono text-xs">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security Tips */}
          <div className="bg-[#FF9500]/5 rounded-[24px] p-6 border border-[#FF9500]/20 shadow-premium">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-[#FF9500]" />
              <h2 className="font-bold text-[#FF9500] tracking-tight text-lg">Security Reminders</h2>
            </div>
            <ul className="text-sm font-medium text-[#FF9500]/80 space-y-2 list-disc list-inside leading-relaxed">
              <li>Change the default admin password if you haven't already.</li>
              <li>Use a strong JWT_SECRET in production (32+ random characters).</li>
              <li>Enable SSL/TLS in production — set <code className="font-mono bg-[#FF9500]/10 px-1.5 py-0.5 rounded text-[#FF9500]">DB_SSL=true</code>.</li>
              <li>Restrict database access to the backend service only.</li>
              <li>Review attendance overrides regularly to ensure audit integrity.</li>
              <li>Archive departed staff promptly to prevent unauthorized access.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
