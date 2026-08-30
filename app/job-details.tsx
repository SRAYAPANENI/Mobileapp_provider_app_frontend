import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Dimensions,
  ActivityIndicator,
  Share,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  MapPin,
  Clock,
  Briefcase,
  Star,
  ShieldCheck,
  Play,
  Navigation,
  Share2,
  Lock,
  AlertTriangle,
  Zap,
  XCircle,
  X,
  CheckCircle2,
  User,
  Home,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import Svg, { Circle, G, Text as SvgText, LinearGradient, Stop, Defs } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { checkFeasibility, FeasibilityResult, calculateDistance, kmToMiles } from '@/services/schedulingEngine';
import { SkoFyApi } from '@/services/api';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';
import { Alert } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { getJobById, JOBS_LIST } from '@/data/jobsData';

const { width } = Dimensions.get('window');



const formatTime = (deadline: number, now: number) => {
  const diff = Math.max(0, deadline - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
};

const SkillMatchCircle = ({ percentage, styles }: { percentage: number; styles: any }) => {
  const size = 110;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <View style={styles.skillMatchContainer}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FFCE48" />
            <Stop offset="50%" stopColor="#10B981" />
            <Stop offset="100%" stopColor="#3B82F6" />
          </LinearGradient>
        </Defs>
        {/* Background Circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#F3F4F6"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#grad)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90, ${center}, ${center})`}
        />
        <G>
          <SvgText
            x={center}
            y={center - 5}
            textAnchor="middle"
            fontSize="10"
            fontFamily={Fonts.poppins}
            fill="#6B7280"
          >
            Skill Match:
          </SvgText>
          <SvgText
            x={center}
            y={center + 15}
            textAnchor="middle"
            fontSize="22"
            fontWeight="bold"
            fontFamily={Fonts.poppinsBold}
            fill="#111827"
          >
            {percentage}%
          </SvgText>
        </G>
      </Svg>
      <Text style={styles.skillMeterText}>
        Recommended based on your Skill-O-Meter data
      </Text>
    </View>
  );
};

export default function JobDetailsScreen() {
  const { id, autoApply } = useLocalSearchParams<{ id: string; autoApply?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const [job, setJob] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set when the job fetch fails permanently (404/403) — a stale notification
  // tap (direct request, new job nearby) landing here after the job expired,
  // got reassigned, or was deleted. Without this, isLoading just goes false
  // with job still null, and the render guard below shows "Fetching Job
  // Details..." forever since it can't tell "still loading" from "never will".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityResult | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedMedia, setSelectedMedia] = useState<{
    type: 'image' | 'video',
    url: string,
    thumbnail?: string,
    title?: string
  } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [hiredSuccess, setHiredSuccess] = useState(false);
  // Bidding is retired — applying no longer proposes a fee. This modal now
  // just confirms + collects an optional message before submitting.
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidMessage, setBidMessage] = useState('');
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  // App-styled replacement for the two gate Alert.alert()s below (skill test
  // / identity verification required) — a plain OS dialog looked completely
  // out of place next to the rest of this screen's branded modals.
  const [gateModal, setGateModal] = useState<{
    title: string; message: string; actionLabel: string; onAction: () => void;
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
          },
          (loc) => {
            setUserLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        );
      }
    };

    startWatching();

    return () => {
      clearInterval(timer);
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    const fetchJobAndLocation = async () => {
      setIsLoading(true);
      try {
        // Getting a GPS fix can take many seconds (cold start, indoors, etc.)
        // — it's only needed for the map/distance, not the job details
        // themselves, so it shouldn't block showing the job at all. Used to
        // be awaited before the job fetch even started, making the whole
        // screen feel like it was "fetching too late" when really it was
        // just stuck waiting on location first.
        Location.requestForegroundPermissionsAsync()
          .then(({ status }) => status === 'granted' ? Location.getCurrentPositionAsync({}) : null)
          .then((loc) => {
            if (loc) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          })
          .catch((err) => console.error('Failed to get current location:', err));

        // Fetch job details — try API first, fall back to local mock data
        let jobData: any;
        try {
          const raw = await SkoFyApi.jobs.get(id || '');
          const j = raw as any;
          // Checking job.status alone here was a real bug: if a DIFFERENT
          // provider got hired (job moves to ACCEPTED/IN_PROGRESS), every
          // other provider who'd applied — or even just opened this job's
          // details — would also see "Enter Service Room" as if it were
          // their own active job, since nothing checked that THEY were the
          // one actually assigned. my_application_status === 'HIRED' is the
          // one signal that's actually about this specific viewer.
          // Bidding is retired — a hired provider now passes through
          // INSPECTING/INVOICE_PENDING before IN_PROGRESS too; without these
          // here, a provider mid-inspection on their OWN job would fall
          // through to a generic "Apply" state instead of "Enter Service Room".
          const isOngoing = ['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS'].includes(j.status) && j.my_application_status === 'HIRED';
          // Job has moved past open bidding and it wasn't this provider who
          // got it — they can no longer apply, whether they tried or not.
          const isLockedByOther = ['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(j.status) && j.my_application_status !== 'HIRED';
          // Distinct from isLockedByOther — the job just died (customer
          // cancelled, expired unhired, or is under dispute) rather than
          // someone else winning it. Without this, a stale direct-request
          // notification tap on a since-cancelled/expired job showed a
          // fully-tappable "Accept & Apply" button that only failed with a
          // generic "Job is not accepting bids" error after the tap.
          const isClosed = ['CANCELLED', 'DISPUTED', 'EXPIRED'].includes(j.status);
          const budgetStr =
            j.budget_min && j.budget_max ? `$${j.budget_min}–$${j.budget_max}` :
            j.budget_min ? `From $${j.budget_min}` :
            j.budget_max ? `Up to $${j.budget_max}` : 'Negotiable';
          const scheduledMs = j.scheduled_at ? new Date(j.scheduled_at).getTime() : null;
          const requiredSkills: { name: string; is_verified_by_provider: boolean }[] = j.required_skills ?? [];
          const matchedCount = requiredSkills.filter(s => s.is_verified_by_provider).length;
          const skillMatchPct = requiredSkills.length > 0
            ? Math.round((matchedCount / requiredSkills.length) * 100)
            : 0;
          jobData = {
            id: j.id?.toString() ?? id,
            title: j.title ?? 'Job',
            description: j.description ?? '',
            jobType: ['HIGH', 'EMERGENCY'].includes(j.urgency) ? 'Urgent' : j.urgency === 'LOW' ? 'Book Slot' : 'Normal',
            status: j.status,
            isOngoing,
            latitude: j.lat ?? null,
            longitude: j.lng ?? null,
            coordinates: { latitude: j.lat ?? null, longitude: j.lng ?? null },
            jobKind: j.job_type ?? 'STANDARD',
            dropoffCoordinates: (j.dropoff_lat != null && j.dropoff_lng != null)
              ? { latitude: j.dropoff_lat, longitude: j.dropoff_lng }
              : null,
            serviceMode: j.service_mode ?? 'ON_SITE',
            location: 'Customer Location',
            startTime: scheduledMs ?? Date.now() + 3600000,
            endTime: scheduledMs ? scheduledMs + 7200000 : Date.now() + 7200000,
            deadline: scheduledMs ?? Date.now() + 9 * 3600000,
            budgetMin: j.budget_min,
            budgetMax: j.budget_max,
            rate: budgetStr,
            duration: 'project',
            fee: j.inspection_fee > 0 ? `$${j.inspection_fee}` : '$0 (Free Inspection)',
            skills: requiredSkills.map(s => s.name),
            requiredSkills,
            requirements: j.notes ? [j.notes] : [],
            skillMatch: skillMatchPct,
            hasMedia: Array.isArray(j.images) && j.images.length > 0,
            // `images` is just bare URL strings with no type metadata — this
            // was previously hardcoded to 'image' for every entry, so a
            // video would try to render through the Image component (a
            // broken-image icon) instead of the Video player this screen
            // already has wired up for it.
            media: (j.images ?? []).map((url: string) => ({
              type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'image',
              url,
              thumbnail: url,
            })),
            employer: { name: 'Customer', image: null, rating: 4.5, jobsCompleted: j.applicant_count ?? 0 },
            notes: j.notes ?? '',
            address: 'See map below',
            customerAvgPaymentRating: j.customer_avg_payment_rating ?? null,
            customerAvgBehaviourRating: j.customer_avg_behaviour_rating ?? null,
            customerReviewCount: j.customer_review_count ?? 0,
            myApplicationId: j.my_application_id ?? null,
            myApplicationStatus: j.my_application_status ?? null,
            isLockedByOther,
            isClosed,
            isDirectRequest: j.is_direct_request ?? false,
          };
        } catch (fetchErr: any) {
          // Backend doesn't know about mock job IDs — fall back to local data,
          // but only for that dev/demo case. A real backend job ID that's
          // genuinely gone (404) or no longer accessible (403 — reassigned to
          // someone else, distribution revoked) should say so, not silently
          // fall through to the generic catch below and leave the screen
          // stuck on "Fetching Job Details..." forever.
          const local = getJobById(id || '1');
          if (!local) {
            if (fetchErr?.error_code === 'NOT_FOUND' || fetchErr?.error_code === 'FORBIDDEN') {
              setLoadError("This job is no longer available — it may have expired, been reassigned, or already closed out.");
            } else {
              setLoadError('Could not load this job. Check your connection and try again.');
            }
            return;
          }
          const existingJobs = (JOBS_LIST as any[])
            .filter((j: any) => j.id !== local.id && (j.isOngoing || j.status === 'Booked'))
            .map((j: any) => ({ id: j.id, startTime: j.startTime || 0, endTime: j.endTime || 0, location: { latitude: j.latitude || 0, longitude: j.longitude || 0 } }));
          const feas = local.isOngoing
            ? { feasible: true, score: 0, status: 'SAFE', reason: 'Active Job', travelTime: 0 }
            : checkFeasibility({ startTime: local.startTime || 0, endTime: local.endTime || 0, location: (local as any).coordinates ?? { latitude: local.latitude || 0, longitude: local.longitude || 0 } }, existingJobs);
          setFeasibility(feas as any);
          jobData = {
            ...local,
            coordinates: (local as any).coordinates ?? { latitude: local.latitude || 0, longitude: local.longitude || 0 },
            deadline: local.deadline || (Date.now() + 9 * 3600000),
            rate: local.fee ?? 'Negotiable',
            duration: 'project',
            requirements: (local as any).requirements || [],
            skillMatch: 85,
            employer: { name: 'Customer', image: null, rating: 4.5, jobsCompleted: 0 },
            address: local.location ?? 'See map below',
          };
          setJob(jobData);
          return;
        }
        setJob(jobData);

        const result = jobData.isOngoing
          ? { feasible: true, score: 0, status: 'SAFE', reason: 'Active Job', travelTime: 0 }
          : checkFeasibility(
            { startTime: jobData.startTime, endTime: jobData.endTime, location: jobData.coordinates },
            []
          );
        setFeasibility(result as any);
      } catch (error) {
        console.error(error);
        setLoadError('Something went wrong loading this job. Please go back and try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchJobAndLocation();
  }, [id]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this ${job.title} job on SkoFy! It pays ${job.rate}.`,
      });
    } catch (error) {
      // Most rejections here are just the user dismissing the share sheet,
      // not a real failure — log for visibility, no alert needed.
      console.error('Share failed:', error);
    }
  };

  const handleApply = () => {
    if (feasibility?.status === 'NOT_FEASIBLE') {
      Alert.alert('Conflict Detected', 'This job overlaps with your existing bookings.');
      return;
    }
    // Accepting a direct request already IS the customer's hire decision —
    // they picked this one provider off the map before ever sending it, so
    // a fee-negotiation step here would just be friction. Skip straight to
    // hiring instead of opening the bid modal.
    if (job?.isDirectRequest) {
      handleDirectAccept();
      return;
    }
    setShowBidModal(true);
  };

  const [isAcceptingDirect, setIsAcceptingDirect] = useState(false);
  const handleDirectAccept = async () => {
    if (isAcceptingDirect || !job) return;
    setIsAcceptingDirect(true);
    try {
      const result: any = await SkoFyApi.jobs.bid(job.id);
      setHiredSuccess(!!result?.hired);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        setHiredSuccess(false);
        if (result?.hired) {
          router.replace({ pathname: '/(tabs)', params: { openServiceRoom: 'true', jobId: job.id } });
        } else {
          router.back();
        }
      }, 2500);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (err?.error_code === 'SKILL_NOT_VERIFIED') {
        setGateModal({
          title: 'Skill Test Required',
          message: msg || 'You need to pass the skill test for this job\'s required skill before applying.',
          actionLabel: 'Take Test',
          onAction: () => { setGateModal(null); router.push('/(tabs)/profile'); },
        });
      } else if (err?.error_code === 'IDENTITY_NOT_VERIFIED') {
        setGateModal({
          title: 'Identity Verification Required',
          message: msg || 'Your identity must be verified before you can apply to jobs.',
          actionLabel: 'Verify Now',
          onAction: () => { setGateModal(null); router.push('/(tabs)/profile'); },
        });
      } else {
        Alert.alert('Failed', msg || 'Could not accept this request. Please try again.');
      }
    } finally {
      setIsAcceptingDirect(false);
    }
  };

  // Tapping "Accept" on the direct-request notification already signals
  // intent — landing here and making them hunt for the Apply Now button
  // themselves was an unnecessary extra step. Accepts automatically once
  // the job's finished loading, exactly once.
  const autoAppliedRef = React.useRef(false);
  useEffect(() => {
    if (autoApply === '1' && !isLoading && job && !autoAppliedRef.current) {
      autoAppliedRef.current = true;
      handleApply();
    }
  }, [autoApply, isLoading, job]);

  const handleSubmitBid = async () => {
    setIsSubmittingBid(true);
    try {
      await SkoFyApi.jobs.bid(job.id, bidMessage.trim() || undefined);
      setShowBidModal(false);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        router.back();
      }, 2500);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('already') || err?.error_code === 'ALREADY_BID') {
        setShowBidModal(false);
        Alert.alert('Already Applied', 'You have already submitted a bid for this job.');
      } else if (err?.error_code === 'SKILL_NOT_VERIFIED') {
        setShowBidModal(false);
        setGateModal({
          title: 'Skill Test Required',
          message: msg || 'You need to pass the skill test for this job\'s required skill before applying.',
          actionLabel: 'Take Test',
          onAction: () => { setGateModal(null); router.push('/(tabs)/profile'); },
        });
      } else if (err?.error_code === 'IDENTITY_NOT_VERIFIED') {
        setShowBidModal(false);
        setGateModal({
          title: 'Identity Verification Required',
          message: msg || 'Your identity must be verified before you can apply to jobs.',
          actionLabel: 'Verify Now',
          onAction: () => { setGateModal(null); router.push('/(tabs)/profile'); },
        });
      } else {
        Alert.alert('Failed', msg || 'Could not submit bid. Please try again.');
      }
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const getFeasibilityColor = (status: string) => {
    switch (status) {
      case 'SAFE': return '#10B981';
      case 'TIGHT': return '#F59E0B';
      case 'RISKY': return '#EF4444';
      case 'NOT_FEASIBLE': return '#7F1D1D';
      default: return '#9CA3AF';
    }
  };

  if (loadError) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background, paddingHorizontal: 32, gap: 16 }]}>
        <Text style={[styles.loadingText, { textAlign: 'center' }]}>{loadError}</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#FFCE48', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
          onPress={() => router.back()}
        >
          <Text style={{ fontWeight: '700', color: '#111827' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading || !job) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#FFCE48" />
        <Text style={styles.loadingText}>Fetching Job Details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <ChevronLeft size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Share2 size={22} color={themeColors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Main Job Info Card */}
        <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.mainCard}>
          {/* Badges row — mirrors dashboard card */}
          <View style={styles.detailBadgesRow}>
            {job.isDirectRequest && (
              <View style={[styles.feasibilityBadge, { backgroundColor: '#FFCE48' }]}>
                <Text style={[styles.feasibilityText, { color: '#111827' }]}>⚡ Direct Request</Text>
              </View>
            )}
            {!job.isOngoing && feasibility && (
              <View style={[styles.feasibilityBadge, { backgroundColor: getFeasibilityColor(feasibility.status) }]}>
                <Text style={styles.feasibilityText}>{feasibility.status}</Text>
              </View>
            )}
            {job.jobType && (
              <View style={[
                styles.jobTypeBadge,
                {
                  backgroundColor:
                    job.jobType === 'Urgent' ? '#EF4444' :
                      job.jobType === 'Book Slot' ? '#10B981' : '#F59E0B'
                }
              ]}>
                <Text style={styles.jobTypeBadgeText}>{job.jobType}</Text>
              </View>
            )}
          </View>

          {!job.isOngoing && feasibility && (
            <View style={[styles.feasibilityInfoRowTop, { backgroundColor: getFeasibilityColor(feasibility.status) + '15' }]}>
              <Zap size={12} color={getFeasibilityColor(feasibility.status)} />
              <Text style={[styles.feasibilityDetailTextSmall, { color: getFeasibilityColor(feasibility.status) }]}>
                {feasibility.travelTime} min travel {'\u2022'} {feasibility.score < 0 ? 'Conflict' : `${feasibility.score} min gap`} {'\u2022'} {feasibility.reason}
              </Text>
            </View>
          )}

          <View style={styles.titleSection}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobTitle}>{job.title}</Text>
              <View style={styles.locationLink}>
                <MapPin size={16} color="#6B7280" />
                <Text style={styles.locationText}>{job.location}</Text>
              </View>
            </View>
            <View style={styles.rateBadge}>
              <Text style={styles.rateText}>{job.rate} / {job.duration}</Text>
            </View>
          </View>

          {/* Map Preview — job.coordinates.latitude/longitude are `number | null`
              (a remote/no-location job has no coordinates at all); render a
              placeholder instead of a MapView centered on (0,0). */}
          {job.coordinates.latitude != null && job.coordinates.longitude != null ? (
            <View style={styles.mapContainer}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={{
                  latitude: job.coordinates.latitude,
                  longitude: job.coordinates.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                scrollEnabled={true}
              >
                {/* Dotted Line between Provider and Customer */}
                {userLocation && (
                  <Polyline
                    coordinates={[
                      { latitude: userLocation.latitude, longitude: userLocation.longitude },
                      { latitude: job.coordinates.latitude, longitude: job.coordinates.longitude }
                    ]}
                    strokeColor="#FFCE48"
                    strokeWidth={3}
                    lineDashPattern={[5, 5]}
                  />
                )}

                {/* Job Location (Customer/Employer) — the pickup point for a
                    PICKUP_DROPOFF job, same as the single location on any
                    other job. */}
                <Marker coordinate={job.coordinates} title={job.jobKind === 'PICKUP_DROPOFF' ? 'Pickup Location' : 'Customer Location'}>
                  <View style={styles.customerMarkerContainer}>
                    <View style={styles.customerMarkerInner}>
                      <Home size={18} color="#fff" fill="#fff" />
                    </View>
                    <View style={styles.markerPointer} />
                  </View>
                </Marker>

                {/* Drop-off point — a second, independent location only for
                    PICKUP_DROPOFF jobs. */}
                {job.jobKind === 'PICKUP_DROPOFF' && job.dropoffCoordinates && (
                  <>
                    <Marker coordinate={job.dropoffCoordinates} title="Drop-off Location" pinColor="#0EA5E9" />
                    <Polyline
                      coordinates={[job.coordinates, job.dropoffCoordinates]}
                      strokeColor="#0EA5E9"
                      strokeWidth={3}
                      lineDashPattern={[5, 5]}
                    />
                  </>
                )}

                {/* Provider Live Location (Skofy Icon) */}
                {userLocation && (
                  <Marker coordinate={userLocation} title="Your Location">
                    <View style={styles.skofyMarkerContainer}>
                      <Image
                        source={require('@/assets/images/logo.png')}
                        style={styles.skofyMarkerIcon}
                        contentFit="contain"
                      />
                    </View>
                  </Marker>
                )}
              </MapView>

              {/* Distance Overlay on Map */}
              {userLocation && (
                <View style={styles.mapDistanceOverlay}>
                  <Navigation size={12} color="#FFCE48" fill="#FFCE48" />
                  <Text style={styles.mapDistanceText}>
                    {kmToMiles(calculateDistance(userLocation, job.coordinates)).toFixed(1)} mi
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.mapContainer, styles.remoteJobPlaceholder]}>
              <Zap size={20} color="#6B7280" />
              <Text style={styles.remoteJobPlaceholderText}>Remote job — no location to display</Text>
            </View>
          )}
        </Animated.View>

        {/* Job Meta Card */}
        <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.employerCard}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FEF9C3', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={20} color="#FFCE48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.employerName}>Budget Range</Text>
              <Text style={styles.statText}>{job.rate} · {job.employer.jobsCompleted} applicants</Text>
            </View>
          </View>
        </Animated.View>

        {/* Description & Requirements Section */}
        <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.descriptionSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Job Description & Requirements</Text>
          </View>

          <View style={styles.matchSpacingBox}>
            <SkillMatchCircle percentage={job.skillMatch} styles={styles} />
          </View>

          <View style={styles.bulletsContainerDetailed}>
            {job.requirements.map((req: string, index: number) => (
              <View key={index} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{req}</Text>
              </View>
            ))}
            <Text style={[styles.jobDescriptionText, { marginTop: 12 }]}>
              {job.description}
            </Text>
          </View>
        </Animated.View>

        {/* Specific Details from Customer (Attachments, etc) */}
        {job.hasMedia && (
          <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.customerDetailsSection}>
            <Text style={styles.sectionTitle}>Customer Attachments</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
              {job.media.map((item: any, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={styles.mediaItem}
                  onPress={() => setSelectedMedia({
                    type: item.type,
                    url: item.url,
                    thumbnail: item.thumbnail,
                    title: job.title
                  })}
                >
                  <Image source={{ uri: item.thumbnail || item.url }} style={styles.mediaImage} />
                  {item.type === 'video' && (
                    <View style={styles.playOverlay}>
                      <Play size={20} color="#fff" fill="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Job Card Details (Timer and Skills from Dashboard) */}
        <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.dashboardDetailsSection}>
          <Text style={styles.sectionTitle}>Job card Summary</Text>
          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStatItem}>
              <Clock size={18} color="#FFCE48" />
              <View style={styles.summaryStatContent}>
                <Text style={styles.summaryStatLabel}>Remaining Time</Text>
                <Text style={styles.summaryStatValue}>
                  {(() => {
                    const { days, hours, minutes, seconds } = formatTime(job.deadline, now);
                    return `${days}d : ${hours}h : ${minutes}m : ${seconds}s`;
                  })()}
                </Text>
              </View>
            </View>
            <View style={styles.summaryStatItem}>
              <Briefcase size={18} color="#FFCE48" />
              <View style={styles.summaryStatContent}>
                <Text style={styles.summaryStatLabel}>Service ID</Text>
                <Text style={styles.summaryStatValue}>#SFY-{job.id.slice(0, 8).toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Customer Meter — reverse of the Skill-O-Meter customers see
              about providers, sourced from past providers' reviews of this
              customer. Hidden entirely until they have at least one review. */}
          {job.customerReviewCount > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Customer Meter</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
                Based on past providers' feedback
              </Text>
              <View style={styles.skillsTagsRow}>
                {job.customerAvgPaymentRating != null && (
                  <View style={[styles.skillTag, { backgroundColor: job.customerAvgPaymentRating >= 4.0 ? '#FFFBEB' : '#F9FAFB', borderColor: job.customerAvgPaymentRating >= 4.0 ? '#D97706' : '#E5E7EB', borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                    <CheckCircle2 size={12} color={job.customerAvgPaymentRating >= 4.0 ? '#D97706' : '#9CA3AF'} />
                    <Text style={[styles.skillTagText, { color: job.customerAvgPaymentRating >= 4.0 ? '#92400E' : '#6B7280' }]}>
                      Pays on Time {job.customerAvgPaymentRating.toFixed(1)}★
                    </Text>
                  </View>
                )}
                {job.customerAvgBehaviourRating != null && (
                  <View style={[styles.skillTag, { backgroundColor: job.customerAvgBehaviourRating >= 4.0 ? '#F0FDF4' : '#F9FAFB', borderColor: job.customerAvgBehaviourRating >= 4.0 ? '#16A34A' : '#E5E7EB', borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                    <CheckCircle2 size={12} color={job.customerAvgBehaviourRating >= 4.0 ? '#16A34A' : '#9CA3AF'} />
                    <Text style={[styles.skillTagText, { color: job.customerAvgBehaviourRating >= 4.0 ? '#166534' : '#6B7280' }]}>
                      Good Behaviour {job.customerAvgBehaviourRating.toFixed(1)}★
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}



          <Text style={[styles.summaryStatLabel, { marginTop: 16 }]}>Required Skills</Text>
          <View style={styles.skillsTagsRow}>
            {(job.requiredSkills && job.requiredSkills.length > 0
              ? job.requiredSkills
              : job.skills.map((name: string) => ({ name, is_verified_by_provider: undefined }))
            ).map((skill: { name: string; is_verified_by_provider?: boolean }, idx: number) => (
              <View
                key={idx}
                style={[
                  styles.skillTag,
                  skill.is_verified_by_provider === true && { backgroundColor: '#F0FDF4', borderColor: '#16A34A', borderWidth: 1 },
                  skill.is_verified_by_provider === false && { backgroundColor: '#FEF2F2', borderColor: '#DC2626', borderWidth: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.skillTagText,
                    skill.is_verified_by_provider === true && { color: '#16A34A' },
                    skill.is_verified_by_provider === false && { color: '#DC2626' },
                  ]}
                >
                  {skill.name}{skill.is_verified_by_provider === true ? ' ✓' : ''}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Persistent Footer Actions */}
      <View style={styles.footer}>
        {(() => {
          // Precedence matters here: isOngoing (I'm the hired provider) >
          // isClosed (job died — cancelled/expired/disputed, nobody won it)
          // > isLockedByOther (job moved on, someone else got it — true
          // final state, overrides "Applied" even if I did apply) >
          // myApplicationId (still open, I'm waiting on my own pending bid)
          // > feasibility conflict > default "Apply Now".
          const isApplied = !job.isOngoing && !job.isClosed && !job.isLockedByOther && !!job.myApplicationId;
          const isLocked = !job.isOngoing && !job.isClosed && job.isLockedByOther;
          const isConflictLocked = !job.isOngoing && !job.isClosed && !job.isLockedByOther && !job.myApplicationId && feasibility?.status === 'NOT_FEASIBLE';
          const disabled = job.isOngoing ? false : (isApplied || isLocked || isConflictLocked || job.isClosed || isAcceptingDirect);
          return (
            <View style={styles.footerRow}>
              {job.isDirectRequest && !job.isOngoing && !isApplied && !isLocked && !job.isClosed && (
                <TouchableOpacity
                  style={styles.declineBtn}
                  disabled={isAcceptingDirect}
                  onPress={() => {
                    Alert.alert(
                      'Decline Direct Request',
                      'The customer will be notified and can choose to broadcast to all providers.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Decline',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await SkoFyApi.jobs.declineDirectRequest(job.id);
                              router.back();
                            } catch {
                              Alert.alert('Error', 'Could not decline. Please try again.');
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <XCircle size={18} color="#EF4444" />
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  job.isDirectRequest && !job.isOngoing && !isApplied && !isLocked ? styles.applyButtonFlex : styles.applyButtonFull,
                  job.isOngoing && styles.ongoingButton,
                  isApplied && styles.appliedButton,
                  (isLocked || isConflictLocked) && styles.conflictButton,
                ]}
                onPress={() => {
                  if (job.isOngoing) {
                    router.push({
                      pathname: '/(tabs)',
                      params: { openServiceRoom: 'true', jobId: job.id }
                    });
                  } else if (!disabled) {
                    handleApply();
                  }
                }}
                disabled={disabled}
              >
                {isAcceptingDirect ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : job.isOngoing ? (
                  <ShieldCheck size={20} color="#111827" />
                ) : isApplied ? (
                  <CheckCircle2 size={20} color="#16A34A" />
                ) : (isLocked || isConflictLocked || job.isClosed) ? (
                  <Lock size={20} color="#9CA3AF" />
                ) : (
                  <ShieldCheck size={20} color="#111827" />
                )}
                <Text style={[
                  styles.applyButtonText,
                  job.isOngoing && styles.ongoingButtonText,
                  isApplied && styles.appliedButtonText,
                  (isLocked || isConflictLocked || job.isClosed) && styles.conflictButtonText,
                ]}>
                  {isAcceptingDirect ? 'Accepting…' :
                    job.isOngoing ? 'Enter Service Room' :
                    isApplied ? 'Applied ✓' :
                    job.isClosed ? 'No Longer Available' :
                    isLocked ? 'Locked — Not Selected' :
                    isConflictLocked ? 'Conflict Locked' :
                    job.isDirectRequest ? 'Accept & Apply' : 'Apply Now'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>

      {/* Media Viewer Modal */}
      <Modal
        visible={!!selectedMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedia(null)}
      >
        <View style={styles.viewerOverlay}>
          <View style={styles.viewerContent}>
            <View style={styles.viewerModalHeader}>
              <View>
                <Text style={styles.viewerModalTitle}>{selectedMedia?.title}</Text>
                <Text style={styles.viewerModalType}>
                  {selectedMedia?.type === 'video' ? 'Video Attachment' : 'Image Attachment'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewerModalClose}
                onPress={() => setSelectedMedia(null)}
              >
                <XCircle size={32} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.viewerMediaArea}>
              {selectedMedia?.type === 'video' ? (
                <Video
                  source={{ uri: selectedMedia.url }}
                  posterSource={{ uri: selectedMedia.thumbnail }}
                  usePoster={true}
                  style={styles.fullVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                />
              ) : (
                <Image
                  source={{ uri: selectedMedia?.url }}
                  style={styles.fullImage}
                  contentFit="contain"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Bid Submission Modal */}
      <Modal
        visible={showBidModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBidModal(false)}
      >
        <KeyboardAvoidingView style={styles.viewerOverlay} behavior="padding" automaticOffset>
          <View style={[styles.bidSheet, { backgroundColor: themeColors.background }]}>
            <View style={styles.bidSheetHandle} />
            <Text style={styles.bidSheetTitle}>Apply to This Job</Text>
            <Text style={styles.bidSheetJob} numberOfLines={2}>{job?.title}</Text>
            <Text style={styles.bidFieldLabel}>
              No price to set yet — you'll inspect the job in person and send an invoice once you're hired.
            </Text>

            <Text style={styles.bidFieldLabel}>Message to Customer (optional)</Text>
            <TextInput
              style={[styles.bidMsgInput, { color: themeColors.text, borderColor: '#E5E7EB' }]}
              placeholder="Briefly describe your experience and why you're a good fit..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={bidMessage}
              onChangeText={setBidMessage}
              textAlignVertical="top"
            />

            <View style={styles.bidActions}>
              <TouchableOpacity style={styles.bidCancelBtn} onPress={() => setShowBidModal(false)}>
                <Text style={styles.bidCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bidSubmitBtn, isSubmittingBid && { opacity: 0.7 }]}
                onPress={handleSubmitBid}
                disabled={isSubmittingBid}
              >
                {isSubmittingBid
                  ? <ActivityIndicator size="small" color="#111827" />
                  : <Text style={styles.bidSubmitText}>Apply</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
      >
        <View style={styles.successOverlay}>
          <Animated.View entering={FadeInUp} style={styles.successCardPopup}>
            <View style={styles.successIconBadge}>
              <CheckCircle2 size={40} color="#10B981" />
            </View>
            <Text style={styles.successHeading}>{hiredSuccess ? "You're Hired!" : 'Application Submitted!'}</Text>
            <Text style={styles.successSubheading}>
              {hiredSuccess
                ? 'Head to the job when you\'re ready — the customer has been notified.'
                : "The employer will review your profile. You'll be notified once you're hired."}
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Gate Modal — skill test / identity verification required before applying */}
      <Modal
        visible={!!gateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setGateModal(null)}
      >
        <View style={styles.successOverlay}>
          <Animated.View entering={FadeInUp} style={styles.successCardPopup}>
            <View style={[styles.successIconBadge, { backgroundColor: '#FEF3C7' }]}>
              <AlertTriangle size={40} color="#F59E0B" />
            </View>
            <Text style={styles.successHeading}>{gateModal?.title}</Text>
            <Text style={styles.successSubheading}>{gateModal?.message}</Text>
            <View style={styles.gateActions}>
              <TouchableOpacity style={styles.gateCancelBtn} onPress={() => setGateModal(null)}>
                <Text style={styles.gateCancelText}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.gateActionBtn} onPress={gateModal?.onAction}>
                <Text style={styles.gateActionText}>{gateModal?.actionLabel}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(t: typeof Colors.light) { return StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: Platform.OS === 'ios' ? 50 : 60,
    marginTop: Platform.OS === 'android' ? 30 : 0,
    borderBottomWidth: 1,
    borderBottomColor: t.inputFilled,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerRight: {
    flexDirection: 'row',
  },
  scrollContent: {
    padding: 16,
  },
  mainCard: {
    backgroundColor: t.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
    marginTop: 10,
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  jobTitle: {
    fontSize: 22,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 6,
  },
  locationLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginLeft: 4,
  },
  rateBadge: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  rateText: {
    fontSize: 12,
    fontFamily: Fonts.poppinsBold,
    color: '#B45309',
  },
  mapContainer: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  remoteJobPlaceholder: {
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  remoteJobPlaceholderText: {
    fontSize: 13,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#6B7280',
  },
  categoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryLabel: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#B45309',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  navigateText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 6,
    fontFamily: Fonts.poppinsMedium,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  providerMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerMarkerPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  employerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 20,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 16,
  },
  employerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  employerDetails: {
    flex: 1,
  },
  employerName: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  employerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statText: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginLeft: 4,
  },
  employerArrow: {
    padding: 4,
  },
  descriptionSection: {
    backgroundColor: t.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contentAndMatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchSpacingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: t.inputFilled,
    marginBottom: 20,
  },
  bulletsContainerDetailed: {
    flex: 1,
  },
  bulletsContainer: {
    flex: 1,
    paddingRight: 12,
  },
  feasibilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  feasibilityText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Fonts.poppinsBold,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#111827',
    marginTop: 7,
    marginRight: 8,
  },
  bulletText: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    lineHeight: 20,
    flex: 1,
  },
  jobDescriptionText: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    lineHeight: 20,
  },
  skillMatchContainer: {
    alignItems: 'center',
    width: 120,
  },
  skillMeterText: {
    fontSize: 9,
    fontFamily: Fonts.poppins,
    color: t.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  customerDetailsSection: {
    backgroundColor: t.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 16,
  },
  mediaScroll: {
    marginTop: 8,
  },
  mediaItem: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dashboardDetailsSection: {
    backgroundColor: t.card,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 30,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  summaryStatContent: {
    marginLeft: 10,
  },
  summaryStatLabel: {
    fontSize: 11,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  summaryStatValue: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  feasibilityInfoRowDetailed: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 10,
  },
  feasibilityDetailTextLarge: {
    fontSize: 13,
    fontFamily: Fonts.poppinsSemiBold,
    flex: 1,
  },
  skillsTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  skillTag: {
    backgroundColor: t.inputFilled,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  skillTagText: {
    fontSize: 12,
    fontFamily: Fonts.poppinsMedium,
    color: t.textSecondary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.card,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: t.inputFilled,
    gap: 12,
  },
  footerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  declineBtn: {
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    gap: 6,
  },
  declineBtnText: {
    fontSize: 15,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#EF4444',
  },
  applyButtonFlex: {
    flex: 1,
    backgroundColor: '#FFCE48',
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCE48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  applyButtonFull: {
    flex: 1,
    backgroundColor: '#FFCE48',
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCE48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ongoingButton: {
    backgroundColor: '#FFCE48',
    shadowColor: '#FFCE48',
  },
  conflictButton: {
    backgroundColor: t.inputFilled,
    shadowColor: 'transparent',
    elevation: 0,
    borderWidth: 1,
    borderColor: t.border,
  },
  appliedButton: {
    backgroundColor: '#F0FDF4',
    shadowColor: 'transparent',
    elevation: 0,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  appliedButtonText: {
    color: '#16A34A',
  },
  applyButtonText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginLeft: 8,
  },
  ongoingButtonText: {
    color: t.textPrimary,
  },
  conflictButtonText: {
    color: t.textMuted,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerContent: {
    width: '100%',
    height: '100%',
  },
  viewerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  viewerModalTitle: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  viewerModalType: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: 'rgba(255,255,255,0.7)',
  },
  viewerModalClose: {
    padding: 5,
  },
  viewerMediaArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: width * 1.2,
  },
  fullVideo: {
    width: width,
    height: width * (9 / 16) * 2, // Approximating 16:9 box
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successCardPopup: {
    backgroundColor: t.card,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  successIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successHeading: {
    fontSize: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubheading: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  gateActions: { flexDirection: 'row', gap: 12, marginTop: 22, width: '100%' },
  gateCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.border,
    alignItems: 'center',
  },
  gateCancelText: { fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary },
  gateActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FFCE48',
    alignItems: 'center',
  },
  gateActionText: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
  skofyMarkerContainer: {
    width: 40,
    height: 40,
    backgroundColor: t.card,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#FFCE48',
  },
  skofyMarkerIcon: {
    width: 28,
    height: 28,
  },
  customerMarkerContainer: {
    alignItems: 'center',
  },
  customerMarkerInner: {
    width: 36,
    height: 36,
    backgroundColor: '#EF4444',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerPointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EF4444',
    marginTop: -2,
  },
  mapDistanceOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mapDistanceText: {
    fontSize: 12,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  detailBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  jobTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  jobTypeBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feasibilityInfoRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  feasibilityDetailTextSmall: {
    fontSize: 11,
    fontFamily: Fonts.poppinsSemiBold,
    flex: 1,
  },
  bidSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bidSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  bidSheetTitle: {
    fontSize: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 4,
  },
  bidSheetJob: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginBottom: 20,
  },
  bidFieldLabel: {
    fontSize: 13,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textPrimary,
    marginBottom: 8,
  },
  bidFeeInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: Fonts.poppinsSemiBold,
    fontSize: 18,
    marginBottom: 16,
  },
  bidMsgInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    minHeight: 90,
    fontFamily: Fonts.poppins,
    fontSize: 14,
    marginBottom: 20,
  },
  bidActions: { flexDirection: 'row', gap: 12 },
  bidCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.border,
    alignItems: 'center',
  },
  bidCancelText: { fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary },
  bidSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FFCE48',
    alignItems: 'center',
  },
  bidSubmitText: { fontSize: 14, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
}); }