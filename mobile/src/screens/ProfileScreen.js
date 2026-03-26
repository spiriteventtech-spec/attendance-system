// src/screens/ProfileScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Platform, Image, StatusBar
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { 
  User, 
  ShieldAlert, 
  Settings, 
  LogOut, 
  Lock, 
  ChevronRight, 
  Terminal,
  Activity,
  Cpu,
  Fingerprint
} from 'lucide-react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [changing,   setChanging]   = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('PERMISSION_DENIED', 'Media library access is required to update biometric signature.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      const uri = result.assets[0].uri;
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      const formData = new FormData();
      formData.append('avatar', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: filename,
        type,
      });

      try {
        const { data: uploadRes } = await authAPI.uploadAvatar(formData);
        await authAPI.updateProfile({ avatarUrl: uploadRes.avatarUrl });
        Alert.alert('IDENTITY_UPDATED', 'Biometric profile image has been synchronized with command database.');
      } catch (err) {
        Alert.alert('UPLOAD_FAIL', 'Failed to transmit biometric data to command center.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert('IDENT_FAILURE', 'All credential fields required.'); return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('HASH_MISMATCH', 'New credentials do not match.'); return;
    }
    setLoading(true);
    try {
      await authAPI.changePassword(currentPwd, newPwd);
      Alert.alert('RECONFIG_SUCCESS', 'Credentials updated in command database.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setChanging(false);
    } catch (err) {
      Alert.alert('RECONFIG_FAIL', err.response?.data?.error || 'Database write error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />
      
      {/* OPERATOR HEADER */}
      <Animated.View entering={FadeInUp.duration(800)} style={styles.profileHeader}>
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarContainer}>
          <View style={styles.avatarRing} />
          <View style={styles.avatarCenter}>
            {uploading ? (
                <ActivityIndicator color="#00F5FF" />
            ) : user?.avatar_url ? (
                <Image 
                  source={{ uri: user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:3001${user.avatar_url}` }} 
                  style={styles.avatarImage} 
                />
            ) : (
                <User size={40} color="#00F5FF" />
            )}
          </View>
          <View style={styles.editBadge}>
            <Settings size={10} color="#000" />
          </View>
        </TouchableOpacity>
        <Text style={styles.operatorTitle}>OPERATOR_STATUS: <Text style={{color: '#22C55E'}}>ACTIVE</Text></Text>
        <Text style={styles.name}>{user?.firstName?.toUpperCase()} {user?.lastName?.toUpperCase()}</Text>
        <Text style={styles.email}>{user?.email?.toLowerCase()}</Text>
        
        <View style={styles.identityBadge}>
            <Fingerprint size={12} color="#00F5FF" />
            <Text style={styles.identityText}>ID_TOKEN: {user?.id?.split('-')[0].toUpperCase()}</Text>
        </View>
      </Animated.View>

      {/* MISSION ROLE TELEMETRY */}
      <View style={styles.telemetrySection}>
         <View style={styles.telemetryCard}>
            <Activity size={18} color="#00F5FF" />
            <View>
                <Text style={styles.telemetryLabel}>ASSIGNED_ROLE</Text>
                <Text style={styles.telemetryValue}>{user?.role?.toUpperCase() || 'GENERAL_STAFF'}</Text>
            </View>
         </View>
         <View style={styles.telemetryCard}>
            <Cpu size={18} color="#00F5FF" />
            <View>
                <Text style={styles.telemetryLabel}>SYSTEM_ACCESS</Text>
                <Text style={styles.telemetryValue}>LEVEL_01_AUTH</Text>
            </View>
         </View>
      </View>

      {/* CREDENTIAL RECONFIGURATION */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setChanging(c => !c)}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Lock size={16} color="#00F5FF" />
            <Text style={styles.sectionTitle}>CREDENTIAL_RECONFIG</Text>
          </View>
          <ChevronRight size={16} color="#4A4A4A" style={{ transform: [{ rotate: changing ? '90deg' : '0deg' }] }} />
        </TouchableOpacity>

        {changing && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CURRENT_HASH</Text>
                <TextInput
                    style={styles.input}
                    secureTextEntry
                    value={currentPwd}
                    onChangeText={setCurrentPwd}
                    placeholder="EXISTING_TOKEN"
                    placeholderTextColor="#2A2A2A"
                />
            </View>
            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>NEW_HASH_SEQUENCE</Text>
                <TextInput
                    style={styles.input}
                    secureTextEntry
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="MIN_8_CHARS"
                    placeholderTextColor="#2A2A2A"
                />
            </View>
            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>VERIFY_SEQUENCE</Text>
                <TextInput
                    style={styles.input}
                    secureTextEntry
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="REPEAT_TOKEN"
                    placeholderTextColor="#2A2A2A"
                />
            </View>
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleChangePassword}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.btnText}>COMMIT_MODIFICATION</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* SYSTEM PARAMETERS */}
      <View style={styles.section}>
        <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Terminal size={14} color="#4A4A4A" />
                <Text style={styles.infoLabel}>TERMINAL_VERSION</Text>
            </View>
            <Text style={styles.infoValue}>4.0.12-STABLE</Text>
        </View>
        <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Settings size={14} color="#4A4A4A" />
                <Text style={styles.infoLabel}>ENVIRONMENT</Text>
            </View>
            <Text style={styles.infoValue}>MISSION_DEPLOYMENT</Text>
        </View>
      </View>

      {/* DECOMMISSION SESSION */}
      <TouchableOpacity
        style={styles.decommissionBtn}
        onPress={() => Alert.alert('DECOMMISSION', 'Are you sure you want to decommission this terminal session?', [
          { text: 'ABORT', style: 'cancel' },
          { text: 'DECOMMISSION', style: 'destructive', onPress: logout },
        ])}
      >
        <LogOut size={16} color="#FF3D00" />
        <Text style={styles.decommissionText}>DECOMMISSION_SESSION</Text>
      </TouchableOpacity>
      
      <View style={styles.footer}>
          <ShieldAlert size={12} color="#1A1A1A" />
          <Text style={styles.footerText}>SECURE_TUNNEL_ACTIVE_RSA_4096</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content:   { padding: 24, paddingTop: 64, paddingBottom: 60 },

  profileHeader: { alignItems: 'center', marginBottom: 40 },
  avatarContainer: { width: 100, height: 100, marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  avatarRing: { 
    position: 'absolute', width: 100, height: 100, borderRadius: 50, 
    borderWidth: 1, borderColor: '#00F5FF', opacity: 0.2 
  },
  avatarCenter: { 
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.03)', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' 
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#00F5FF',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  operatorTitle: { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', letterSpacing: 2, marginBottom: 8 },
  name:      { fontSize: 24, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
  email:     { fontSize: 11, color: '#4A4A4A', fontWeight: 'bold', marginTop: 4 },
  
  identityBadge: { 
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, 
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0, 245, 255, 0.05)', 
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0, 245, 255, 0.1)' 
  },
  identityText:  { fontSize: 8, fontWeight: '900', color: '#00F5FF', letterSpacing: 1 },

  telemetrySection: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  telemetryCard: { 
    flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', 
    borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'
  },
  telemetryLabel: { fontSize: 7, color: '#4A4A4A', fontWeight: 'bold', letterSpacing: 1 },
  telemetryValue: { fontSize: 11, color: '#FFF', fontWeight: 'bold' },

  section: {
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20,
  },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 2 },

  form:  { padding: 20, paddingTop: 0, gap: 16 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 8, fontWeight: '900', color: '#4A4A4A', letterSpacing: 1 },
  input: {
    backgroundColor: '#080808', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 12, color: '#FFF', fontWeight: 'bold', borderWidth: 1, borderColor: '#1A1A1A'
  },
  btn: {
    backgroundColor: '#00F5FF', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.02)',
  },
  infoLabel: { fontSize: 10, color: '#4A4A4A', fontWeight: 'bold', letterSpacing: 1 },
  infoValue: { fontSize: 10, color: '#FFF', fontWeight: 'bold' },

  decommissionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: 'rgba(255, 61, 0, 0.05)', borderRadius: 16,
    paddingVertical: 16, marginTop: 20, borderWidth: 1, borderColor: 'rgba(255, 61, 0, 0.1)'
  },
  decommissionText: { fontSize: 11, fontWeight: '900', color: '#FF3D00', letterSpacing: 1 },

  footer: { alignItems: 'center', marginTop: 40, gap: 8 },
  footerText: { fontSize: 8, color: '#1A1A1A', fontWeight: 'bold', letterSpacing: 2 },
});
