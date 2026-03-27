// src/pages/PersonalHistory.tsx
import React, { useEffect, useState } from 'react';
import { attendanceAPI } from '../services/api';
import { Badge, Modal, Spinner, EmptyState, Skeleton } from '../components/ui';
import { ClipboardList, AlertCircle, Eye, MapPin } from 'lucide-react';
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
      setTimeout(() => setLoading(false), 200);
    }
  };

  const openBreaches = async (log: Log) => {
    setViewingBreaches(log);
    const { data } = await attendanceAPI.breaches(log.id);
    setBreaches(data);
  };

  const fmt = (dt?: string) => dt ? format(new Date(dt), 'HH:mm') : 'Active';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12">
      <div className="flex justify-between items-end border-b border-black/5 pb-12">
        <div>
          <span className="text-[11px] font-bold text-[#007AFF] uppercase tracking-widest">Employee Records</span>
          <h1 className="text-4xl font-bold tracking-tight text-[#1D1D1F]">Attendance History</h1>
          <p className="text-sm text-[#86868B] mt-2">Comprehensive log of your verified workplace sessions.</p>
        </div>
        <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-[#007AFF]" />
        </div>
      </div>

      <div className="bg-white rounded-[32px] overflow-hidden shadow-premium border border-black/5">
        {loading ? (
          <div className="p-12 space-y-6">
            <Skeleton className="w-full h-12" />
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="w-full h-16" />)}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState message="No attendance history found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F5F5F7]">
                  <th className="p-6 label-apple !mb-0">Date</th>
                  <th className="p-6 label-apple !mb-0">Site / Workspace</th>
                  <th className="p-6 label-apple !mb-0">Session Times</th>
                  <th className="p-6 label-apple !mb-0">Total Hours</th>
                  <th className="p-6 label-apple !mb-0">Out-of-Range</th>
                  <th className="p-6 label-apple !mb-0">Status</th>
                  <th className="p-6 label-apple !mb-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-black/[0.01] transition-colors group">
                    <td className="p-6">
                      <span className="text-sm font-bold text-[#1D1D1F]">
                        {format(new Date(log.check_in_time), 'MMM d, yyyy')}
                      </span>
                    </td>
                    <td className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#007AFF]/5 flex items-center justify-center text-[#007AFF]">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold text-[#1D1D1F]">{log.site_name}</span>
                        </div>
                    </td>
                    <td className="p-6 text-sm text-[#86868B] font-medium">
                      {fmt(log.check_in_time)} — {fmt(log.check_out_time)}
                    </td>
                    <td className="p-6 text-sm font-bold text-[#007AFF]">
                      {log.total_hours_worked ? `${log.total_hours_worked}h` : '—'}
                    </td>
                    <td className="p-6">
                      {(log.total_away_minutes || 0) > 0 ? (
                        <span className="text-[12px] font-bold text-[#FF9500] bg-[#FF9500]/10 px-2 py-1 rounded-lg">
                          {log.total_away_minutes}m away
                        </span>
                      ) : <span className="text-[#86868B] text-xs font-medium">Inside range</span>}
                    </td>
                    <td className="p-6">
                      <Badge label={log.status} />
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setDetailLog(log)}
                          className="p-2 rounded-xl border border-black/5 hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#007AFF] transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {log.breach_count > 0 && (
                          <button 
                            onClick={() => openBreaches(log)}
                            className="p-2 rounded-xl border border-[#FF3B30]/10 bg-[#FF3B30]/5 text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-all"
                          >
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

      {/* Detail Modal */}
      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title="Session Summary">
        {detailLog && (
          <div className="p-2 space-y-8">
            <div className="grid grid-cols-2 gap-8">
                <div className="p-5 rounded-2xl bg-[#F5F5F7] border border-black/5 space-y-1">
                    <span className="label-apple">Designated Site</span>
                    <p className="text-sm font-bold text-[#1D1D1F]">{detailLog.site_name}</p>
                </div>
                <div className="p-5 rounded-2xl bg-[#F5F5F7] border border-black/5 space-y-1">
                    <span className="label-apple">Session Status</span>
                    <div><Badge label={detailLog.status} /></div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-2">
                    <h4 className="label-apple">Check-In Documentation</h4>
                    <div className="p-5 rounded-2xl bg-white border border-black/5 shadow-premium text-sm text-[#1D1D1F] leading-relaxed italic">
                        "{detailLog.check_in_note || 'No notes provided'}"
                    </div>
                </div>

                {detailLog.check_out_note && (
                    <div className="space-y-2">
                        <h4 className="label-apple">Check-Out Documentation</h4>
                        <div className="p-5 rounded-2xl bg-white border border-black/5 shadow-premium text-sm text-[#1D1D1F] leading-relaxed italic">
                            "{detailLog.check_out_note}"
                        </div>
                    </div>
                )}

                {detailLog.override_comment && (
                    <div className="p-5 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/10 space-y-2">
                        <h4 className="label-apple !text-[#FF9500]">Administrative Note</h4>
                        <p className="text-sm text-[#86868B] leading-relaxed">
                            {detailLog.override_comment}
                        </p>
                    </div>
                )}
            </div>
            
            <button 
               onClick={() => setDetailLog(null)}
               className="btn-apple w-full py-4 bg-[#F5F5F7] text-[#1D1D1F]"
            >
                Close Summary
            </button>
          </div>
        )}
      </Modal>

      {/* Breach Modal */}
      <Modal open={!!viewingBreaches} onClose={() => setViewingBreaches(null)} title="Location Discrepancies">
        {viewingBreaches && (
          <div className="p-2 space-y-6">
            <div className="p-5 rounded-2xl bg-[#FF3B30]/5 border border-[#FF3B30]/10">
                <p className="text-sm text-[#86868B] text-center leading-relaxed">
                    The following segments were recorded while your device was outside the designated workplace geofence.
                </p>
            </div>
            
            <div className="space-y-3">
                {breaches.length === 0 ? (
                  <p className="text-sm text-[#86868B] text-center py-6">Loading discrepancy records...</p>
                ) : (
                  <div className="space-y-3">
                    {breaches.map((b: any, i: number) => (
                      <div key={b.id} className="p-5 rounded-2xl bg-white border border-black/5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#FF3B30] uppercase tracking-widest">Instance #{i + 1}</span>
                          {b.duration_away_minutes && (
                            <span className="text-[10px] font-bold text-[#FF3B30] bg-[#FF3B30]/10 px-2 py-0.5 rounded-full">{b.duration_away_minutes} min duration</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[9px] font-bold text-[#86868B] uppercase mb-0.5">Left Range</p>
                                <p className="text-xs font-bold text-[#1D1D1F]">{format(new Date(b.exit_time), 'HH:mm:ss')}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-[#86868B] uppercase mb-0.5">Returned</p>
                                <p className="text-xs font-bold text-[#34C759]">
                                    {b.return_time ? format(new Date(b.return_time), 'HH:mm:ss') : 'Still Away'}
                                </p>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
            
            <button 
               onClick={() => setViewingBreaches(null)}
               className="btn-apple w-full py-4 bg-[#F5F5F7] text-[#1D1D1F]"
            >
                Dismiss
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
