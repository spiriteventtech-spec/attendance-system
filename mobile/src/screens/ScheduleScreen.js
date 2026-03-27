// src/screens/ScheduleScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Platform
} from 'react-native';
import { shiftsAPI } from '../services/api';
import { Calendar, Clock, MapPin, ChevronRight, Navigation } from 'lucide-react-native';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import Animated, { FadeInRight } from 'react-native-reanimated';

export default function ScheduleScreen() {
  const [shifts, setShifts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadShifts = useCallback(async () => {
    try {
      const { data } = await shiftsAPI.getMyShifts();
      setShifts(data);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadShifts();
  };

  const openInMaps = (lat, lng, label) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lng}`;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    Linking.openURL(url);
  };

  const renderShift = ({ item, index }) => {
    const start = parseISO(item.start_time);
    const end   = parseISO(item.end_time);

    let dateLabel = format(start, 'EEEE, d MMM');
    if (isToday(start)) dateLabel = 'Today';
    else if (isTomorrow(start)) dateLabel = 'Tomorrow';

    const statusColors = {
      scheduled:   { text: '#00F5FF', bg: 'rgba(0, 245, 255, 0.05)' },
      in_progress: { text: '#FFCC00', bg: 'rgba(255, 204, 0, 0.05)' },
      completed:   { text: '#34C759', bg: 'rgba(52, 199, 89, 0.05)' },
      absent:      { text: '#FF3B30', bg: 'rgba(255, 59, 48, 0.05)' },
    };

    const statusStyle = statusColors[item.status] || statusColors.scheduled;

    return (
      <Animated.View entering={FadeInRight.delay(index * 100).duration(600)}>
        <TouchableOpacity
          style={styles.shiftCard}
          activeOpacity={0.7}
          onPress={() => openInMaps(item.latitude, item.longitude, item.site_name)}
        >
          <View style={styles.cardHeader}>
            <View style={styles.dateBadge}>
              <Calendar size={12} color="#00F5FF" />
              <Text style={styles.dateText}>{dateLabel.toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {item.status.toUpperCase().replace('_', ' ')}
              </Text>
            </View>
          </View>

          <Text style={styles.siteName}>{item.site_name}</Text>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Clock size={14} color="#8E8E93" />
              <Text style={styles.detailText}>
                {format(start, 'HH:mm')} — {format(end, 'HH:mm')}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <MapPin size={14} color="#8E8E93" />
              <Text style={styles.detailText} numberOfLines={1}>
                {item.radius_meters}m Zone
              </Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.navAction}>
              <Navigation size={14} color="#00F5FF" />
              <Text style={styles.navText}>GET DIRECTIONS</Text>
            </View>
            <ChevronRight size={16} color="#48484A" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00F5FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>WORK_SCHEDULE</Text>
        <Text style={styles.subTitle}>{shifts.length} ASSIGNMENTS_FOUND</Text>
      </View>

      <FlatList
        data={shifts}
        renderItem={renderShift}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00F5FF" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Calendar size={48} color="#1C1C1E" />
            <Text style={styles.emptyText}>NO_SHIFTS_ASSIGNED</Text>
            <Text style={styles.emptySubText}>Check back later for new roster</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -1,
  },
  subTitle: {
    fontSize: 10,
    color: '#48484A',
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  shiftCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#00F5FF',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  siteName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    gap: 12,
  },
  navAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#00F5FF',
    letterSpacing: 1,
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#3A3A3C',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 20,
    letterSpacing: 2,
  },
  emptySubText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
