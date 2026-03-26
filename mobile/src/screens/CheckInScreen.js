// src/screens/CheckInScreen.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  Alert, ActivityIndicator, Dimensions, Platform, StatusBar,
} from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence,
  interpolate,
  Extrapolate,
  runOnJS
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { 
  ShieldCheck, 
  Navigation, 
  Activity, 
  Clock, 
  MapPin, 
  Wifi, 
  Zap, 
  LogOut,
  Target,
  ChevronRight
} from 'lucide-react-native';
import { attendanceAPI, locationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const LOCATION_TASK = 'background-location-task';
const POLL_INTERVAL = 30000;

// Aerospace Map Configuration
const MAP_STYLE = [
  { "elementType": "geometry", "stylers": [{ "color": "#121212" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#4A4A4A" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#000000" }] },
  { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [{ "color": "#1F1F1F" }] },
  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#0F0F0F" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1A1A1A" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#242424" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0A0A0A" }] }
];

// Background Location Task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  if (data?.locations?.[0]) {
    const loc = data.locations[0];
    try { await locationAPI.ping(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy); } catch {}
  }
});

// Telemetry Card Component
const TelemetryCard = ({ label, value, icon: Icon, color = '#00F5FF' }) => (
  <View style={styles.telemetryCard}>
    <View style={[styles.telemetryIcon, { borderColor: color + '33' }]}>
      <Icon size={14} color={color} />
    </View>
    <View>
      <Text style={styles.telemetryLabel}>{label}</Text>
      <Text style={styles.telemetryValue}>{value}</Text>
    </View>
  </View>
);

export default function CheckInScreen() {
  const { user, logout } = useAuth();
  const mapRef = useRef(null);

  const [location,      setLocation]     = useState(null);
  const [activeLog,     setActiveLog]    = useState(null);
  const [isInside,      setIsInside]     = useState(false);
  const [loading,       setLoading]      = useState(true);
  const [noteModal,     setNoteModal]    = useState({ visible: false, type: null });
  const [noteText,      setNoteText]     = useState('');
  const [submitting,    setSubmitting]   = useState(false);

  // Animations
  const radarPulse = useSharedValue(0);
  const scanLine = useSharedValue(0);
  const slideValue = useSharedValue(0);

  useEffect(() => {
    init();
    radarPulse.value = withRepeat(withTiming(1, { duration: 3000 }), -1, false);
    scanLine.value = withRepeat(withTiming(1, { duration: 4000 }), -1, false);
    return () => { stopTracking(); };
  }, []);

  // Foreground Polling Loop
  useEffect(() => {
    let interval;
    if (activeLog) {
      interval = setInterval(async () => {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(pos.coords);
          
          const { data: pingRes } = await locationAPI.ping(
            pos.coords.latitude, 
            pos.coords.longitude, 
            pos.coords.accuracy
          );
          
          setIsInside(pingRes.isInside);
          
          if (pingRes.breachOpened) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Alert.alert(
              '🚨 GEOFENCE_BREACH',
              'Device has exited the designated mission perimeter. Return immediately.',
              [{ text: 'ACKNOWLEDGE', style: 'destructive' }]
            );
          }
        } catch (e) {
          console.warn('Foreground polling error:', e);
        }
      }, POLL_INTERVAL);
    }
    return () => clearInterval(interval);
  }, [activeLog]);

  const init = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('SYSTEM_CRITICAL', 'Location permissions required for terminal initialization.');
      return;
    }
    await refreshAll();
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [pos, logRes] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        attendanceAPI.getActive(),
      ]);
      setLocation(pos.coords);
      setActiveLog(logRes.data);
      if (logRes.data) {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, logRes.data.latitude, logRes.data.longitude);
        setIsInside(dist <= logRes.data.radius_meters);
        await startBackgroundTracking();
      }
    } finally { setLoading(false); }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const startBackgroundTracking = async () => {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') return;
      const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
      if (!started) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: POLL_INTERVAL,
          distanceInterval: 20,
          foregroundService: {
            notificationTitle: 'TERMINAL_ACTIVE',
            notificationBody: 'Precision Location Monitoring in Progress.',
          },
        });
      }
    } catch {}
  };

  const stopTracking = async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  };

  const submitNote = async () => {
    if (noteText.trim().length < 3) {
      Alert.alert('NOTE_REQUIRED', 'Please provide mission-specific briefing (3+ characters).');
      return;
    }
    setSubmitting(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      if (noteModal.type === 'checkin') {
        await attendanceAPI.checkIn(activeLog.site_id, latitude, longitude, noteText.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await attendanceAPI.checkOut(latitude, longitude, noteText.trim());
        await stopTracking();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      setNoteModal({ visible: false, type: null });
      await refreshAll();
    } catch (err) {
      Alert.alert('COMM_FAIL', err.response?.data?.error || 'Failed to sync with command center.');
    } finally { setSubmitting(false); slideValue.value = withTiming(0); }
  };

  // Animated Styles
  const radarPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(radarPulse.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(radarPulse.value, [0, 1], [0.8, 2]) }],
  }));

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: scanLine.value * 360 + 'deg' }],
  }));

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideValue.value }],
  }));

  const handleSliderGesture = (event) => {
    const maxX = width - 110;
    if (event.nativeEvent.translationX > 0) {
      slideValue.value = Math.min(event.nativeEvent.translationX, maxX);
    }
    if (event.nativeEvent.state === 3) { // End
      if (slideValue.value > maxX * 0.8) {
        slideValue.value = withTiming(maxX, {}, () => {
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
          runOnJS(setNoteModal)({ visible: true, type: activeLog ? 'checkout' : 'checkin' });
        });
      } else {
        slideValue.value = withTiming(0);
      }
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#00F5FF" />
      <Text style={[styles.telemetryLabel, { marginTop: 20 }]}>INITIALIZING_TERMINAL_LINK...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER: OPERATOR IDENTITY */}
      <View style={styles.header}>
        <View style={styles.glassBackground} />
        <View style={styles.headerContent}>
          <View>
            <View style={styles.statusIndicator}>
              <View style={[styles.led, activeLog ? styles.ledActive : styles.ledIdle]} />
              <Text style={styles.telemetryLabel}>
                {activeLog ? 'SESSION_AUTHORIZED' : 'TERMINAL_STANDBY'}
              </Text>
            </View>
            <Text style={styles.operatorName}>{user?.firstName?.toUpperCase()} // OP_01</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <LogOut size={16} color="#4A4A4A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* RADAR / MAP VIEW */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          customMapStyle={MAP_STYLE}
          // Note: Native Google Maps SDK follows device locale. 
          // To force English, the device language must be set to English.
          initialRegion={{
            latitude: location?.latitude || 25.2854,
            longitude: location?.longitude || 51.5310,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005
          }}
          showsUserLocation={false}
        >
          {activeLog && (
            <Circle
              center={{ latitude: activeLog.latitude, longitude: activeLog.longitude }}
              radius={activeLog.radius_meters}
              strokeColor={isInside ? 'rgba(0, 245, 255, 0.4)' : 'rgba(255, 61, 0, 0.4)'}
              fillColor={isInside ? 'rgba(0, 245, 255, 0.05)' : 'rgba(255, 61, 0, 0.05)'}
              strokeWidth={1}
              lineDashPattern={[5, 5]}
            />
          )}
          {location && (
             <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }}>
                <View style={styles.markerContainer}>
                    <Animated.View style={[styles.pulseRing, radarPulseStyle]} />
                    <View style={styles.markerCore} />
                </View>
             </Marker>
          )}
        </MapView>
        
        {/* Radar Overlay Decoration */}
        <View style={styles.radarOverlay} pointerEvents="none">
             <Animated.View style={[styles.scanLine, scanLineStyle]} />
             <View style={styles.radarRingSmall} />
             <View style={styles.radarRingLarge} />
        </View>

        {/* Geofence HUD */}
        <View style={styles.hudTop}>
            <View style={styles.hudBadge}>
                <Navigation size={12} color="#00F5FF" />
                <Text style={styles.hudText}>{isInside ? 'TARGET_IN_RANGE' : 'OUT_OF_SECTOR'}</Text>
            </View>
        </View>
      </View>

      {/* TELEMETRY ANALYTICS */}
      <View style={styles.telemetryArea}>
        <View style={styles.telemetryRow}>
            <TelemetryCard 
                label="Mission Start" 
                value={activeLog ? new Date(activeLog.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                icon={Clock}
            />
            <TelemetryCard 
                label="Signal Quality" 
                value={location?.accuracy ? `${location.accuracy.toFixed(1)}m` : 'SEARCHING...'}
                icon={Wifi}
            />
        </View>
        <View style={styles.telemetryRow}>
            <TelemetryCard 
                label="Target Coordinates" 
                value={location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'UNKNOWN'}
                icon={Target}
            />
            <TelemetryCard 
                label="Shift Pulse" 
                value={activeLog ? `${activeLog.total_away_minutes}m LOSS` : 'NOMINAL'}
                icon={Zap}
                color={activeLog?.total_away_minutes > 0 ? '#FF3D00' : '#22C55E'}
            />
        </View>
      </View>

      {/* ACTION AREA: SLIDE TO AUTHORIZE */}
      <View style={styles.actionArea}>
        <View style={styles.sliderTray}>
            <PanGestureHandler onGestureEvent={handleSliderGesture}>
                <Animated.View style={[styles.sliderHandle, sliderStyle]}>
                    <ChevronRight color="#000" size={24} />
                    <View style={styles.handlePulse} />
                </Animated.View>
            </PanGestureHandler>
            <Text style={styles.sliderText}>
                {activeLog ? '>>> SLIDE TO DECOMMISSION' : '>>> SLIDE TO AUTHORIZE'}
            </Text>
        </View>
        <TouchableOpacity onPress={refreshAll} style={styles.refreshBtn}>
             <Activity size={14} color="#00F5FF" />
             <Text style={styles.refreshText}>RESCAN_ENVIRONMENT</Text>
        </TouchableOpacity>
      </View>

      {/* NOTE TERMINAL MODAL */}
      <Modal visible={noteModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
                <ShieldCheck size={20} color="#00F5FF" />
                <Text style={styles.modalTitle}>POST_FLIGHT_DEBRIEFING</Text>
            </View>
            <Text style={styles.modalSubtitle}>Please enter mission parameters and operational status.</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="ENTER LOG DATA..."
              placeholderTextColor="#2A2A2A"
              multiline
              value={noteText}
              onChangeText={setNoteText}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setNoteModal({ visible: false, type: null }); slideValue.value = withTiming(0); }}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>ABORT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={submitNote}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.confirmBtnText}>COMMIT_DATA</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  center:       { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  
  header: {
    height: 120, justifyContent: 'flex-end',
    paddingHorizontal: 24, paddingBottom: 16,
    zIndex: 10,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statusIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  led: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  ledActive: { backgroundColor: '#22C55E', shadowColor: '#22C55E', shadowRadius: 4, elevation: 4 },
  ledIdle: { backgroundColor: '#4A4A4A' },
  operatorName: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
  logoutBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },

  mapContainer: { height: height * 0.45, overflow: 'hidden' },
  map: { ...StyleSheet.absoluteFillObject },
  markerContainer: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#00F5FF' },
  markerCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#00F5FF' },
  
  radarOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanLine: { position: 'absolute', width: width, height: 2, backgroundColor: 'rgba(0, 245, 255, 0.1)', top: '50%' },
  radarRingSmall: { width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(0, 245, 255, 0.05)' },
  radarRingLarge: { width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: 'rgba(0, 245, 255, 0.03)' },
  
  hudTop: { position: 'absolute', top: 20, width: '100%', alignItems: 'center' },
  hudBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0, 245, 255, 0.2)' },
  hudText: { color: '#00F5FF', fontSize: 10, fontWeight: 'bold', marginLeft: 8, letterSpacing: 1 },

  telemetryArea: { padding: 24, gap: 12 },
  telemetryRow: { flexDirection: 'row', gap: 12 },
  telemetryCard: { 
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', 
    borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
  },
  telemetryIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  telemetryLabel: { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 },
  telemetryValue: { fontSize: 13, color: '#FFF', fontWeight: 'bold', letterSpacing: 0.5 },

  actionArea: { padding: 24, flex: 1, justifyContent: 'flex-end' },
  sliderTray: { height: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 30, justifyContent: 'center', padding: 4, position: 'relative' },
  sliderHandle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#00F5FF', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  handlePulse: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: '#00F5FF', opacity: 0.2 },
  sliderText: { position: 'absolute', width: '100%', textAlign: 'center', fontSize: 10, fontWeight: 'bold', color: 'rgba(0, 245, 255, 0.3)', letterSpacing: 1 },
  
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 8 },
  refreshText: { fontSize: 10, color: '#00F5FF', fontWeight: 'bold', letterSpacing: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#111', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1A1A1A' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  modalTitle: { color: '#00F5FF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  modalSubtitle: { color: '#4A4A4A', fontSize: 11, marginBottom: 20 },
  noteInput: { backgroundColor: '#080808', borderRadius: 12, padding: 16, color: '#FFF', minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#1A1A1A' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, height: 50, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { color: '#4A4A4A', fontSize: 12, fontWeight: 'bold' },
  confirmBtn: { flex: 2, height: 50, backgroundColor: '#00F5FF', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: '#000', fontSize: 12, fontWeight: '900' },
});
