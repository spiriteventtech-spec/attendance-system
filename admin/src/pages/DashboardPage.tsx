// src/pages/DashboardPage.tsx
import React, { useEffect, useState } from 'react';
import { Users, Clock, AlertTriangle, CheckCircle2, TrendingUp, MapPin } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { attendanceAPI, usersAPI, locationAPI } from '../services/api';
import { StatCard, StatWidget, Spinner } from '../components/ui';
import { format, subDays } from 'date-fns';
import clsx from 'clsx';

export default function DashboardPage() {
  const [stats,    setStats]   = useState<any>(null);
  const [chart,    setChart]   = useState<any[]>([]);
  const [live,     setLive]    = useState<any[]>([]);
  const [loading,  setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [liveRes, logsRes, usersRes] = await Promise.all([
        locationAPI.live(),
        attendanceAPI.logs({ limit: 500, startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd') }),
        usersAPI.list({ status: 'active', limit: 999 }),
      ]);

      const liveData  = liveRes.data;
      const logs      = logsRes.data.logs;
      const users     = usersRes.data.users;
      setLive(liveData);

      // Build daily chart for last 7 days
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(new Date(), i), 'MMM d');
        days[d] = 0;
      }
      logs.forEach((l: any) => {
        const d = format(new Date(l.check_in_time), 'MMM d');
        if (days[d] !== undefined) days[d]++;
      });
      setChart(Object.entries(days).map(([date, count]) => ({ date, count })));

      // Aggregate stats
      const today = logs.filter((l: any) =>
        format(new Date(l.check_in_time), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
      );
      const breached = liveData.filter((u: any) => !u.is_inside).length;

      setStats({
        checkedInNow:   liveData.length,
        breachedNow:    breached,
        todaySessions:  today.length,
        activeStaff:    users.length,
        totalHoursWeek: logs.reduce((s: number, l: any) => s + (parseFloat(l.total_hours_worked) || 0), 0).toFixed(1),
        overridesWeek:  logs.filter((l: any) => l.status === 'overridden').length,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Overview</h1>
          <p className="text-base text-[#86868B] font-medium mt-1">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatWidget 
          label="Live In Field" 
          value={stats.checkedInNow} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          color="var(--brand-success)" 
        />
        <StatWidget 
          label="Geofence Alerts" 
          value={stats.breachedNow} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          color="var(--brand-danger)" 
        />
        <StatWidget 
          label="Today's Sessions" 
          value={stats.todaySessions} 
          icon={<Clock className="w-5 h-5" />} 
          color="var(--brand-primary)" 
        />
        <StatWidget 
          label="Adjustments" 
          value={stats.overridesWeek} 
          icon={<MapPin className="w-5 h-5" />} 
          color="var(--brand-warning)" 
        />
      </div>

      {/* Charts + Live Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Bar Chart */}
        <div className="premium-card xl:col-span-3">
          <h2 className="text-lg font-bold text-[#1D1D1F] tracking-tight mb-8">Activity — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart} barSize={32}>
              <XAxis dataKey="date" tick={{ fill: '#86868B', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{ fill: '#86868B', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} allowDecimals={false} dx={-10} />
              <Tooltip
                contentStyle={{ background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontSize: 13, fontWeight: 600 }}
                cursor={{ fill: 'rgba(0,0,0,0.03)', radius: 8 }}
              />
              <Bar dataKey="count" radius={[8, 8, 8, 8]}>
                {chart.map((_, i) => (
                  <Cell key={i} fill={i === chart.length - 1 ? '#007AFF' : '#E5E5EA'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Live Feed */}
        <div className="premium-card xl:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold text-[#1D1D1F] tracking-tight">Live Status</h2>
            <span className="px-2.5 py-1 bg-[#34C759]/10 text-[#34C759] text-[11px] font-bold rounded-full">{live.length} ACTIVE</span>
          </div>
          {live.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#86868B]">
              <div className="text-4xl mb-4 grayscale opacity-30">☁️</div>
              <p className="text-sm font-medium">No active sessions at the moment.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
              {live.map((u: any) => (
                <div key={u.user_id} className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#F5F5F7] border border-transparent hover:border-[#007AFF]/10 transition-all">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${u.is_inside ? 'bg-[#34C759]' : 'bg-[#FF3B30]'} shadow-sm`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1D1D1F] truncate leading-none mb-1">
                      {u.first_name} {u.last_name}
                    </p>
                    <p className="text-[11px] text-[#86868B] font-medium truncate italic">{u.site_name}</p>
                  </div>
                  <div className={clsx(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    u.is_inside ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#FF3B30]/10 text-[#FF3B30]"
                  )}>
                    {u.is_inside ? 'ON SITE' : 'OFF SITE'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
