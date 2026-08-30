import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Star,
  ShieldCheck,
  Briefcase,
  Clock,
} from 'lucide-react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';

interface JobHistoryItem {
  id: string;
  title: string;
  date: string;
  price: string;
  status: 'Completed' | 'Cancelled' | string;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMemberSince(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function computeOverall(profile: any): number {
  const vals = [profile?.avg_payment_rating, profile?.avg_behaviour_rating, profile?.avg_negotiation_rating, profile?.avg_environment_rating]
    .filter((v) => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
}

// --- Skill Gauge Component ---
function SkillGauge({ score, size = 70 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke="#F3F4F6" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#FFCE48" strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill as any}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={styles.gaugeText}>{score}%</Text>
        </View>
      </View>
    </View>
  );
}

// --- Main Screen ---
export default function CustomerProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles2 = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<JobHistoryItem[]>([]);
  const [customerReviews, setCustomerReviews] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    (async () => {
      try {
        const job: any = await SkoFyApi.jobs.get(jobId);
        const customerId = job.customer_id;
        const [profileData, allHistory, reviews] = await Promise.all([
          SkoFyApi.customers.getDetail(customerId),
          SkoFyApi.jobs.getHistory(),
          SkoFyApi.customers.getReviews(customerId).catch(() => []),
        ]);
        setProfile(profileData);
        // Index reviews by job_id for O(1) lookup
        const reviewMap: Record<string, any> = {};
        if (Array.isArray(reviews)) {
          for (const r of reviews) { if (r.job_id) reviewMap[r.job_id] = r; }
        }
        setCustomerReviews(reviewMap);
        const filtered = (Array.isArray(allHistory) ? allHistory : []).filter(
          (h: any) => h.customer_id === customerId
        );
        setHistory(filtered.map((h: any) => ({
          id: h.job_id,
          title: h.title,
          date: formatDate(h.created_at),
          // Bidding is retired — final_amount (the settled, post-inspection-
          // invoice price) is the real number; proposed_fee only survives on
          // pre-migration applications.
          price: `$${(h.final_amount ?? h.proposed_fee ?? h.inspection_fee ?? 0).toLocaleString()}`,
          status: h.job_status === 'COMPLETED' ? 'Completed' : h.job_status === 'CANCELLED' ? 'Cancelled' : h.job_status,
        })));
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  if (loading) {
    return (
      <View style={[styles2.container, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={themeColors.brand} />
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={[styles2.container, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontFamily: Fonts.poppinsSemiBold, fontSize: 16, color: themeColors.textPrimary, marginBottom: 16, textAlign: 'center' }}>
          Couldn't load this customer's profile.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles2.backButton}>
          <ChevronLeft size={24} color="#000" />
        </TouchableOpacity>
      </View>
    );
  }

  const overall = computeOverall(profile);
  const skillScore = Math.round((overall / 5) * 100);

  return (
    <View style={[styles2.container, { backgroundColor: themeColors.surface }]}>
      {/* Header */}
      <View style={styles2.header}>
        <TouchableOpacity style={styles2.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles2.headerTitle}>Customer Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles2.scrollContent}>
        {/* Profile Section */}
        <Animated.View entering={FadeInUp.duration(600)} style={styles2.profileSection}>
          <View style={styles2.avatarContainer}>
            <Image
              source={{ uri: profile.profile_image_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=FFCE48&color=000` }}
              style={styles2.avatar}
            />
          </View>
          <Text style={styles2.userName}>{profile.name}</Text>
          <View style={styles2.verifiedRow}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={styles2.verifiedText}>Verified Customer</Text>
          </View>

          {profile.review_count > 0 ? (
            <View style={styles2.starRow}>
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={18}
                  color={i < Math.round(overall) ? '#FFCE48' : '#D1D5DB'}
                  fill={i < Math.round(overall) ? '#FFCE48' : 'none'}
                />
              ))}
              <Text style={styles2.ratingNum}>{overall.toFixed(1)}/5</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: '#9CA3AF', fontFamily: Fonts.poppins, marginTop: 10 }}>
              No ratings yet
            </Text>
          )}
        </Animated.View>

        {/* Quick Stats */}
        <Animated.View entering={FadeInUp.delay(100).springify()} style={styles2.statsRow}>
          <View style={styles2.statItem}>
            <Text style={styles2.statValue}>{profile.jobs_posted}</Text>
            <Text style={styles2.statLabel}>Total Jobs</Text>
          </View>
          <View style={styles2.divider} />
          <View style={styles2.statItem}>
            <SkillGauge score={skillScore} />
            <Text style={styles2.statLabel}>Customer Meter</Text>
          </View>
        </Animated.View>

        {/* About Section */}
        <Animated.View entering={FadeInUp.delay(200).springify()} style={styles2.aboutCard}>
          <Text style={styles2.sectionTitle}>About Customer</Text>
          <View style={styles2.aboutRow}>
            <Briefcase size={16} color="#6B7280" />
            <Text style={styles2.aboutText}>{profile.jobs_posted} jobs posted on SkoFy</Text>
          </View>
          <View style={styles2.aboutRow}>
            <Clock size={16} color="#6B7280" />
            <Text style={styles2.aboutText}>Member since {formatMemberSince(profile.member_since)}</Text>
          </View>
        </Animated.View>

        {/* Job History */}
        <View style={styles2.sectionHeader}>
          <Text style={styles2.sectionTitle}>Job History</Text>
          <Text style={styles2.historyCount}>{history.length} total</Text>
        </View>

        {history.length === 0 && (
          <Text style={{ paddingHorizontal: 20, fontSize: 13, color: '#9CA3AF', fontFamily: Fonts.poppins }}>
            No shared job history with this customer yet.
          </Text>
        )}

        {history.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(300 + index * 100)}
            style={styles2.historyCard}
          >
            <View style={styles2.historyHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles2.historyTitle}>{item.title}</Text>
                <Text style={styles2.historySubtitle}>{item.date}</Text>
              </View>
              <View style={[styles2.statusBadge, {
                backgroundColor: item.status === 'Completed' ? '#ECFDF5' : '#FEF2F2'
              }]}>
                <Text style={[styles2.statusText, {
                  color: item.status === 'Completed' ? '#10B981' : '#EF4444'
                }]}>
                  {item.status}
                </Text>
              </View>
            </View>

            <View style={styles2.ratingSection}>
              <Text style={styles2.priceText}>{item.price}</Text>
            </View>

            {customerReviews[item.id] && (() => {
              const r = customerReviews[item.id];
              const dims: Array<{ key: string; label: string }> = [
                { key: 'behaviour_rating', label: 'Behaviour' },
                { key: 'negotiation_rating', label: 'Negotiation' },
                { key: 'payment_rating', label: 'Payment' },
                { key: 'environment_rating', label: 'Environment' },
              ];
              return (
                <View style={styles2.metricsContainer}>
                  {dims.map(({ key, label }) => (
                    <View key={key} style={styles2.metricItem}>
                      <Text style={styles2.metricLabel}>{label}</Text>
                      <View style={styles2.metricBar}>
                        <View style={[styles2.metricFill, { width: `${((r[key] ?? 0) / 5) * 100}%` as any }]} />
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: Fonts.poppinsBold, color: '#FFCE48', width: 24, textAlign: 'right' }}>
                        {(r[key] ?? 0).toFixed(1)}
                      </Text>
                    </View>
                  ))}
                  {r.comment ? <Text style={styles2.commentText}>"{r.comment}"</Text> : null}
                </View>
              );
            })()}

          </Animated.View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// --- Styles ---
function makeStyles(t: typeof Colors.light) { return StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: t.card,
    borderBottomWidth: 1,
    borderBottomColor: t.inputFilled,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  scrollContent: { paddingBottom: 40 },

  // Profile
  profileSection: {
    alignItems: 'center',
    backgroundColor: t.card,
    paddingVertical: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  avatarContainer: { marginBottom: 16 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: t.inputFilled,
    borderWidth: 3,
    borderColor: '#FFCE48',
  },
  userName: { fontSize: 22, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  verifiedText: { fontSize: 11, fontFamily: Fonts.poppinsBold, color: '#10B981' },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  ratingNum: { fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary, marginLeft: 6 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: t.card,
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  statLabel: { fontSize: 11, fontFamily: Fonts.poppinsSemiBold, color: t.textMuted, marginTop: 4 },
  divider: { width: 1, height: 40, backgroundColor: t.inputFilled },
  gaugeText: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: '#FFCE48' },

  // About
  aboutCard: {
    backgroundColor: t.card,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  aboutText: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textSecondary, flex: 1 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  historyCount: { fontSize: 12, fontFamily: Fonts.poppinsSemiBold, color: t.textMuted },

  // History Card
  historyCard: {
    backgroundColor: t.card,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  historyTitle: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  historySubtitle: { fontSize: 11, fontFamily: Fonts.poppins, color: t.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 10, fontFamily: Fonts.poppinsBold },
  ratingSection: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 },
  priceText: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: '#FFCE48' },
  commentText: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 18,
  },
  metricsContainer: { gap: 8 },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricLabel: { fontSize: 11, fontFamily: Fonts.poppinsSemiBold, color: t.textMuted, width: 80 },
  metricBar: {
    flex: 1,
    height: 6,
    backgroundColor: t.inputFilled,
    borderRadius: 3,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    backgroundColor: '#FFCE48',
    borderRadius: 3,
  },
}); }

const styles = StyleSheet.create({
  gaugeText: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: '#FFCE48' },
});
