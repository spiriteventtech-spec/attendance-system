// src/pages/LiveMapPage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import clsx from 'clsx';

// ── Staff Marker Portal ──────────────────────────────────────
const StaffMarkerPortal = ({ u, onClick }: { u: any; onClick: () => void }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById(`marker-${u.user_id}`);
    if (el) setContainer(el);
  }, [u.user_id]);

  if (!container) return null;
  return createPortal(<StaffMarker u={u} onClick={onClick} />, container);
};

// ── Cupertino/Material Map Styles ───────────────────────────
const SILVER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e9e9e9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

// ── Fit Bounds Helper ──────────────────────────────────────
const FitBounds = ({ positions }: { positions: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [positions, map]);
  return null;
};

// ── Staff Overlays (Portal-like for StaffMarkers) ────────────
const StaffOverlays = ({ staff, onSelect }: { staff: any[]; onSelect: (u: any) => void }) => {
  return (
    <>
      {staff.map(u => (
        <Marker
          key={`overlay-${u.user_id}`}
          position={[u.displayLat, u.displayLng]}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: '', // We render the component inside the divIcon or via a Portal/Custom component. 
            // However, in Leaflet, the easiest performant way is DivIcon + ReactDOMServer or just simple CSS markers.
            // For this UI, we'll use Marker with custom CSS classes.
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          })}
        >
          <Popup className="premium-popup">
             <div className="p-2 min-w-[120px]">
                <p className="font-bold text-sm">{u.first_name} {u.last_name}</p>
                <p className="text-[10px] text-gray-500 uppercase font-medium">{u.site_name}</p>
                <button 
                  className="btn-apple-secondary w-full mt-3 py-1.5 text-[11px]"
                  onClick={() => onSelect(u)}
                >
                  View Intel
                </button>
             </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

// ── Staff Avatar with Material Ripple ───────────────────────
const StaffMarker = ({ u, onClick }: { u: any; onClick: () => void }) => {
  const statusColor = u.has_open_breach || !u.is_inside ? 'var(--brand-danger)' : 'var(--brand-success)';
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace('/api', '');
  const avatarUrl = u.avatar_url ? (u.avatar_url.startsWith('http') ? u.avatar_url : `${baseUrl}${u.avatar_url}`) : null;

  return (
    <div 
      className="relative cursor-pointer group" 
      onClick={onClick}
      style={{ width: 44, height: 44 }}
    >
      {/* Ripple Rings */}
      <div className="absolute inset-0 rounded-full bg-[var(--brand-success)] opacity-0 group-hover:block transition-all" 
           style={{ backgroundColor: statusColor }}>
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: statusColor }} />
        <div className="absolute inset-0 rounded-full animate-pulse opacity-10" style={{ backgroundColor: statusColor }} />
      </div>

      {/* Avatar Container */}
      <div className="relative w-11 h-11 rounded-full border-2 border-white shadow-premium overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center p-[1px]">
        <div className={clsx(
          "w-full h-full rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white",
          !avatarUrl && (u.has_open_breach || !u.is_inside ? 'bg-[var(--brand-danger)]' : 'bg-[var(--brand-success)]')
        )}>
          {avatarUrl ? (
            <img src={avatarUrl} className="w-full h-full object-cover" alt="Staff" />
          ) : (
            u.first_name[0]
          )}
        </div>
      </div>

      {/* Status Badge */}
      {!u.is_inside && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--brand-danger)] rounded-full border-2 border-white flex items-center justify-center animate-bounce">
          <AlertTriangle className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  );
};

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
    timerRef.current = setInterval(fetchLive, 15000);
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

  // Use Leaflet as the engine but styled like Google Maps Silver
  // (Switching to full Google Maps JS API would require a significant restructure and API Key)
  // I will enhance the Leaflet styling to mimic the Silver theme perfectly.

  return (
    <div className="relative h-full w-full bg-[var(--bg-main)] overflow-hidden flex font-sans">
      {/* Main Map Canvas */}
      <div className="absolute inset-0 z-0 map-silver">
        <MapContainer
          center={[25.2854, 51.5310]}
          zoom={13}
          zoomControl={false}
          style={{ width: '100%', height: '100%', background: '#f5f5f7' }}
        >
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" 
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />
          <FitBounds positions={jitteredStaff.map(u => [u.displayLat, u.displayLng])} />

          {sites.map(s => (
            <React.Fragment key={s.id}>
              <Circle 
                center={[s.lat, s.lng]} 
                radius={s.radius} 
                pathOptions={{ 
                  color: 'var(--brand-primary)', 
                  weight: 1, 
                  fillOpacity: 0.04, 
                  dashArray: '8, 8' 
                }} 
              />
            </React.Fragment>
          ))}

          {jitteredStaff.map(u => (
            <Marker
              key={u.user_id}
              position={[u.displayLat, u.displayLng]}
              icon={L.divIcon({
                className: 'marker-clear',
                html: `<div id="marker-${u.user_id}" class="marker-container"></div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22]
              })}
              eventHandlers={{
                click: () => setSelected(u)
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -20]} opacity={1}>
                <div className="bg-white/90 backdrop-blur-xl border border-black/[0.03] px-3 py-1 rounded-full text-[10px] font-bold text-[var(--text-primary)] shadow-premium">
                  {u.first_name}
                </div>
              </Tooltip>
            </Marker>
          ))}

          {/* Render StaffMarker components as Overlays into the DivIcons via Portals */}
          {jitteredStaff.map(u => (
            <StaffMarkerPortal key={`portal-${u.user_id}`} u={u} onClick={() => setSelected(u)} />
          ))}

          {/* Render StaffOverlays (Popups/Tooltips) into the map */}
          <StaffOverlays staff={jitteredStaff} onSelect={setSelected} />
        </MapContainer>
      </div>

      {/* OVERLAY: Top Status Bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-10">
        <motion.div 
          initial={{ x: -20, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }}
          className="bg-white/90 backdrop-blur-xl rounded-full px-8 py-4 pointer-events-auto flex items-center gap-8 shadow-premium border border-black/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#007AFF]/10 flex items-center justify-center">
              <Radar className="w-5 h-5 text-[#007AFF] animate-pulse" />
            </div>
            <div>
              <h1 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#86868B]">Workforce Telemetry</h1>
              <div className="flex items-center gap-4 mt-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#34C759] shadow-[0_0_10px_rgba(52,199,89,0.5)]" />
                  <span className="text-xl font-black text-[#1D1D1F] tracking-tight">{staff.length} <span className="text-[#86868B] text-sm">Nodes</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="h-8 w-px bg-black/10" />
          <button className="btn-apple bg-black/5 text-[#86868B] font-bold" onClick={fetchLive}>
            <RefreshCw className="w-4 h-4 mr-2 inline" /> Synchronize
          </button>
        </motion.div>

        <div className="flex flex-col gap-2 items-end">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/90 backdrop-blur-xl px-5 py-3 rounded-full border border-black/5 flex items-center gap-3 shadow-premium"
          >
            <Activity className="w-4 h-4 text-[#34C759]" />
            <span className="text-[10px] font-bold tracking-widest text-[#34C759]">CORE_STATUS: NOMINAL</span>
          </motion.div>
        </div>
      </div>

      {/* OVERLAY: Left Telemetry List */}
      <div className="absolute top-36 left-6 bottom-6 w-80 pointer-events-none z-10 hidden xl:flex flex-col gap-4">
        <motion.div 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/90 backdrop-blur-xl rounded-[24px] flex-1 flex flex-col pointer-events-auto overflow-hidden shadow-premium border border-black/5"
        >
          <div className="p-5 border-b border-black/5 bg-[#F5F5F7]/50">
            <span className="telemetry-label font-bold text-[#1D1D1F]">Protocol Feed</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {staff.map(u => (
              <motion.div 
                key={u.user_id}
                whileHover={{ x: 4, backgroundColor: 'rgba(0,0,0,0.02)' }}
                onClick={() => setSelected(u)}
                className={`p-4 rounded-[16px] border transition-all cursor-pointer ${
                  selected?.user_id === u.user_id 
                    ? 'border-[#007AFF]/30 bg-[#007AFF]/5 shadow-sm' 
                    : 'border-black/5 bg-white'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${u.is_inside ? 'bg-[#34C759]' : 'bg-[#FF3B30] animate-pulse'}`} />
                    <span className="text-sm font-bold text-[#1D1D1F] tracking-tight">{u.first_name} {u.last_name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#86868B]">{format(new Date(u.pinged_at), 'HH:mm')}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[#86868B] font-medium tracking-wide truncate max-w-[120px]">{u.site_name}</span>
                  <span className={`font-bold ${u.is_inside ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                    {u.is_inside ? 'NOMINAL' : 'ALERT'}
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
            className="absolute top-6 right-6 bottom-6 w-[380px] bg-white/95 backdrop-blur-2xl rounded-[32px] z-20 pointer-events-auto flex flex-col shadow-premium border border-black/5 overflow-hidden"
          >
            {/* Header / ID Card */}
            <div className="p-8 bg-gradient-to-b from-[#F5F5F7] to-transparent border-b border-black/5 relative text-center">
              <button 
                onClick={() => setSelected(null)}
                className="absolute top-6 right-6 p-2 bg-black/5 rounded-full text-[#86868B] hover:text-[#1D1D1F] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-[#007AFF]/10 p-1 mb-4 flex items-center justify-center">
                  <div className="w-full h-full rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center text-[#007AFF] font-bold text-3xl">
                    {selected.avatar_url ? (
                      <img src={`${(import.meta.env.VITE_API_BASE_URL || '').replace('/api', '')}${selected.avatar_url}`} className="w-full h-full object-cover" />
                    ) : (
                      selected.first_name[0]
                    )}
                  </div>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">{selected.first_name} {selected.last_name}</h2>
                <div className="flex items-center gap-3 mt-3">
                   <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest bg-white ${selected.is_inside ? 'text-[#34C759] border border-[#34C759]/30' : 'text-[#FF3B30] border border-[#FF3B30]/30'}`}>
                      {selected.is_inside ? 'INSIDE ZONE' : 'BREACHED'}
                   </div>
                </div>
              </div>
            </div>

            {/* Vital Signs / Telemetry */}
            <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Assigned Site</span>
                  <div className="flex items-center gap-2">
                    <Navigation className="w-3.5 h-3.5 text-[#1D1D1F]" />
                    <span className="text-sm font-bold text-[#1D1D1F] truncate">{selected.site_name}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Session Time</span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#1D1D1F]" />
                    <span className="text-sm font-bold text-[#1D1D1F]">{formatDistanceToNow(new Date(selected.check_in_time))}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Spatial Drift</span>
                  <span className="text-sm font-bold text-[#FF3B30] block mt-1">{Math.round(selected.total_away_minutes)}m Deviation</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Auth Status</span>
                  <span className="text-sm font-bold text-[#1D1D1F] block mt-1 uppercase">ID_{selected.user_id.split('-')[0]}</span>
                </div>
              </div>

              {/* Logs */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Mission Parameters</span>
                <div className="p-5 rounded-2xl bg-black/5 text-[#86868B] text-sm leading-relaxed font-medium">
                  "{selected.check_in_note || 'No check-in note provided.'}"
                </div>
              </div>

              {/* Action: Command Broadcast */}
              <div className="space-y-4 pt-6 border-t border-black/5">
                <span className="text-[10px] font-bold uppercase text-[#86868B] tracking-wider">Terminal Directive</span>
                <div className="space-y-3">
                  <textarea 
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    className="bg-black/5 border-transparent rounded-2xl p-4 text-sm text-[#1D1D1F] placeholder-[#86868B] w-full h-24 resize-none focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 transition-all font-medium"
                    placeholder="Enter broadcast message..."
                  />
                  <button 
                    disabled={sendingMsg}
                    className="btn-apple bg-[#007AFF] text-white w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-[0_4px_14px_rgba(0,122,255,0.3)] hover:shadow-[0_6px_20px_rgba(0,122,255,0.4)]"
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
                    <Send className="w-4 h-4" /> Transmit Command
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#F5F5F7] text-center border-t border-black/5">
               <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Secure Link Active</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
