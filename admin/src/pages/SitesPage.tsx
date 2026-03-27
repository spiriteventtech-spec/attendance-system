import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { sitesAPI } from '../services/api';
import { 
  Plus, 
  MapPin, 
  MousePointer2, 
  Search, 
  X, 
  Crosshair, 
  Navigation, 
  Edit2, 
  Scan,
  Activity,
  ShieldCheck,
  Globe,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Badge, Modal, Spinner, EmptyState } from '../components/ui';
import toast from 'react-hot-toast';

function MapPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function LocateMe({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const map = useMap();
  const handleLocate = () => {
    map.locate().on('locationfound', (e) => {
      map.flyTo(e.latlng, 16);
      onLocate(e.latlng.lat, e.latlng.lng);
    });
  };

  return (
    <div className="absolute top-4 left-4 z-[1000]">
      <button 
        className="p-3 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-brand-cyan hover:shadow-neon-cyan transition-all"
        onClick={handleLocate}
        title="Find my location"
      >
        <Navigation className="w-5 h-5" />
      </button>
    </div>
  );
}

function LocationSearch({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 16, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

// Custom DivIcon for Site Selection
const createSiteMarker = () => L.divIcon({
  className: 'custom-site-marker',
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 rounded-full bg-brand-cyan/20 animate-ping"></div>
      <div class="relative w-4 h-4 rounded-full bg-brand-cyan border-2 border-white shadow-neon-cyan"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

export default function SitesPage() {
  const [sites,    setSites]   = useState<any[]>([]);
  const [loading,  setLoading] = useState(true);
  const [modal,    setModal]   = useState(false);
  const [selected, setSelected]= useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState({ name: '', description: '', latitude: '', longitude: '', radiusMeters: '100' });

  const pendingLoc = React.useMemo(() => {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const rad = parseInt(form.radiusMeters);
    return (!isNaN(lat) && !isNaN(lng)) ? { lat, lng, rad } : null;
  }, [form.latitude, form.longitude, form.radiusMeters]);

  useEffect(() => { fetchSites(); }, []);

  const fetchSites = async () => {
    setLoading(true);
    try {
        const { data } = await sitesAPI.list();
        setSites(data);
    } finally {
        setLoading(false);
    }
  };

  const handleMapPick = (lat: number, lng: number) => {
    setForm(f => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    setIsPicking(false);
    setModal(true);
    toast.success('Coordinates Saved');
  };

  const handleSearchSuggestions = async (val: string) => {
    setSearchQuery(val);
    if (val.length < 3) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&accept-language=en`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation is not supported by your browser');
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setForm(f => ({ ...f, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
      setFlyTo({ lat: latitude, lng: longitude });
      toast.success('Location Acquired');
    }, (err) => {
      toast.error('Failed to get current location');
    });
  };

  const selectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setFlyTo({ lat, lng });
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.latitude || !form.longitude) {
      toast.error('Please fill in all required fields'); return;
    }
    setSubmitting(true);
    try {
      const payload = { 
        ...form, 
        latitude: parseFloat(form.latitude), 
        longitude: parseFloat(form.longitude), 
        radiusMeters: parseInt(form.radiusMeters) 
      };

      if (isEditing && selected) {
        await sitesAPI.update(selected.id, payload);
        toast.success('Site Updated Successfully');
      } else {
        await sitesAPI.create(payload);
        toast.success('New Site Created Successfully');
      }

      setModal(false);
      setIsEditing(false);
      fetchSites();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save site');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this site?')) return;
    try {
        await sitesAPI.delete(id);
        toast.success('Site Deleted Successfully');
        fetchSites();
    } catch (err) {
        toast.error('Failed to delete site');
    }
  };

  if (loading) return <div className="flex justify-center py-32 bg-void"><Spinner size="lg" /></div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 h-[calc(100vh-64px)] flex flex-col bg-transparent">
      {/* HEADER SECTION */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between border-b border-black/5 pb-8"
      >
        <div>
           <span className="text-[11px] font-bold text-[#A855F7] uppercase tracking-widest">Site Management</span>
           <h1 className="text-4xl font-bold tracking-tight text-[#1D1D1F] mt-2">
             Deployment <span className="text-[#86868B]">Sites</span>
           </h1>
        </div>
        <button 
          className="btn-apple bg-[#A855F7] text-white shadow-premium py-3 px-8" 
          onClick={() => { setIsEditing(false); setForm({ name: '', description: '', latitude: '', longitude: '', radiusMeters: '100' }); setModal(true); }}
        >
          <Plus className="w-5 h-5 mr-2 inline" /> Add New Site
        </button>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 flex-1 min-h-0">
        {/* SITES LIST TERMINAL */}
        <div className="bg-white rounded-3xl flex flex-col overflow-hidden shadow-premium border border-black/5">
            <div className="p-8 border-b border-black/5 bg-gradient-to-br from-[#F5F5F7] to-transparent flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-[#A855F7]" />
                    <span className="text-sm font-bold text-[#1D1D1F]">{sites.length} Active Geofences</span>
                </div>
                <div className="flex gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#34C759] shadow-[0_0_8px_rgba(52,199,89,0.3)]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB]" />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                {sites.map((site, index) => (
                    <motion.div
                        key={site.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={clsx(
                            'bg-white rounded-[20px] group relative !p-6 cursor-pointer border shadow-sm transition-all duration-300 overflow-hidden hover:shadow-premium',
                            selected?.id === site.id ? 'border-[#AF52DE] bg-[#AF52DE]/[0.02] shadow-[0_0_20px_rgba(175,82,222,0.1)]' : 'border-black/5 hover:border-black/10'
                        )}
                        onClick={() => setSelected(selected?.id === site.id ? null : site)}
                    >
                        <div className="flex justify-between items-start">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-bold text-[#1D1D1F] tracking-tight group-hover:text-[#AF52DE] transition-colors">{site.name}</h3>
                                    <Badge label={site.is_active ? 'Active' : 'Locked'} variant={site.is_active ? 'active' : 'frozen'} />
                                </div>
                                <p className="text-xs text-[#86868B] font-medium">
                                    {site.description || 'No description provided'}
                                </p>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  className="p-2 rounded-xl bg-black/5 text-[#86868B] hover:text-[#007AFF] hover:bg-[#007AFF]/10 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); setSelected(site); setForm({ ...site, radiusMeters: site.radius_meters.toString() }); setModal(true); }}
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  className="p-2 rounded-xl bg-black/5 text-[#86868B] hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(site.id); }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-black/5 pt-6">
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Location</span>
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-[#A855F7]" />
                                    <span className="text-[11px] font-bold text-[#1D1D1F]">{parseFloat(site.latitude).toFixed(4)}°N, {parseFloat(site.longitude).toFixed(4)}°E</span>
                                </div>
                            </div>
                            <div className="space-y-1 text-right">
                                <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Radius</span>
                                <div className="flex items-center justify-end gap-2 text-[#FF9500]">
                                    <span className="text-[11px] font-bold">{site.radius_meters}m</span>
                                    <ShieldCheck className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>

        {/* TACTICAL MAP PREVIEW */}
        <div className="bg-white rounded-[24px] relative overflow-hidden h-full flex flex-col shadow-premium border border-black/5">
            <div className="absolute top-0 right-0 p-8 z-[1000] pointer-events-none opacity-[0.03]">
                <Scan className="w-48 h-48 text-[#1D1D1F]" />
            </div>

            <div className="flex-1 relative">
                {(selected || isPicking) ? (
                    <MapContainer
                        key={selected?.id || 'picking-map'}
                        center={selected ? [selected.latitude, selected.longitude] : [25.2854, 51.5310]}
                        zoom={selected ? 17 : 12}
                        className="w-full h-full"
                        zoomControl={false}
                    >
                        <TileLayer 
                          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en" 
                          attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
                        />
                        
                        {selected && (
                            <>
                                <Circle
                                    center={[selected.latitude, selected.longitude]}
                                    radius={selected.radius_meters}
                                    pathOptions={{ color: '#A855F7', fillColor: '#A855F7', fillOpacity: 0.1, weight: 1, dashArray: '10, 10' }}
                                />
                                <Marker position={[selected.latitude, selected.longitude]} icon={createSiteMarker()}>
                                    <Popup className="aerospace-popup">{selected.name}</Popup>
                                </Marker>
                            </>
                        )}

                        {pendingLoc && (isPicking || isEditing) && (
                            <>
                                <Circle
                                    center={[pendingLoc.lat, pendingLoc.lng]}
                                    radius={pendingLoc.rad}
                                    pathOptions={{ color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.15, weight: 2, dashArray: '5, 5' }}
                                />
                                <Marker 
                                    position={[pendingLoc.lat, pendingLoc.lng]} 
                                    draggable={true}
                                    icon={createSiteMarker()}
                                    eventHandlers={{
                                        dragend: (e) => {
                                            const marker = e.target;
                                            const position = marker.getLatLng();
                                            setForm(f => ({ ...f, latitude: position.lat.toFixed(6), longitude: position.lng.toFixed(6) }));
                                        },
                                    }}
                                />
                            </>
                        )}

                        {isPicking && <MapPicker onPick={handleMapPick} />}
                        {flyTo && <LocationSearch lat={flyTo.lat} lng={flyTo.lng} />}
                        <LocateMe onLocate={(lat, lng) => setFlyTo({ lat, lng })} />
                    </MapContainer>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F5F5F7]/80 backdrop-blur-md border border-black/5">
                        <Scan className="w-16 h-16 text-black/10 mb-6" />
                        <h4 className="text-sm font-bold text-[#86868B] tracking-wide text-center">Select a site to view on map</h4>
                    </div>
                )}

                {/* SEARCH INTERFACE OVERLAY */}
                <div className="absolute top-6 right-6 w-80 z-[1000]">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B] group-focus-within:text-[#007AFF] transition-colors" />
                        <input
                            className="bg-white/90 backdrop-blur-md border border-black/10 rounded-[20px] pl-12 pr-4 text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#007AFF]/50 focus:ring-4 focus:ring-[#007AFF]/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] h-12 w-full font-semibold"
                            placeholder="Search location..."
                            value={searchQuery}
                            onChange={e => handleSearchSuggestions(e.target.value)}
                        />
                    </div>
                    
                    <AnimatePresence>
                        {searchResults.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="mt-2 bg-white/95 backdrop-blur-2xl border border-black/10 rounded-[20px] shadow-[0_20px_40px_rgba(0,0,0,0.2)] overflow-hidden"
                            >
                                {searchResults.map((result, i) => (
                                    <button
                                        key={i}
                                        className="w-full text-left p-4 text-[11px] font-bold text-[#86868B] hover:bg-[#007AFF]/5 hover:text-[#007AFF] border-b border-black/5 last:border-0 transition-all uppercase tracking-widest leading-relaxed"
                                        onClick={() => selectSearchResult(result)}
                                    >
                                        <p className="line-clamp-2 leading-relaxed">{result.display_name}</p>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* PICKING MODE INDICATOR */}
                <AnimatePresence>
                    {isPicking && (
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] py-4 px-8 bg-[#007AFF] text-white rounded-full shadow-[0_4px_24px_rgba(0,122,255,0.4)] flex items-center gap-4 border-[3px] border-white"
                        >
                            <MousePointer2 className="w-5 h-5 animate-bounce" />
                            <span className="text-[11px] font-bold uppercase tracking-widest">Pinpointing Location</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            {/* TACTICAL OVERLAY TEXT */}
            <div className="p-6 bg-[#F5F5F7]/80 backdrop-blur-md border-t border-black/5 flex justify-between items-center">
                <div className="flex gap-4 items-center">
                    <div className="w-1 h-8 bg-[#A855F7] rounded-full" />
                    <div>
                        <p className="text-[9px] font-bold text-[#86868B] uppercase tracking-widest">Connection</p>
                        <p className="text-[11px] font-bold text-[#1D1D1F] tracking-tight">ENCRYPTED // ACTIVE</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-bold text-[#86868B] uppercase tracking-widest">Live Updates</p>
                    <p className="text-[11px] font-bold text-[#34C759] tracking-widest uppercase">Streaming</p>
                </div>
            </div>
        </div>
      </div>

      {/* DEPLOYMENT TERMINAL (MODAL) */}
      <Modal open={modal} onClose={() => setModal(false)} title={isEditing ? 'Update Site' : 'Create New Site'}>
        <div className="space-y-8">
          <div className="space-y-6">
              <div>
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Site Name</label>
                <input className="input-apple" placeholder="Enter site name..." value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Description (Optional)</label>
                <textarea className="input-apple h-24 resize-none py-4" placeholder="Brief site description..." value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              
              <div className="grid grid-cols-2 gap-6 bg-[#F5F5F7] p-6 rounded-[24px] border border-black/5 shadow-inner">
                <div>
                  <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest block mb-1">Latitude</label>
                  <input className="bg-transparent border-0 text-[#1D1D1F] text-xl focus:ring-0 w-full p-0 font-bold" placeholder="00.0000" type="number" step="any"
                    value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest block mb-1">Longitude</label>
                  <input className="bg-transparent border-0 text-[#1D1D1F] text-xl focus:ring-0 w-full p-0 font-bold" placeholder="00.0000" type="number" step="any"
                    value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  className={clsx(
                    "btn-apple-secondary py-4",
                    isPicking && "border-[#A855F7] text-[#A855F7] shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                  )}
                  onClick={() => { setIsPicking(!isPicking); if (!isPicking) setModal(false); }}
                >
                  <MousePointer2 className="w-4 h-4 mr-2 inline" /> {isPicking ? 'Selecting...' : 'Select on Map'}
                </button>
                <button 
                  type="button"
                  className="btn-apple-secondary py-4"
                  onClick={useCurrentLocation}
                >
                  <Crosshair className="w-4 h-4 mr-2 inline" /> Use Current Location
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Geofence Radius (Meters)</label>
                <div className="relative group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A855F7]" />
                    <input className="input-apple pl-12 text-[#A855F7] font-bold text-lg" type="number" min="10" max="10000"
                        value={form.radiusMeters} onChange={e => setForm(f => ({ ...f, radiusMeters: e.target.value }))} />
                </div>
                <p className="text-[10px] font-semibold text-[#86868B] mt-3 italic">Standard: 50m — Wide Range: 500m+</p>
              </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button className="flex-1 py-4 text-xs font-bold text-[#86868B] hover:text-[#1D1D1F] transition-colors" onClick={() => setModal(false)}>Cancel</button>
            <button 
              className="btn-apple flex-1 py-4 bg-[#A855F7] text-white shadow-premium font-bold" 
              onClick={handleSubmit} 
              disabled={submitting}
            >
              {submitting ? <Spinner size="sm" /> : (isEditing ? 'Update Site' : 'Create Site')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
