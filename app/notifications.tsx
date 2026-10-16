import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bell,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  MessageSquare,
  Phone,
  Star,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkoFyApi } from '@/services/api';
import { openScreen, useOpenScreen } from '@/services/openScreens';
import { useAppAlert } from '@/components/app-alert';

interface NotifItem {
  id: string;
  title: string;
  body: string;
  notif_type: string;
  job_id: string | null;
  is_read: boolean;
  created_at: string;
  image_url: string | null;
  ticket_id?: string | null;
}

function getTypeStyles(type: string) {
  switch (type) {
    case 'new_job':
      return { icon: Briefcase, color: '#FFCE48', bg: '#FFFDE7' };
    case 'hired':
      return { icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5' };
    case 'job_cancelled':
      return { icon: XCircle, color: '#EF4444', bg: '#FEF2F2' };
    case 'chat_message':
      return { icon: MessageSquare, color: '#8B5CF6', bg: '#F5F3FF' };
    case 'incoming_call':
    case 'call_cancelled':
      return { icon: Phone, color: '#10B981', bg: '#ECFDF5' };
    case 'review':
      return { icon: Star, color: '#F59E0B', bg: '#FFFBEB' };
    case 'skill_verified':
      return { icon: Zap, color: '#3B82F6', bg: '#EFF6FF' };
    case 'invoice_accepted':
    case 'invoice_countered':
    case 'job_cost_paid':
      return { icon: DollarSign, color: '#10B981', bg: '#ECFDF5' };
    default:
      return { icon: Bell, color: '#FFCE48', bg: '#FFFBEB' };
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The newest notification shown — "Clear all" clears up to it, so one that
 * arrives while the user is deciding isn't cleared unseen. */
function newestCreatedAt(list: { created_at: string }[]): string | undefined {
  return list.reduce<string | undefined>((max, n) => (!max || new Date(n.created_at) > new Date(max) ? n.created_at : max), undefined);
}

export default function NotificationsScreen() {
  // A tapped announcement comes back to this list instead of opening another copy.
  useOpenScreen('/notifications', 'list', {});
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);

  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const appAlert = useAppAlert();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await SkoFyApi.notifications.list();
      setNotifications(data);
      SkoFyApi.notifications.readAll().catch(() => {});
    } catch {
      // keep stale data
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePress = (item: NotifItem) => {
    // A support reply opens that conversation (ticket_id is kept since
    // migration 053; older rows open the list of the user's tickets).
    if (item.notif_type === 'support_ticket') {
      if (item.ticket_id) openScreen('/support-chat', item.ticket_id, { ticketId: item.ticket_id });
      else router.push('/help-support' as any);
      return;
    }
    if (!item.job_id) return;
    switch (item.notif_type) {
      case 'new_job':
        router.push('/(tabs)');
        break;
      case 'hired':
      // Invoice negotiation + payment confirmation all happen in the
      // Service Room, not the plain dashboard — a provider tapping
      // "Customer countered $150" or "Payment received" needs to land
      // straight there, not have to go find the job themselves.
      case 'invoice_accepted':
      case 'invoice_countered':
      case 'job_cost_paid':
        router.push({ pathname: '/(tabs)', params: { openServiceRoom: 'true', jobId: item.job_id } } as any);
        break;
      case 'chat_message':
      case 'incoming_call':
        openScreen('/chat', item.job_id, { jobId: item.job_id });
        break;
      default:
        router.push('/(tabs)');
    }
  };

  const clearAll = () => {
    if (notifications.length === 0) return;
    appAlert.show('warning', 'Clear all notifications?', "They'll be removed from this list. This can't be undone.", [
      { text: 'Cancel', variant: 'secondary' },
      {
        text: 'Clear all',
        variant: 'primary',
        onPress: async () => {
          const before = notifications;
          setNotifications([]);
          try {
            await SkoFyApi.notifications.clearAll(newestCreatedAt(before));
          } catch {
            setNotifications(before);
            appAlert.show('error', 'Could not clear', 'Please check your connection and try again.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
        <TouchableOpacity
          onPress={clearAll}
          style={[styles.clearBtn, notifications.length === 0 && { opacity: 0 }]}
          disabled={notifications.length === 0}
        >
          <ThemedText style={styles.clearText}>Clear All</ThemedText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFCE48" />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFCE48']} tintColor="#FFCE48" />
          }
        >
          {notifications.length > 0 ? (
            notifications.map((item, index) => {
              const { icon: Icon, color, bg } = getTypeStyles(item.notif_type);
              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInUp.delay(index * 80)}
                  layout={LinearTransition}
                >
                  <TouchableOpacity
                    style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
                    onPress={() => handlePress(item)}
                  >
                    <View style={[styles.iconBox, { backgroundColor: bg }]}>
                      <Icon size={20} color={color} />
                    </View>
                    <View style={styles.contentBox}>
                      <View style={styles.titleRow}>
                        <ThemedText style={[styles.notifTitle, !item.is_read && styles.unreadTitle]}>
                          {item.title}
                        </ThemedText>
                        {!item.is_read && <View style={styles.unreadDot} />}
                      </View>
                      <ThemedText style={styles.notifMessage} numberOfLines={2}>{item.body}</ThemedText>
                      {item.image_url && (
                        <Image source={{ uri: item.image_url }} style={styles.bannerImage} contentFit="cover" />
                      )}
                      <ThemedText style={styles.timeText}>{timeAgo(item.created_at)}</ThemedText>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Bell size={40} color="#D1D5DB" />
              </View>
              <ThemedText style={styles.emptyTitle}>All caught up!</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                When you receive new updates, they'll appear here.
              </ThemedText>
            </View>
          )}
        </ScrollView>
      )}
      {appAlert.element}
    </View>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 16,
      backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.borderSubtle,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    clearBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    clearText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsMedium, color: '#EF4444' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    notificationCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: t.card,
      padding: 16, borderRadius: 16, marginBottom: 12,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
      borderWidth: 1, borderColor: 'transparent',
    },
    unreadCard: { backgroundColor: '#FFFBEB', borderColor: '#FFCE48' },
    iconBox: {
      width: 48, height: 48, borderRadius: 12,
      justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    contentBox: { flex: 1 },
    titleRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 4,
    },
    notifTitle: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary, flex: 1 },
    unreadTitle: { color: t.textPrimary },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFCE48', marginLeft: 8 },
    notifMessage: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textSecondary, lineHeight: 18, marginBottom: 6 },
    bannerImage: {
      width: '100%', height: 140, borderRadius: 12, marginBottom: 8, backgroundColor: t.inputFilled,
    },
    timeText: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.poppins, color: t.textMuted },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyIconCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: t.inputFilled, justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textSecondary, marginBottom: 8 },
    emptySubtitle: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppins, color: t.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  });
}
