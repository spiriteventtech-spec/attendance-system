// src/pages/SecurityAuditPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust Security Audit Dashboard
// • Paginated security_audit_log with severity color-coding
// • Session conflict policy toggle (block_new | terminate_old)
// • QR code generator per site (burn-after-reading)
// • Device binding manager (reset user device)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Shield, AlertTriangle, Zap, Smartphone, QrCode,
  RefreshCw, ChevronLeft, ChevronRight, Settings,
  Eye, Radio, Activity, Lock, Download
} from 'lucide-react';
import { securityAPI, sitesAPI, usersAPI } from '../services/api';
import { Spinner, FilterSelect } from '../components/ui';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Severity config ───────────────────────────────────────────────────────────
const SEVERITY: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critical: { label: 'CRITICAL', bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100',    dot: '#EF4444' },
  high:     { label: 'HIGH',     bg: 'bg-orange-50',  text: 'text-orange-600', border: 'border-orange-100', dot: '#F97316' },
  medium:   { label: 'MEDIUM',   bg: 'bg-yellow-50',  text: 'text-yellow-600', border: 'border-yellow-100', dot: '#EAB308' },
  info:     { label: 'INFO',     bg: 'bg-blue-50',    text: 'text-blue-600',   border: 'border-blue-100',   dot: '#60A5FA' },
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  device_mismatch:          <Smartphone className="w-4 h-4" />,
  velocity_violation:       <Zap className="w-4 h-4" />,
  replay_attack:            <Radio className="w-4 h-4" />,
  mock_location:            <AlertTriangle className="w-4 h-4" />,
  selfie_fail:              <Eye className="w-4 h-4" />,
  device_registered:        <Shield className="w-4 h-4" />,
  device_unbound:           <Lock className="w-4 h-4" />,
  qr_replay:                <QrCode className="w-4 h-4" />,
  session_terminated:       <Activity className="w-4 h-4" />,
  device_reregistration_attempt: <Smartphone className="w-4 h-4" />,
};

const EVENT_LABELS: Record<string, string> = {
  device_mismatch:          'Device Mismatch',
  velocity_violation:       'GPS Velocity Violation',
  replay_attack:            'Replay Attack',
  mock_location:            'Mock Location Detected',
  selfie_fail:              'Selfie Verification Failed',
  device_registered:        'Device Registered',
  device_unbound:           'Device Binding Reset',
  qr_replay:                'QR Code Replay Attempt',
  session_terminated:       'Session Terminated',
  stale_request:            'Stale Request',
  invalid_nonce_signature:  'Invalid Nonce',
  missing_device_id:        'Missing Device ID',
  selfie_error:             'Selfie Service Error',
  device_reregistration_attempt: 'Re-registration Attempt',
};

