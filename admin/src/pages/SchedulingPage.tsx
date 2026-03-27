// src/pages/SchedulingPage.tsx
import React, { useEffect, useState } from 'react';
import { 
  shiftsAPI, sitesAPI, usersAPI 
} from '../services/api';
import { 
  Calendar, Clock, User, MapPin, Plus, Trash2, 
  ChevronLeft, ChevronRight, Filter, AlertCircle, CheckCircle2
} from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { LoadingScreen } from '../components/ui/LoadingScreen';

export default function SchedulingPage() {
  const [shifts,   setShifts]   = useState<any[]>([]);
  const [sites,    setSites]    = useState<any[]>([]);
  const [staff,    setStaff]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters & State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [newShift, setNewShift] = useState({
    userId: '', siteId: '', 
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '08:00', endTime: '17:00'
  });

  const loadData = async () => {
    try {
      const [sRes, siRes, stRes] = await Promise.all([
        shiftsAPI.list(),
        sitesAPI.list(),
        usersAPI.list({ limit: 999 })
      ]);
      setShifts(sRes.data);
      setSites(siRes.data);
      setStaff(stRes.data.users || []);
    } catch (err) {
      console.error('Failed to load scheduling data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const start = new Date(`${newShift.date}T${newShift.startTime}:00`).toISOString();
      const end   = new Date(`${newShift.date}T${newShift.endTime}:00`).toISOString();
      
      await shiftsAPI.create({
        userId: newShift.userId,
        siteId: newShift.siteId,
        startTime: start,
        endTime: end
      });
      
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm('Permanently decommission this assignment?')) return;
    try {
      await shiftsAPI.delete(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <LoadingScreen />;

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-700">
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-black text-[#1D1D1F] tracking-tight">Mission Control // Roster</h1>
          <p className="text-[#86868B] font-medium mt-1 uppercase tracking-widest text-[10px]">Strategic Force Deployment</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-[#007AFF] text-white px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-[#0062CC] transition-all shadow-lg shadow-blue-500/20 active:scale-95"
        >
          <Plus size={18} strokeWidth={3} />
          ASSIGN MISSION
        </button>
      </header>

      {/* Week View Navigation */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-sm mb-8">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-[#1D1D1F]">{format(selectedDate, 'MMMM yyyy')}</h2>
                <div className="flex bg-black/[0.04] p-1 rounded-xl">
                    <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-[#86868B]"><ChevronLeft size={16}/></button>
                    <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-[#86868B]"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#86868B]">
                <Filter size={14} />
                LIVE_VIEW_MODE
            </div>
        </div>

        <div className="grid grid-cols-7 gap-4">
            {weekDays.map(day => {
                const dayShifts = shifts.filter(s => isSameDay(parseISO(s.start_time), day));
                const active = isSameDay(day, new Date());
                
                return (
                    <div key={day.toString()} className={`min-h-[160px] rounded-2xl border transition-all p-3 ${active ? 'bg-blue-50/30 border-blue-100 shadow-inner' : 'bg-black/[0.01] border-black/[0.03] hover:border-black/10'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-[#007AFF]' : 'text-[#86868B]'}`}>
                                {format(day, 'EEE')}
                            </span>
                            <span className={`text-sm font-bold ${active ? 'text-[#1D1D1F]' : 'text-[#1D1D1F]'}`}>
                                {format(day, 'd')}
                            </span>
                        </div>
                        
                        <div className="space-y-2">
                            {dayShifts.map(shift => (
                                <div key={shift.id} className="group relative bg-white border border-black/[0.05] p-2 rounded-xl shadow-sm hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-[10px] font-bold text-[#1D1D1F] truncate">{shift.first_name} {shift.last_name[0]}.</p>
                                        <button 
                                            onClick={() => handleDeleteShift(shift.id)}
                                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 transition-all"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <p className="text-[9px] font-bold text-[#86868B] truncate mb-1 flex items-center gap-1">
                                        <MapPin size={8} /> {shift.site_name}
                                    </p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[8px] font-black text-[#86868B]">
                                            {format(parseISO(shift.start_time), 'HH:mm')}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-tight ${
                                            shift.status === 'completed' ? 'bg-green-50 text-green-600' :
                                            shift.status === 'absent' ? 'bg-red-50 text-red-600' :
                                            shift.status === 'in_progress' ? 'bg-orange-50 text-orange-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>
                                            {shift.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-white/20">
                <div className="p-8">
                    <h3 className="text-xl font-black text-[#1D1D1F] mb-1">New Assignment</h3>
                    <p className="text-sm text-[#86868B] font-medium mb-8 uppercase tracking-widest text-[10px]">Strategic Deployment Protocol</p>
                    
                    <form onSubmit={handleCreateShift} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-[#86868B] ml-2">Operator</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868B] w-4 h-4" />
                                <select 
                                    required
                                    className="w-full bg-black/[0.04] border-none rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold text-[#1D1D1F] focus:ring-2 ring-[#007AFF] outline-none appearance-none"
                                    value={newShift.userId}
                                    onChange={e => setNewShift({...newShift, userId: e.target.value})}
                                >
                                    <option value="">SELECT_OPERATOR</option>
                                    {staff.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-[#86868B] ml-2">Objective Site</label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868B] w-4 h-4" />
                                <select 
                                    required
                                    className="w-full bg-black/[0.04] border-none rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold text-[#1D1D1F] focus:ring-2 ring-[#007AFF] outline-none appearance-none"
                                    value={newShift.siteId}
                                    onChange={e => setNewShift({...newShift, siteId: e.target.value})}
                                >
                                    <option value="">SELECT_SITE</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#86868B] ml-2">Date</label>
                                <input 
                                    type="date" 
                                    required
                                    className="w-full bg-black/[0.04] border-none rounded-2xl py-3.5 px-4 text-sm font-bold text-[#1D1D1F] focus:ring-2 ring-[#007AFF] outline-none"
                                    value={newShift.date}
                                    onChange={e => setNewShift({...newShift, date: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-[#86868B] ml-2">Time Window</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="time" 
                                        required
                                        className="flex-1 bg-black/[0.04] border-none rounded-2xl py-3.5 px-4 text-xs font-bold text-[#1D1D1F] focus:ring-2 ring-[#007AFF] outline-none"
                                        value={newShift.startTime}
                                        onChange={e => setNewShift({...newShift, startTime: e.target.value})}
                                    />
                                    <span className="text-[#86868B] font-black text-xs">—</span>
                                    <input 
                                        type="time" 
                                        required
                                        className="flex-1 bg-black/[0.04] border-none rounded-2xl py-3.5 px-4 text-xs font-bold text-[#1D1D1F] focus:ring-2 ring-[#007AFF] outline-none"
                                        value={newShift.endTime}
                                        onChange={e => setNewShift({...newShift, endTime: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="flex-1 bg-black/[0.04] text-[#1D1D1F] py-4 rounded-2xl font-bold text-sm hover:bg-black/[0.08] transition-all active:scale-95"
                            >
                                ABORT
                            </button>
                            <button 
                                type="submit"
                                disabled={submitting}
                                className="flex-1 bg-[#007AFF] text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#0062CC] transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-95"
                            >
                                {submitting ? 'DEPLOYING...' : 'CONFIRM MISSION'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
