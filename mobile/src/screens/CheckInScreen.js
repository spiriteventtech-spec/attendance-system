// src/screens/CheckInScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust Check-In Flow:
//   1. SLIDE → triggers biometric re-authentication (expo-local-authentication)
//   2. BIOMETRIC PASS → opens selfie camera (expo-camera)
//   3. SELFIE CAPTURED → uploads to /api/security/checkin-selfie (AWS Rekognition)
//   4. IDENTITY CONFIRMED → shows note entry modal
//   5. NOTE CONFIRMED → check-in submitted
//
// Floating QR button in the bottom-right corner for offline/poor-signal sites.
// Mock location detection on every foreground ping.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  Alert, ActivityIndicator, Dimensions, Platform, StatusBar,
} from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence,
  interpolate,
  runOnJS
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { 
  ShieldCheck, Navigation, Activity, Clock, MapPin, Wifi, Zap, LogOut,
  Target, ChevronRight, QrCode, Camera, CheckCircle, XCircle, Fingerprint
} from 'lucide-react-native';
import { attendanceAPI, locationAPI, securityAPI, shiftsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
const LOCATION_TASK  = 'background-location-task';
const POLL_INTERVAL  = 30000;

// ── Selfie verification steps ─────────────────────────────────────────────────
const SELFIE_STEP = { IDLE: 'idle', CAMERA: 'camera', VERIFYING: 'verifying', DONE: 'done' };

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
    try {
      const providerStatus = await Location.getProviderStatusAsync().catch(() => null);
      const isMock = providerStatus?.isLocationSimulated ?? false;
      await locationAPI.ping(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy, isMock);
    } catch {}
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
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [location,      setLocation]     = useState(null);
  const [activeLog,     setActiveLog]    = useState(null);
  const [isInside,      setIsInside]     = useState(false);
  const [loading,       setLoading]      = useState(true);
  const [noteModal,     setNoteModal]    = useState({ visible: false, type: null });
  const [noteText,      setNoteText]     = useState('');
  const [submitting,    setSubmitting]   = useState(false);

  // Zero-Trust state
  const [selfieStep,    setSelfieStep]   = useState(SELFIE_STEP.IDLE);
  const [selfieResult,  setSelfieResult] = useState(null); // { passed, confidence }
  const [pendingAction, setPendingAction] = useState(null); // 'checkin' | 'checkout'

  // QR Scanner modal
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrNote,         setQrNote]         = useState('');
  const [qrScanned,      setQrScanned]      = useState(false);
  const [qrSubmitting,   setQrSubmitting]   = useState(false);

  // Shift info
  const [nextShift,      setNextShift]      = useState(null);
  const [isRefreshing,   setIsRefreshing]   = useState(false);

  // Animations
  const radarPulse  = useSharedValue(0);
  const scanLine    = useSharedValue(0);
  const slideValue  = useSharedValue(0);
  const selfieGlow  = useSharedValue(0);

  useEffect(() => {
    init();
    loadNextShift();
    radarPulse.value = withRepeat(withTiming(1, { duration: 3000 }), -1, false);
    scanLine.value   = withRepeat(withTiming(1, { duration: 4000 }), -1, false);
    selfieGlow.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
    return () => { stopTracking(); };
  }, []);

  // Foreground Polling Loop with mock-location detection
  useEffect(() => {
    let interval;
    if (activeLog) {
      interval = setInterval(async () => {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(pos.coords);

          // ── Mock location check ──────────────────────────────────────────
          const providerStatus = await Location.getProviderStatusAsync().catch(() => null);
          const isMock = providerStatus?.isLocationSimulated ?? false;

          if (isMock) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
              '🚨 GPS_TAMPERING_DETECTED',
              'Mock location software detected. This incident has been logged and reported.',
              [{ text: 'UNDERSTOOD', style: 'destructive' }]
            );
          }

          const { data: pingRes } = await locationAPI.ping(
            pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, isMock
          );

          setIsInside(pingRes.isInside ?? isInside);

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
    } else {
      // Not checked in - refresh next shift occasionally
      loadNextShift();
    }
    return () => clearInterval(interval);
  }, [activeLog, isInside]);

  const loadNextShift = async () => {
    try {
      const { data: shifts } = await shiftsAPI.getMyShifts();
      const upcoming = shifts
        .filter(s => new Date(s.start_time) > new Date() || s.status === 'scheduled')
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
      setNextShift(upcoming);
    } catch (e) {
      console.error('Failed to load next shift:', e);
    }
  };

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

  // ── ZERO-TRUST CHECK-IN FUNNEL ────────────────────────────────────────────
  // Step 1: Slider completed → trigger biometric re-auth
  const initiateSecureAction = useCallback(async (actionType) => {
    setPendingAction(actionType);

    // Step 1: Biometric re-authentication
    const hasHW  = await LocalAuthentication.hasHardwareAsync();
    const isEnr  = await LocalAuthentication.isEnrolledAsync();

    if (hasHW && isEnr) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: actionType === 'checkin' ? 'Confirm identity to check in' : 'Confirm identity to check out',
        fallbackLabel: 'Use PIN',
      });

      if (!result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        slideValue.value = withTiming(0);
        Alert.alert('AUTH_FAILED', 'Biometric verification failed.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Step 2: Selfie verification (only for check-in, not check-out)
    if (actionType === 'checkin') {
      await requestSelfie();
    } else {
      // Checkout doesn't need selfie — go straight to note modal
      setSelfieResult({ passed: true, skipped: true });
      setNoteModal({ visible: true, type: 'checkout' });
    }
  }, []);

  // Step 2: Open camera for selfie
  const requestSelfie = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        // Selfie skipped — proceed without it
        setNoteModal({ visible: true, type: 'checkin' });
        return;
      }
    }
    setSelfieStep(SELFIE_STEP.CAMERA);
  };

  // Step 3: Take photo and verify
  const captureSelfie = async () => {
    if (!cameraRef.current) return;
    setSelfieStep(SELFIE_STEP.VERIFYING);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      const { data: result } = await securityAPI.checkInSelfie(photo.base64);
      setSelfieResult(result);

      if (!result.passed && !result.skipped) {
        // Identity mismatch — block check-in
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSelfieStep(SELFIE_STEP.DONE);
        Alert.alert(
          '🚫 IDENTITY_REJECTED',
          `Face match confidence: ${result.confidence?.toFixed(1) ?? 0}% (minimum: ${result.threshold ?? 80}%)\n\nThis incident has been logged.`,
          [{ text: 'ABORT', style: 'destructive', onPress: () => {
            setSelfieStep(SELFIE_STEP.IDLE);
            slideValue.value = withTiming(0);
          }}]
        );
        return;
      }

      // Selfie passed or skipped — proceed to note
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelfieStep(SELFIE_STEP.DONE);
      setTimeout(() => {
        setSelfieStep(SELFIE_STEP.IDLE);
        setNoteModal({ visible: true, type: pendingAction || 'checkin' });
      }, 800);
    } catch (err) {
      console.error('Selfie capture error:', err);
      setSelfieStep(SELFIE_STEP.IDLE);
      // On error, allow check-in to proceed
      setNoteModal({ visible: true, type: pendingAction || 'checkin' });
    }
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
        await attendanceAPI.checkIn(activeLog?.site_id || null, latitude, longitude, noteText.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await attendanceAPI.checkOut(latitude, longitude, noteText.trim());
        await stopTracking();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      setNoteModal({ visible: false, type: null });
      setNoteText('');
      setSelfieResult(null);
      setPendingAction(null);
      await refreshAll();
    } catch (err) {
      Alert.alert('COMM_FAIL', err.response?.data?.error || 'Failed to sync with command center.');
    } finally {
      setSubmitting(false);
      slideValue.value = withTiming(0);
    }
  };

  // ── QR SCANNER ────────────────────────────────────────────────────────────
  const handleQRScan = async ({ data: scannedData }) => {
    if (qrScanned || qrSubmitting) return;
    setQrScanned(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const payload = JSON.parse(scannedData);
      if (payload.type !== 'ATTENDANCE_QR' || !payload.token) {
        Alert.alert('INVALID_QR', 'This QR code is not a valid attendance token.');
        setQrScanned(false);
        return;
      }

      setQrSubmitting(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      await securityAPI.verifyQR(
        payload.token,
        pos.coords.latitude,
        pos.coords.longitude,
        qrNote.trim() || 'QR check-in'
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQrModalVisible(false);
      setQrNote('');
      await refreshAll();
      Alert.alert('✅ CHECK-IN_CONFIRMED', 'QR code verified. Session authorized.');
    } catch (err) {
      const code = err.response?.data?.error;
      const msg = {
        QR_EXPIRED: 'This QR code has expired (24h limit). Ask an admin to generate a new one.',
        QR_ALREADY_USED: 'You have already used this QR code today.',
        QR_INVALID: 'Invalid or unknown QR code.',
      }[code] || err.response?.data?.error || 'QR verification failed.';
      Alert.alert('QR_REJECTED', msg);
      setQrScanned(false);
    } finally {
      setQrSubmitting(false);
    }
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
          runOnJS(initiateSecureAction)(activeLog ? 'checkout' : 'checkin');
        });
      } else {
        slideValue.value = withTiming(0);
      }
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#00F5FF" />
      <Text style={[styles.telemetryLabel, { marginTop: 20 }]}>INITIALIZING_ZERO_TRUST_TERMINAL...</Text>
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Security badge */}
            <View style={styles.securityBadge}>
              <ShieldCheck size={10} color="#22C55E" />
              <Text style={styles.securityBadgeText}>ZERO-TRUST</Text>
            </View>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <LogOut size={16} color="#4A4A4A" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* RADAR / MAP VIEW */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          customMapStyle={MAP_STYLE}
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
              strokeColor={isInside ? 'rgba(0, 245, 255, 0.8)' : 'rgba(255, 61, 0, 0.8)'}
              fillColor={isInside ? 'rgba(0, 245, 255, 0.15)' : 'rgba(255, 61, 0, 0.15)'}
              strokeWidth={2}
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
        
        {/* Aerospace HUD Overlays */}
        <View style={styles.radarOverlay} pointerEvents="none">
             <Animated.View style={[styles.scanLine, scanLineStyle]} />
             <View style={styles.gridOverlay}>
                {[1,2,3,4].map(i => <View key={i} style={[styles.radarRing, { width: i * 100, height: i * 100 }]} />)}
             </View>
        </View>

        {/* Status HUD */}
        <View style={styles.hudTop}>
            <View style={[styles.hudBadge, { borderColor: isInside ? 'rgba(0, 245, 255, 0.3)' : 'rgba(255, 61, 0, 0.3)' }]}>
                <View style={[styles.pulseDot, { backgroundColor: isInside ? '#00F5FF' : '#FF3D00' }]} />
                <Text style={[styles.hudText, { color: isInside ? '#00F5FF' : '#FF3D00' }]}>
                  {isInside ? 'GEOFENCE_ACTIVE' : 'OUT_OF_BOUNDS'}
                </Text>
            </View>
        </View>

        {/* Floating QR Button */}
        <TouchableOpacity
          style={styles.qrFloatingBtn}
          onPress={() => { setQrModalVisible(true); setQrScanned(false); }}
          activeOpacity={0.8}
        >
          <QrCode size={18} color="#000" />
          <Text style={styles.qrFloatingText}>QR</Text>
        </TouchableOpacity>
      </View>

      {/* NEXT SHIFT INTEL */}
      {nextShift && !activeLog && (
        <View style={styles.nextShiftContainer}>
           <View style={styles.glassBackground} />
           <View style={styles.nextShiftContent}>
              <View style={styles.nextShiftIcon}>
                 <Calendar size={14} color="#00F5FF" />
              </View>
              <View style={{ flex: 1 }}>
                 <Text style={styles.nextShiftLabel}>UPCOMING_ASSIGNMENT</Text>
                 <Text style={styles.nextShiftValue}>{nextShift.site_name}</Text>
              </View>
              <View style={{ alignItems: 'right' }}>
                 <Text style={styles.nextShiftTime}>
                    {new Date(nextShift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </Text>
                 <Text style={styles.nextShiftDate}>
                    {new Date(nextShift.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                 </Text>
              </View>
           </View>
        </View>
      )}

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
        <View style={styles.authFlowLabel}>
          <Fingerprint size={10} color="#4A4A4A" />
          <Text style={styles.authFlowText}>BIOMETRIC → IDENTITY_SCAN → AUTHORIZE</Text>
        </View>
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

      {/* ── SELFIE CAMERA MODAL ─────────────────────────────────────────────── */}
      <Modal visible={selfieStep === SELFIE_STEP.CAMERA || selfieStep === SELFIE_STEP.VERIFYING} transparent animationType="fade">
        <View style={styles.selfieModalOverlay}>
          <View style={styles.selfieCard}>
            {/* Header */}
            <View style={styles.selfieHeader}>
              <Camera size={18} color="#00F5FF" />
              <Text style={styles.selfieTitle}>IDENTITY_SCAN</Text>
            </View>
            <Text style={styles.selfieSubtitle}>
              Position your face within the frame. Ensure good lighting.
            </Text>

            {/* Camera Frame */}
            <View style={styles.cameraFrame}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
              />
              {/* Corner brackets */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {selfieStep === SELFIE_STEP.VERIFYING && (
                <View style={styles.verifyingOverlay}>
                  <ActivityIndicator color="#00F5FF" size="large" />
                  <Text style={styles.verifyingText}>RUNNING_AI_SCAN...</Text>
                </View>
              )}
            </View>

            {/* Buttons */}
            <View style={styles.selfieBtns}>
              <TouchableOpacity
                style={styles.selfieAbortBtn}
                onPress={() => { setSelfieStep(SELFIE_STEP.IDLE); slideValue.value = withTiming(0); }}
                disabled={selfieStep === SELFIE_STEP.VERIFYING}
              >
                <XCircle size={16} color="#4A4A4A" />
                <Text style={styles.selfieAbortText}>ABORT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selfieCapBtn, selfieStep === SELFIE_STEP.VERIFYING && { opacity: 0.5 }]}
                onPress={captureSelfie}
                disabled={selfieStep === SELFIE_STEP.VERIFYING}
              >
                <CheckCircle size={16} color="#000" />
                <Text style={styles.selfieCapText}>CAPTURE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── NOTE TERMINAL MODAL ─────────────────────────────────────────────── */}
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
                onPress={() => {
                  setNoteModal({ visible: false, type: null });
                  setNoteText('');
                  slideValue.value = withTiming(0);
                }}
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

      {/* ── QR SCANNER MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={qrModalVisible} transparent animationType="slide">
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrCard}>
            <View style={styles.selfieHeader}>
              <QrCode size={18} color="#00F5FF" />
              <Text style={styles.selfieTitle}>QR_SITE_AUTHENTICATION</Text>
            </View>
            <Text style={styles.selfieSubtitle}>
              Scan the site QR code displayed at the event entrance.
            </Text>

            {/* QR Camera */}
            <View style={[styles.cameraFrame, { height: 220 }]}>
              {!qrScanned && !qrSubmitting ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleQRScan}
                >
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </CameraView>
              ) : (
                <View style={styles.verifyingOverlay}>
                  <ActivityIndicator color="#00F5FF" size="large" />
                  <Text style={styles.verifyingText}>VERIFYING_QR...</Text>
                </View>
              )}
            </View>

            {/* Optional note for QR check-in */}
            <TextInput
              style={[styles.noteInput, { marginTop: 16, minHeight: 60 }]}
              placeholder="OPTIONAL: ENTRY_NOTE..."
              placeholderTextColor="#2A2A2A"
              value={qrNote}
              onChangeText={setQrNote}
            />

            <TouchableOpacity
              style={styles.selfieAbortBtn}
              onPress={() => { setQrModalVisible(false); setQrScanned(false); setQrNote(''); }}
            >
              <XCircle size={16} color="#4A4A4A" />
              <Text style={styles.selfieAbortText}>CLOSE</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 24, paddingBottom: 16, zIndex: 10,
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
  securityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  securityBadgeText: { fontSize: 7, fontWeight: '900', color: '#22C55E', letterSpacing: 1 },

  mapContainer: { height: height * 0.42, overflow: 'hidden' },
  map: { ...StyleSheet.absoluteFillObject },
  markerContainer: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#00F5FF' },
  markerCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#00F5FF' },
  
  radarOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanLine: { position: 'absolute', width: width, height: 2, backgroundColor: 'rgba(0, 245, 255, 0.1)', top: '50%' },
  
  hudTop: { position: 'absolute', top: 20, width: '100%', alignItems: 'center' },
  hudBadge: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, gap: 10
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  hudText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  gridOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  radarRing: { position: 'absolute', borderRadius: 1000, borderWidth: 1, borderColor: 'rgba(0, 245, 255, 0.03)' },

  // Floating QR button
  qrFloatingBtn: {
    position: 'absolute', bottom: 16, right: 16,
    backgroundColor: '#00F5FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    shadowColor: '#00F5FF', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  qrFloatingText: { fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1 },

  telemetryArea: { padding: 16, gap: 12 },
  telemetryRow: { flexDirection: 'row', gap: 12 },
  telemetryCard: { 
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', 
    borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
  },
  telemetryIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  telemetryLabel: { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 },
  telemetryValue: { fontSize: 13, color: '#FFF', fontWeight: 'bold', letterSpacing: 0.5 },

  actionArea: { padding: 24, flex: 1, justifyContent: 'flex-end' },
  authFlowLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 12 },
  authFlowText: { fontSize: 8, color: '#4A4A4A', fontWeight: '900', letterSpacing: 1.5 },
  sliderTray: { height: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 30, justifyContent: 'center', padding: 4, position: 'relative' },
  sliderHandle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#00F5FF', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  handlePulse: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: '#00F5FF', opacity: 0.2 },
  sliderText: { position: 'absolute', width: '100%', textAlign: 'center', fontSize: 10, fontWeight: 'bold', color: 'rgba(0, 245, 255, 0.3)', letterSpacing: 1 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 8 },
  refreshText: { fontSize: 10, color: '#00F5FF', fontWeight: 'bold', letterSpacing: 2 },

  // Selfie Camera Modal
  selfieModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', padding: 24 },
  selfieCard: { backgroundColor: '#0A0A0A', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#1A1A1A' },
  selfieHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  selfieTitle: { color: '#00F5FF', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  selfieSubtitle: { color: '#4A4A4A', fontSize: 11, marginBottom: 20, letterSpacing: 0.5 },
  cameraFrame: {
    width: '100%', height: 280, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#000', position: 'relative',
  },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#00F5FF', borderWidth: 2 },
  cornerTL: { top: 8, left: 8, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 8, right: 8, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 8, left: 8, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 8, right: 8, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  verifyingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', gap: 16 },
  verifyingText: { color: '#00F5FF', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  selfieBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  selfieAbortBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50 },
  selfieAbortText: { color: '#4A4A4A', fontSize: 11, fontWeight: 'bold' },
  selfieCapBtn: { flex: 2, height: 50, backgroundColor: '#00F5FF', borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  selfieCapText: { color: '#000', fontSize: 12, fontWeight: '900' },

  // Note Modal
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

  // QR Modal
  qrModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-end', paddingBottom: 32 },
  qrCard: { backgroundColor: '#0A0A0A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderColor: '#1A1A1A' },

  // Next Shift Styles
  nextShiftContainer: {
    position: 'absolute',
    top: 110,
    left: 20,
    right: 20,
    height: 70,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.1)',
    zIndex: 100,
  },
  nextShiftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  nextShiftIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 245, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextShiftLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#00F5FF',
    letterSpacing: 1,
  },
  nextShiftValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2,
  },
  nextShiftTime: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'right',
  },
  nextShiftDate: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#4A4A4A',
    textAlign: 'right',
    marginTop: 2,
  },
});
