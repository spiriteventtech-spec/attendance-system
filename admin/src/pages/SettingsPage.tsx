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
        <h1 className="text-xl font-bold text-[#F1F5F9]">Settings</h1>
        <p className="text-sm text-steel-400">Manage your {user?.role === 'admin' ? 'admin' : 'staff'} account</p>
      </div>

      {/* Profile Card */}
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center text-brand text-xl font-bold border border-brand/30">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <p className="font-bold text-[#F1F5F9]">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-steel-400">{user?.email}</p>
            <span className={`badge mt-1 capitalize ${user?.role === 'admin' ? 'bg-purple-500/15 text-purple-400' : 'bg-brand/15 text-brand'}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-brand/10"><Key className="w-4 h-4 text-brand" /></div>
          <h2 className="font-semibold text-[#F1F5F9]">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" placeholder="••••••••"
              value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" placeholder="Min. 8 characters"
              value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" placeholder="Repeat new password"
              value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <div className="pt-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : <><Key className="w-4 h-4" /> Update Password</>}
            </button>
          </div>
        </form>
      </div>

      {user?.role === 'admin' && (
        <>
          {/* System Info */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10"><Database className="w-4 h-4 text-blue-400" /></div>
              <h2 className="font-semibold text-[#F1F5F9]">System Information</h2>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Application',    value: 'EventsTrack v1.0.0' },
                { label: 'Backend',        value: 'Node.js + Express' },
                { label: 'Database',       value: 'PostgreSQL 16 + PostGIS 3.4' },
                { label: 'Mobile App',     value: 'React Native (Expo SDK 50)' },
                { label: 'Location Poll',  value: 'Every 30 seconds' },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-2 border-b border-[#253352] last:border-0">
                  <span className="text-steel-400">{row.label}</span>
                  <span className="text-[#CBD5E1] font-medium font-mono text-xs">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security Tips */}
          <div className="card p-5 border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold text-amber-400">Security Reminders</h2>
            </div>
            <ul className="text-xs text-steel-400 space-y-2 list-disc list-inside">
              <li>Change the default admin password if you haven't already.</li>
              <li>Use a strong JWT_SECRET in production (32+ random characters).</li>
              <li>Enable SSL/TLS in production — set <code className="font-mono bg-[#0F172A] px-1 rounded">DB_SSL=true</code>.</li>
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
