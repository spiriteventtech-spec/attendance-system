// src/pages/StaffPage.tsx
import React, { useEffect, useState } from 'react';
import { usersAPI, authAPI, shiftsAPI, securityAPI } from '../services/api';
import { Badge, Modal, Spinner, FilterInput, FilterSelect, ConfirmDialog, EmptyState, Skeleton } from '../components/ui';
import { UserPlus, Search, Lock, Archive, Edit2, RotateCcw, Eye, Smartphone, Calendar, UserCheck, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

export default function StaffPage() {
  const [users,     setUsers]    = useState<any[]>([]);
  const [total,     setTotal]    = useState(0);
  const [loading,   setLoading]  = useState(true);
  const [search,    setSearch]   = useState('');
  const [statusFilter, setStatus] = useState('');
  const [roleFilter,   setRole]   = useState('');

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editUser,    setEditUser]    = useState<any>(null);
  const [statsUser,   setStatsUser]   = useState<any>(null);
  const [statsData,   setStatsData]   = useState<any>(null);
  const [resetUser,   setResetUser]   = useState<any>(null);
  const [confirmAct,  setConfirmAct]  = useState<{ user: any; action: string } | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  
  const [userShifts,  setUserShifts]  = useState<any[]>([]);
  const [statTab,     setStatTab]     = useState<'stats' | 'roster'>('stats');

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'staff', phone: '',
  });
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => { fetchUsers(); }, [search, statusFilter, roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (roleFilter) params.role = roleFilter;
      const { data } = await usersAPI.list(params);
      setUsers(data.users);
      setTotal(data.total);
    } finally {
      setTimeout(() => setLoading(false), 200);
    }
  };

  const openStats = async (user: any) => {
    setStatsUser(user);
    setStatTab('stats');
    try {
      const [sRes, shRes] = await Promise.all([
        usersAPI.stats(user.id),
        shiftsAPI.list({ userId: user.id })
      ]);
      setStatsData(sRes.data);
      setUserShifts(shRes.data);
    } catch (err) {
      toast.error('Failed to load user intelligence data');
    }
  };

  const handleResetDevice = async (userId: string) => {
    if (!confirm('Authorize a new device for this operator? Existing hardware binding will be severed.')) return;
    try {
      await securityAPI.resetDeviceBinding(userId);
      toast.success('Device binding cleared. Operator can now register a new device.');
      fetchUsers();
    } catch (err) {
      toast.error('Failed to reset device binding');
    }
  };

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      toast.error('All fields are required'); return;
    }
    setSubmitting(true);
    try {
      await usersAPI.create(form);
      toast.success('User created successfully');
      setCreateModal(false);
      setForm({ firstName:'', lastName:'', email:'', password:'', role:'staff', phone:'' });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    setSubmitting(true);
    try {
      await usersAPI.update(editUser.id, {
        firstName: editUser.first_name,
        lastName:  editUser.last_name,
        email:     editUser.email,
        phone:     editUser.phone,
        role:      editUser.role,
      });
      toast.success('User updated');
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally { setSubmitting(false); }
  };

  const handleResetPassword = async () => {
    if (resetPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSubmitting(true);
    try {
      await authAPI.resetPassword(resetUser.id, resetPassword);
      toast.success('Password reset successfully');
      setResetUser(null);
      setResetPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Reset failed');
    } finally { setSubmitting(false); }
  };

  const handleConfirm = async () => {
    if (!confirmAct) return;
    setSubmitting(true);
    try {
      const { user, action } = confirmAct;
      if (action === 'freeze')   await usersAPI.freeze(user.id, true);
      if (action === 'unfreeze') await usersAPI.freeze(user.id, false);
      if (action === 'archive')  await usersAPI.archive(user.id);
      if (action === 'recover')  await usersAPI.recover(user.id);
      toast.success(`User ${action === 'recover' ? 'recovered' : action + 'd'}`);
      setConfirmAct(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally { setSubmitting(false); }
  };

  const [enrollUser,   setEnrollUser]  = useState<any>(null);

  const handleEnrollPhoto = async (file: File) => {
    if (!enrollUser) return;
    setSubmitting(true);
    try {
      await authAPI.uploadAvatar(file, enrollUser.id);
      toast.success('Staff photo enrolled successfully');
      setEnrollUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Enrollment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor: Record<string, string> = {
    active: 'text-green-400', frozen: 'text-sky-400', archived: 'text-gray-500',
  };

  return (
    <div className="p-6 lg:p-10 space-y-6 h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight text-gradient">Workforce Intel</h1>
          <p className="text-sm font-medium text-[#86868B] mt-1">{total} team members onboarded</p>
        </div>
        <button className="btn-apple bg-[#007AFF] text-white font-bold shadow-lg shadow-[#007AFF]/20" onClick={() => setCreateModal(true)}>
          <UserPlus className="w-4 h-4" /> Add Member
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-[32px] p-6 border border-black/5 shadow-premium flex flex-wrap gap-4 items-end backdrop-blur-xl bg-white/80">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2 px-1">Search Directory</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
            <input className="input pl-11 bg-black/[0.03] border-transparent focus:bg-white focus:border-[#007AFF]/20 transition-all rounded-2xl" placeholder="Find by name, email, or role…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatus}
          options={[{ value:'', label:'All Status' }, { value:'active', label:'Active Operators' },
                    { value:'frozen', label:'Locked Accounts' }, { value:'archived', label:'Archived' }]} />
        <FilterSelect label="Role" value={roleFilter} onChange={setRole}
          options={[{ value:'', label:'All Roles' }, { value:'staff', label:'Field Staff' },
                    { value:'admin', label:'Command Center' }]} />
        <button className="btn-apple bg-black/5 text-[#86868B] font-bold rounded-2xl" onClick={() => { setSearch(''); setStatus(''); setRole(''); }}>
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[32px] overflow-hidden border border-black/5 shadow-premium backdrop-blur-xl">
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="w-full h-12 mb-4 rounded-2xl" />
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="w-full h-16 rounded-2xl" />)}
          </div>
        ) : users.length === 0 ? (
          <EmptyState message="No personnel found matching your criteria." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F5F5F7]/80 border-b border-black/5">
                  <th className="py-5 px-6 text-[10px] font-bold text-[#86868B] uppercase tracking-[0.2em]">Personnel</th>
                  <th className="py-5 px-6 text-[10px] font-bold text-[#86868B] uppercase tracking-[0.2em]">Access Level</th>
                  <th className="py-5 px-6 text-[10px] font-bold text-[#86868B] uppercase tracking-[0.2em]">Security Status</th>
                  <th className="py-5 px-6 text-[10px] font-bold text-[#86868B] uppercase tracking-[0.2em]">Joined</th>
                  <th className="py-5 px-6 text-[10px] font-bold text-[#86868B] uppercase tracking-[0.2em] text-right">Command</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#F5F5F7]/50 transition-colors group">
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} className="w-11 h-11 rounded-2xl object-cover ring-2 ring-white shadow-md" alt="" />
                          ) : (
                            <div className="w-11 h-11 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-sm font-black flex-shrink-0">
                              {u.first_name?.[0]}{u.last_name?.[0]}
                            </div>
                          )}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${u.avatar_url ? 'bg-[#34C759]' : 'bg-[#D1D1D6]'}`} title={u.avatar_url ? 'AI Photo Enrolled' : 'No Reference Photo'}>
                            <UserCheck className="w-2.5 h-2.5 text-white" />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-[#1D1D1F] text-sm tracking-tight">
                            {u.first_name} {u.last_name}
                          </span>
                          <span className="text-[11px] font-medium text-[#86868B]">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <span className={`inline-block px-3 py-1 text-[9px] font-black uppercase rounded-full tracking-wider ${u.role === 'admin' ? 'bg-[#AF52DE]/10 text-[#AF52DE] border border-[#AF52DE]/20' : 'bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[11px] font-bold tracking-tight flex items-center gap-1.5 ${u.status === 'active' ? 'text-[#34C759]' : u.status === 'frozen' ? 'text-[#FF9500]' : 'text-[#86868B]'}`}>
                          {u.status === 'frozen' ? '🔒 Account Locked' : u.status === 'archived' ? '📦 Archived' : '● Operational'}
                        </span>
                        {u.device_fingerprint && <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Bound to Hardware</span>}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-xs font-bold text-[#86868B]">
                      {new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <button className="p-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-[#86868B] transition-colors" title="Intelligence Report" onClick={() => openStats(u)}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2.5 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] transition-colors" title="AI Enrollment" onClick={() => setEnrollUser(u)}>
                          <Camera className="w-4 h-4" />
                        </button>
                        <button className="p-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-[#86868B] transition-colors" title="Edit Profile" onClick={() => setEditUser({ ...u })}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-2.5 rounded-xl bg-[#AF52DE]/10 hover:bg-[#AF52DE]/20 text-[#AF52DE] transition-colors" title="Credential Reset" onClick={() => setResetUser(u)}>
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {u.device_fingerprint && (
                          <button className="p-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 transition-colors" title="Unbind Hardware" onClick={() => handleResetDevice(u.id)}>
                            <Smartphone className="w-4 h-4" />
                          </button>
                        )}
                        {u.status === 'active' && u.role !== 'admin' && (
                          <button className="p-2.5 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#FF3B30] transition-colors" title="Archive User"
                            onClick={() => setConfirmAct({ user: u, action: 'archive' })}>
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enroll Modal */}
      <Modal open={!!enrollUser} onClose={() => setEnrollUser(null)} title="AI Photo Enrollment">
        {enrollUser && (
          <div className="space-y-6">
            <div className="p-4 bg-[#F5F5F7] rounded-3xl border border-black/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-[#007AFF] font-black shadow-sm">
                {enrollUser.first_name?.[0]}{enrollUser.last_name?.[0]}
              </div>
              <div>
                <p className="text-sm font-black text-[#1D1D1F]">{enrollUser.first_name} {enrollUser.last_name}</p>
                <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest">Enrolling for AI Identity Verification</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-black/10 rounded-[32px] text-center bg-black/[0.01] hover:bg-black/[0.02] transition-colors group relative cursor-pointer overflow-hidden">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                  onChange={e => e.target.files?.[0] && handleEnrollPhoto(e.target.files[0])}
                />
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform">
                    <Camera className="w-6 h-6 text-[#007AFF]" />
                  </div>
                  <p className="text-xs font-bold text-[#1D1D1F]">Upload Reference Photo</p>
                  <p className="text-[10px] text-[#86868B] font-medium leading-relaxed px-4">Ensure a clear, well-lit headshot against a plain background for maximum AI confidence.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button className="btn-apple-secondary text-[11px] font-bold uppercase tracking-widest" onClick={() => setEnrollUser(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add New Staff Member">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">First Name</label>
              <input className="input-apple" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Last Name</label>
              <input className="input-apple" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
          </div>
          <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Email</label>
            <input className="input-apple" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Password (min 8 chars)</label>
            <input className="input-apple" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Phone (optional)</label>
            <input className="input-apple" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Role</label>
            <select className="input-apple" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-3">
            <button className="btn-apple-secondary" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn-apple" onClick={handleCreate} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Staff Member">
        {editUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">First Name</label>
                <input className="input-apple" value={editUser.first_name} onChange={e => setEditUser((u: any) => ({ ...u, first_name: e.target.value }))} /></div>
              <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Last Name</label>
                <input className="input-apple" value={editUser.last_name} onChange={e => setEditUser((u: any) => ({ ...u, last_name: e.target.value }))} /></div>
            </div>
            <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Email</label>
              <input className="input-apple" type="email" value={editUser.email} onChange={e => setEditUser((u: any) => ({ ...u, email: e.target.value }))} /></div>
            <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Phone</label>
              <input className="input-apple" type="tel" value={editUser.phone || ''} onChange={e => setEditUser((u: any) => ({ ...u, phone: e.target.value }))} /></div>
            <div><label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Role</label>
              <select className="input-apple" value={editUser.role} onChange={e => setEditUser((u: any) => ({ ...u, role: e.target.value }))}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-3">
              <button className="btn-apple-secondary" onClick={() => setEditUser(null)}>Cancel</button>
              <button className="btn-apple" onClick={handleEdit} disabled={submitting}>
                {submitting ? <Spinner size="sm" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title="Reset Password">
        {resetUser && (
          <div className="space-y-4">
            <p className="text-sm text-[#86868B] font-medium leading-relaxed">
              Setting a new password for <strong className="text-[#1D1D1F]">{resetUser.first_name} {resetUser.last_name}</strong>.
              Please communicate the new password securely.
            </p>
            <div>
              <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-1.5">New Password (min 8 chars)</label>
              <input className="input-apple" type="password" value={resetPassword}
                onChange={e => setResetPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="flex gap-3 justify-end pt-3">
              <button className="btn-apple-secondary" onClick={() => setResetUser(null)}>Cancel</button>
              <button className="btn-apple bg-[#FF9500]" onClick={handleResetPassword} disabled={submitting}>
                {submitting ? <Spinner size="sm" /> : 'Reset Password'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Stats Modal */}
      <Modal open={!!statsUser} onClose={() => { setStatsUser(null); setStatsData(null); setUserShifts([]); }} title="Staff Intelligence">
        {statsUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-3xl bg-black/[0.02] border border-black/5">
                <div className="w-12 h-12 rounded-full bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-lg font-black">
                    {statsUser.first_name?.[0]}{statsUser.last_name?.[0]}
                </div>
                <div>
                    <p className="text-base font-black text-[#1D1D1F]">{statsUser.first_name} {statsUser.last_name}</p>
                    <p className="text-xs font-bold text-[#86868B] uppercase tracking-widest">{statsUser.role} // {statsUser.status}</p>
                </div>
            </div>

            <div className="flex gap-1 p-1 bg-black/[0.03] rounded-2xl">
                <button 
                    onClick={() => setStatTab('stats')}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${statTab === 'stats' ? 'bg-white shadow-sm text-[#007AFF]' : 'text-[#86868B] hover:text-[#1D1D1F]'}`}
                >
                    PERFORMANCE
                </button>
                <button 
                    onClick={() => setStatTab('roster')}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${statTab === 'roster' ? 'bg-white shadow-sm text-[#007AFF]' : 'text-[#86868B] hover:text-[#1D1D1F]'}`}
                >
                    ROSTER
                </button>
            </div>

            {!statsData ? <div className="flex justify-center py-6"><Spinner /></div> : (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {statTab === 'stats' ? (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                        { label: 'Total Sessions', value: statsData.total_sessions },
                        { label: 'Total Hours',    value: `${parseFloat(statsData.total_hours).toFixed(1)}h` },
                        { label: 'Total Away',     value: `${statsData.total_away_minutes || 0}m` },
                        { label: 'Overridden',     value: statsData.overridden_count },
                        ].map(s => (
                        <div key={s.label} className="p-4 rounded-3xl bg-black/[0.01] border border-black/[0.04]">
                            <p className="text-[10px] font-black tracking-widest text-[#86868B] uppercase mb-1">{s.label}</p>
                            <p className="text-xl font-bold text-[#1D1D1F]">{s.value}</p>
                        </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {userShifts.length === 0 ? (
                            <div className="py-10 text-center">
                                <Calendar className="mx-auto w-8 h-8 text-black/10 mb-2" />
                                <p className="text-xs font-bold text-[#86868B]">No assigned missions found.</p>
                            </div>
                        ) : userShifts.map((s: any) => (
                            <div key={s.id} className="p-4 rounded-2xl bg-white border border-black/[0.03] shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-[#1D1D1F] mb-1">{s.site_name}</p>
                                    <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-tighter">
                                        {format(parseISO(s.start_time), 'MMM d, HH:mm')} — {format(parseISO(s.end_time), 'HH:mm')}
                                    </p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${
                                    s.status === 'completed' ? 'bg-green-50 text-green-600' :
                                    s.status === 'absent' ? 'bg-red-50 text-red-600' :
                                    'bg-blue-50 text-blue-600'
                                }`}>
                                    {s.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmAct}
        onClose={() => setConfirmAct(null)}
        onConfirm={handleConfirm}
        loading={submitting}
        title={confirmAct?.action === 'archive' ? 'Archive User' : confirmAct?.action === 'recover' ? 'Recover User' : confirmAct?.action === 'freeze' ? 'Freeze Account' : 'Unfreeze Account'}
        message={
          confirmAct?.action === 'archive'
            ? `Archive ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}? They will be soft-deleted and cannot log in. Attendance data is preserved.`
            : confirmAct?.action === 'recover'
            ? `Restore ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}'s account? They will be moved back to Active status and regain login access.`
            : confirmAct?.action === 'freeze'
            ? `Freeze ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}'s account? They will be unable to log in until unfrozen.`
            : `Unfreeze ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}'s account and restore login access?`
        }
        variant="danger"
      />
    </div>
  );
}
