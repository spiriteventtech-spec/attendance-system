// src/pages/PersonalDashboard.tsx
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  History, 
  MapPin, 
  LogIn, 
  LogOut, 
  Megaphone, 
  ShieldAlert,
  Navigation,
  Activity,
  Radar,
  User as UserIcon
} from 'lucide-react';
import { authAPI, attendanceAPI, sitesAPI, announcementsAPI } from '../services/api';
import { StatCard, Spinner, Badge, Modal, EmptyState } from '../components/ui';
import { PremiumFloatingCard } from '../components/ui/PremiumFloatingCard';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const Odometer = ({ value }: { value: string | number }) => (
  <motion.span
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    key={value}
    className="font-mono inline-block"
  >
    {value}
  </motion.span>
);

export default function PersonalDashboard() {
  const { user, refresh } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInForm, setCheckInForm] = useState({ siteId: '', note: '' });
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [checkOutNote, setCheckOutNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    sitesAPI.listPublic().then(res => setSites(res.data));
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loadingToast = toast.loading('Uploading biometric signature...');
    try {
      const { data } = await authAPI.uploadAvatar(file);
      await authAPI.updateProfile({ avatarUrl: data.avatarUrl });
      await refresh();
      toast.success('IDENTITY_AVATAR_UPDATED', { id: loadingToast });
      loadData();
    } catch (err: any) {
      toast.error('UPLOAD_PROTOCOL_FAILURE', { id: loadingToast });
    }
  };

  const loadData = async () => {
    try {
      const [statsRes, activeRes, historyRes, annRes] = await Promise.all([
        authAPI.stats(),
        attendanceAPI.active(),
        attendanceAPI.history({ limit: 5 }),
        announcementsAPI.list(),
      ]);
      setStats(statsRes.data);
      setActive(activeRes.data);
      setHistory(historyRes.data);
      setAnnouncements(annRes.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!checkInForm.siteId) return toast.error('PROTOCOL ERROR: Site ID Required');
    setCheckingIn(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })
      );
      await attendanceAPI.checkin({
        siteId: checkInForm.siteId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        note: checkInForm.note
      });
      toast.success('CHECK-IN INITIALIZED');
      setShowCheckIn(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'GEOLOCATION_VALIDATION_FAILED');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#252634]"><Spinner size="lg" /></div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12">
      {/* AEROSPACE HEADER */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-end border-b border-white/[0.05] pb-12"
      >
        <div className="flex gap-8 items-center">
            <div className="relative group">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="w-24 h-24 rounded-full border-2 border-brand-purple p-1 shadow-[0_0_20px_rgba(168,85,247,0.3)] bg-[#2D2E3D] overflow-hidden relative"
               >
                 {user?.avatarUrl ? (
                   <img src={`${(import.meta.env.VITE_API_BASE_URL || '').replace('/api', '')}${user.avatarUrl}`} className="w-full h-full rounded-full object-cover" />
                 ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center text-white text-3xl font-bold italic">
                        {user?.firstName?.[0]}
                    </div>
                 )}
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <UserIcon className="w-6 h-6 text-white" />
                 </div>
               </button>
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept="image/*"
                 onChange={handleAvatarUpload}
               />
               <div className="absolute -bottom-1 -right-1 p-1.5 bg-[#252634] rounded-full border border-brand-purple">
                  <Activity className="w-3 h-3 text-brand-purple animate-pulse" />
               </div>
            </div>
            <div>
                <span className="telemetry-label text-brand-cyan">Operator Identity Detected</span>
                <h1 className="text-4xl font-bold tracking-tighter text-white">
                    {user?.firstName} <span className="text-white/40">{user?.lastName}</span>
                </h1>
                <div className="flex gap-4 mt-3">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-brand-green" />
                        <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest">Biometrics Verified</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{format(new Date(), 'PP')}</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex gap-4">
            {active ? (
                <button 
                  onClick={() => setShowCheckOut(true)}
                  className="btn-command border-brand-red/30 text-brand-red hover:bg-brand-red/10 animate-pulse"
                >
                    <LogOut className="w-4 h-4" /> End Mission Shift
                </button>
            ) : (
                <button 
                  onClick={() => setShowCheckIn(true)}
                  className="btn-command shadow-neon-cyan"
                >
                    <LogIn className="w-4 h-4" /> Initialize Shift
                </button>
            )}
        </div>
      </motion.div>

      {/* TELEMETRY GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <PremiumFloatingCard 
          title="Missions Completed" 
          value={stats?.total_sessions || "0"} 
          gradient="purple-blue" 
          icon={<History className="w-6 h-6"/>} 
          delay={0}
        />
        <PremiumFloatingCard 
          title="Flight Hours" 
          value={`${parseFloat(stats?.total_hours || '0').toFixed(1)}h`} 
          gradient="orange-pink" 
          icon={<Clock className="w-6 h-6"/>} 
          delay={0.1}
        />
        <PremiumFloatingCard 
          title="Divergence" 
          value={`${stats?.total_away_minutes || 0}m`} 
          gradient="purple-blue" 
          icon={<Navigation className="w-6 h-6"/>} 
          delay={0.2}
        />
        <PremiumFloatingCard 
          title="Overrides" 
          value={stats?.overridden_count || "0"} 
          gradient="orange-pink" 
          icon={<ShieldAlert className="w-6 h-6"/>} 
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        {/* LEFT COLUMN: ACTIVE STATUS & BROADCASTS */}
        <div className="space-y-12">
            <div className="bg-[#2D2E3D] rounded-3xl p-8 shadow-soft-3d border border-white/[0.03] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Radar className="w-24 h-24" />
                </div>
                <span className="telemetry-label mb-6">Real-Time Core Status</span>
                {active ? (
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-brand-purple/10 to-brand-blue/10 border border-brand-purple/20">
                            <span className="text-[9px] font-bold text-brand-purple uppercase tracking-widest mb-1 block">Active Coordinates</span>
                            <p className="text-xl font-bold text-white tracking-tight">{active.site_name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-[#252634] border border-white/5 space-y-1">
                                <span className="text-[8px] font-bold text-white/40 uppercase">T-Start</span>
                                <p className="text-sm font-mono text-white">{format(new Date(active.check_in_time), 'HH:mm:ss')}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[#252634] border border-white/5 space-y-1">
                                <span className="text-[8px] font-bold text-white/40 uppercase">Drift Alert</span>
                                <p className="text-sm font-mono text-brand-orange">{active.total_away_minutes || 0}min</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 justify-center py-2 text-brand-purple">
                            <div className="status-pulse-cyan !bg-brand-purple after:bg-brand-purple" />
                            <span className="text-[10px] font-bold tracking-[0.3em] uppercase animate-pulse">Telemetry Nominal</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 opacity-40">
                        <div className="w-16 h-16 rounded-full border-2 border-white/10 flex items-center justify-center">
                           <ShieldAlert className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-white">System Idle</p>
                            <p className="text-[10px] text-white/40 mt-2 max-w-[200px] leading-relaxed">Check-in required to initialize background GPS monitoring.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* COMMUNICATIONS TERMINAL */}
            <div className="bg-[#2D2E3D] rounded-3xl p-8 shadow-soft-3d border border-white/[0.03]">
                <div className="flex items-center justify-between mb-8">
                    <span className="telemetry-label text-brand-purple">Incoming Directives</span>
                    <Badge label="Secure Channel" />
                </div>
                {announcements.length === 0 ? (
                    <EmptyState message="No active directives" />
                ) : (
                   <div className="space-y-4">
                        {announcements.slice(0, 3).map(a => (
                            <div key={a.id} className="p-4 rounded-xl bg-[#252634] border border-white/5 hover:border-brand-purple/30 transition-all group">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge label={a.priority} />
                                    <span className="text-[9px] font-mono text-white/20">{format(new Date(a.created_at), 'HH:mm')}</span>
                                </div>
                                <h4 className="text-xs font-bold text-white group-hover:text-brand-purple transition-colors">{a.title}</h4>
                                <p className="text-[11px] text-white/40 mt-2 line-clamp-2 leading-relaxed italic">"{a.message}"</p>
                            </div>
                        ))}
                   </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: RECENT FLIGHT LOGS */}
        <div className="xl:col-span-2">
            <div className="bg-[#2D2E3D] rounded-3xl h-full flex flex-col overflow-hidden shadow-soft-3d border border-white/[0.03]">
                <div className="p-8 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent flex items-center justify-between">
                    <div>
                        <span className="telemetry-label text-brand-purple">Mission History</span>
                        <h2 className="text-sm font-bold tracking-tight">Recent Execution Logs</h2>
                    </div>
                    <button className="btn-command border-brand-purple/30 text-brand-purple">Archive History</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {history.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02]">
                                    <th className="p-6 telemetry-label">Mission ID / Site</th>
                                    <th className="p-6 telemetry-label">Temporal Window</th>
                                    <th className="p-6 telemetry-label">Metrics</th>
                                    <th className="p-6 telemetry-label">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {history.map(log => (
                                    <motion.tr 
                                      key={log.id} 
                                      whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                                      className="group transition-colors"
                                    >
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-[#252634] border border-white/5 flex items-center justify-center text-brand-purple group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all">
                                                    <Navigation className="w-5 h-5" />
                                                </div>
                                                <span className="text-sm font-bold text-white tracking-tight">{log.site_name}</span>
                                            </div>
                                        </td>
                                        <td className="p-6 space-y-1">
                                            <p className="text-xs font-mono text-white/60">
                                                {format(new Date(log.check_in_time), 'MMM d, HH:mm')}
                                            </p>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest italic">
                                                - {log.check_out_time ? format(new Date(log.check_out_time), 'HH:mm') : 'ACTIVE'}
                                            </p>
                                        </td>
                                        <td className="p-6">
                                            <span className="text-sm font-bold font-mono text-brand-purple">{log.total_hours_worked || '0.0'}h</span>
                                        </td>
                                        <td className="p-6">
                                            <Badge label={log.status} />
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* TERMINAL OVERLAYS (MODALS) */}
      <Modal open={showCheckIn} onClose={() => setShowCheckIn(false)} title="Initialize Operations">
        <div className="space-y-8">
            <div className="p-6 rounded-2xl bg-brand-cyan/5 border border-brand-cyan/10 flex gap-4 items-start">
                <ShieldAlert className="w-6 h-6 text-brand-cyan mt-1" />
                <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-2">Pre-Flight Authorization</h4>
                    <p className="text-[10px] text-white/50 leading-relaxed uppercase tracking-widest">Your spatial coordinates will be locked against the PostGIS geofence. Unauthorized deviations will trigger automated breach logs.</p>
                </div>
            </div>
            
            <div className="space-y-6">
                <div>
                    <label className="telemetry-label">Deployment Sector</label>
                    <select 
                       className="input-terminal" 
                       value={checkInForm.siteId} 
                       onChange={e => setCheckInForm(f => ({ ...f, siteId: e.target.value }))}
                    >
                        <option value="">SCANNING FOR STATIONS...</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id} className="bg-void">{s.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="telemetry-label">Directive Summary (Shift Note)</label>
                    <textarea 
                        className="input-terminal h-32 resize-none" 
                        placeholder="ENTER MISSION OBJECTIVES..."
                        value={checkInForm.note}
                        onChange={e => setCheckInForm(f => ({ ...f, note: e.target.value }))}
                    />
                </div>
            </div>

            <div className="flex gap-4 pt-4">
                <button className="flex-1 p-4 text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white" onClick={() => setShowCheckIn(false)}>Abort</button>
                <button 
                  disabled={checkingIn}
                  className="btn-command flex-1 py-4 animate-shimmer"
                  onClick={handleCheckIn}
                >
                    {checkingIn ? <Spinner size="sm" /> : 'Execute Check-In Protocol'}
                </button>
            </div>
        </div>
      </Modal>

      {/* Check-Out Modal (Placeholder logic for style) */}
      <Modal open={showCheckOut} onClose={() => setShowCheckOut(false)} title="Debrief Protocol">
        <div className="space-y-8">
            <textarea 
               className="input-terminal h-48"
               placeholder="ENTER POST-MISSION SUMMARY..."
               value={checkOutNote}
               onChange={e => setCheckOutNote(e.target.value)}
            />
            <button className="btn-command w-full py-5 border-brand-red/40 text-brand-red" onClick={() => setShowCheckOut(false)}>
                End Mission Operations
            </button>
        </div>
      </Modal>
    </div>
  );
}
