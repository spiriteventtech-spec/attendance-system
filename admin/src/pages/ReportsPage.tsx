// src/pages/ReportsPage.tsx
import React, { useEffect, useState } from 'react';
import { reportsAPI, sitesAPI, usersAPI } from '../services/api';
import { FilterSelect, FilterInput, Spinner, StatCard } from '../components/ui';
import { Download, FileText, FileSpreadsheet, BarChart3, TrendingUp, Users, MapPin } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { attendanceAPI } from '../services/api';
import toast from 'react-hot-toast';

const presets = [
  { label: 'Today',        start: format(new Date(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
  { label: 'This Week',    start: format(startOfWeek(new Date()), 'yyyy-MM-dd'), end: format(endOfWeek(new Date()), 'yyyy-MM-dd') },
  { label: 'Last 7 Days',  start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
  { label: 'This Month',   start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'Last 30 Days', start: format(subDays(new Date(), 30), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
];

export default function ReportsPage() {
  const [sites,      setSites]     = useState<any[]>([]);
  const [staffList,  setStaffList] = useState<any[]>([]);
  const [loading,    setLoading]   = useState<string | null>(null);
  const [summary,    setSummary]   = useState<any>(null);
  const [aggregated, setAggregated] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [filters, setFilters] = useState({
    siteId: '', userId: '', startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    frequency: 'daily'
  });
  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));

  useEffect(() => {
    sitesAPI.list().then(r => setSites(r.data));
    usersAPI.list({ limit: 999 }).then(r => setStaffList(r.data.users));
  }, []);

  useEffect(() => { loadSummary(); }, [filters]);

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const params: any = { limit: 999 };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate)   params.endDate   = filters.endDate;
      if (filters.siteId)    params.siteId    = filters.siteId;
      if (filters.userId)    params.userId    = filters.userId;
      
      const { data } = await attendanceAPI.logs(params);
      const logs = data.logs;
      
      // Perform frontend aggregation for immediate UI feedback
      const staffMap: Record<string, any> = {};
      const siteMap: Record<string, any>  = {};
      const timeMap: Record<string, any>  = {};

      logs.forEach((l: any) => {
        const h = parseFloat(l.total_hours_worked) || 0;
        const sName = `${l.first_name} ${l.last_name}`;
        const pName = l.site_name;
        
        // Group by Frequency
        const dateObj = new Date(l.check_in_time);
        let periodKey;
        if (filters.frequency === 'daily') {
          periodKey = l.check_in_time.split('T')[0];
        } else if (filters.frequency === 'weekly') {
          const start = startOfWeek(dateObj);
          periodKey = `W/C ${format(start, 'MMM dd')}`;
        } else {
          periodKey = format(dateObj, 'MMM yyyy');
        }

        staffMap[sName] = (staffMap[sName] || 0) + h;
        siteMap[pName]  = (siteMap[pName]  || 0) + h;
        timeMap[periodKey] = (timeMap[periodKey] || 0) + h;
      });

      setAggregated({
        staff: Object.entries(staffMap).map(([name, hours]) => ({ name, hours: hours.toFixed(1) })),
        sites: Object.entries(siteMap).map(([name, hours]) => ({ name, hours: hours.toFixed(1) })),
        timeline: Object.entries(timeMap).map(([date, hours]) => ({ date, hours: parseFloat(hours.toFixed(1)) }))
          // Sort daily normally, but keep map order for others or refine
          .sort((a, b) => filters.frequency === 'daily' ? a.date.localeCompare(b.date) : 0)
      });

      setSummary({
        sessions:    logs.length,
        totalHours:  logs.reduce((s: number, l: any) => s + (parseFloat(l.total_hours_worked) || 0), 0).toFixed(1),
        totalAway:   logs.reduce((s: number, l: any) => s + (parseInt(l.total_away_minutes) || 0), 0),
        overridden:  logs.filter((l: any) => l.status === 'overridden').length,
        breaches:    logs.reduce((s: number, l: any) => s + (parseInt(l.breach_count) || 0), 0),
      });
    } catch (err) {
      toast.error('Failed to load summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const downloadReport = async (fmt: string) => {
    setLoading(fmt);
    try {
      const params: any = { format: fmt, frequency: filters.frequency };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate)   params.endDate   = filters.endDate;
      if (filters.siteId)    params.siteId    = filters.siteId;
      if (filters.userId)    params.userId    = filters.userId;

      const response = await reportsAPI.export(params);

      const mimes: Record<string, string> = {
        pdf:  'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv:  'text/csv',
      };
      const exts: Record<string, string> = { pdf: 'pdf', xlsx: 'xlsx', csv: 'csv' };

      const url = URL.createObjectURL(new Blob([response.data], { type: mimes[fmt] }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${format(new Date(), 'yyyy-MM-dd')}.${exts[fmt]}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${fmt.toUpperCase()} report downloaded`);
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">Reports & Export</h1>
        <p className="text-sm font-medium text-[#86868B] mt-1">Generate and download attendance reports</p>
      </div>

      {/* Date Presets */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
        <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-3">Quick Ranges</label>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                filters.startDate === p.start && filters.endDate === p.end
                  ? 'bg-[#007AFF] text-white shadow-sm'
                  : 'bg-black/[0.03] text-[#86868B] hover:bg-black/[0.06] hover:text-[#1D1D1F]'
              }`}
              onClick={() => setFilters(f => ({ ...f, startDate: p.start, endDate: p.end }))}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 mt-6">
          <FilterSelect label="Site / Project" value={filters.siteId} onChange={v => setFilter('siteId', v)}
            options={[{ value:'', label:'All Sites' }, ...sites.map(s => ({ value: s.id, label: s.name }))]} />
          <FilterSelect label="Staff Member" value={filters.userId} onChange={v => setFilter('userId', v)}
            options={[{ value:'', label:'All Staff' }, ...staffList.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }))]} />
          <FilterInput label="From" type="date" value={filters.startDate} onChange={v => setFilter('startDate', v)} />
          <FilterInput label="To"   type="date" value={filters.endDate}   onChange={v => setFilter('endDate', v)} />
          
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block">Calc Frequency</label>
            <div className="flex bg-black/[0.03] p-1 rounded-2xl">
              {['daily', 'weekly', 'monthly'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter('frequency', f)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                    filters.frequency === f ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Visualizer */}
      {!loadingSummary && aggregated && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-[#1D1D1F] flex items-center gap-2 tracking-tight">
                <TrendingUp className="w-5 h-5 text-[#007AFF]" /> Hour Trends ({filters.frequency})
              </h3>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aggregated.timeline}>
                  <defs>
                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007AFF" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="#86868B" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#86868B" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '16px', fontSize: '13px', fontWeight: 600, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: '#007AFF' }}
                  />
                  <Area type="monotone" dataKey="hours" stroke="#007AFF" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
            <h3 className="text-sm font-bold text-[#1D1D1F] mb-6 flex items-center gap-2 tracking-tight">
              <Users className="w-5 h-5 text-[#AF52DE]" /> Staff Allocation (Total Hours)
            </h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregated.staff} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#86868B" fontSize={11} fontWeight={600} width={100} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '16px', fontSize: '13px', fontWeight: 600, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="hours" fill="#AF52DE" radius={[0, 6, 6, 0]} barSize={24}>
                    {aggregated.staff.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#AF52DE' : '#BF5AF2'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {loadingSummary ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : summary && (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 lg:gap-6">
          <StatCard label="Sessions"     value={summary.sessions}    icon={<BarChart3 className="w-5 h-5"/>}  color="blue" />
          <StatCard label="Total Hours"  value={`${summary.totalHours}h`} icon={<FileText className="w-5 h-5"/>}    color="green" />
          <StatCard label="Away Time"    value={`${summary.totalAway}m`}  icon={<FileText className="w-5 h-5"/>}    color="amber" />
          <StatCard label="Breaches"     value={summary.breaches}    icon={<FileText className="w-5 h-5"/>}    color="red" />
          <StatCard label="Overridden"   value={summary.overridden}  icon={<FileText className="w-5 h-5"/>}    color="purple" />
        </div>
      )}

      {/* Export Buttons */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-premium">
        <h2 className="text-lg font-bold text-[#1D1D1F] mb-6 tracking-tight">Export Report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* PDF */}
          <div className="p-6 rounded-3xl bg-[#FF3B30]/5 border border-[#FF3B30]/10 hover:bg-[#FF3B30]/10 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-[#FF3B30]/10 group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6 text-[#FF3B30]" />
                </div>
                <div>
                  <p className="text-base font-bold text-[#1D1D1F]">PDF Report</p>
                  <p className="text-xs font-semibold tracking-wide text-[#86868B] uppercase">Formatted</p>
                </div>
              </div>
              <p className="text-sm font-medium text-[#86868B] mb-6 leading-relaxed">
                Generates a multi-page PDF with summary stats and a paginated attendance table. Best for sharing and archiving.
              </p>
            </div>
            <button className="w-full bg-[#FF3B30] text-white font-bold px-6 py-3.5 rounded-full hover:bg-[#FF3B30]/90 transition-colors shadow-sm flex items-center justify-center gap-2 active:scale-95" onClick={() => downloadReport('pdf')} disabled={!!loading}>
              {loading === 'pdf' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download PDF</>}
            </button>
          </div>

          {/* Excel */}
          <div className="p-6 rounded-3xl bg-[#34C759]/5 border border-[#34C759]/10 hover:bg-[#34C759]/10 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-[#34C759]/10 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-6 h-6 text-[#34C759]" />
                </div>
                <div>
                  <p className="text-base font-bold text-[#1D1D1F]">Excel Workbook</p>
                  <p className="text-xs font-semibold tracking-wide text-[#86868B] uppercase">.xlsx format</p>
                </div>
              </div>
              <p className="text-sm font-medium text-[#86868B] mb-6 leading-relaxed">
                Full dataset in a styled Excel workbook with a summary sheet and all attendance logs. Supports 10,000+ records.
              </p>
            </div>
            <button
              className="w-full bg-[#34C759] text-white font-bold px-6 py-3.5 rounded-full hover:bg-[#34C759]/90 transition-colors shadow-sm flex items-center justify-center gap-2 active:scale-95"
              onClick={() => downloadReport('xlsx')} disabled={!!loading}
            >
              {loading === 'xlsx' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download Excel</>}
            </button>
          </div>

          {/* CSV */}
          <div className="p-6 rounded-3xl bg-[#007AFF]/5 border border-[#007AFF]/10 hover:bg-[#007AFF]/10 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-2xl bg-[#007AFF]/10 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-6 h-6 text-[#007AFF]" />
                </div>
                <div>
                  <p className="text-base font-bold text-[#1D1D1F]">CSV Export</p>
                  <p className="text-xs font-semibold tracking-wide text-[#86868B] uppercase">Raw data</p>
                </div>
              </div>
              <p className="text-sm font-medium text-[#86868B] mb-6 leading-relaxed">
                Plain comma-separated values for importing into any analytics tool, database, or custom reporting system.
              </p>
            </div>
            <button className="btn-apple w-full justify-center py-3.5 text-[15px]" onClick={() => downloadReport('csv')} disabled={!!loading}>
              {loading === 'csv' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download CSV</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

