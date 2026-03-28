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
import { authAPI, attendanceAPI, sitesAPI, announcementsAPI, securityAPI } from '../services/api';
import { StatCard, StatWidget, Spinner, Badge, Modal, EmptyState, Skeleton, SelfieCapture } from '../components/ui';
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
  const [showSelfie, setShowSelfie] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInForm, setCheckInForm] = useState({ siteId: '', note: '' });
  
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
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
      toast.error('Failed to upload file', { id: loadingToast });
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

  const triggerCheckIn = () => {
    if (!checkInForm.siteId) return toast.error('Please select a site');
    setShowCheckIn(false);
    setShowSelfie(true);
  };

  const handleSelfieCapture = async (base64Image: string) => {
    setShowSelfie(false);
    setCheckingIn(true);
    const loadingToast = toast.loading('Verifying identity...');
    
    try {
      // 1. Verify Identity
      const { data: verifyData } = await securityAPI.checkinSelfie(base64Image);
      
      if (!verifyData.passed) {
        toast.error('Identity verification failed. Please ensure your face is clearly visible.', { id: loadingToast });
        setCheckingIn(false);
        return;
      }
      
      if (verifyData.skipped) {
        toast.success(verifyData.message || 'Identity verified (Skipped)', { id: loadingToast });
      } else {
        toast.success(`Identity verified! (${verifyData.confidence}%)`, { id: loadingToast });
      }

      // 2. Fetch Geolocation and Check-In
      toast.loading('Acquiring secure GPS lock...', { id: loadingToast });
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
      );
      
      await attendanceAPI.checkin({
        siteId: checkInForm.siteId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        note: checkInForm.note
      });
      
      toast.success('CHECK-IN INITIALIZED', { id: loadingToast });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'CHECK-IN FAILED', { id: loadingToast });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
      ).catch(() => ({ coords: { latitude: undefined, longitude: undefined } } as any));

      await attendanceAPI.checkout({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        note: checkOutNote
      });

      toast.success('SHIFT COMPLETED');
      setShowCheckOut(false);
      setCheckOutNote('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'CHECK-OUT_FAILED');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) return (
    <div className="p-8 max-w-7xl mx-auto space-y-12">
      <div className="flex justify-between items-end border-b border-black/5 pb-12">
        <div className="flex gap-8 items-center">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-64 h-10" />
            <Skeleton className="w-48 h-4" />
          </div>
        </div>
        <Skeleton className="w-40 h-12" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        <Skeleton className="h-[400px] rounded-3xl" />
        <Skeleton className="xl:col-span-2 h-[400px] rounded-3xl" />
      </div>
    </div>
  );

  return (
    <div className="p-6 lg:p-10 space-y-12 h-screen overflow-y-auto">
      {/* PROFESSIONAL HEADER */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-end border-b border-black/5 pb-12"
      >
        <div className="flex gap-8 items-center">
            <div className="relative group">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="w-24 h-24 rounded-full border-2 border-white p-1 shadow-premium bg-white overflow-hidden relative"
               >
                 {user?.avatarUrl ? (
                   <img src={`${(import.meta.env.VITE_API_BASE_URL || '').replace('/api', '')}${user.avatarUrl}`} className="w-full h-full rounded-full object-cover" />
                 ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center text-white text-3xl font-bold italic">
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
               <div className="absolute -bottom-1 -right-1 p-1.5 bg-white rounded-full border border-black/5 shadow-sm">
                  <Activity className="w-3 h-3 text-[#34C759] animate-pulse" />
               </div>
            </div>
            <div>
                <span className="text-[11px] font-bold text-[#007AFF] uppercase tracking-widest">Active Workplace Session</span>
                <h1 className="text-4xl font-bold tracking-tight text-[#1D1D1F]">
                    {user?.firstName} <span className="text-[#86868B]">{user?.lastName}</span>
                </h1>
                <div className="flex gap-4 mt-3">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                        <span className="text-[11px] font-bold text-[#34C759] uppercase tracking-widest">Identity Verified</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#86868B]">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">{format(new Date(), 'PP')}</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex gap-4">
            {active ? (
                <button 
                  onClick={() => setShowCheckOut(true)}
                  className="btn-apple bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white min-w-[200px]"
                >
                    <LogOut className="w-4 h-4" /> End Shift
                </button>
            ) : (
                <button 
                  onClick={() => setShowCheckIn(true)}
                  className="btn-apple bg-[#007AFF] hover:bg-[#007AFF]/90 text-white min-w-[200px]"
                >
                    <LogIn className="w-4 h-4" /> Check In
                </button>
            )}
        </div>
      </motion.div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatWidget 
          label="Total Sessions" 
          value={stats?.total_sessions || "0"} 
          icon={<History className="w-5 h-5"/>} 
          color="#007AFF"
        />
        <StatWidget 
          label="Hours Worked" 
          value={`${parseFloat(stats?.total_hours || '0').toFixed(1)}h`} 
          icon={<Clock className="w-5 h-5"/>} 
          color="#34C759"
        />
        <StatWidget 
          label="Out-of-Range" 
          value={`${stats?.total_away_minutes || 0}m`} 
          icon={<MapPin className="w-5 h-5"/>} 
          color="#FF9500"
        />
        <StatWidget 
          label="Adjustments" 
          value={stats?.overridden_count || "0"} 
          icon={<AlertTriangle className="w-5 h-5"/>} 
          color="#5856D6"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        {/* LEFT COLUMN: ACTIVE STATUS & BROADCASTS */}
        <div className="space-y-12">
            <div className="bg-white rounded-[32px] p-8 shadow-premium border border-black/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                    <Radar className="w-24 h-24" />
                </div>
                <span className="label-apple mb-6 block">Real-Time Status</span>
                {active ? (
                    <div className="space-y-6">
                        <div className="p-6 rounded-[20px] bg-[#007AFF]/5 border border-[#007AFF]/10">
                            <span className="text-[10px] font-bold text-[#007AFF] uppercase tracking-widest mb-1 block">Active Site</span>
                            <p className="text-xl font-bold text-[#1D1D1F] tracking-tight">{active.site_name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-[#F5F5F7] border border-black/5 space-y-1">
                                <span className="text-[9px] font-bold text-[#86868B] uppercase">Start Time</span>
                                <p className="text-sm font-semibold text-[#1D1D1F]">{format(new Date(active.check_in_time), 'HH:mm:ss')}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-[#F5F5F7] border border-black/5 space-y-1">
                                <span className="text-[9px] font-bold text-[#86868B] uppercase">Away Time</span>
                                <p className="text-sm font-semibold text-[#FF9500]">{active.total_away_minutes || 0} min</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 justify-center py-2 text-[#007AFF]">
                            <div className="w-2 h-2 rounded-full bg-[#007AFF] animate-pulse" />
                            <span className="text-[10px] font-bold tracking-widest uppercase">Monitoring Active</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 opacity-60">
                        <div className="w-16 h-16 rounded-full border border-black/5 flex items-center justify-center bg-[#F5F5F7]">
                           <MapPin className="w-7 h-7 text-[#86868B]" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-[#1D1D1F]">Ready to Check In</p>
                            <p className="text-[11px] text-[#86868B] mt-2 max-w-[200px] leading-relaxed">Please check in to a site to begin your shift and enable location tracking.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* COMMUNICATIONS SECTION */}
            <div className="bg-white rounded-[32px] p-8 shadow-premium border border-black/5">
                <div className="flex items-center justify-between mb-8">
                    <span className="label-apple">Announcements</span>
                    <Badge label="Company Wide" />
                </div>
                {announcements.length === 0 ? (
                    <EmptyState message="No current announcements" />
                ) : (
                   <div className="space-y-4">
                        {announcements.slice(0, 3).map(a => (
                            <div key={a.id} className="p-5 rounded-2xl bg-[#F5F5F7] border border-black/5 hover:border-[#007AFF]/30 transition-all group cursor-pointer">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge label={a.priority} variant={a.priority.toLowerCase()} />
                                    <span className="text-[10px] font-semibold text-[#86868B]">{format(new Date(a.created_at), 'HH:mm')}</span>
                                </div>
                                <h4 className="text-sm font-bold text-[#1D1D1F] group-hover:text-[#007AFF] transition-colors">{a.title}</h4>
                                <p className="text-[12px] text-[#86868B] mt-2 line-clamp-2 leading-relaxed italic">"{a.message}"</p>
                            </div>
                        ))}
                   </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: RECENT LOGS */}
        <div className="xl:col-span-2">
            <div className="bg-white rounded-[32px] h-full flex flex-col overflow-hidden shadow-premium border border-black/5">
                <div className="p-8 border-b border-black/5 flex items-center justify-between">
                    <div>
                        <span className="label-apple">Activity History</span>
                        <h2 className="text-lg font-bold text-[#1D1D1F] tracking-tight">Recent Sessions</h2>
                    </div>
                    <button className="text-[12px] font-bold text-[#007AFF] hover:underline">View All History</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {history.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#F5F5F7]">
                                    <th className="p-6 label-apple !mb-0">Site</th>
                                    <th className="p-6 label-apple !mb-0">Time</th>
                                    <th className="p-6 label-apple !mb-0">Duration</th>
                                    <th className="p-6 label-apple !mb-0">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                                {history.map(log => (
                                    <motion.tr 
                                      key={log.id} 
                                      whileHover={{ backgroundColor: 'rgba(0,0,0,0.01)' }}
                                      className="group transition-colors"
                                    >
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-[#F5F5F7] border border-black/5 flex items-center justify-center text-[#007AFF]">
                                                    <MapPin className="w-5 h-5" />
                                                </div>
                                                <span className="text-sm font-bold text-[#1D1D1F] tracking-tight">{log.site_name}</span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <p className="text-sm font-semibold text-[#1D1D1F]">
                                                {format(new Date(log.check_in_time), 'MMM d')}
                                            </p>
                                            <p className="text-[10px] text-[#86868B] font-medium">
                                                {format(new Date(log.check_in_time), 'HH:mm')} - {log.check_out_time ? format(new Date(log.check_out_time), 'HH:mm') : 'Active'}
                                            </p>
                                        </td>
                                        <td className="p-6">
                                            <span className="text-sm font-bold text-[#007AFF]">{log.total_hours_worked || '0.0'}h</span>
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

      {/* CHECK-IN MODERN MODAL */}
      <Modal open={showCheckIn} onClose={() => setShowCheckIn(false)} title="Initialize Shift">
        <div className="p-2 space-y-8">
            <div className="p-6 rounded-[20px] bg-[#007AFF]/5 border border-[#007AFF]/10 flex gap-4 items-start">
                <ShieldAlert className="w-6 h-6 text-[#007AFF] mt-1" />
                <div>
                    <h4 className="label-apple !text-[#007AFF] mb-1">Location Verification</h4>
                    <p className="text-[12px] text-[#86868B] leading-relaxed">Your location will be verified against the assigned site geofence. Please ensure you are within the designated area.</p>
                </div>
            </div>
            
            <div className="space-y-6">
                <div>
                    <label className="label-apple mb-2 block">Assigned Site</label>
                    <select 
                       className="input-apple"
                       value={checkInForm.siteId} 
                       onChange={e => setCheckInForm(f => ({ ...f, siteId: e.target.value }))}
                    >
                        <option value="">Select a site...</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label-apple mb-2 block">Notes</label>
                    <textarea 
                        className="input-apple h-32 resize-none" 
                        placeholder="Enter any shift notes or objectives..."
                        value={checkInForm.note}
                        onChange={e => setCheckInForm(f => ({ ...f, note: e.target.value }))}
                    />
                </div>
            </div>

            <div className="flex gap-4 pt-4">
                <button className="flex-1 py-4 text-sm font-bold text-[#86868B] hover:text-[#1D1D1F]" onClick={() => setShowCheckIn(false)}>Cancel</button>
                <button 
                  disabled={checkingIn}
                  className="btn-apple bg-[#007AFF] text-white flex-1 py-4 shadow-xl shadow-[#007AFF]/20"
                  onClick={triggerCheckIn}
                >
                    {checkingIn ? <Spinner size="sm" /> : 'Confirm Check-In'}
                </button>
            </div>
        </div>
      </Modal>

      {/* CHECK-OUT MODERN MODAL */}
      <Modal open={showCheckOut} onClose={() => setShowCheckOut(false)} title="End Your Shift">
        <div className="p-2 space-y-8">
            <div className="p-6 rounded-[20px] bg-[#FF3B30]/5 border border-[#FF3B30]/10">
                <p className="text-[12px] text-[#86868B] leading-relaxed text-center">Please provide a summary of your activities before completing your shift.</p>
            </div>
            <textarea 
               className="input-apple h-48 resize-none py-4"
               placeholder="Shift summary..."
               value={checkOutNote}
               onChange={e => setCheckOutNote(e.target.value)}
            />
            <button 
              disabled={checkingOut}
              className="btn-apple w-full py-5 bg-[#FF3B30] text-white shadow-xl shadow-[#FF3B30]/20 flex items-center justify-center gap-2" 
              onClick={handleCheckOut}
            >
                {checkingOut ? <Spinner size="sm" /> : 'Confirm Check-Out'}
            </button>
        </div>
      </Modal>

      {/* SELFIE CAPTURE OVERLAY */}
      <AnimatePresence>
        {showSelfie && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <SelfieCapture 
              onCapture={handleSelfieCapture} 
              onCancel={() => setShowSelfie(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
