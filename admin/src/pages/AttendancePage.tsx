// src/pages/AttendancePage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { attendanceAPI, sitesAPI, usersAPI } from '../services/api';
import { Badge, Modal, Spinner, FilterInput, FilterSelect, EmptyState } from '../components/ui';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Log {
  id: string; user_id: string; site_id: string;
  first_name: string; last_name: string; email: string; site_name: string;
  check_in_time: string; check_out_time?: string;
  check_in_note: string; check_out_note?: string;
  total_hours_worked?: number; total_away_minutes?: number;
  status: string; override_comment?: string;
  breach_count: number;
}

export default function AttendancePage() {
  const [logs,       setLogs]      = useState<Log[]>([]);
  const [total,      setTotal]     = useState(0);
  const [page,       setPage]      = useState(1);
  const [loading,    setLoading]   = useState(true);
  const [sites,      setSites]     = useState<any[]>([]);
  const [staffList,  setStaffList] = useState<any[]>([]);

  // Filters
  const [filters, setFilters] = useState({
    siteId: '', userId: '', startDate: '', endDate: '',
    status: '', minHours: '',
  });
  const setFilter = (key: string, val: string) => setFilters(f => ({ ...f, [key]: val }));

  // Modals
  const [overrideLog,   setOverrideLog]  = useState<Log | null>(null);
  const [breachLog,     setBreachLog]    = useState<Log | null>(null);
  const [breaches,      setBreaches]     = useState<any[]>([]);
  const [overrideForm,  setOverrideForm] = useState({ checkInTime: '', checkOutTime: '', adminComment: '' });
  const [submitting,    setSubmitting]   = useState(false);
  const [detailLog,     setDetailLog]    = useState<Log | null>(null);

  useEffect(() => {
    sitesAPI.list().then(r => setSites(r.data));
    usersAPI.list({ limit: 999, status: 'active' }).then(r => setStaffList(r.data.users));
  }, []);

  useEffect(() => { fetchLogs(); }, [page, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const { data } = await attendanceAPI.logs(params);
      setLogs(data.logs);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const openBreaches = async (log: Log) => {
    setBreachLog(log);
    const { data } = await attendanceAPI.breaches(log.id);
    setBreaches(data);
  };

  const openOverride = (log: Log) => {
    setOverrideLog(log);
    setOverrideForm({
      checkInTime:  log.check_in_time  ? format(new Date(log.check_in_time), "yyyy-MM-dd'T'HH:mm") : '',
      checkOutTime: log.check_out_time ? format(new Date(log.check_out_time), "yyyy-MM-dd'T'HH:mm") : '',
      adminComment: '',
    });
  };

  const submitOverride = async () => {
    if (!overrideForm.adminComment.trim()) { toast.error('Admin comment is required'); return; }
    setSubmitting(true);
    try {
      await attendanceAPI.override({
        logId: overrideLog!.id,
        checkInTime:  overrideForm.checkInTime  || undefined,
        checkOutTime: overrideForm.checkOutTime || undefined,
        adminComment: overrideForm.adminComment,
      });
      toast.success('Record overridden successfully');
      setOverrideLog(null);
      fetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Override failed');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / 25);
  const fmt = (dt?: string) => dt ? format(new Date(dt), 'MMM d, HH:mm') : '—';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Attendance</h1>
          <p className="text-base text-[#86868B] font-medium mt-1">{total} session records</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="premium-card">
        <div className="flex items-center gap-2 mb-6">
          <SlidersHorizontal className="w-4 h-4 text-[#007AFF]" />
          <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">Search Filters</span>
        </div>
        <div className="flex flex-wrap gap-6">
          <FilterSelect
            label="Location"
            value={filters.siteId}
            onChange={v => setFilter('siteId', v)}
            options={[{ value: '', label: 'All Sites' }, ...sites.map(s => ({ value: s.id, label: s.name }))]}
          />
          <FilterSelect
            label="Member"
            value={filters.userId}
            onChange={v => setFilter('userId', v)}
            options={[{ value: '', label: 'All Staff' }, ...staffList.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }))]}
          />
          <FilterInput label="Start Date" type="date" value={filters.startDate} onChange={v => setFilter('startDate', v)} />
          <FilterInput label="End Date"   type="date" value={filters.endDate}   onChange={v => setFilter('endDate', v)} />
          <FilterSelect
            label="Filter Status"
            value={filters.status}
            onChange={v => setFilter('status', v)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'active',     label: 'Active' },
              { value: 'completed',  label: 'Completed' },
              { value: 'overridden', label: 'Overridden' },
            ]}
          />
          <div className="flex items-end">
            <button className="btn-apple-secondary shadow-none px-6" onClick={() => { setFilters({ siteId:'', userId:'', startDate:'', endDate:'', status:'', minHours:'' }); setPage(1); }}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="premium-card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState message="No attendance records match your criteria." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Staff Member</th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Assigned Site</th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Check-In</th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Check-Out</th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Hours</th>
                  <th className="px-6 py-4 text-left text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Status</th>
                  <th className="px-6 py-4 text-right text-[11px] font-bold text-[#86868B] uppercase tracking-widest border-b border-black/[0.03]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.02]">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-[#F5F5F7] transition-all duration-200 group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#007AFF]/5 flex items-center justify-center text-[#007AFF] text-[10px] font-bold">
                          {log.first_name[0]}{log.last_name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-[#1D1D1F] text-sm tracking-tight">{log.first_name} {log.last_name}</p>
                          <p className="text-[#86868B] text-[11px] font-medium">{log.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-semibold text-[#1D1D1F] tracking-tight">{log.site_name}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs font-medium text-[#1D1D1F]">{fmt(log.check_in_time)}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs font-medium text-[#1D1D1F]">{fmt(log.check_out_time)}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-[#007AFF]">
                        {log.total_hours_worked ? `${log.total_hours_worked}h` : '—'}
                      </span>
                      {(log.total_away_minutes || 0) > 30 && (
                        <p className="text-[10px] text-[#FF3B30] font-bold mt-0.5">-{log.total_away_minutes}m away</p>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <Badge label={log.status} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="btn-apple-secondary py-1 px-3 text-[11px] font-bold shadow-none" onClick={() => setDetailLog(log)}>
                          Notes
                        </button>
                        <button className="btn-apple py-1 px-3 text-[11px] font-bold shadow-none" onClick={() => openOverride(log)}>
                          Override
                        </button>
                        {log.breach_count > 0 && (
                          <button className="p-1.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20 transition-all" onClick={() => openBreaches(log)}>
                            <AlertCircle className="w-4 h-4" />
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-[13px] font-medium text-[#86868B]">
            Page <span className="text-[#1D1D1F] font-bold">{page}</span> of <span className="text-[#1D1D1F] font-bold">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-black/[0.03] text-[#86868B] hover:text-[#1D1D1F] transition-all disabled:opacity-30" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-black/[0.03] text-[#86868B] hover:text-[#1D1D1F] transition-all disabled:opacity-30" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={!!overrideLog} onClose={() => setOverrideLog(null)} title="Record Override">
        {overrideLog && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/10 text-sm font-medium text-[#FF9500] leading-relaxed">
              Updating historical records documentation for <strong>{overrideLog.first_name} {overrideLog.last_name}</strong>.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="telemetry-label">Check-In</label>
                <input type="datetime-local" className="input-apple" value={overrideForm.checkInTime}
                  onChange={e => setOverrideForm(f => ({ ...f, checkInTime: e.target.value }))} />
              </div>
              <div>
                <label className="telemetry-label">Check-Out</label>
                <input type="datetime-local" className="input-apple" value={overrideForm.checkOutTime}
                  onChange={e => setOverrideForm(f => ({ ...f, checkOutTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="telemetry-label">Audit Comment</label>
              <textarea
                className="input-apple min-h-[100px] resize-none"
                placeholder="Required for compliance logging..."
                value={overrideForm.adminComment}
                onChange={e => setOverrideForm(f => ({ ...f, adminComment: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button className="btn-apple-secondary" onClick={() => setOverrideLog(null)}>Cancel</button>
              <button className="btn-apple bg-[#FF9500]" onClick={submitOverride} disabled={submitting}>
                {submitting ? <Spinner size="sm" /> : 'Confirm Override'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title="Session Transcripts">
        {detailLog && (
          <div className="space-y-8">
            <div className="space-y-2">
              <label className="telemetry-label">Check-In Notes</label>
              <div className="p-5 rounded-2xl bg-[#F5F5F7] text-sm text-[#1D1D1F] font-medium leading-relaxed italic border border-black/[0.02]">
                "{detailLog.check_in_note || 'No transcript available'}"
              </div>
            </div>
            {detailLog.check_out_note && (
              <div className="space-y-2">
                <label className="telemetry-label">Check-Out Notes</label>
                <div className="p-5 rounded-2xl bg-[#F5F5F7] text-sm text-[#1D1D1F] font-medium leading-relaxed italic border border-black/[0.02]">
                  "{detailLog.check_out_note}"
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
