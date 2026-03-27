// src/screens/HistoryScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar
} from 'react-native';
import { attendanceAPI } from '../services/api';
import { 
  Database, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  History,
  Activity
} from 'lucide-react-native';
import Animated, { FadeInLeft, Layout } from 'react-native-reanimated';

const statusTheme = {
  completed: { color: '#22C55E', label: 'NOMINAL' },
  active: { color: '#00F5FF', label: 'OPERATIONAL' },
  overridden: { color: '#F59E0B', label: 'ARCHIVE_MOD' },
};

export default function HistoryScreen() {
  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);

  useEffect(() => { fetchLogs(1); }, []);

  const fetchLogs = async (p, refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const { data } = await attendanceAPI.getHistory(p);
      if (p === 1) setLogs(data);
      else setLogs(prev => [...prev, ...data]);
      setHasMore(data.length === 20);
      setPage(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = () => { if (hasMore && !loading) fetchLogs(page + 1); };

  const renderItem = ({ item, index }) => {
    const isOpen = expanded === item.id;
    const theme = statusTheme[item.status] || { color: '#4A4A4A', label: 'UNKNOWN' };
    
    return (
      <Animated.View 
        entering={FadeInLeft.delay(index * 50).duration(400)}
        layout={Layout.springify()}
      >
        <TouchableOpacity 
          style={styles.card} 
          onPress={() => setExpanded(isOpen ? null : item.id)}
          activeOpacity={0.9}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardLeft}>
              <View style={styles.metaRow}>
                <MapPin size={10} color="#00F5FF" />
                <Text style={styles.telemetryLabel}>LOCATION_STATION</Text>
              </View>
              <Text style={styles.siteName}>{item.site_name.toUpperCase()}</Text>
            </View>
            <View style={styles.cardRight}>
                <View style={[styles.statusBadge, { borderColor: theme.color + '44' }]}>
                    <View style={[styles.dot, { backgroundColor: theme.color }]} />
                    <Text style={[styles.statusText, { color: theme.color }]}>{theme.label}</Text>
                </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <Clock size={12} color="#4A4A4A" />
                <Text style={styles.statValue}>
                    {new Date(item.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
                <Activity size={12} color="#4A4A4A" />
                <Text style={styles.statValue}>
                    {item.total_hours_worked ? `${item.total_hours_worked.toFixed(1)}H` : '---'}
                </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
                <Text style={styles.dateText}>
                    {new Date(item.check_in_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                </Text>
            </View>
          </View>

          {(item.total_away_minutes > 0 || item.breach_count > 0) && (
            <View style={styles.alertRow}>
                {item.total_away_minutes > 0 && (
                    <View style={styles.alertItem}>
                        <AlertTriangle size={10} color="#F59E0B" />
                        <Text style={styles.alertText}>{item.total_away_minutes}M_SIGNAL_LOSS</Text>
                    </View>
                )}
                {item.breach_count > 0 && (
                    <View style={[styles.alertItem, { backgroundColor: 'rgba(255, 61, 0, 0.1)' }]}>
                        <AlertTriangle size={10} color="#FF3D00" />
                        <Text style={[styles.alertText, { color: '#FF3D00' }]}>{item.breach_count}_GEO_BREACH</Text>
                    </View>
                )}
            </View>
          )}

          {isOpen && (
            <View style={styles.expanded}>
                <View style={styles.expandedItem}>
                    <Text style={styles.expandedLabel}>[ INBOUND_DEBRIEF ]</Text>
                    <Text style={styles.expandedValue}>{item.check_in_note || 'NONE_RECORDED'}</Text>
                </View>
                {item.check_out_note && (
                    <View style={styles.expandedItem}>
                        <Text style={styles.expandedLabel}>[ OUTBOUND_DEBRIEF ]</Text>
                        <Text style={styles.expandedValue}>{item.check_out_note}</Text>
                    </View>
                )}
                {item.override_comment && (
                    <View style={[styles.expandedItem, { borderLeftColor: '#F59E0B' }]}>
                        <Text style={[styles.expandedLabel, { color: '#F59E0B' }]}>[ COMMAND_OVERRIDE ]</Text>
                        <Text style={styles.expandedValue}>{item.override_comment}</Text>
                    </View>
                )}
            </View>
          )}

          <View style={styles.expandHint}>
             {isOpen ? <ChevronUp size={12} color="#1A1A1A" /> : <ChevronDown size={12} color="#1A1A1A" />}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#00F5FF" />
      <Text style={styles.telemetryLabel}>QUERYING_MISSION_ARCHIVE...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerBar}>
        <View style={styles.glassBg} />
        <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <History size={20} color="#00F5FF" />
                <View>
                    <Text style={styles.title}>MISSION_ARCHIVE</Text>
                    <Text style={styles.subtitle}>TOTAL_OPERATIONS: {logs.length}</Text>
                </View>
            </View>
            
            {/* Contribution Heatmap */}
            <View style={styles.heatmapContainer}>
                <View style={styles.heatmapLabels}>
                    <Text style={styles.heatmapLabel}>ACTIVITY_PULSE_7D</Text>
                </View>
                <View style={styles.heatmapGrid}>
                    {[...Array(28)].map((_, i) => {
                        const opacity = Math.random() * 0.8 + 0.1; // Simulated data for UI
                        return (
                            <View 
                                key={i} 
                                style={[
                                    styles.heatmapCell, 
                                    { backgroundColor: `rgba(0, 245, 255, ${opacity})` }
                                ]} 
                            />
                        );
                    })}
                </View>
            </View>
        </View>
      </View>

      <FlatList
        data={logs}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchLogs(1, true)}
            tintColor="#00F5FF"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Database size={48} color="rgba(255,255,255,0.03)" />
            <Text style={styles.emptyText}>ARCHIVE_ENTRY_NULL</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#000' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  headerBar:  { 
    padding: 24, paddingTop: 64, flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  glassBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.02)' },
  title:      { fontSize: 18, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  subtitle:   { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', letterSpacing: 2, marginTop: 2 },
  
  heatmapContainer: {
    marginTop: 24,
    backgroundColor: 'rgba(0, 245, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.1)',
  },
  heatmapLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heatmapLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: '#00F5FF',
    letterSpacing: 2,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heatmapCell: {
    width: (width - 100) / 14,
    height: (width - 100) / 14,
    borderRadius: 3,
  },
  
  list:       { padding: 16, paddingBottom: 100 },
  card:       { 
    backgroundColor: 'rgba(255,255,255,0.02)', 
    borderRadius: 20, padding: 20, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  cardLeft:   { flex: 1 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  telemetryLabel: { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', letterSpacing: 1.5 },
  siteName:   { fontSize: 15, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  
  cardRight:  { alignItems: 'flex-end' },
  statusBadge: { 
    flexDirection: 'row', alignItems: 'center', 
    paddingHorizontal: 8, paddingVertical: 4, 
    borderRadius: 8, borderWidth: 1, gap: 6
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  statusText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  statsRow: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, gap: 16
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statValue: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  divider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  dateText: { fontSize: 10, color: '#00F5FF', fontWeight: 'bold' },

  alertRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  alertItem: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6
  },
  alertText: { fontSize: 8, color: '#F59E0B', fontWeight: '900', letterSpacing: 0.5 },

  expanded: { 
    marginTop: 20, paddingTop: 20, 
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', gap: 16 
  },
  expandedItem: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)', paddingLeft: 12 },
  expandedLabel: { fontSize: 8, color: '#4A4A4A', fontWeight: 'bold', marginBottom: 4 },
  expandedValue: { fontSize: 11, color: '#FFF', lineHeight: 16 },

  expandHint: { 
    position: 'absolute', bottom: 8, left: '50%', 
    marginLeft: -6, opacity: 0.5 
  },

  empty:      { alignItems: 'center', paddingTop: 100, gap: 16 },
  emptyText:  { color: '#1A1A1A', fontSize: 10, fontWeight: 'bold', letterSpacing: 2 },
});
