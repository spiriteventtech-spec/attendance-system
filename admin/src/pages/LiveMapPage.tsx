// src/pages/LiveMapPage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { locationAPI, announcementsAPI } from '../services/api';
import { Spinner } from '../components/ui';
import { 
  Radar, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  MessageSquare, 
  Send, 
  X, 
  Navigation,
  Shield,
  Clock,
  User as UserIcon
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

// Aerospace Marker Logic
const createAerospaceMarker = (inside: boolean, breach: boolean, avatarUrl?: string) => {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace('/api', '');
  const fullUrl = avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : `${baseUrl}${avatarUrl}`) : null;
  
  // Soft 3D Gradient Logic
  const gradient = breach || !inside ? 'from-brand-orange to-brand-rose' : 'from-brand-purple to-brand-blue';
  const shadowColor = breach || !inside ? 'rgba(244,63,94,0.4)' : 'rgba(168,85,247,0.4)';
  const pulseClass = breach || !inside ? 'animate-ping' : 'animate-pulse';

  return L.divIcon({
    html: `
      <div class="relative flex items-center justify-center" style="width: 50px; height: 50px;">
        <!-- Pulsing Outer Ring -->
        <div class="absolute inset-0 rounded-full bg-gradient-to-br ${gradient} opacity-20 ${pulseClass}"></div>
        
        <!-- Soft 3D Node Container -->
        <div class="relative w-10 h-10 rounded-full bg-[#2D2E3D] border border-white/10 overflow-hidden shadow-[0_0_15px_${shadowColor}] flex items-center justify-center p-[2px]">
          <div class="absolute inset-0 bg-gradient-to-br ${gradient} opacity-20"></div>
          <div class="relative w-full h-full rounded-full overflow-hidden bg-[#1A1B26]">
            ${fullUrl 
              ? `<img src="${fullUrl}" class="w-full h-full object-cover" />` 
              : `<div class="w-full h-full flex items-center justify-center text-[8px] font-black text-white ${gradient.split(' ')[0].replace('from-', 'bg-')}">NODE</div>`}
          </div>
        </div>

        <!-- Direction Arrow -->
        <div class="absolute -top-1 w-2 h-2 bg-gradient-to-br ${gradient} rotate-45 shadow-lg"></div>
      </div>
    `,
    className: '',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25],
  });
};

const siteMarker = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 rounded-lg border border-white/20 rotate-45 bg-white/5 backdrop-blur-sm"></div>
      <div class="text-[10px] z-10">🛰️</div>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
    }
  }, [positions.length, map]);
  return null;
}