export default function SecurityAuditPage() {
  const [events,          setEvents]        = useState<any[]>([]);
  const [total,           setTotal]         = useState(0);
  const [page,            setPage]          = useState(1);
  const [loadingLog,      setLoadingLog]    = useState(false);
  const [infraStatus,     setInfraStatus]   = useState<any>(null);

  const [sessionPolicy,   setSessionPolicy] = useState<'block_new' | 'terminate_old'>('block_new');
  const [savingPolicy,    setSavingPolicy]  = useState(false);

  const [sites,           setSites]         = useState<any[]>([]);
  const [staff,           setStaff]         = useState<any[]>([]);
  const [selSite,         setSelSite]       = useState('');
  const [qrResult,        setQrResult]      = useState<any>(null);
  const [qrImageUrl,      setQrImageUrl]    = useState('');
  const [generatingQR,    setGeneratingQR]  = useState(false);

  const [selUser,         setSelUser]       = useState('');
  const [resettingDevice, setResettingDevice] = useState(false);

  // Filters
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterEvent,    setFilterEvent]    = useState('');
  const [filterUserId,   setFilterUserId]   = useState('');

  const LIMIT = 20;

  const loadLog = useCallback(async (pg = 1) => {
    setLoadingLog(true);
    try {
      const params: any = { page: pg, limit: LIMIT };
      if (filterSeverity) params.severity  = filterSeverity;
      if (filterEvent)    params.eventType = filterEvent;
      if (filterUserId)   params.userId    = filterUserId;
      const { data } = await securityAPI.getAuditLog(params);
      setEvents(data.events);
      setTotal(data.total);
      setPage(pg);
    } catch {
      toast.error('Failed to load security log');
    } finally {
      setLoadingLog(false);
    }
  }, [filterSeverity, filterEvent, filterUserId]);

  useEffect(() => { loadLog(1); }, [loadLog]);

  // Load session policy
  useEffect(() => {
    securityAPI.getSessionPolicy()
      .then(r => setSessionPolicy(r.data.policy))
      .catch(() => {});
    securityAPI.getStatus()
      .then((r: any) => setInfraStatus(r.data))
      .catch(() => {});
    sitesAPI.list().then(r => setSites(r.data)).catch(() => {});
    usersAPI.list({ limit: 999 }).then(r => setStaff(r.data.users)).catch(() => {});
  }, []);

  const savePolicy = async (policy: 'block_new' | 'terminate_old') => {
    setSavingPolicy(true);
    try {
      await securityAPI.setSessionPolicy(policy);
      setSessionPolicy(policy);
      toast.success(`Session policy set to: ${policy === 'block_new' ? 'Block New Device' : 'Terminate Old Device'}`);
    } catch {
      toast.error('Failed to update policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const generateQR = async () => {
    if (!selSite) { toast.error('Select a site first'); return; }
    setGeneratingQR(true);
    try {
      const { data } = await securityAPI.generateQR(selSite);
      setQrResult(data);
      // Render QR image client-side from the qrPayload
      const url = await QRCode.toDataURL(data.qrPayload, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      });
      setQrImageUrl(url);
      toast.success('QR code generated (valid 24h)');
    } catch {
      toast.error('Failed to generate QR code');
    } finally {
      setGeneratingQR(false);
    }
  };

  const downloadQR = () => {
    if (!qrImageUrl || !qrResult) return;
    const a = document.createElement('a');
    a.href = qrImageUrl;
    a.download = `qr-${qrResult.siteName.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.png`;
    a.click();
  };

  const resetDevice = async () => {
    if (!selUser) { toast.error('Select a staff member first'); return; }
    const user = staff.find(u => u.id === selUser);
    if (!confirm(`Reset device binding for ${user?.first_name} ${user?.last_name}? They will be able to re-register on next login.`)) return;
    setResettingDevice(true);
    try {
      await securityAPI.resetDeviceBinding(selUser);
      toast.success('Device binding reset. User can re-register on next login.');
      setSelUser('');
    } catch {
      toast.error('Failed to reset device binding');
    } finally {
      setResettingDevice(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  // Stats from events
  const criticalCount  = events.filter(e => e.severity === 'critical').length;
  const highCount      = events.filter(e => e.severity === 'high').length;

  return (
    <div className="p-6 lg:p-10 space-y-6 h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-50">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            Security Audit Center
          </h1>
          <p className="text-sm font-medium text-[#86868B] mt-1">
            Zero-Trust telemetry · Device binding · Replay protection · GPS anti-spoofing
          </p>
        </div>
        <button
          onClick={() => loadLog(1)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/[0.04] text-sm font-bold text-[#1D1D1F] hover:bg-black/[0.08] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: total, icon: <Activity className="w-5 h-5" />, color: 'blue' },
          { label: 'Critical Alerts', value: criticalCount, icon: <AlertTriangle className="w-5 h-5" />, color: 'red' },
          { label: 'High Severity', value: highCount, icon: <Zap className="w-5 h-5" />, color: 'orange' },
          { label: 'System Uptime', value: infraStatus ? `${Math.floor(infraStatus.system.uptime / 3600)}h ${Math.floor((infraStatus.system.uptime % 3600) / 60)}m` : '---', icon: <Activity className="w-5 h-5" />, color: 'green' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white rounded-[20px] p-5 border border-black/5 shadow-sm">
            <div className={`inline-flex p-2 rounded-xl mb-3 ${
              color === 'red' ? 'bg-red-50 text-red-500' :
              color === 'orange' ? 'bg-orange-50 text-orange-500' :
              color === 'green' ? 'bg-green-50 text-green-500' :
              'bg-blue-50 text-blue-500'
            }`}>{icon}</div>
            <p className="text-2xl font-bold text-[#1D1D1F] tracking-tight">{value}</p>
            <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Infrastructure Status */}
      <div className="bg-white rounded-[24px] p-6 border border-black/5 shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h2 className="text-sm font-bold text-[#1D1D1F] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#007AFF]" />
            Security Infrastructure Status
          </h2>
          <span className="text-[10px] font-bold text-[#86868B] px-2 py-1 rounded bg-black/[0.04]">
            VERSION: {infraStatus?.system?.version || 'ZT-1.0'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-black/[0.02] border border-black/[0.04]">
            <div className={`p-2.5 rounded-xl ${infraStatus?.awsRekognition?.enabled ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1D1D1F]">Selfie AI Verification</p>
              <p className="text-xs text-[#86868B] mt-0.5">AWS Rekognition (CompareFaces)</p>
              <div className="mt-2 flex items-center gap-4">
                <span className={`flex items-center gap-1.5 text-[10px] font-bold ${infraStatus?.awsRekognition?.enabled ? 'text-green-500' : 'text-red-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${infraStatus?.awsRekognition?.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                  {infraStatus?.awsRekognition?.enabled ? 'ONLINE' : 'NOT CONFIGURED'}
                </span>
                {infraStatus?.awsRekognition?.enabled && (
                  <span className="text-[10px] font-bold text-[#86868B]">CONFIDENCE: {infraStatus.awsRekognition.confidenceThreshold}%</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-2xl bg-black/[0.02] border border-black/[0.04]">
            <div className={`p-2.5 rounded-xl ${infraStatus?.smtp?.enabled ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1D1D1F]">Security Alerts (Email)</p>
              <p className="text-xs text-[#86868B] mt-0.5">SMTP Relay Service</p>
              <div className="mt-2 flex items-center gap-4">
                <span className={`flex items-center gap-1.5 text-[10px] font-bold ${infraStatus?.smtp?.enabled ? 'text-green-500' : 'text-red-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${infraStatus?.smtp?.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                  {infraStatus?.smtp?.enabled ? 'ONLINE' : 'NOT CONFIGURED'}
                </span>
                {infraStatus?.smtp?.enabled && (
                  <span className="text-[10px] font-bold text-[#86868B] truncate max-w-[120px]">HOST: {infraStatus.smtp.host}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Audit Log ──────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <FilterSelect
                label="Severity"
                value={filterSeverity}
                onChange={v => { setFilterSeverity(v); }}
                options={[
                  { value: '', label: 'All Severities' },
                  { value: 'critical', label: '🔴 Critical' },
                  { value: 'high',     label: '🟠 High' },
                  { value: 'medium',   label: '🟡 Medium' },
                  { value: 'info',     label: '🟢 Info' },
                ]}
              />
              <FilterSelect
                label="Event Type"
                value={filterEvent}
                onChange={v => { setFilterEvent(v); }}
                options={[
                  { value: '', label: 'All Events' },
                  ...Object.entries(EVENT_LABELS).map(([k, v]) => ({ value: k, label: v })),
                ]}
              />
              <FilterSelect
                label="Staff Member"
                value={filterUserId}
                onChange={v => { setFilterUserId(v); }}
                options={[
                  { value: '', label: 'All Staff' },
                  ...staff.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` })),
                ]}
              />
            </div>
          </div>

          {/* Log Table */}
          <div className="bg-white rounded-[24px] border border-black/5 shadow-sm overflow-hidden">
            {loadingLog ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#86868B]">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-semibold">No security events found</p>
                <p className="text-xs mt-1">All clear — the system is secure</p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.04]">
                {events.map((evt) => {
                  const sv = SEVERITY[evt.severity] || SEVERITY.info;
                  return (
                    <div key={evt.id} className={`p-4 hover:bg-black/[0.02] transition-colors ${sv.bg} border-l-4 ${sv.border}`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${sv.bg} ${sv.text} mt-0.5 shrink-0`}>
                          {EVENT_ICONS[evt.event_type] || <Shield className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sv.bg} ${sv.text} border ${sv.border}`}>
                              {sv.label}
                            </span>
                            <span className="text-sm font-semibold text-[#1D1D1F]">
                              {EVENT_LABELS[evt.event_type] || evt.event_type}
                            </span>
                          </div>
                          {(evt.first_name || evt.email) && (
                            <p className="text-xs font-medium text-[#86868B] mt-1">
                              👤 {evt.first_name ? `${evt.first_name} ${evt.last_name}` : evt.email}
                              {evt.ip_address && <span className="ml-2 font-mono text-[10px] bg-black/[0.04] px-1.5 py-0.5 rounded-md">{evt.ip_address}</span>}
                            </p>
                          )}
                          {evt.detail && Object.keys(evt.detail).length > 0 && (
                            <details className="group mt-2">
                              <summary className="text-[10px] font-bold text-[#86868B] cursor-pointer hover:text-[#1D1D1F] uppercase tracking-wider">
                                View Details
                              </summary>
                              <pre className="mt-2 text-[10px] font-mono bg-black/[0.04] rounded-lg p-3 overflow-x-auto text-[#1D1D1F] leading-relaxed">
                                {JSON.stringify(evt.detail, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-[#86868B] whitespace-nowrap shrink-0">
                          {format(new Date(evt.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-black/[0.04]">
                <button
                  onClick={() => loadLog(page - 1)}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-black/[0.04] text-[#1D1D1F] hover:bg-black/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="text-xs font-semibold text-[#86868B]">
                  Page {page} of {totalPages} · {total} events
                </span>
                <button
                  onClick={() => loadLog(page + 1)}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-black/[0.04] text-[#1D1D1F] hover:bg-black/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Control Panel ─────────────────────────────── */}
        <div className="space-y-5">

          {/* Session Conflict Policy */}
          <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold text-[#1D1D1F] mb-1 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#86868B]" />
              Multi-Device Policy
            </h2>
            <p className="text-xs text-[#86868B] mb-4 leading-relaxed">
              What happens when a user logs in on a second device?
            </p>
            <div className="space-y-3">
              {[
                {
                  key: 'block_new' as const,
                  label: '🔒 Block New Device',
                  desc: 'Reject the second login entirely. Safest option.',
                },
                {
                  key: 'terminate_old' as const,
                  label: '🔄 Terminate Old Session',
                  desc: 'Allow the new login but kill the first device\'s token. Best for phone replacements.',
                },
              ].map(({ key, label, desc }) => (
                <button
                  key={key}
                  onClick={() => savePolicy(key)}
                  disabled={savingPolicy}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    sessionPolicy === key
                      ? 'border-[#007AFF] bg-[#007AFF]/5'
                      : 'border-black/[0.06] hover:border-[#007AFF]/40 hover:bg-black/[0.02]'
                  }`}
                >
                  <p className="text-sm font-bold text-[#1D1D1F]">{label}</p>
                  <p className="text-xs text-[#86868B] mt-1">{desc}</p>
                  {sessionPolicy === key && (
                    <span className="inline-block mt-2 text-[10px] font-bold text-[#007AFF] uppercase tracking-wider">✓ Active</span>
                  )}
                </button>
              ))}
            </div>
            {savingPolicy && <div className="flex justify-center mt-3"><Spinner /></div>}
          </div>

          {/* QR Code Generator */}
          <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold text-[#1D1D1F] mb-1 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#86868B]" />
              Burn-After-Reading QR
            </h2>
            <p className="text-xs text-[#86868B] mb-4 leading-relaxed">
              Generates a site-specific QR code. Expires in 24h and is single-use per employee per shift.
            </p>
            <FilterSelect
              label="Select Site"
              value={selSite}
              onChange={setSelSite}
              options={[{ value: '', label: 'Choose site…' }, ...sites.map(s => ({ value: s.id, label: s.name }))]}
            />
            <button
              onClick={generateQR}
              disabled={generatingQR || !selSite}
              className="btn-apple w-full justify-center mt-4 py-3"
            >
              {generatingQR ? <Spinner size="sm" /> : <><QrCode className="w-4 h-4" /> Generate QR Code</>}
            </button>

            {qrResult && qrImageUrl && (
              <div className="mt-5 text-center">
                <div className="inline-block p-3 bg-white border-2 border-[#007AFF]/20 rounded-2xl shadow-sm">
                  <img src={qrImageUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg" />
                </div>
                <p className="text-xs font-semibold text-[#1D1D1F] mt-3">{qrResult.siteName}</p>
                <p className="text-[10px] text-[#86868B] mt-1">
                  Expires: {format(new Date(qrResult.expiresAt), 'dd MMM yyyy, HH:mm')}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={downloadQR}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-full bg-[#007AFF] text-white text-xs font-bold hover:bg-[#007AFF]/90 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => { setQrResult(null); setQrImageUrl(''); }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-full bg-black/[0.04] text-[#1D1D1F] text-xs font-bold hover:bg-black/[0.08] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Device Binding Reset */}
          <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold text-[#1D1D1F] mb-1 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#86868B]" />
              Reset Device Binding
            </h2>
            <p className="text-xs text-[#86868B] mb-4 leading-relaxed">
              Use when a worker gets a new phone and needs to re-register their device.
            </p>
            <FilterSelect
              label="Select Staff Member"
              value={selUser}
              onChange={setSelUser}
              options={[
                { value: '', label: 'Choose staff member…' },
                ...staff.filter(u => u.role === 'staff').map(u => ({
                  value: u.id,
                  label: `${u.first_name} ${u.last_name}`,
                })),
              ]}
            />
            <button
              onClick={resetDevice}
              disabled={resettingDevice || !selUser}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-full border-2 border-red-100 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resettingDevice ? <Spinner size="sm" /> : <><Lock className="w-4 h-4" /> Reset Device</>}
            </button>
            <p className="text-[10px] text-[#86868B] mt-3 text-center">
              The worker will be asked to re-register their device on next login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
