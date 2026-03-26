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
      toast.error('Failed to load telemetry summary');
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
        <h1 className="text-xl font-bold text-[#F1F5F9]">Reports & Export</h1>
        <p className="text-sm text-steel-400">Generate and download attendance reports</p>
      </div>

      {/* Date Presets */}
      <div className="card p-4">
        <label className="label mb-3 block">Quick Ranges</label>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filters.startDate === p.start && filters.endDate === p.end
                  ? 'bg-brand text-white'
                  : 'bg-[#0F172A] border border-[#334155] text-steel-400 hover:border-brand/40 hover:text-[#F1F5F9]'
              }`}
              onClick={() => setFilters(f => ({ ...f, startDate: p.start, endDate: p.end }))}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          <FilterSelect label="Site / Project" value={filters.siteId} onChange={v => setFilter('siteId', v)}
            options={[{ value:'', label:'All Sites' }, ...sites.map(s => ({ value: s.id, label: s.name }))]} />
          <FilterSelect label="Staff Member" value={filters.userId} onChange={v => setFilter('userId', v)}
            options={[{ value:'', label:'All Staff' }, ...staffList.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }))]} />
          <FilterInput label="From" type="date" value={filters.startDate} onChange={v => setFilter('startDate', v)} />
          <FilterInput label="To"   type="date" value={filters.endDate}   onChange={v => setFilter('endDate', v)} />
          
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label className="label">Calc Frequency</label>
            <div className="flex bg-[#0F172A] border border-[#334155] rounded-xl p-1">
              {['daily', 'weekly', 'monthly'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter('frequency', f)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    filters.frequency === f ? 'bg-brand text-black' : 'text-steel-400 hover:text-white'
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
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand" /> Hour Trends ({filters.frequency})
              </h3>
            </div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aggregated.timeline}>
                  <defs>
                    <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F5FF" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00F5FF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                    itemStyle={{ color: '#00F5FF' }}
                  />
                  <Area type="monotone" dataKey="hours" stroke="#00F5FF" fillOpacity={1} fill="url(#colorHours)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-[#F1F5F9] mb-6 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" /> Staff Allocation (Total Hours)
            </h3>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregated.staff} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={10} width={100} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                  />
                  <Bar dataKey="hours" fill="#A855F7" radius={[0, 4, 4, 0]} barSize={20}>
                    {aggregated.staff.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#A855F7' : '#8B5CF6'} />
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
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : summary && (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard label="Sessions"     value={summary.sessions}    icon={<BarChart3 className="w-5 h-5"/>}  color="blue" />
          <StatCard label="Total Hours"  value={`${summary.totalHours}h`} icon={<FileText className="w-5 h-5"/>}    color="green" />
          <StatCard label="Away Time"    value={`${summary.totalAway}m`}  icon={<FileText className="w-5 h-5"/>}    color="amber" />
          <StatCard label="Breaches"     value={summary.breaches}    icon={<FileText className="w-5 h-5"/>}    color="red" />
          <StatCard label="Overridden"   value={summary.overridden}  icon={<FileText className="w-5 h-5"/>}    color="purple" />
        </div>
      )}

      {/* Export Buttons */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-[#F1F5F9] mb-5">Export Report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* PDF */}
          <div className="p-5 rounded-xl bg-[#0F172A] border border-[#334155] hover:border-red-500/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <FileText className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#F1F5F9]">PDF Report</p>
                <p className="text-xs text-steel-400">Formatted for printing</p>
              </div>
            </div>
            <p className="text-xs text-steel-400 mb-4">
              Generates a multi-page PDF with summary stats and a paginated attendance table. Best for sharing and archiving.
            </p>
            <button className="btn-danger w-full justify-center" onClick={() => downloadReport('pdf')} disabled={!!loading}>
              {loading === 'pdf' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download PDF</>}
            </button>
          </div>

          {/* Excel */}
          <div className="p-5 rounded-xl bg-[#0F172A] border border-[#334155] hover:border-green-500/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <FileSpreadsheet className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#F1F5F9]">Excel Spreadsheet</p>
                <p className="text-xs text-steel-400">.xlsx with formatting</p>
              </div>
            </div>
            <p className="text-xs text-steel-400 mb-4">
              Full dataset in a styled Excel workbook with a summary sheet and all attendance logs. Supports 10,000+ records.
            </p>
            <button
              className="w-full justify-center bg-green-600/20 text-green-400 border border-green-600/30 font-semibold px-4 py-2 rounded-lg hover:bg-green-600/30 transition-colors flex items-center gap-2"
              onClick={() => downloadReport('xlsx')} disabled={!!loading}
            >
              {loading === 'xlsx' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download Excel</>}
            </button>
          </div>

          {/* CSV */}
          <div className="p-5 rounded-xl bg-[#0F172A] border border-[#334155] hover:border-blue-500/30 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#F1F5F9]">CSV Export</p>
                <p className="text-xs text-steel-400">Raw data for analysis</p>
              </div>
            </div>
            <p className="text-xs text-steel-400 mb-4">
              Plain comma-separated values for importing into any analytics tool, database, or custom reporting system.
            </p>
            <button className="btn-primary w-full justify-center" onClick={() => downloadReport('csv')} disabled={!!loading}>
              {loading === 'csv' ? <Spinner size="sm" /> : <><Download className="w-4 h-4" /> Download CSV</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
