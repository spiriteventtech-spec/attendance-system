// src/pages/StaffPage.tsx
import React, { useEffect, useState } from 'react';
import { usersAPI, authAPI, shiftsAPI, securityAPI } from '../services/api';
import { Badge, Modal, Spinner, FilterInput, FilterSelect, ConfirmDialog, EmptyState, Skeleton } from '../components/ui';
import { UserPlus, Search, Lock, Archive, Edit2, RotateCcw, Eye, Smartphone, Calendar } from 'lucide-react';
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
      toast.success(`User ${action}d`);
      setConfirmAct(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally { setSubmitting(false); }
  };

  const statusColor: Record<string, string> = {
    active: 'text-green-400', frozen: 'text-sky-400', archived: 'text-gray-500',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">Staff Management</h1>
          <p className="text-sm font-medium text-[#86868B] mt-1">{total} total users</p>
        </div>
        <button className="btn-apple bg-[#007AFF] text-white font-bold" onClick={() => setCreateModal(true)}>
          <UserPlus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
            <input className="input pl-11 bg-black/[0.03] border-transparent" placeholder="Name or email…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatus}
          options={[{ value:'', label:'All Status' }, { value:'active', label:'Active' },
                    { value:'frozen', label:'Frozen' }, { value:'archived', label:'Archived' }]} />
        <FilterSelect label="Role" value={roleFilter} onChange={setRole}
          options={[{ value:'', label:'All Roles' }, { value:'staff', label:'Staff' },
                    { value:'admin', label:'Admin' }]} />
        <button className="btn-apple bg-black/5 text-[#86868B] font-bold" onClick={() => { setSearch(''); setStatus(''); setRole(''); }}>
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[24px] overflow-hidden border border-black/5 shadow-premium">
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="w-full h-12 mb-4" />
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="w-full h-16" />)}
          </div>
        ) : users.length === 0 ? (
          <EmptyState message="No users match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F5F5F7] border-b border-black/5">
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider">Name</th>
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider">Email</th>
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider">Role</th>
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider">Joined</th>
                  <th className="py-4 px-6 text-xs font-bold text-[#86868B] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#F5F5F7]/50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] text-sm font-bold flex-shrink-0">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <span className="font-bold text-[#1D1D1F]">
                          {u.first_name} {u.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-[#86868B]">{u.email}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-block px-2.5 py-1 text-[11px] font-bold uppercase rounded-full tracking-wider ${u.role === 'admin' ? 'bg-[#AF52DE]/10 text-[#AF52DE]' : 'bg-[#007AFF]/10 text-[#007AFF]'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-bold tracking-wide capitalize ${u.status === 'active' ? 'text-[#34C759]' : u.status === 'frozen' ? 'text-[#FF9500]' : 'text-[#86868B]'}`}>
                        {u.status === 'frozen' ? '🔒 Frozen' : u.status === 'archived' ? '📦 Archived' : '● Active'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-[#86868B]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 rounded-xl bg-black/5 hover:bg-black/10 text-[#86868B] transition-colors" title="View Stats" onClick={() => openStats(u)}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-xl bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] transition-colors" title="Edit" onClick={() => setEditUser({ ...u })}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-xl bg-[#AF52DE]/10 hover:bg-[#AF52DE]/20 text-[#AF52DE] transition-colors" title="Reset Password" onClick={() => setResetUser(u)}>
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {u.device_fingerprint && (
                          <button className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 transition-colors" title="Reset Device Binding" onClick={() => handleResetDevice(u.id)}>
                            <Smartphone className="w-4 h-4" />
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button className="px-3 py-2 rounded-xl bg-[#FF9500]/10 hover:bg-[#FF9500]/20 text-[#FF9500] text-xs font-bold transition-colors" title="Freeze"
                            onClick={() => setConfirmAct({ user: u, action: 'freeze' })}>
                            <Lock className="w-4 h-4 inline mr-1" /> Freeze
                          </button>
                        )}
                        {u.status === 'frozen' && (
                          <button className="px-3 py-2 rounded-xl bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] text-xs font-bold transition-colors" title="Unfreeze"
                            onClick={() => setConfirmAct({ user: u, action: 'unfreeze' })}>
                            Unfreeze
                          </button>
                        )}
                        {u.status !== 'archived' && u.role !== 'admin' && (
                          <button className="p-2 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#FF3B30] transition-colors" title="Archive"
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
        title={confirmAct?.action === 'archive' ? 'Archive User' : confirmAct?.action === 'freeze' ? 'Freeze Account' : 'Unfreeze Account'}
        message={
          confirmAct?.action === 'archive'
            ? `Archive ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}? They will be soft-deleted and cannot log in. Attendance data is preserved.`
            : confirmAct?.action === 'freeze'
            ? `Freeze ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}'s account? They will be unable to log in until unfrozen.`
            : `Unfreeze ${confirmAct?.user?.first_name} ${confirmAct?.user?.last_name}'s account and restore login access?`
        }
        variant="danger"
      />
    </div>
  );
}
