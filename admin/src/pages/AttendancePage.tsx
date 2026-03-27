// src/pages/AttendancePage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  useReactTable 
} from '@tanstack/react-table';
import { attendanceAPI, sitesAPI, usersAPI } from '../services/api';
import { Badge, Modal, Spinner, FilterInput, EmptyState } from '../components/ui';
import { SlidersHorizontal, ChevronLeft, ChevronRight, AlertCircle, ChevronDown, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface Log {
  id: string; user_id: string; site_id: string;
  first_name: string; last_name: string; email: string; site_name: string;
  check_in_time: string; check_out_time?: string;
  check_in_note: string; check_out_note?: string;
  total_hours_worked?: number; total_away_minutes?: number;
  status: string; override_comment?: string;
  breach_count: number;
}

// ── Filter Chip (Google Style) ────────────────────────────────
const FilterChip = ({ 
  label, value, active, children, onClear 
}: { 
  label: string; value: string; active?: boolean; 
  children: React.ReactNode; onClear: () => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handle = (e: MouseEvent) => { if (open && !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div 
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-full border text-[13px] font-medium transition-all cursor-pointer",
          active 
            ? "bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]/20 text-[var(--brand-primary)]" 
            : "bg-white border-black/[0.05] text-[var(--text-secondary)] hover:bg-black/[0.02]"
        )}
      >
        <span>{label}: <span className={active ? "font-bold" : ""}>{value}</span></span>
        <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
        {active && (
           <button 
             onClick={(e) => { e.stopPropagation(); onClear(); }}
             className="hover:text-[var(--brand-primary)]/60"
           >
             <X className="w-3 h-3" />
           </button>
        )}
      </div>
      
      <AnimatePresence>
        {open && (
           <motion.div 
             initial={{ opacity: 0, y: 10, scale: 0.95 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={{ opacity: 0, y: 10, scale: 0.95 }}
             className="absolute top-full left-0 mt-2 z-40 glass-panel !p-0 min-w-[240px] overflow-hidden shadow-2xl"
           >
             {children}
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Attendance Table Component ───────────────────────────────
const columnHelper = createColumnHelper<Log>();

const AttendanceTable = ({ data, onOverride, onNotes, onBreaches }: any) => {
  const columns = useMemo(() => [
    columnHelper.accessor(row => `${row.first_name} ${row.last_name}`, {
      id: 'staff',
      header: 'Staff Member',
      cell: info => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--brand-primary)]/5 flex items-center justify-center text-[var(--brand-primary)] text-[10px] font-bold">
            {info.row.original.first_name[0]}{info.row.original.last_name[0]}
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)] text-sm tracking-tight">{info.getValue()}</p>
            <p className="text-[var(--text-secondary)] text-[11px] font-medium">{info.row.original.email}</p>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('site_name', {
      header: 'Site',
      cell: info => <span className="text-sm font-semibold text-[var(--text-primary)]">{info.getValue()}</span>,
    }),
    columnHelper.accessor('check_in_time', {
      header: 'Check-In',
      cell: info => {
        const val = info.getValue();
        return <span className="text-xs font-medium text-[var(--text-primary)]">{val ? format(new Date(val), 'MMM d, HH:mm') : '—'}</span>;
      },
    }),
    columnHelper.accessor('check_out_time', {
      header: 'Check-Out',
      cell: info => {
        const val = info.getValue();
        return <span className="text-xs font-medium text-[var(--text-primary)]">{val ? format(new Date(val), 'MMM d, HH:mm') : '—'}</span>;
      },
    }),
    columnHelper.accessor('total_hours_worked', {
      header: 'Hours',
      cell: info => (
        <div>
          <span className="text-sm font-bold text-[var(--brand-primary)]">{info.getValue() ? `${info.getValue()}h` : '—'}</span>
          {(info.row.original.total_away_minutes || 0) > 30 && (
            <p className="text-[9px] text-[var(--brand-danger)] font-bold">-{info.row.original.total_away_minutes}m deviation</p>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => <Badge label={info.getValue()} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: info => (
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="btn-apple-secondary py-1 px-3 text-[11px] font-bold shadow-none" onClick={() => onNotes(info.row.original)}>Notes</button>
          <button className="btn-apple py-1 px-3 text-[11px] font-bold shadow-none" onClick={() => onOverride(info.row.original)}>Override</button>
          {info.row.original.breach_count > 0 && (
            <button className="p-1.5 rounded-full bg-[var(--brand-danger)]/10 text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/20 transition-all" onClick={() => onBreaches(info.row.original)}>
              <AlertCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    }),
  ], [onOverride, onNotes, onBreaches]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-white/80 backdrop-blur-md">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="px-6 py-4 text-left text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest border-b border-black/[0.03]">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-black/[0.02]">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-[var(--bg-main)] transition-all duration-200 group">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-6 py-5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

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
  const setFilter = (key: string, val: string) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

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

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Attendance</h1>
          <p className="text-base text-[var(--text-secondary)] font-medium mt-1">{total} session records</p>
        </div>
      </div>

      {/* Filter Chips (Google Style) */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 mr-4">
          <SlidersHorizontal className="w-4 h-4 text-[var(--brand-primary)]" />
          <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Filters</span>
        </div>
        
        <FilterChip 
          label="Site" 
          value={sites.find(s => s.id === filters.siteId)?.name || 'All Sites'} 
          active={!!filters.siteId}
          onClear={() => setFilter('siteId', '')}
        >
          <div className="p-2 space-y-1">
            <button key="all" className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-black/[0.03]" onClick={() => setFilter('siteId', '')}>All Sites</button>
            {sites.map(s => (
              <button key={s.id} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-black/[0.03]" onClick={() => setFilter('siteId', s.id)}>{s.name}</button>
            ))}
          </div>
        </FilterChip>

        <FilterChip 
          label="Status" 
          value={filters.status || 'All Statuses'} 
          active={!!filters.status}
          onClear={() => setFilter('status', '')}
        >
          <div className="p-2 space-y-1">
            {['All Statuses', 'Active', 'Completed', 'Overridden'].map(s => (
              <button key={s} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-black/[0.03]" onClick={() => setFilter('status', s === 'All Statuses' ? '' : s.toLowerCase())}>{s}</button>
            ))}
          </div>
        </FilterChip>

        <FilterChip 
          label="Date Range" 
          value={filters.startDate ? `${filters.startDate} → ${filters.endDate || 'Now'}` : 'Anytime'} 
          active={!!filters.startDate}
          onClear={() => { setFilter('startDate', ''); setFilter('endDate', ''); }}
        >
          <div className="p-4 space-y-4 w-64" onClick={(e) => e.stopPropagation()}>
            <FilterInput label="Start" type="date" value={filters.startDate} onChange={v => setFilter('startDate', v)} />
            <FilterInput label="End" type="date" value={filters.endDate} onChange={v => setFilter('endDate', v)} />
          </div>
        </FilterChip>
      </div>

      {/* TanStack Table (Frictionless, Blurred Header) */}
      <div className="premium-card !p-0 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState message="No attendance records match your criteria." />
        ) : (
          <AttendanceTable data={logs} onOverride={openOverride} onNotes={setDetailLog} onBreaches={openBreaches} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">
            Page <span className="text-[var(--text-primary)] font-bold">{page}</span> of <span className="text-[var(--text-primary)] font-bold">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-black/[0.03] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all disabled:opacity-30 shadow-sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-black/[0.03] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all disabled:opacity-30 shadow-sm" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={!!overrideLog} onClose={() => setOverrideLog(null)} title="Record Override">
        {overrideLog && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-[var(--brand-warning)]/5 border border-[var(--brand-warning)]/10 text-sm font-medium text-[var(--brand-warning)] leading-relaxed">
              Updating historical records documentation for <strong>{overrideLog.first_name} {overrideLog.last_name}</strong>.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Check-In</label>
                <input type="datetime-local" className="input-apple" value={overrideForm.checkInTime}
                  onChange={e => setOverrideForm(f => ({ ...f, checkInTime: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Check-Out</label>
                <input type="datetime-local" className="input-apple" value={overrideForm.checkOutTime}
                  onChange={e => setOverrideForm(f => ({ ...f, checkOutTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Audit Comment</label>
              <textarea
                className="input-apple min-h-[100px] resize-none"
                placeholder="Required for compliance logging..."
                value={overrideForm.adminComment}
                onChange={e => setOverrideForm(f => ({ ...f, adminComment: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button className="btn-apple-secondary" onClick={() => setOverrideLog(null)}>Cancel</button>
              <button className="btn-apple bg-[var(--brand-warning)]" onClick={submitOverride} disabled={submitting}>
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
              <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Check-In Notes</label>
              <div className="p-5 rounded-2xl bg-[var(--bg-main)] text-sm text-[var(--text-primary)] font-medium leading-relaxed italic border border-black/[0.02]">
                "{detailLog.check_in_note || 'No transcript available'}"
              </div>
            </div>
            {detailLog.check_out_note && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Check-Out Notes</label>
                <div className="p-5 rounded-2xl bg-[var(--bg-main)] text-sm text-[var(--text-primary)] font-medium leading-relaxed italic border border-black/[0.02]">
                  "{detailLog.check_out_note}"
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!breachLog} onClose={() => setBreachLog(null)} title="Security Incidents" wide>
        <div className="space-y-4">
           {breaches.length === 0 ? <EmptyState message="No perimeter breaches recorded for this session." /> : (
             <div className="grid gap-4">
               {breaches.map((b: any, idx: number) => (
                 <div key={idx} className="p-4 rounded-2xl bg-[var(--brand-danger)]/5 border border-[var(--brand-danger)]/10 flex justify-between items-center">
                   <div className="flex items-center gap-4">
                     <AlertCircle className="w-5 h-5 text-[var(--brand-danger)]" />
                     <div>
                       <p className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-tight">Perimeter Breach</p>
                       <p className="text-[11px] text-[var(--text-secondary)] font-medium">{format(new Date(b.timestamp), 'MMM d, HH:mm:ss')}</p>
                     </div>
                   </div>
                   <div className="text-right">
                     <p className="text-xs font-black text-[var(--brand-danger)]">{Math.round(b.distance_meters)}M DEVIATION</p>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </Modal>
    </div>
  );
}
