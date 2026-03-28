import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { authAPI, securityAPI } from '../services/api';
import { Spinner } from '../components/ui';
import { Shield, Key, Bell, Database, Mail, FileText, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);

  // Weekly Report Settings
  const [reportSettings, setReportSettings] = useState({ enabled: false, recipient: '', format: 'both' as 'pdf' | 'xlsx' | 'both' });
  const [loadingReports, setLoadingReports] = useState(false);
  const [savingReports, setSavingReports] = useState(false);
  const [triggeringTest, setTriggeringTest] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchReportSettings();
    }
  }, [user]);

  const fetchReportSettings = async () => {
    setLoadingReports(true);
    try {
      const { data } = await securityAPI.getReportSettings();
      setReportSettings({
        enabled: data.weekly_report_enabled === 'true',
        recipient: data.weekly_report_recipient || '',
        format: data.weekly_report_format || 'both'
      });
    } catch (err) {
      toast.error('Failed to load report settings');
    } finally {
      setLoadingReports(false);
    }
  };

  const handleSaveReports = async () => {
    setSavingReports(true);
    try {
      await securityAPI.setReportSettings(reportSettings);
      toast.success('Report settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingReports(false);
    }
  };

  const handleTriggerTest = async () => {
    setTriggeringTest(true);
    const id = toast.loading('Generating and sending test report...');
    try {
      const { data } = await securityAPI.triggerTestReport();
      toast.success(data.message || 'Test report sent!', { id });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send test report', { id });
    } finally {
      setTriggeringTest(false);
    }
  };

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
    <div className="p-6 lg:p-10 space-y-8 max-w-3xl h-screen overflow-y-auto pb-20">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">Settings</h1>
        <p className="text-sm font-medium text-[#86868B] mt-1">Manage your {user?.role === 'admin' ? 'admin' : 'staff'} account and system preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Profile Card */}
          <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-xl font-bold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div>
                <p className="font-bold text-[#1D1D1F] text-lg tracking-tight">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm font-medium text-[#86868B]">{user?.email}</p>
                <div className="flex gap-2 mt-1.5">
                  <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full tracking-widest ${user?.role === 'admin' ? 'bg-[#AF52DE]/10 text-[#AF52DE]' : 'bg-[#007AFF]/10 text-[#007AFF]'}`}>
                    {user?.role}
                  </span>
                  {user?.role === 'admin' && <span className="bg-green-50 text-green-600 px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full tracking-widest">System Controller</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-[#007AFF]/10"><Key className="w-5 h-5 text-[#007AFF]" /></div>
              <h2 className="font-bold text-[#1D1D1F] tracking-tight text-lg">Update Security</h2>
            </div>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="label-apple mb-1.5 block">Current Password</label>
                  <input type="password" className="input-apple bg-black/[0.02]" placeholder="••••••••"
                    value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required />
                </div>
                <div>
                  <label className="label-apple mb-1.5 block">New Password</label>
                  <input type="password" className="input-apple bg-black/[0.02]" placeholder="Min. 8 characters"
                    value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} required />
                </div>
                <div>
                  <label className="label-apple mb-1.5 block">Confirm New Password</label>
                  <input type="password" className="input-apple bg-black/[0.02]" placeholder="Repeat new password"
                    value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" className="btn-apple bg-[#007AFF] text-white w-full justify-center shadow-lg shadow-[#007AFF]/20" disabled={submitting}>
                  {submitting ? <Spinner size="sm" /> : <><Key className="w-4 h-4" /> Save New Password</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-8">
          {user?.role === 'admin' && (
            <>
              {/* Automated Weekly Reporting */}
              <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                  <FileText className="w-20 h-20" />
                </div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-[#007AFF]/10"><Mail className="w-5 h-5 text-[#007AFF]" /></div>
                  <h2 className="font-bold text-[#1D1D1F] tracking-tight text-lg">Weekly Reporting</h2>
                </div>

                {loadingReports ? (
                  <div className="py-10 flex flex-col items-center gap-3 opacity-40">
                    <Spinner size="md" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Syncing configuration...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F5F5F7] border border-black/5">
                      <div>
                        <p className="text-sm font-bold text-[#1D1D1F]">Enable Reports</p>
                        <p className="text-[11px] text-[#86868B]">Sends every Sun @ 23:59</p>
                      </div>
                      <button 
                        onClick={() => setReportSettings(s => ({ ...s, enabled: !s.enabled }))}
                        className={`w-12 h-6 rounded-full transition-all relative ${reportSettings.enabled ? 'bg-[#34C759]' : 'bg-[#D1D1D6]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${reportSettings.enabled ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="label-apple mb-1.5 block">Recipient Email</label>
                        <input 
                          type="email" 
                          className="input-apple bg-black/[0.01]" 
                          placeholder="admin@company.com"
                          value={reportSettings.recipient}
                          onChange={e => setReportSettings(s => ({ ...s, recipient: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="label-apple mb-1.5 block">Report Format</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['pdf', 'xlsx', 'both'].map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => setReportSettings(s => ({ ...s, format: fmt as any }))}
                              className={`py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${reportSettings.format === fmt ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]' : 'bg-white text-[#86868B] border-black/5 hover:border-black/20'}`}
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button 
                        onClick={handleTriggerTest}
                        disabled={triggeringTest || !reportSettings.recipient}
                        className="btn-apple bg-[#F5F5F7] text-[#1D1D1F] border border-black/5 flex-1 justify-center text-xs"
                      >
                         {triggeringTest ? <Spinner size="sm" /> : <><Send className="w-3.5 h-3.5" /> Test Send</>}
                      </button>
                      <button 
                        onClick={handleSaveReports}
                        disabled={savingReports}
                        className="btn-apple bg-[#1D1D1F] text-white flex-1 justify-center text-xs shadow-lg shadow-black/10"
                      >
                         {savingReports ? <Spinner size="sm" /> : 'Save Config'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* System Info */}
              <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-[#5856D6]/10"><Database className="w-5 h-5 text-[#5856D6]" /></div>
                  <h2 className="font-bold text-[#1D1D1F] tracking-tight text-lg">System Status</h2>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'Security Version',    value: 'ZT-2.1.0 (Enterprise)' },
                    { label: 'Database Engine',    value: 'PostgreSQL 16.2' },
                    { label: 'AI Module',          value: 'AWS Rekognition v3' },
                    { label: 'Cloud Storage',      value: 'S3 / Local Encrypted' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-2.5 border-b border-black/5 last:border-0">
                      <span className="font-medium text-[#86868B]">{row.label}</span>
                      <span className="text-[#1D1D1F] font-bold">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {user?.role === 'admin' && (
        <div className="bg-[#FF9500]/5 rounded-[24px] p-8 border border-[#FF9500]/20 max-w-none">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-[#FF9500]" />
            <h2 className="font-bold text-[#FF9500] tracking-tight text-lg">Security & Compliance Guidelines</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ul className="text-sm font-medium text-[#FF9500]/80 space-y-3 list-disc list-inside leading-relaxed">
              <li>Change default passwords immediately (Admin@1234).</li>
              <li>Use 32+ character random strings for <code className="font-mono bg-[#FF9500]/10 px-1.5 py-0.5 rounded text-[#FF9500]">JWT_SECRET</code>.</li>
              <li>Ensure attendance logs are audited monthly for variances.</li>
            </ul>
            <ul className="text-sm font-medium text-[#FF9500]/80 space-y-3 list-disc list-inside leading-relaxed">
              <li>Enable <code className="font-mono bg-[#FF9500]/10 px-1.5 py-0.5 rounded text-[#FF9500]">DB_SSL=true</code> in high-security environments.</li>
              <li>Verify SMTP credentials to receive critical device-mismatch alerts.</li>
              <li>Archive inactive users to reduce the attack surface.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
