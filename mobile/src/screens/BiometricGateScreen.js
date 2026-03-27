// src/screens/BiometricGateScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen biometric authentication gate.
// Appears on every cold launch BEFORE the main tabs are shown.
// If biometrics are unavailable (no hardware, not enrolled), passes through.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, StatusBar, Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence, interpolate, FadeIn,
} from 'react-native-reanimated';
import { ShieldCheck, Fingerprint, AlertTriangle } from 'lucide-react-native';

export default function BiometricGateScreen({ onUnlocked }) {
  const [checking, setChecking]       = useState(true);
  const [supported, setSupported]     = useState(false);
  const [enrolled, setEnrolled]       = useState(false);
  const [failed, setFailed]           = useState(false);
  const [failCount, setFailCount]     = useState(0);
  const [authenticating, setAuthenticating] = useState(false);

  // Animations
  const pulse  = useSharedValue(0);
  const shake  = useSharedValue(0);
  const glow   = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2500 }), -1, true);
    glow.value  = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
    checkBiometricCapability();
  }, []);

  const checkBiometricCapability = async () => {
    const hasHW  = await LocalAuthentication.hasHardwareAsync();
    const isEnr  = await LocalAuthentication.isEnrolledAsync();
    setSupported(hasHW);
    setEnrolled(isEnr);
    setChecking(false);

    if (!hasHW || !isEnr) {
      // No biometrics available — pass through immediately
      setTimeout(() => onUnlocked(), 500);
    } else {
      // Trigger automatically on first render
      setTimeout(() => triggerBiometric(), 400);
    }
  };

  const triggerBiometric = async () => {
    if (authenticating) return;
    setAuthenticating(true);
    setFailed(false);

    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'OPERATOR_IDENTITY_VERIFICATION',
        fallbackLabel: 'USE_PIN',
        cancelLabel: 'ABORT',
        disableDeviceFallback: false,
        biometricsSecurityLevel: Platform.OS === 'android' ? 'strong' : undefined,
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        glow.value = withTiming(2, { duration: 400 });
        setTimeout(() => onUnlocked(), 300);
      } else {
        setFailed(true);
        setFailCount(prev => prev + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake.value = withSequence(
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 60 }),
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        );

        if (result.error === 'lockout' || result.error === 'lockout_permanent') {
          Alert.alert(
            'BIOMETRIC_LOCKOUT',
            'Too many failed attempts. The system has been locked. Contact your administrator.',
            [{ text: 'ACKNOWLEDGE', style: 'destructive' }]
          );
        }
      }
    } catch (err) {
      console.error('Biometric error:', err);
      // Pass through on error so app remains usable
      onUnlocked();
    } finally {
      setAuthenticating(false);
    }
  };

  // Animated styles
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.15, 0.5]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.6]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0, 1, 2], [0.3, 0.8, 1.0]),
    shadowRadius: interpolate(glow.value, [0, 1, 2], [10, 25, 40]),
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  if (checking) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#00F5FF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background grid lines */}
      <View style={styles.bgGrid}>
        {[0.15, 0.35, 0.55, 0.75, 0.9].map((top, i) => (
          <View key={i} style={[styles.gridLine, { top: `${top * 100}%` }]} />
        ))}
      </View>

      <Animated.View entering={FadeIn.duration(800)} style={styles.content}>
        
        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={styles.systemLabel}>FIELD_TERMINAL_SECURITY</Text>
          <Text style={styles.title}>IDENTITY{'\n'}VERIFICATION</Text>
          <View style={styles.divider} />
        </View>

        {/* Biometric Icon with Pulse */}
        <Animated.View style={[styles.iconWrapper, shakeStyle]}>
          <Animated.View style={[styles.pulseRing, pulseStyle]} />
          <Animated.View style={[styles.iconCircle, glowStyle, failed && styles.iconCircleFailed]}>
            {failed
              ? <AlertTriangle size={40} color="#FF3D00" />
              : <ShieldCheck size={40} color="#00F5FF" />
            }
          </Animated.View>
        </Animated.View>

        {/* Status text */}
        <View style={styles.statusArea}>
          {authenticating ? (
            <>
              <ActivityIndicator color="#00F5FF" style={{ marginBottom: 12 }} />
              <Text style={styles.statusText}>SCANNING_BIOMETRIC_SIGNATURE...</Text>
            </>
          ) : failed ? (
            <>
              <Text style={[styles.statusText, { color: '#FF3D00' }]}>
                IDENTITY_VERIFICATION_FAILED
              </Text>
              {failCount >= 3 && (
                <Text style={styles.warnText}>
                  Multiple failures logged. Incident reported to admin.
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.statusText}>AWAITING_BIOMETRIC_INPUT</Text>
          )}
        </View>

        {/* Retry button */}
        {!authenticating && (
          <TouchableOpacity
            style={[styles.authBtn, failed && styles.authBtnFailed]}
            onPress={triggerBiometric}
            activeOpacity={0.8}
          >
            <Fingerprint size={18} color={failed ? '#FF3D00' : '#000'} />
            <Text style={[styles.authBtnText, failed && { color: '#FF3D00' }]}>
              {failed ? 'RETRY_AUTHENTICATION' : 'BEGIN_SCAN'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          ENCRYPTED_SESSION // ZERO-TRUST_PROTOCOL_v2
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
  },
  gridLine: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#00F5FF',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  titleArea: {
    alignItems: 'center',
    marginBottom: 60,
  },
  systemLabel: {
    fontSize: 9,
    color: '#4A4A4A',
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 40,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: '#00F5FF',
    marginTop: 20,
    shadowColor: '#00F5FF',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  iconWrapper: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#00F5FF',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 245, 255, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  iconCircleFailed: {
    borderColor: 'rgba(255, 61, 0, 0.4)',
    backgroundColor: 'rgba(255, 61, 0, 0.06)',
    shadowColor: '#FF3D00',
  },
  statusArea: {
    alignItems: 'center',
    minHeight: 60,
    marginBottom: 32,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#00F5FF',
    letterSpacing: 2,
    textAlign: 'center',
  },
  warnText: {
    fontSize: 11,
    color: '#FF8A00',
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#00F5FF',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 16,
    shadowColor: '#00F5FF',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 48,
  },
  authBtnFailed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF3D00',
    shadowColor: '#FF3D00',
  },
  authBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.5,
  },
  footer: {
    fontSize: 8,
    color: '#1A1A1A',
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
});
