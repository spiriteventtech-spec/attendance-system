// src/pages/AnnouncementsPage.tsx
import React, { useEffect, useState } from 'react';
import { announcementsAPI, usersAPI, sitesAPI } from '../services/api';
import { Spinner, Modal } from '../components/ui';
import { Megaphone, Send, Trash2, AlertTriangle, Info, Bell, Calendar, User, Plus } from 'lucide-react';
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
  general:   { icon: <Info className="w-4 h-4" />,          color: 'bg-[#007AFF]/8 text-[#007AFF] border-[#007AFF]/15',    dot: '#007AFF' },
  important: { icon: <Bell className="w-4 h-4" />,          color: 'bg-[#FF9500]/8 text-[#FF9500] border-[#FF9500]/15',    dot: '#FF9500' },
  urgent:    { icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-[#FF3B30]/8 text-[#FF3B30] border-[#FF3B30]/15',    dot: '#FF3B30' },
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
    targetType: 'all',
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

  useEffect(() => { fetchData(); }, []);

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
    <div className="p-6 lg:p-10 space-y-8 pb-12 h-screen overflow-y-auto min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">Broadcasts</h1>
          <p className="text-base text-[#86868B] font-medium mt-1">
            Send updates and notifications to staff members
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="btn-apple gap-2"
        >
          <Plus className="w-4 h-4" />
          New Broadcast
        </button>
      </div>

      {/* Announcement List */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="premium-card flex flex-col items-center py-20 text-center">
            <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
              <Megaphone className="w-8 h-8 text-[#86868B]" />
            </div>
            <h3 className="text-[#1D1D1F] font-semibold text-lg mb-1">No broadcasts yet</h3>
            <p className="text-[#86868B] text-sm font-medium">Create your first announcement above.</p>
          </div>
        ) : announcements.map(a => {
          const cfg = priorityConfig[a.priority] || priorityConfig.general;
          return (
            <div key={a.id} className="premium-card group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* Priority + Target badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={clsx(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border capitalize",
                      cfg.color
                    )}>
                      {cfg.icon}
                      {a.priority}
                    </div>
                    {(a as any).target_site_id || (a as any).target_user_id ? (
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-[#AF52DE]/8 text-[#AF52DE] border border-[#AF52DE]/15 max-w-[200px] truncate">
                        {(a as any).target_site_id ? `Site: ${(a as any).target_site_name}` : `User: ${(a as any).target_first_name}`}
                      </div>
                    ) : (
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-[#34C759]/8 text-[#34C759] border border-[#34C759]/15">
                        All Staff
                      </div>
                    )}
                    <h3 className="font-bold text-[#1D1D1F] text-base">{a.title}</h3>
                  </div>

                  <p className="text-[#1D1D1F] text-sm leading-relaxed whitespace-pre-wrap">
                    {a.message}
                  </p>

                  {/* Meta */}
                  <div className="flex items-center gap-6 text-[11px] text-[#86868B] font-medium">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>{a.first_name} {a.last_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {(() => {
                          try { return format(new Date(a.created_at), 'PPPp'); }
                          catch (e) { return 'Invalid Date'; }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-2 text-[#86868B] hover:text-[#FF3B30] hover:bg-[#FF3B30]/8 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Delete announcement"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Broadcast">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Title */}
          <div>
            <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Title</label>
            <input
              required
              className="input-apple"
              placeholder="E.g. Site Maintenance Update"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Target Audience */}
          <div>
            <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Target Audience</label>
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
                    "py-2.5 rounded-xl border text-[11px] font-bold uppercase transition-all",
                    formData.targetType === t.id
                      ? 'bg-[#007AFF]/8 border-[#007AFF]/30 text-[#007AFF]'
                      : 'bg-black/[0.02] border-black/[0.05] text-[#86868B] hover:border-black/10'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {formData.targetType === 'site' && (
              <select
                required
                className="input-apple mt-3"
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
                className="input-apple mt-3"
                value={formData.targetUserId}
                onChange={e => setFormData({ ...formData, targetUserId: e.target.value })}
              >
                <option value="">Select Staff Member...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-3">
              {(['general', 'important', 'urgent'] as const).map(p => {
                const cfg = priorityConfig[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: p })}
                    className={clsx(
                      "py-2.5 rounded-xl border text-[11px] font-bold uppercase transition-all flex items-center justify-center gap-2 capitalize",
                      formData.priority === p
                        ? clsx('border ring-2', cfg.color, 'ring-current/20')
                        : 'bg-black/[0.02] border-black/[0.05] text-[#86868B] hover:border-black/10'
                    )}
                  >
                    {cfg.icon}
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Message</label>
            <textarea
              required
              rows={5}
              className="input-apple resize-none"
              placeholder="Type your message here..."
              value={formData.message}
              onChange={e => setFormData({ ...formData, message: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModal(false)}
              className="btn-apple-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-apple flex-[2]"
            >
              {submitting ? <Spinner size="sm" /> : <><Send className="w-4 h-4" /> Broadcast Now</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
