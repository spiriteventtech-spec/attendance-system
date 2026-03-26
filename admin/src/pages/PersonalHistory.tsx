// src/pages/PersonalHistory.tsx
import React, { useEffect, useState } from 'react';
import { attendanceAPI } from '../services/api';
import { Badge, Modal, Spinner, FilterInput, EmptyState } from '../components/ui';
import { ClipboardList, ChevronLeft, ChevronRight, AlertCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface Log {
  id: string;
  site_id: string;
  site_name: string;
  check_in_time: string;
  check_out_time?: string;
  check_in_note: string;
  check_out_note?: string;
  total_hours_worked?: number;
  total_away_minutes?: number;
  status: string;
  override_comment?: string;
  breach_count: number;
}

export default function PersonalHistory() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLog, setDetailLog] = useState<Log | null>(null);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [viewingBreaches, setViewingBreaches] = useState<Log | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await attendanceAPI.history();
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  const openBreaches = async (log: Log) => {
    setViewingBreaches(log);
    const { data } = await attendanceAPI.breaches(log.id);
    setBreaches(data);
  };

  const fmt = (dt?: string) => dt ? format(new Date(dt), 'MMM d, HH:mm') : '—';

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#F1F5F9]">My History</h1>
        <p className="text-sm text-steel-400">View your past attendance records and sessions</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState message="No attendance history found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0F172A]">
                  <th className="table-th text-xs">Date</th>
                  <th className="table-th text-xs">Site / Project</th>
                  <th className="table-th text-xs">Check-In</th>
                  <th className="table-th text-xs">Check-Out</th>
                  <th className="table-th text-xs">Hours</th>
                  <th className="table-th text-xs">Away</th>
                  <th className="table-th text-xs">Status</th>
                  <th className="table-th text-xs text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-[#253352]/30 transition-colors group">
                    <td className="table-td text-xs font-semibold text-[#F1F5F9]">
                      {format(new Date(log.check_in_time), 'MMM d, yyyy')}
                    </td>
                    <td className="table-td text-xs">{log.site_name}</td>
                    <td className="table-td text-xs font-mono">{fmt(log.check_in_time)}</td>
                    <td className="table-td text-xs font-mono">{fmt(log.check_out_time)}</td>
                    <td className="table-td">
                      <span className="text-sm font-bold text-brand">
                        {log.total_hours_worked ? `${log.total_hours_worked}h` : '—'}
                      </span>
                    </td>
                    <td className="table-td text-xs">
                      {(log.total_away_minutes || 0) > 0 ? (
                        <span className="text-amber-400 font-semibold">{log.total_away_minutes}m</span>
                      ) : <span className="text-steel-400">—</span>}
                    </td>
                    <td className="table-td">
                      <Badge label={log.status} />
                    </td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="btn-ghost text-xs py-1 px-2" onClick={() => setDetailLog(log)}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {log.breach_count > 0 && (
                          <button className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={() => openBreaches(log)}>
                            <AlertCircle className="w-3 h-3" />
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

      {/* Detail Modal */}
      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title="Session Details">
        {detailLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Site</label>
                <p className="text-sm text-[#F1F5F9]">{detailLog.site_name}</p>
              </div>
              <div>
                <label className="label">Status</label>
                <Badge label={detailLog.status} />
              </div>
            </div>
            <div>
              <label className="label">Check-In Note</label>
              <p className="text-sm text-[#CBD5E1] bg-[#0F172A] rounded-lg p-3 border border-[#334155]">
                {detailLog.check_in_note}
              </p>
            </div>
            {detailLog.check_out_note && (
              <div>
                <label className="label">Check-Out Note</label>
                <p className="text-sm text-[#CBD5E1] bg-[#0F172A] rounded-lg p-3 border border-[#334155]">
                  {detailLog.check_out_note}
                </p>
              </div>
            )}
            {detailLog.override_comment && (
              <div>
                <label className="label text-amber-400">Admin Remark</label>
                <p className="text-sm text-amber-300 bg-amber-500/5 rounded-lg p-3 border border-amber-500/20">
                  {detailLog.override_comment}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Breach Modal */}
      <Modal open={!!viewingBreaches} onClose={() => setViewingBreaches(null)} title="Time Away from Site">
        {viewingBreaches && (
          <div className="space-y-3">
            {breaches.length === 0 ? (
              <p className="text-sm text-steel-400 text-center py-6">No breach records found.</p>
            ) : (
              <div className="space-y-2">
                {breaches.map((b: any, i: number) => (
                  <div key={b.id} className="p-3 rounded-lg bg-[#0F172A] border border-[#334155]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-red-400">Away #{i + 1}</span>
                      {b.duration_away_minutes && (
                        <span className="badge bg-red-500/10 text-red-400">{b.duration_away_minutes} min</span>
                      )}
                    </div>
                    <p className="text-xs text-steel-400">
                      Left: <span className="text-[#F1F5F9] font-mono">{format(new Date(b.exit_time), 'HH:mm:ss')}</span>
                    </p>
                    <p className="text-xs text-steel-400">
                      Returned: <span className="text-[#F1F5F9] font-mono">
                        {b.return_time ? format(new Date(b.return_time), 'HH:mm:ss') : '⚠️ Not yet returned'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