export default function LiveMapPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const timerRef = useRef<any>(null);

  const fetchLive = async () => {
    try {
      const { data } = await locationAPI.live();
      setStaff(data);
    } catch (e) {
      toast.error('Telemetry Connection Interrupted');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLive();
    timerRef.current = setInterval(fetchLive, 15000); // Higher frequency for "Precision" feel
    return () => clearInterval(timerRef.current);
  }, []);

  const jitteredStaff = React.useMemo(() => {
    const seen: Record<string, number> = {};
    return staff.map(u => {
      const lat = parseFloat(u.latitude);
      const lng = parseFloat(u.longitude);
      if (isNaN(lat) || isNaN(lng)) return u;
      const posKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      seen[posKey] = (seen[posKey] || 0) + 1;
      const offset = (seen[posKey] - 1) * 0.0001;
      return { ...u, displayLat: lat + offset, displayLng: lng + offset };
    });
  }, [staff]);

  const sites = React.useMemo(() => Array.from(
    new Map(staff.map(u => [u.site_id, { 
      id: u.site_id, 
      name: u.site_name, 
      lat: parseFloat(u.site_lat), 
      lng: parseFloat(u.site_lng), 
      radius: parseFloat(u.radius_meters) 
    }])).values()
  ).filter(s => !isNaN(s.lat) && !isNaN(s.lng)), [staff]);

  return (
    <div className="relative h-full w-full bg-[#252634] overflow-hidden flex font-sans">
      {/* Main Map Canvas */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[25.2854, 51.5310]}
          zoom={13}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer 
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en" 
            attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
          />
          <FitBounds positions={jitteredStaff.map(u => [u.displayLat, u.displayLng])} />

          {sites.map(s => (
            <React.Fragment key={s.id}>
              <Circle 
                center={[s.lat, s.lng]} 
                radius={s.radius} 
                pathOptions={{ color: '#A855F7', weight: 1, fillOpacity: 0.05, dashArray: '10, 10' }} 
              />
              <Marker position={[s.lat, s.lng]} icon={siteMarker} />
            </React.Fragment>
          ))}

          {jitteredStaff.map(u => (
            <Marker
              key={u.user_id}
              position={[u.displayLat, u.displayLng]}
              icon={createAerospaceMarker(u.is_inside, parseInt(u.has_open_breach) > 0, u.avatar_url)}
              eventHandlers={{ click: () => setSelected(u) }}
            >
              <Tooltip permanent direction="top" offset={[0, -20]} className="aerospace-tooltip">
                <div className="bg-[#2D2E3D]/90 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[9px] font-bold text-white tracking-widest uppercase shadow-soft-3d">
                  {u.first_name}
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* OVERLAY: Top Status Bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-10">
        <motion.div 
          initial={{ x: -20, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }}
          className="bg-[#2D2E3D] rounded-3xl px-8 py-5 pointer-events-auto flex items-center gap-8 shadow-soft-3d border border-white/[0.03]"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center shadow-lg">
              <Radar className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-xs font-black tracking-[0.2em] uppercase text-white/40">Workforce Telemetry</h1>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand-purple shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                  <span className="text-lg font-black text-white tracking-tight">{staff.length} <span className="text-white/20">Nodes</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="h-10 w-px bg-white/5" />
          <button className="btn-command border-brand-purple/20 text-brand-purple hover:bg-brand-purple/10" onClick={fetchLive}>
            <RefreshCw className="w-3.5 h-3.5" /> Synchronize
          </button>
        </motion.div>

        <div className="flex flex-col gap-2 items-end">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#2D2E3D] px-6 py-3 rounded-2xl border border-brand-purple/20 flex items-center gap-3 shadow-soft-3d"
          >
            <Activity className="w-4 h-4 text-brand-purple" />
            <span className="text-[10px] font-black tracking-widest text-brand-purple">CORE_STATUS: NOMINAL</span>
          </motion.div>
        </div>
      </div>

      {/* OVERLAY: Left Telemetry List */}
      <div className="absolute top-36 left-6 bottom-6 w-80 pointer-events-none z-10 hidden xl:flex flex-col gap-4">
        <motion.div 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-[#2D2E3D] rounded-3xl flex-1 flex flex-col pointer-events-auto overflow-hidden shadow-soft-3d border border-white/[0.03]"
        >
          <div className="p-6 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
            <span className="telemetry-label text-brand-purple">Protocol Feed</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {staff.map(u => (
              <motion.div 
                key={u.user_id}
                whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.03)' }}
                onClick={() => setSelected(u)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  selected?.user_id === u.user_id 
                    ? 'border-brand-purple/50 bg-gradient-to-br from-brand-purple/5 to-brand-blue/5 shadow-[0_0_20px_rgba(168,85,247,0.15)]' 
                    : 'border-white/5 bg-white/[0.01]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${u.is_inside ? 'bg-brand-purple shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-brand-orange shadow-[0_0_10px_rgba(251,146,60,0.5)]'}`} />
                    <span className="text-xs font-black text-white tracking-tight">{u.first_name} {u.last_name}</span>
                  </div>
                  <span className="text-[9px] font-black text-white/20">{format(new Date(u.pinged_at), 'HH:mm')}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-white/40 uppercase font-bold tracking-widest truncate max-w-[120px]">{u.site_name}</span>
                  <span className={`font-black ${u.is_inside ? 'text-brand-purple' : 'text-brand-orange'}`}>
                    {u.is_inside ? 'SIGNAL_NOMINAL' : 'DEVIATION_ALERT'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* OVERLAY: Detailed Node Inspector (Selected User) */}
      <AnimatePresence>
        {selected && (
          <motion.div 
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="absolute top-6 right-6 bottom-6 w-96 bg-[#2D2E3D] rounded-3xl z-20 pointer-events-auto flex flex-col shadow-soft-3d border border-white/[0.03] overflow-hidden"
          >
            {/* Header / ID Card */}
            <div className="p-10 bg-gradient-to-br from-white/[0.03] to-transparent border-b border-white/5 relative text-center">
              <button 
                onClick={() => setSelected(null)}
                className="absolute top-6 right-6 p-2 text-white/20 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue p-1 shadow-lg mb-4">
                  <div className="w-full h-full rounded-full overflow-hidden bg-[#2D2E3D] p-1">
                    {selected.avatar_url ? (
                      <img src={`${(import.meta.env.VITE_API_BASE_URL || '').replace('/api', '')}${selected.avatar_url}`} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-[#2D2E3D] flex items-center justify-center text-white font-black italic text-3xl">
                        {selected.first_name[0]}
                      </div>
                    )}
                  </div>
                </div>
                <h2 className="text-3xl font-black tracking-tighter text-white">{selected.first_name} <span className="text-white/20">{selected.last_name}</span></h2>
                <div className="flex items-center gap-3 mt-4">
                   <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] bg-white/5 border ${selected.is_inside ? 'border-brand-purple/30 text-brand-purple' : 'border-brand-orange/30 text-brand-orange'}`}>
                      {selected.is_inside ? 'SIGNAL_NOMINAL' : 'PERIMETER_BREACH'}
                   </div>
                </div>
              </div>
            </div>

            {/* Vital Signs / Telemetry */}
            <div className="flex-1 p-8 space-y-10 overflow-y-auto">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <span className="telemetry-label text-brand-purple">Assigned Site</span>
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-black uppercase text-white truncate">{selected.site_name}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="telemetry-label text-brand-purple">Session Time</span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-black text-white">{formatDistanceToNow(new Date(selected.check_in_time)).toUpperCase()}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="telemetry-label text-brand-purple">Spatial Drift</span>
                  <span className="text-xs font-black text-brand-orange">{Math.round(selected.total_away_minutes)}M DEVIATION</span>
                </div>
                <div className="space-y-2">
                  <span className="telemetry-label text-brand-purple">Auth Status</span>
                  <span className="text-xs font-black text-white/40 leading-none">ID_{selected.user_id.split('-')[0].toUpperCase()}</span>
                </div>
              </div>

              {/* Logs */}
              <div className="space-y-4">
                <span className="telemetry-label text-brand-purple">Mission Parameters</span>
                <div className="p-6 rounded-2xl bg-[#252634] border border-white/5 italic text-white/40 text-[11px] leading-relaxed">
                  "{selected.check_in_note || 'INITIALIZING_LOG_PARAMETERS_NULL'}"
                </div>
              </div>

              {/* Action: Command Broadcast */}
              <div className="space-y-4 pt-6 border-t border-white/5">
                <span className="telemetry-label text-brand-purple">Terminal Directive</span>
                <div className="space-y-4">
                  <textarea 
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    className="bg-[#252634] border border-white/10 rounded-2xl p-4 text-xs text-white placeholder-white/10 w-full h-24 resize-none focus:outline-none focus:border-brand-purple/50 transition-all font-bold"
                    placeholder="ENTER OVERRIDE SEQUENCE..."
                  />
                  <button 
                    disabled={sendingMsg}
                    className="btn-command w-full py-5 rounded-2xl border-brand-purple/40 text-brand-purple hover:bg-brand-purple/10 flex items-center justify-center gap-3 font-black text-[10px]"
                    onClick={() => {
                      if (!messageText.trim()) return;
                      setSendingMsg(true);
                      setTimeout(() => {
                        toast.success('Directive Transmitted Successfully');
                        setSendingMsg(false);
                        setMessageText('');
                      }, 1000);
                    }}
                  >
                    <Send className="w-4 h-4" /> TRANSMIT_COMMAND
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-[#252634]/50 text-center">
               <p className="text-[7px] font-black tracking-[0.5em] text-white/10 uppercase">Secure Link Active // Sector 07-ID</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
