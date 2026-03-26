// src/pages/AnnouncementsPage.tsx
import React, { useEffect, useState } from 'react';
import { announcementsAPI, usersAPI, sitesAPI } from '../services/api';
import { Spinner, Badge, Modal } from '../components/ui';
import { Megaphone, Send, Trash2, AlertTriangle, Info, Bell, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: 'general' | 'important' | 'urgent';
  created_at: string;
  first_name: string;
  last_name: string;
}

const priorityConfig = {
  general:   { icon: <Info className="w-4 h-4" />,      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  important: { icon: <Bell className="w-4 h-4" />,      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  urgent:    { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'general',
    targetType: 'all', // 'all', 'site', 'user'
    targetUserId: '',
    targetSiteId: ''
  });

  const fetchData = async () => {
    try {
      const [annRes, userRes, siteRes] = await Promise.all([
        announcementsAPI.list(),
        usersAPI.list(),
        sitesAPI.list(),
      ]);
      setAnnouncements(Array.isArray(annRes.data) ? annRes.data : []);
      setUsers(Array.isArray(userRes.data.users) ? userRes.data.users : []);
      setSites(Array.isArray(siteRes.data) ? siteRes.data : []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await announcementsAPI.create({
        ...formData,
        targetUserId: (formData.targetType === 'user' && formData.targetUserId) ? formData.targetUserId : null,
        targetSiteId: (formData.targetType === 'site' && formData.targetSiteId) ? formData.targetSiteId : null,
      } as any);
      toast.success('Announcement sent!');
      setModal(false);
      setFormData({ title: '', message: '', priority: 'general', targetType: 'all', targetUserId: '', targetSiteId: '' });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await announcementsAPI.delete(id);
      toast.success('Announcement removed');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 h-full flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F1F5F9] flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-brand" />
            Admin Broadcasts
          </h1>
          <p className="text-steel-400 text-sm mt-1">Send updates and notifications to all staff members.</p>
        </div>
        <button 
          onClick={() => setModal(true)}
          className="btn-primary flex items-center gap-2 px-5 py-2.5"
        >
          <Send className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="card p-12 flex flex-col items-center text-center opacity-60">
            <Megaphone className="w-12 h-12 text-steel-500 mb-4" />
            <p className="text-steel-400">No announcements posted yet.</p>
          </div>
        ) : (
          announcements.map(a => (
            <div key={a.id} className="card p-5 group animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={clsx("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5", (priorityConfig[a.priority] || priorityConfig.general).color)}>
                      {(priorityConfig[a.priority] || priorityConfig.general).icon}
                      {a.priority}
                    </div>
                    {(a as any).target_site_id || (a as any).target_user_id ? (
                      <div className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 max-w-[200px] truncate">
                        Target: {(a as any).target_site_id ? `Site (${(a as any).target_site_name})` : `User (${(a as any).target_first_name})`}
                      </div>
                    ) : (
                      <div className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        All Staff
                      </div>
                    )}
                    <h3 className="font-bold text-lg text-[#F1F5F9]">{a.title}</h3>
                  </div>
                  
                  <p className="text-steel-300 leading-relaxed whitespace-pre-wrap">
                    {a.message}
                  </p>
                  
                  <div className="flex items-center gap-6 text-[11px] text-steel-500 pt-2">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>{a.first_name} {a.last_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {(() => {
                          try { return format(new Date(a.created_at), 'PPPp'); }
                          catch(e) { return 'Invalid Date'; }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleDelete(a.id)}
                  className="p-2 text-steel-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Create Broadcast Announcement">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-steel-400 uppercase tracking-wider">Title</label>
            <input 
              required
              className="w-full bg-[#0F172A] border-[#334155] rounded-xl px-4 py-3 text-[#F1F5F9] focus:ring-2 focus:ring-brand/50 outline-none transition-all"
              placeholder="E.g. Site Maintenance Update"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-steel-400 uppercase tracking-wider">Target Audience</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'all',  label: 'All Staff' },
                { id: 'site', label: 'Site Team' },
                { id: 'user', label: 'Single User' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, targetType: t.id as any })}
                  className={clsx(
                    "py-2 rounded-lg border text-[10px] font-bold uppercase transition-all",
                    formData.targetType === t.id 
                      ? 'bg-brand/10 border-brand text-brand' 
                      : 'bg-[#0F172A] border-[#334155] text-steel-500'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {formData.targetType === 'site' && (
              <select
                required
                className="w-full bg-[#0F172A] border-[#334155] rounded-xl px-4 py-3 text-sm text-[#F1F5F9] mt-2 outline-none"
                value={formData.targetSiteId}
                onChange={e => setFormData({ ...formData, targetSiteId: e.target.value })}
              >
                <option value="">Select Target Site...</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {formData.targetType === 'user' && (
              <select
                required
                className="w-full bg-[#0F172A] border-[#334155] rounded-xl px-4 py-3 text-sm text-[#F1F5F9] mt-2 outline-none"
                value={formData.targetUserId}
                onChange={e => setFormData({ ...formData, targetUserId: e.target.value })}
              >
                <option value="">Select Staff Member...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-steel-400 uppercase tracking-wider">Priority</label>
            <div className="grid grid-cols-3 gap-3">
              {(['general', 'important', 'urgent'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: p })}
                  className={clsx(
                    "py-2 rounded-xl border text-xs font-bold uppercase transition-all flex items-center justify-center gap-2",
                    formData.priority === p 
                      ? 'bg-brand/10 border-brand text-brand ring-2 ring-brand/20' 
                      : 'bg-[#0F172A] border-[#334155] text-steel-400 hover:border-steel-500'
                  )}
                >
                  {priorityConfig[p].icon}
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-steel-400 uppercase tracking-wider">Message</label>
            <textarea 
              required
              rows={5}
              className="w-full bg-[#0F172A] border-[#334155] rounded-xl px-4 py-3 text-[#F1F5F9] focus:ring-2 focus:ring-brand/50 outline-none transition-all resize-none"
              placeholder="Type your message here..."
              value={formData.message}
              onChange={e => setFormData({ ...formData, message: e.target.value })}
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-steel-800 text-steel-300 hover:bg-steel-700 font-bold text-sm transition-all">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-2 px-8 py-3 rounded-xl bg-brand text-white hover:bg-brand-hover font-bold text-sm shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2">
              {submitting ? <Spinner size="sm" /> : <><Send className="w-4 h-4" /> Broadcast Now</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
