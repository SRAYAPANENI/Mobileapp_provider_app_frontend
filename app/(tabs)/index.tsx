import AnimatedBrandMark from '@/components/animated-brand-mark';
import React, { useState, useEffect, useRef } from 'react';
import {
  AppState,
  BackHandler,
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  PanResponder,
  Animated as RNAnimated,
  useWindowDimensions,
  Linking,
  TextInput as RNTextInput,
  RefreshControl,
  Pressable,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useAppAlert } from '@/components/app-alert';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Clock,
  MapPin,
  Flame,
  UtilityPole as Gas,
  ConciergeBell as Cleaning,
  Bell,
  Navigation,
  User,
  CheckCircle2,
  PartyPopper,
  Check,
  Zap,
  Phone,
  MessageSquare,
  Navigation as NavIcon,
  CheckCircle,
  Star,
  XCircle,
  X as XIcon,
  Package,
  AlertTriangle,
  LogOut,
  Camera,
} from 'lucide-react-native';
import notifee from '@notifee/react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';
import { checkFeasibility, FeasibilityResult, calculateDistance, kmToMiles } from '@/services/schedulingEngine';
import { SkoFyApi } from '@/services/api';
import { startBackgroundLocation, stopBackgroundLocation } from '@/services/background-location';
import { connectLocationSocket, disconnectLocationSocket, sendLocationViaSocket } from '@/services/location-socket';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
const formatTime = (deadline: number, now: number) => {
  const diff = Math.max(0, deadline - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
};

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const { openServiceRoom, jobId: paramJobId } = useLocalSearchParams<{ openServiceRoom?: string; jobId?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [isAvailable, setIsAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifNudge, setShowNotifNudge] = useState(false);
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);
  const [pickupDropoffEnabled, setPickupDropoffEnabled] = useState(false);
  const [pickupDropoffSaving, setPickupDropoffSaving] = useState(false);
  const [isExitModalVisible, setIsExitModalVisible] = useState(false);
  const lastBackPressTime = useRef(0);

  const loadJobs = React.useCallback(async () => {
    try {
      const [inbound, active] = await Promise.all([
        SkoFyApi.jobs.getInbound().catch(() => []),
        SkoFyApi.jobs.getActive().catch(() => []),
      ]);

      const mapInbound = (j: any) => ({
        id: String(j.job_id ?? j.id),
        title: j.title,
        description: j.description,
        jobType: j.urgency === 'HIGH' || j.urgency === 'EMERGENCY' ? 'Urgent' : j.urgency === 'LOW' ? 'Book Slot' : 'Normal',
        status: 'Open',
        isOngoing: false,
        latitude: j.lat ?? null,
        longitude: j.lng ?? null,
        location: j.address ?? 'Customer Location',
        // "STANDARD" (default) or "PICKUP_DROPOFF" — the pickup point is
        // latitude/longitude above; dropoff is a second, independent point.
        jobKind: j.job_type ?? 'STANDARD',
        dropoffLatitude: j.dropoff_lat ?? null,
        dropoffLongitude: j.dropoff_lng ?? null,
        // "ON_SITE" (default) or "REMOTE" — no physical location/distance
        // matching at all (e.g. hiring a developer/consultant).
        serviceMode: j.service_mode ?? 'ON_SITE',
        startTime: j.scheduled_at ? new Date(j.scheduled_at).getTime() : Date.now() + 3600000,
        endTime: j.scheduled_at ? new Date(j.scheduled_at).getTime() + 7200000 : Date.now() + 7200000,
        // No scheduled_at means this is an ASAP/urgent request rather than a
        // booked slot — give a 9hr response window from when the job was
        // actually POSTED, not from whenever this list happens to load. Using
        // Date.now() here meant the countdown silently reset to ~9hrs on
        // every refresh, regardless of how long the job had really been
        // waiting — it never actually counted down to anything real.
        deadline: j.scheduled_at
          ? new Date(j.scheduled_at).getTime()
          : new Date(j.created_at).getTime() + 9 * 3600000,
        budgetMin: j.budget_min,
        budgetMax: j.budget_max,
        fee: j.budget_min && j.budget_max ? `$${j.budget_min}–$${j.budget_max}` : j.budget_min ? `From $${j.budget_min}` : 'Negotiable',
        skills: j.skills ?? [],
        // Previously hardcoded false — ProviderJobView didn't carry images
        // at all until now, so this "+ Photos" badge already existed in the
        // card but could never actually show for any job.
        hasMedia: Array.isArray(j.images) && j.images.length > 0,
        icon: Gas,
        distance: '—',
        employer: { name: j.customer_name ?? 'Customer', image: null, rating: 4.5, jobsCompleted: 0 },
        feasibility: { feasible: true, status: 'SAFE', reason: 'Inbound', score: 0, travelTime: 0 },
        customerAvgPaymentRating: j.customer_avg_payment_rating ?? null,
        customerAvgBehaviourRating: j.customer_avg_behaviour_rating ?? null,
        customerReviewCount: j.customer_review_count ?? 0,
        // This was already coming back from the backend (job_distributions
        // join already includes the provider's own application, if any) but
        // was never actually mapped — "already applied" jobs were
        // indistinguishable from never-applied ones in the All Jobs tab.
        applicationId: j.application_id ?? null,
        appStatus: j.app_status ?? null,
        // A customer targeted this provider specifically (map "Book directly")
        // rather than this being one of many broadcast recipients — time-
        // limited (auto-advances to the next provider in their shortlist if
        // ignored) and worth surfacing ahead of the regular browsable list,
        // not folded in indistinguishably.
        isDirectRequest: j.is_direct_request ?? false,
      });

      const mapActive = (j: any) => ({
        id: String(j.job_id ?? j.id),
        title: j.title,
        description: j.description,
        jobType: j.urgency === 'HIGH' || j.urgency === 'EMERGENCY' ? 'Urgent' : 'Normal',
        status: j.job_status ?? 'ACCEPTED',
        isOngoing: true,
        latitude: j.lat ?? null,
        longitude: j.lng ?? null,
        location: j.address ?? 'Customer Location',
        jobKind: j.job_type ?? 'STANDARD',
        dropoffLatitude: j.dropoff_lat ?? null,
        dropoffLongitude: j.dropoff_lng ?? null,
        // "ON_SITE" (default) or "REMOTE" — no physical location/distance
        // matching at all (e.g. hiring a developer/consultant).
        serviceMode: j.service_mode ?? 'ON_SITE',
        startTime: j.scheduled_at ? new Date(j.scheduled_at).getTime() : Date.now(),
        endTime: j.scheduled_at ? new Date(j.scheduled_at).getTime() + 7200000 : Date.now() + 7200000,
        // Same reasoning as mapInbound — anchor to when the job was actually
        // posted, not to whenever this list happens to load.
        deadline: j.scheduled_at
          ? new Date(j.scheduled_at).getTime()
          : new Date(j.created_at).getTime() + 9 * 3600000,
        budgetMin: j.budget_min,
        budgetMax: j.budget_max,
        // Bidding is retired — final_amount (the settled, post-inspection-
        // invoice price) is the real number once agreed; proposed_fee only
        // survives on pre-migration applications; budget is a rough fallback
        // for a job that hasn't reached that point yet.
        fee: j.final_amount ? `$${j.final_amount}` : j.proposed_fee ? `$${j.proposed_fee}` : j.budget_min ? `$${j.budget_min}` : 'Negotiable',
        skills: j.skills ?? [],
        hasMedia: Array.isArray(j.images) && j.images.length > 0,
        icon: Gas,
        distance: '—',
        employer: { name: j.customer_name ?? 'Customer', phone: j.customer_phone ?? null, image: j.customer_profile_image ?? null, rating: 4.5, jobsCompleted: 0 },
        feasibility: { feasible: true, status: 'SAFE', reason: 'Active Job', score: 0, travelTime: 0 },
        customerAvgPaymentRating: j.customer_avg_payment_rating ?? null,
        customerAvgBehaviourRating: j.customer_avg_behaviour_rating ?? null,
        customerReviewCount: j.customer_review_count ?? 0,
      });

      const inboundList = (Array.isArray(inbound) ? inbound : []).map(mapInbound);
      const activeList = (Array.isArray(active) ? active : []).map(mapActive);

      // Active job IDs take precedence; if provider has an active job, lock the dashboard
      const ongoingJob = activeList[0] ?? null;
      if (ongoingJob) setActiveJobId(ongoingJob.id);

      setJobs([...activeList, ...inboundList]);
    } catch (error) {
      console.error('Failed to load jobs', error);
      setJobs([]);
    }
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }, [loadJobs]);

  const appAlert = useAppAlert();
  const [activeTab, setActiveTab] = useState(0); // 0: All, 1: Ongoing, 2: Booked, 3: Applied
  const [now, setNow] = useState(Date.now());
  const [address, setAddress] = useState('Locating...');
  const [userName, setUserName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [isLocating, setIsLocating] = useState(true);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // The location-watch effect below runs once on mount, so it reads this ref
  // (not the state directly) to always see the current active job without restarting GPS watching.
  const activeJobIdRef = useRef<string | null>(null);
  const userCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    activeJobIdRef.current = activeJobId;
    if (activeJobId) {
      startBackgroundLocation();
      connectLocationSocket(activeJobId);
    } else {
      stopBackgroundLocation();
      disconnectLocationSocket();
    }
  }, [activeJobId]);
  useEffect(() => { userCoordsRef.current = userCoords; }, [userCoords]);

  // When the provider brings the app to the foreground after it was backgrounded
  // or killed, push an immediate fresh GPS fix so the customer's tracking screen
  // doesn't stay frozen at the last known position.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !activeJobIdRef.current) return;
      try {
        // Push cached GPS immediately so customer sees movement right away,
        // then follow with a fresh fix.
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 500 });
        if (cached) {
          const c = { latitude: cached.coords.latitude, longitude: cached.coords.longitude };
          setUserCoords(c);
          const sent = sendLocationViaSocket(c.latitude, c.longitude, cached.coords.speed, cached.coords.heading);
          if (!sent) SkoFyApi.tracking.updateLocation(c.latitude, c.longitude, cached.coords.heading).catch(() => {});
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserCoords(coords);
        const sent = sendLocationViaSocket(coords.latitude, coords.longitude, loc.coords.speed, loc.coords.heading);
        if (!sent) SkoFyApi.tracking.updateLocation(coords.latitude, coords.longitude, loc.coords.heading).catch(() => {});
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // Push current location immediately when a job becomes active (don't wait for next movement).
  // If GPS coords aren't cached yet (e.g. app just reopened), get a fresh fix first.
  useEffect(() => {
    if (!activeJobId) return;
    const push = async () => {
      let coords = userCoordsRef.current;
      if (!coords) {
        try {
          // Try cached fix first (instant), then fresh fix
          const cached = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 500 });
          if (cached) {
            coords = { latitude: cached.coords.latitude, longitude: cached.coords.longitude };
            setUserCoords(coords);
          } else {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setUserCoords(coords);
          }
        } catch { return; }
      }
      const sent = sendLocationViaSocket(coords.latitude, coords.longitude);
      if (!sent) {
        SkoFyApi.tracking.updateLocation(coords.latitude, coords.longitude)
          .catch((err) => console.warn('Failed to push initial active-job location:', err));
      }
    };
    push();
  }, [activeJobId]);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showChatNotification, setShowChatNotification] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showFinalSuccess, setShowFinalSuccess] = useState(false);
  const [ratings, setRatings] = useState({
    behaviour: 0,
    negotiation: 0,
    payment: 0,
    environment: 0,
  });
  const [comment, setComment] = useState('');
  const [pendingRatingJobId, setPendingRatingJobId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const selectedJob = jobs.find(j => j.id === (selectedJobId || activeJobId));

  // On-site inspection + invoice — bidding is retired, price is only ever
  // set after inspecting the job in person. /jobs/active doesn't carry this
  // detail, so the full job is fetched separately while the modal is open.
  const [manageJobDetail, setManageJobDetail] = useState<any>(null);
  const [otpInput, setOtpInput] = useState('');
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [completingInspection, setCompletingInspection] = useState(false);
  // Pickup & Drop: proof-of-pickup photo — this job kind's equivalent of the
  // OTP-gated inspection start above (the customer isn't at the pickup point
  // to hand over a code, so a photo substitutes for it instead).
  const [pickupPhoto, setPickupPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [materials, setMaterials] = useState<Array<{ name: string; quantity: string; unit_cost: string }>>([]);
  // KeyboardAvoidingView is well known to not cooperate with RN's <Modal> on
  // Android — Modal renders in its own native window, which doesn't
  // participate in the Activity's keyboard-driven resize the way a normal
  // screen does, so wrapping the sheet's content in one (as tried before)
  // silently did nothing. Scrolling to the focused input directly, on its
  // own focus event, sidesteps that entirely instead of depending on it.
  const manageScrollRef = useRef<ScrollView>(null);
  const otpInputRef = useRef<RNTextInput>(null);
  const scrollToFocusedInput = () => {
    setTimeout(() => manageScrollRef.current?.scrollToEnd({ animated: true }), 150);
  };
  const [raisingInvoice, setRaisingInvoice] = useState(false);
  const [respondingToCounter, setRespondingToCounter] = useState(false);

  const INSPECTION_MIN_SECONDS = 20 * 60;

  useEffect(() => {
    if (!showManageModal || !selectedJob) return;
    if (!['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING'].includes(selectedJob.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const detail = await SkoFyApi.jobs.get(selectedJob.id);
        if (cancelled) return;
        setManageJobDetail(detail);
        // The outer branch logic below keys off selectedJob.status, which
        // comes from the /jobs/active list — only refreshed on mount/tab-
        // focus, never while this modal is open. Without this, a customer
        // rejecting the invoice (or the counter) mid-negotiation would leave
        // the provider stuck looking at a stale "waiting" screen forever,
        // since this poll's own fresher status was never fed back in.
        if (detail?.status && detail.status !== selectedJob.status) {
          if (detail.status === 'CANCELLED') {
            appAlert.show(
              'warning', 'Job Cancelled',
              detail.cancellation_reason ? `The customer cancelled this job. Reason: ${detail.cancellation_reason}` : 'The customer cancelled this job.',
            );
            setShowManageModal(false);
            // Unlock the dashboard the same way handleCompleteJob does —
            // this job is dead, no reason to keep it "locked in" as active.
            setActiveJobId(null);
          }
          setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: detail.status } : j));
        }
      } catch {
        // transient — keep showing last known values
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [showManageModal, selectedJob?.id, selectedJob?.status]);

  // 1-second tick to drive the 20-minute inspection countdown display.
  useEffect(() => {
    if (selectedJob?.status !== 'INSPECTING') return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [selectedJob?.status]);

  const inspectionSecondsRemaining = (() => {
    const startedAt = manageJobDetail?.inspection_started_at;
    if (!startedAt) return INSPECTION_MIN_SECONDS;
    const elapsed = (nowTick - new Date(startedAt).getTime()) / 1000;
    return Math.max(0, Math.round(INSPECTION_MIN_SECONDS - elapsed));
  })();

  const handleRequestInspectionOtp = async () => {
    if (!selectedJob) return;
    setRequestingOtp(true);
    try {
      await SkoFyApi.jobs.requestInspectionOtp(selectedJob.id);
      appAlert.show('success', 'Code Sent', "Ask the customer for the 4-digit code on their screen.");
    } catch (err: any) {
      appAlert.show('error', 'Failed', err?.message ?? 'Could not request the inspection code. Please try again.');
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyInspectionOtp = async () => {
    if (!selectedJob || otpInput.length !== 4) return;
    let coords = userCoords;
    if (!coords) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserCoords(coords);
      } catch {
        appAlert.show('error', 'Location Required', 'Turn on location to start the inspection.');
        return;
      }
    }
    setVerifyingOtp(true);
    try {
      await SkoFyApi.jobs.verifyInspectionOtp(selectedJob.id, otpInput, coords.latitude, coords.longitude);
      setOtpInput('');
      setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: 'INSPECTING' } : j));
    } catch (err: any) {
      if (err?.error_code === 'NOT_AT_LOCATION') {
        appAlert.show('warning', 'Too Far From Job Site', err.message ?? 'You need to be at the customer\'s location.');
      } else {
        appAlert.show('error', 'Invalid Code', err?.message ?? 'That code is incorrect or expired.');
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handlePickPickupPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      appAlert.show('warning', 'Camera Permission Required', 'Please allow camera access in your device settings to confirm pickup.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPickupPhoto({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' });
    }
  };

  const handleConfirmPickup = async () => {
    if (!selectedJob || !pickupPhoto) return;
    let coords = userCoords;
    if (!coords) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserCoords(coords);
      } catch {
        appAlert.show('error', 'Location Required', 'Turn on location to confirm pickup.');
        return;
      }
    }
    setConfirmingPickup(true);
    try {
      await SkoFyApi.jobs.confirmPickup(selectedJob.id, pickupPhoto.uri, pickupPhoto.mimeType, coords.latitude, coords.longitude);
      const detail = await SkoFyApi.jobs.get(selectedJob.id);
      setManageJobDetail(detail);
      setPickupPhoto(null);
    } catch (err: any) {
      if (err?.error_code === 'NOT_AT_LOCATION') {
        appAlert.show('warning', 'Too Far From Pickup Location', err.message ?? 'You need to be at the pickup location.');
      } else {
        appAlert.show('error', 'Could Not Confirm Pickup', err?.message ?? 'Please try again.');
      }
    } finally {
      setConfirmingPickup(false);
    }
  };

  const handleCompleteInspection = async () => {
    if (!selectedJob) return;
    // Active guard: tapping early gives a direct answer, not just a
    // silently-disabled button — the button stays tappable the whole time
    // (see the INSPECTING render branch below) specifically so this fires.
    if (inspectionSecondsRemaining > 0) {
      const mins = Math.floor(inspectionSecondsRemaining / 60);
      const secs = inspectionSecondsRemaining % 60;
      appAlert.show(
        'warning', 'Keep Inspecting',
        `Inspection must last at least 20 minutes — ${mins}:${String(secs).padStart(2, '0')} still remaining.`,
      );
      return;
    }
    setCompletingInspection(true);
    try {
      await SkoFyApi.jobs.completeInspection(selectedJob.id);
      const detail = await SkoFyApi.jobs.get(selectedJob.id);
      setManageJobDetail(detail);
    } catch (err: any) {
      appAlert.show('error', 'Not Yet', err?.message ?? 'Please try again in a moment.');
    } finally {
      setCompletingInspection(false);
    }
  };

  const handleRaiseInvoice = async () => {
    if (!selectedJob) return;
    const amount = parseFloat(invoiceAmount);
    if (!invoiceAmount.trim() || isNaN(amount) || amount <= 0) {
      appAlert.show('error', 'Invalid Amount', 'Enter a valid invoice amount greater than 0.');
      return;
    }
    setRaisingInvoice(true);
    try {
      const materialLines = materials
        .filter(m => m.name.trim())
        .map(m => ({
          name: m.name.trim(),
          quantity: parseFloat(m.quantity) || 1,
          unit_cost: parseFloat(m.unit_cost) || 0,
        }));
      await SkoFyApi.jobs.raiseInvoice(selectedJob.id, amount, materialLines, invoiceNotes.trim() || undefined);
      setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: 'INVOICE_PENDING' } : j));
      setInvoiceAmount('');
      setInvoiceNotes('');
      setMaterials([]);
    } catch (err: any) {
      appAlert.show('error', 'Failed to Send Invoice', err?.message ?? 'Please try again.');
    } finally {
      setRaisingInvoice(false);
    }
  };

  const handleRespondToCounter = async (accept: boolean) => {
    if (!selectedJob) return;
    setRespondingToCounter(true);
    try {
      await SkoFyApi.jobs.respondToCounter(selectedJob.id, accept);
      // Rejecting the counter no longer cancels the job — the original
      // invoice amount goes back on offer instead, and the job stays
      // INVOICE_PENDING while the customer decides. Both branches now just
      // re-fetch and keep the modal open, matching each other.
      const detail = await SkoFyApi.jobs.get(selectedJob.id);
      setManageJobDetail(detail);
    } catch (err: any) {
      appAlert.show('error', 'Failed', err?.message ?? 'Please try again.');
    } finally {
      setRespondingToCounter(false);
    }
  };

  const panY = useRef(new RNAnimated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          setShowManageModal(false);
          RNAnimated.timing(panY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else {
          RNAnimated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    notifee.getNotificationSettings()
      .then(s => { if (s.authorizationStatus < 1) setShowNotifNudge(true); })
      .catch(() => {});
  }, []);

  // Load provider profile (name + availability + photo) on mount
  useEffect(() => {
    SkoFyApi.provider.getProfile()
      .then((profile: any) => {
        if (profile?.name) setUserName(profile.name);
        if (typeof profile?.is_available === 'boolean') setIsAvailable(profile.is_available);
        if (profile?.profile_image_url) setProfileImageUrl(profile.profile_image_url);
        setIsIdentityVerified(!!profile?.is_identity_verified);
      })
      .catch((err) => console.error('Failed to fetch provider profile:', err));
    SkoFyApi.notifications.unreadCount().then(setUnreadNotifCount).catch(() => {});
  }, []);

  // Same skill row (and identity-verification flag) Profile's dedicated
  // toggle reads/writes — surfaced here too since a provider shouldn't have
  // to leave the dashboard to find it. Refreshed on every focus, not just
  // mount: this screen and Profile both stay mounted in the background
  // across tab switches, so toggling it in Profile (or getting verified)
  // and switching back here would otherwise show stale state.
  const refreshPickupDropoffStatus = React.useCallback(() => {
    SkoFyApi.provider.getProfile()
      .then((profile: any) => {
        setIsIdentityVerified(!!profile?.is_identity_verified);
        if (typeof profile?.is_available === 'boolean') setIsAvailable(profile.is_available);
        // Same staleness issue as is_available above: this screen and
        // Profile both stay mounted across tab switches, and this was only
        // ever fetched once at cold start — so uploading/changing a photo
        // in Profile left the Dashboard's header stuck on the generic
        // person icon (or a stale old photo, if one had been set at cold
        // start and was since removed) for the rest of the session instead
        // of picking up the change on the next visit. Unconditional, not
        // `if (profile?.profile_image_url)`, so a removal (photo_url now
        // null) actually clears it here instead of only ever being able to
        // set a new one.
        if (profile?.name) setUserName(profile.name);
        setProfileImageUrl(profile?.profile_image_url || null);
      })
      .catch(() => {});
    SkoFyApi.skills.getMySkills()
      .then((skills: any[]) => {
        setPickupDropoffEnabled((skills || []).some(s => s.name === 'Pickup & Delivery Errands' && s.is_verified));
      })
      .catch(() => {});
  }, []);
  useFocusEffect(React.useCallback(() => { refreshPickupDropoffStatus(); }, [refreshPickupDropoffStatus]));

  // Double-back-to-exit — same pattern as the customer app's Home/Login
  // screens, previously missing here entirely (this Dashboard is the
  // provider app's root/landing tab, so it's the natural place for it).
  useFocusEffect(
    React.useCallback(() => {
      const backAction = () => {
        const currentTime = Date.now();
        if (currentTime - lastBackPressTime.current < 2000) {
          setIsExitModalVisible(true);
        } else {
          lastBackPressTime.current = currentTime;
        }
        return true;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
  );

  const handleTogglePickupDropoff = async (value: boolean) => {
    if (value && !isIdentityVerified) {
      appAlert.show('warning', 'Identity verification required', 'Complete identity verification (in Profile) before enabling Pickup & Delivery.');
      return;
    }
    setPickupDropoffSaving(true);
    try {
      const skills = await SkoFyApi.skills.setPickupDropoffEnabled(value);
      setPickupDropoffEnabled((skills || []).some((s: any) => s.name === 'Pickup & Delivery Errands' && s.is_verified));
    } catch (err: any) {
      appAlert.show('error', 'Error', err?.message || 'Could not update Pickup & Delivery.');
    } finally {
      setPickupDropoffSaving(false);
    }
  };

  // Load dashboard jobs from API on mount
  useEffect(() => {
    setIsLoading(true);
    loadJobs().finally(() => setIsLoading(false));
  }, [loadJobs]);

  // Quietly re-fetch whenever this tab regains focus (no full-screen spinner)
  // so an edit the customer just made — deadline, budget, title — actually
  // shows up here without the provider needing to manually pull-to-refresh.
  // Also polls periodically while the tab stays focused — useFocusEffect
  // alone only fires on the initial focus transition, so a new inbound job,
  // an applicant response, or an invoice/inspection status change sat there
  // stale until the provider switched tabs away and back or pulled to
  // refresh manually. The Service Room modal (opened from here) already
  // pauses this via its own dedicated poll while it's open, so this doesn't
  // fight with that.
  useFocusEffect(
    React.useCallback(() => {
      loadJobs();
      const interval = setInterval(loadJobs, 15000);
      return () => clearInterval(interval);
    }, [loadJobs])
  );

  const tabs = ['All Jobs', 'Ongoing', 'Booked Slots', 'Applied'];
  const tabWidth = (width - 40) / 3;

  // Tab badge pulse — fires once when count increases for a non-active tab
  const tabPulseScales = [useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const prevTabCounts = useRef([0, 0, 0, 0]);
  const getTabCount = (idx: number) => jobs.filter((j: any) => {
    const alreadyApplied = j.applicationId != null;
    const isBookSlotType = j.jobType === 'Book Slot';
    if (idx === 0) return !j.isOngoing && !alreadyApplied;
    if (idx === 1) return j.isOngoing && !isBookSlotType;
    if (idx === 2) return j.isOngoing && isBookSlotType;
    if (idx === 3) return alreadyApplied && !j.isOngoing;
    return false;
  }).length;
  useEffect(() => {
    tabs.forEach((_, idx) => {
      const cur = getTabCount(idx);
      if (cur > prevTabCounts.current[idx] && idx !== activeTab) {
        tabPulseScales[idx].value = withSequence(
          withTiming(1.25, { duration: 200 }),
          withSpring(1, { damping: 8 }),
        );
      }
      prevTabCounts.current[idx] = cur;
    });
  }, [jobs]);

  // Animation values
  const acceptButtonScale = useSharedValue(1);
  const urgentBadgeScale = useSharedValue(1);
  const successScale = useSharedValue(0);
  const successOpacity = useSharedValue(0);

  useEffect(() => {
    if (showSuccessOverlay) {
      successScale.value = withSpring(1, { damping: 15 });
      successOpacity.value = withTiming(1, { duration: 400 });

      const timer = setTimeout(() => {
        setShowSuccessOverlay(false);
        successScale.value = withTiming(0);
        successOpacity.value = withTiming(0);
        setActiveTab(1); // Switch to Ongoing tab automatically

        // Simulate a new message notification after 5 seconds of getting hired
        setTimeout(() => {
          setShowChatNotification(true);
        }, 5000);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessOverlay]);

const filteredJobs = jobs.filter((job) => {
    // Once a job is hired/ongoing it belongs exclusively in one tab — it
    // used to also keep showing in All Jobs (and in Booked Slots, if it
    // started as a booked slot), so the same job appeared in multiple tabs.
    // Same idea for jobs already applied to — those now live exclusively in
    // the Applied tab instead of staying mixed into All Jobs/Booked Slots
    // with no way to tell them apart from never-applied ones.
    //
    // Booked Slots specifically used to mean "Book Slot jobs still open to
    // apply to" (excluding hired ones) — backwards from what the label
    // implies. Now it means "Book Slot jobs you're actually booked/hired
    // for", and those hired jobs move out of Ongoing exclusively into here
    // instead, so Ongoing = hired Urgent/Normal jobs, Booked Slots = hired
    // Book Slot jobs.
    const alreadyApplied = job.applicationId != null;
    const isBookSlotType = job.jobType === 'Book Slot';
    // Going offline stops new jobs from being distributed to this provider
    // (the Distribution Agent already skips is_available=false providers
    // server-side) — but jobs distributed before they went offline stayed
    // visible here regardless, which looked like "I'm offline and jobs are
    // still coming in". Browsable/unapplied jobs hide entirely while
    // offline; already-ongoing or already-applied jobs still need managing
    // regardless of availability, so those two tabs are unaffected.
    if (activeTab === 0) return isAvailable && !job.isOngoing && !alreadyApplied;
    if (activeTab === 1) return job.isOngoing && !isBookSlotType;
    if (activeTab === 2) return job.isOngoing && isBookSlotType;
    if (activeTab === 3) return alreadyApplied && !job.isOngoing;
    return true;
  }).sort((a, b) => {
    // Direct requests are time-limited (auto-advance to the next provider in
    // the customer's shortlist if ignored) — surface them ahead of the
    // regular browsable list instead of mixed in at whatever position they'd
    // otherwise fall in.
    if (!!a.isDirectRequest === !!b.isDirectRequest) return 0;
    return a.isDirectRequest ? -1 : 1;
  });

  const handleApplyJob = async (jobId: string) => {
    if (pendingRatingJobId) {
      alert('Please complete the pending rating before applying for a new job!');
      return;
    }
    if (activeJobId) {
      alert('You already have an ongoing job. Complete it before applying for another one!');
      return;
    }

    try {
      // Bidding is retired — applying no longer proposes a fee. The real
      // price is set only after inspecting the job in person, post-hire.
      await SkoFyApi.jobs.bid(jobId);
    } catch (err: any) {
      const msg = err?.message ?? '';
      const alreadyApplied = msg.toLowerCase().includes('already') || err?.error_code === 'ALREADY_BID';
      if (!alreadyApplied) {
        if (err?.error_code === 'SKILL_NOT_VERIFIED') {
          appAlert.show('warning', 'Skill Test Required',
            msg || 'You need to pass the skill test for this job\'s required skill before applying.',
            [
              { text: 'Not Now', variant: 'secondary' },
              { text: 'Take Test', onPress: () => router.push('/(tabs)/profile') },
            ]
          );
        } else if (err?.error_code === 'IDENTITY_NOT_VERIFIED') {
          appAlert.show('warning', 'Identity Verification Required',
            msg || 'Your identity must be verified before you can apply to jobs.',
            [
              { text: 'Not Now', variant: 'secondary' },
              { text: 'Verify Now', onPress: () => router.push('/(tabs)/profile') },
            ]
          );
        } else if (err?.error_code === 'CONNECT_ONBOARDING_INCOMPLETE') {
          appAlert.show('warning', 'Payout Setup Required',
            msg || 'You need to finish setting up payouts before you can be hired for jobs.',
            [
              { text: 'Not Now', variant: 'secondary' },
              { text: 'Set Up Now', onPress: () => router.push('/(tabs)/profile') },
            ]
          );
        } else if (err?.error_code === 'BACKGROUND_CHECK_PENDING' || err?.error_code === 'LICENSE_NOT_VERIFIED') {
          appAlert.show('warning', 'Verification Required',
            msg || 'This job needs your verification to finish before you can be hired.',
            [
              { text: 'Not Now', variant: 'secondary' },
              { text: 'View Status', onPress: () => router.push('/(tabs)/profile') },
            ]
          );
        } else {
          appAlert.show('error', 'Bid Failed', msg || 'Failed to submit bid. Please try again.');
        }
        return;
      }
    }

    // This used to set isOngoing: true here — the exact flag that gates
    // "Service Room" access (Start Job / Mark Completed) — meaning the
    // moment a provider merely APPLIED to a job, the app treated them as
    // already hired for it, full Service Room and all, with no customer
    // ever having chosen them. Applying just marks the job "Applied ✓";
    // isOngoing only becomes true once the backend's /active list actually
    // shows assigned_provider_id pointing at this provider (real hire).
    setJobs(prevJobs => prevJobs.map(job =>
      job.id === jobId ? { ...job, applicationId: job.applicationId ?? jobId, appStatus: 'PENDING' } : job
    ));
    setShowSuccessOverlay(true);
  };

  const handleManageService = (jobId: string) => {
    // Reset the shared invoice-form state on open — it only clears after a
    // successful submit, so without this, switching to a different job's
    // Service Room before submitting would carry over stale materials/amount.
    setInvoiceAmount('');
    setInvoiceNotes('');
    setMaterials([]);
    setPickupPhoto(null);
    setSelectedJobId(jobId);
    setShowManageModal(true);
  };

  // Auto-open service room modal when navigated from job details
  useEffect(() => {
    if (openServiceRoom === 'true' && paramJobId) {
      handleManageService(paramJobId);
    }
  }, [openServiceRoom, paramJobId]);

  const handleStartJob = async () => {
    if (!activeJobId) return;

    let coords = userCoords;
    if (!coords) {
      // userCoords being null here used to be a dead end — a plain native
      // alert with just "OK" that did nothing useful. It could mean the
      // mount-time permission request is still pending, was denied once
      // (still askable), or was permanently denied — each needs a different
      // response, not the same unhelpful message every time.
      try {
        const current = await Location.getForegroundPermissionsAsync();
        let granted = current.status === 'granted';
        if (!granted) {
          if (current.status === 'denied' && !current.canAskAgain) {
            setShowLocationModal(true);
            return;
          }
          const requested = await Location.requestForegroundPermissionsAsync();
          granted = requested.status === 'granted';
          if (!granted) {
            setShowLocationModal(true);
            return;
          }
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserCoords(coords);
      } catch (err) {
        console.error('Failed to get location for starting job:', err);
        setShowLocationModal(true);
        return;
      }
    }

    try {
      await SkoFyApi.jobs.markStarted(activeJobId, coords.latitude, coords.longitude);
      setJobs(prevJobs => prevJobs.map(job =>
        job.id === activeJobId ? { ...job, status: 'IN_PROGRESS' } : job
      ));
    } catch (err: any) {
      if (err?.error_code === 'NOT_AT_LOCATION') {
        appAlert.show('warning', 'Too Far From Job Site', err.message ?? 'You need to be at the customer\'s location to start this job.');
      } else {
        appAlert.show('error', 'Could Not Start Job', err?.message ?? 'Could not start the job. Please try again.');
      }
    }
  };

  const handleCompleteJob = async () => {
    if (!activeJobId) return;

    const completedId = activeJobId;

    try {
      await SkoFyApi.jobs.markComplete(completedId);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // If the job is already COMPLETED (customer marked it first), the
      // backend rejects with "Job must be IN_PROGRESS to complete." — still
      // show the rating modal so the provider can rate the customer.
      if (!msg.includes('IN_PROGRESS')) {
        appAlert.show('error', 'Could Not Complete Job', msg || 'Could not mark the job as completed. Please try again.');
        return;
      }
    }

    setJobs(prevJobs => prevJobs.map(job =>
      job.id === completedId ? { ...job, isOngoing: false, status: 'Completed' } : job
    ));

    setShowManageModal(false);
    setActiveJobId(null);
    setPendingRatingJobId(completedId);

    setTimeout(() => {
      setShowRatingModal(true);
    }, 500);
  };

  const [showCancelJobModal, setShowCancelJobModal] = useState(false);
  const [cancelJobReason, setCancelJobReason] = useState<string | null>(null);
  const [otherCancelJobReason, setOtherCancelJobReason] = useState('');
  const [cancellingJob, setCancellingJob] = useState(false);

  const PROVIDER_CANCEL_REASONS = [
    'Personal emergency',
    'Vehicle breakdown',
    'Can\'t reach the location',
    'Unexpected schedule conflict',
    'Customer not responding',
    'Other',
  ];

  const handleConfirmCancelJob = async () => {
    if (!activeJobId || cancellingJob) return;
    const finalReason = cancelJobReason === 'Other' ? otherCancelJobReason.trim() : cancelJobReason;
    if (!finalReason) return;
    setCancellingJob(true);
    try {
      await SkoFyApi.jobs.cancelJob(activeJobId, finalReason);
      setJobs(prevJobs => prevJobs.filter(job => job.id !== activeJobId));
      setShowCancelJobModal(false);
      setShowManageModal(false);
      setActiveJobId(null);
      setCancelJobReason(null);
      setOtherCancelJobReason('');
    } catch (err: any) {
      appAlert.show('error', 'Cancel Failed', err?.message ?? 'Could not cancel this job. Please try again.');
    } finally {
      setCancellingJob(false);
    }
  };

  const submitRating = async () => {
    if (!pendingRatingJobId) return;
    if (Object.values(ratings).some(v => v === 0)) {
      appAlert.show('info', 'Rate All Categories', 'Please give a rating for every category before submitting.');
      return;
    }

    setIsSubmittingRating(true);
    try {
      // This used to call a mock stub that always resolved true without
      // touching the network — the rating just disappeared, never reaching
      // the backend at all. Now wired to the real endpoint.
      await SkoFyApi.jobs.submitCustomerReview(pendingRatingJobId, {
        behaviour_rating: ratings.behaviour,
        negotiation_rating: ratings.negotiation,
        payment_rating: ratings.payment,
        environment_rating: ratings.environment,
        comment: comment || undefined,
      });
      setPendingRatingJobId(null);
      setSelectedJobId(null);
      setShowRatingModal(false);
      setRatings({ behaviour: 0, negotiation: 0, payment: 0, environment: 0 });
      setComment('');

      setTimeout(() => {
        setShowFinalSuccess(true);
      }, 400);
    } catch (error) {
      console.error('Failed to submit customer review:', error);
      appAlert.show('error', 'Rating Failed', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleNavigateToSite = () => {
    if (!selectedJob) return;
    const { latitude, longitude, title } = selectedJob;
    if (latitude && longitude) {
      router.push({
        pathname: '/navigate-to-site' as any,
        params: { lat: String(latitude), lng: String(longitude), title: title ?? 'Job Site', jobId: selectedJob.id },
      });
    }
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        // Small delay so the Android Activity window is fully attached before
        // requesting permission — prevents the dialog being silently dropped
        // on cold first-launch.
        await new Promise(resolve => setTimeout(resolve, 400));
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setAddress('Location permission denied');
          setIsLocating(false);
          return;
        }

        // Use last cached fix immediately (instant) so the map and address show
        // right away after app reopen — don't wait for a fresh satellite fix.
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: 300000,      // accept up to 5 min old
          requiredAccuracy: 500,
        });
        if (cached) {
          setUserCoords({ latitude: cached.coords.latitude, longitude: cached.coords.longitude });
          updateAddress(cached);
        }

        // Then get a fresh high-accuracy fix and refine.
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const initLat = initialLocation.coords.latitude;
        const initLng = initialLocation.coords.longitude;
        setUserCoords({ latitude: initLat, longitude: initLng });
        updateAddress(initialLocation);
        // Always push the initial location to the backend so the provider
        // appears in distribution queries even before moving 5m.
        SkoFyApi.tracking.updateLocation(initLat, initLng)
          .catch((err) => console.warn('Failed to push initial location:', err));

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (newLocation) => {
            setUserCoords({
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
            });
            updateAddress(newLocation);
            // Stream live GPS to the backend only while a job is actively underway.
            // Try WebSocket first (real-time, <200ms); fall back to HTTP PATCH
            // if the socket isn't open (e.g. briefly after app reopen).
            if (activeJobIdRef.current) {
              const sent = sendLocationViaSocket(
                newLocation.coords.latitude,
                newLocation.coords.longitude,
                newLocation.coords.speed,
                newLocation.coords.heading,
              );
              if (!sent) {
                SkoFyApi.tracking.updateLocation(
                  newLocation.coords.latitude,
                  newLocation.coords.longitude,
                  newLocation.coords.heading,
                ).catch((err) => console.warn('Failed to push live location update:', err));
              }
            }
          }
        );
      } catch (error) {
        console.error('Location error:', error);
        setAddress('Unable to get location');
        setIsLocating(false);
      }
    };

    const updateAddress = async (location: Location.LocationObject) => {
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocode.length > 0) {
          const addr = reverseGeocode[0];
          const formattedAddr = `${addr.name || ''}, ${addr.street || ''}, ${addr.city || ''}`.trim()
            .replace(/^,/, '').trim()
            .replace(/, ,/g, ',');
          setAddress(formattedAddr);
        }
      } catch (err) {
        console.warn('Reverse geocode failed', err);
      } finally {
        setIsLocating(false);
      }
    };

    startLocationTracking();
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(interval);
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // Pulse animations — must run inside useEffect, not during render
  useEffect(() => {
    acceptButtonScale.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true
    );
    urgentBadgeScale.value = withRepeat(
      withSequence(withTiming(1.1, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      true
    );
  }, []);

  const acceptButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: acceptButtonScale.value }],
  }));


  const successOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
    opacity: successOpacity.value,
  }));

  const notificationTranslateY = useSharedValue(-100);
  const notificationStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: notificationTranslateY.value }],
  }));

  useEffect(() => {
    if (showChatNotification) {
      notificationTranslateY.value = withSpring(Platform.OS === 'ios' ? 60 : 40);
      const timer = setTimeout(() => {
        setShowChatNotification(false);
        notificationTranslateY.value = withTiming(-100);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showChatNotification]);

  const urgentBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: urgentBadgeScale.value }],
  }));

  const renderJobCard = (job: any, index: number) => {
    const Icon = job.icon || Gas;
    const isUrgent = job.jobType === 'Urgent';
    const isBookSlot = job.jobType === 'Book Slot';
    const { days, hours, minutes, seconds } = formatTime(job.deadline, now);

    const feasibility: FeasibilityResult = job.feasibility || { feasible: true, score: 0, status: 'SAFE', reason: 'Active Job' };

    const getFeasibilityColor = (status: string) => {
      switch (status) {
        case 'SAFE': return '#10B981';
        case 'TIGHT': return '#F59E0B';
        case 'RISKY': return '#EF4444';
        case 'NOT_FEASIBLE': return '#7F1D1D';
        default: return '#9CA3AF';
      }
    };

    const isConflict = feasibility.status === 'NOT_FEASIBLE';

    return (
      <Animated.View
        key={job.id}
        entering={FadeInUp.delay(200 * index).springify()}
        style={[
          styles.jobCard,
          {
            backgroundColor: themeColors.background,
            shadowColor: themeColors.shadow,
            borderColor: job.isDirectRequest ? '#6366F1' : isUrgent ? '#FEE2E2' : '#F3F4F6',
            borderWidth: job.isDirectRequest ? 2 : isUrgent ? 1.5 : 1,
            opacity: isConflict && !job.isOngoing ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.jobCardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: job.isDirectRequest ? '#EEF2FF' : isUrgent ? '#FEF2F2' : '#F9FAFB' }]}>
            <Icon size={28} color={job.isDirectRequest ? '#6366F1' : isUrgent ? '#EF4444' : '#FFCE48'} />
          </View>
          <View style={styles.jobTitleContainer}>
            <View style={styles.titleRow}>
              {job.isDirectRequest && (
                <View style={styles.directRequestBadge}>
                  <ThemedText style={styles.directRequestText}>DIRECT REQUEST</ThemedText>
                </View>
              )}
              {!job.isOngoing && (
                <View style={[styles.feasibilityBadge, { backgroundColor: getFeasibilityColor(feasibility.status) }]}>
                  <ThemedText style={styles.feasibilityText}>{feasibility.status}</ThemedText>
                </View>
              )}
              {job.jobType && (
                <Animated.View style={[
                  styles.statusBadge,
                  { backgroundColor: isUrgent ? '#EF4444' : isBookSlot ? '#10B981' : '#F59E0B' },
                  isUrgent && urgentBadgeStyle,
                ]}>
                  <Text style={styles.statusText}>{job.jobType}</Text>
                </Animated.View>
              )}
              {job.jobKind === 'PICKUP_DROPOFF' && (
                <View style={[styles.statusBadge, { backgroundColor: '#0EA5E9' }]}>
                  <Text style={styles.statusText}>Pickup & Drop</Text>
                </View>
              )}
              {job.serviceMode === 'REMOTE' && (
                <View style={[styles.statusBadge, { backgroundColor: '#7C3AED' }]}>
                  <Text style={styles.statusText}>Remote</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <ThemedText style={[styles.jobTitle, { flex: 1 }]} numberOfLines={1}>{job.title}</ThemedText>
              <View style={styles.distanceBadge}>
                <Navigation size={12} color="#FFCE48" fill="#FFCE48" />
                <Text style={styles.distanceBadgeText}>
                  {job.latitude == null || job.longitude == null
                    ? 'Remote'
                    : userCoords
                    ? `${kmToMiles(calculateDistance(userCoords, { latitude: job.latitude, longitude: job.longitude })).toFixed(1)} mi`
                    : job.distance}
                </Text>
              </View>
            </View>
            <ThemedText style={styles.jobDescription} numberOfLines={2}>
              {job.description}
            </ThemedText>
          </View>
        </View>

        {!job.isOngoing && job.serviceMode !== 'REMOTE' && (
          <View style={styles.feasibilityInfoRow}>
            <Zap size={12} color={getFeasibilityColor(feasibility.status)} />
            <ThemedText style={[styles.feasibilityDetailText, { color: getFeasibilityColor(feasibility.status) }]}>
              {(() => {
                // job.latitude/longitude are `number | null` (not defaulted to 0
                // anymore — see mapInbound/mapActive) — this guard now correctly
                // means "job has no location" rather than happening to work only
                // because 0 is falsy.
                if (userCoords && job.latitude != null && job.longitude != null) {
                  const distKm = calculateDistance(userCoords, { latitude: job.latitude, longitude: job.longitude });
                  const mins = Math.max(1, Math.round(distKm / 40 * 60));
                  return `${mins} min travel`;
                }
                return `${feasibility.travelTime} min travel`;
              })()} {'•'} {feasibility.score < 0 ? 'Conflict' : `${feasibility.score} min gap`} {'•'} {feasibility.reason}
            </ThemedText>
          </View>
        )}

        <View style={styles.skillsRow}>
          {(job.skills || []).map((skill: string, idx: number) => (
            <View key={idx} style={styles.skillBadge}>
              <CheckCircle2 size={12} color="#D97706" />
              <ThemedText style={styles.skillText}>{skill}</ThemedText>
            </View>
          ))}
          {job.hasMedia && (
            <View style={[styles.skillBadge, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
              <Text style={[styles.skillText, { color: '#666' }]}>+ Photos</Text>
            </View>
          )}
        </View>

        {/* Customer Meter — reverse of the Skill-O-Meter customers see about
            providers: same review-derived trust signal, but rating the
            customer (payment reliability, behaviour) instead of skills. */}
        {job.customerReviewCount > 0 && (
          <View style={styles.skillsRow}>
            {job.customerAvgPaymentRating != null && (
              <View style={[styles.skillBadge, { backgroundColor: job.customerAvgPaymentRating >= 4.0 ? '#FFFBEB' : '#F9FAFB', borderColor: job.customerAvgPaymentRating >= 4.0 ? '#FDE9C0' : '#E5E7EB' }]}>
                <CheckCircle2 size={12} color={job.customerAvgPaymentRating >= 4.0 ? '#D97706' : '#9CA3AF'} />
                <ThemedText style={[styles.skillText, { color: job.customerAvgPaymentRating >= 4.0 ? '#92400E' : '#6B7280' }]}>
                  Pays on Time {job.customerAvgPaymentRating.toFixed(1)}★
                </ThemedText>
              </View>
            )}
            {job.customerAvgBehaviourRating != null && (
              <View style={[styles.skillBadge, { backgroundColor: job.customerAvgBehaviourRating >= 4.0 ? '#F0FDF4' : '#F9FAFB', borderColor: job.customerAvgBehaviourRating >= 4.0 ? '#BBF7D0' : '#E5E7EB' }]}>
                <CheckCircle2 size={12} color={job.customerAvgBehaviourRating >= 4.0 ? '#16A34A' : '#9CA3AF'} />
                <ThemedText style={[styles.skillText, { color: job.customerAvgBehaviourRating >= 4.0 ? '#166534' : '#6B7280' }]}>
                  Good Behaviour {job.customerAvgBehaviourRating.toFixed(1)}★
                </ThemedText>
              </View>
            )}
          </View>
        )}

        <View style={styles.jobDetails}>
          <View style={styles.detailItem}>
            <Clock size={16} color={isUrgent ? '#EF4444' : themeColors.icon} />
            <ThemedText style={[styles.detailText, isUrgent && { color: '#EF4444' }]}>
              {days}d : {hours}h : {minutes}m : <Text style={styles.secondsText}>{seconds}s</Text>
            </ThemedText>
          </View>
          <View style={[styles.detailItem, { flex: 1, marginLeft: 10 }]}>
            <MapPin size={16} color={themeColors.icon} />
            <ThemedText style={styles.detailText} numberOfLines={1}>
              {job.location}
            </ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View>
            <ThemedText style={styles.feeLabel}>Service Fee</ThemedText>
            <ThemedText style={styles.feeValue}>{job.fee}</ThemedText>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => router.push({
                pathname: '/job-details' as any,
                params: { id: job.id },
              })}
            >
              <ThemedText style={styles.detailsButtonText}>Details</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.acceptButton,
                {
                  backgroundColor: job.isOngoing ? '#10B981' :
                    (job.appStatus === 'REJECTED' ? '#FEF2F2' :
                    (job.applicationId ? '#F0FDF4' :
                    (isConflict ? '#F3F4F6' : (activeJobId ? '#E5E7EB' : '#FFCE48')))),
                },
              ]}
              onPress={() => job.isOngoing ? handleManageService(job.id) : (job.applicationId ? undefined : handleApplyJob(job.id))}
              disabled={!!job.applicationId || (!!activeJobId && !job.isOngoing) || (isConflict && !job.isOngoing)}
            >
              <Animated.View style={isUrgent && !job.isOngoing && !isConflict && !job.applicationId ? acceptButtonStyle : null}>
                <ThemedText style={[
                  styles.acceptButtonText,
                  job.appStatus === 'REJECTED' && { color: '#EF4444' },
                  (job.applicationId && job.appStatus !== 'REJECTED') && { color: '#16A34A' },
                  (!job.applicationId && ((activeJobId && !job.isOngoing) || (isConflict && !job.isOngoing))) && { color: '#9CA3AF' },
                ]}>
                  {job.isOngoing ? 'Service Room' :
                    // Already applied takes priority over the other disabled
                    // states — this used to show "Apply Job" again (or even
                    // "Locked"/"Conflict" for unrelated reasons) with no way
                    // to tell a job you'd already bid on apart from one you
                    // hadn't, until you tapped it and got an error.
                    (job.applicationId
                      ? (job.appStatus === 'REJECTED' ? 'Rejected' : 'Applied ✓')
                      : (isConflict ? 'Conflict' : (activeJobId ? 'Locked' : 'Apply Job')))}
                </ThemedText>
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.centeredLogoRow}>
            <AnimatedBrandMark size={32} nameSize={20} centered={false} pro />
          </View>

          <View style={styles.headerActions}>
            <View style={styles.availabilityToggle}>
              <Switch
                value={isAvailable}
                onValueChange={async (val) => {
                  setIsAvailable(val);
                  SkoFyApi.provider.setAvailability(val).catch(() => setIsAvailable(!val));
                  // Push a GPS fix immediately when going online so the
                  // distribution agent has a location to match against.
                  if (val) {
                    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
                      .then((loc) => SkoFyApi.tracking.updateLocation(loc.coords.latitude, loc.coords.longitude))
                      .catch(() => {});
                  }
                }}
                trackColor={{ false: '#E5E7EB', true: '#FFCE48' }}
                thumbColor={Platform.OS === 'ios' ? '#fff' : isAvailable ? '#fff' : '#f4f3f4'}
                ios_backgroundColor="#E5E7EB"
              />
              <View style={[styles.statusIndicatorCircle, { backgroundColor: isAvailable ? '#10B981' : '#EF4444' }]} />
            </View>
            <TouchableOpacity style={styles.iconActionBtn} onPress={() => { setUnreadNotifCount(0); router.push('/notifications'); }}>
              <Bell size={22} color={themeColors.text} />
              {unreadNotifCount > 0 && <View style={styles.notificationDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileCircleSmall} onPress={() => router.push('/profile')}>
              {profileImageUrl ? (
                <Image source={{ uri: profileImageUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} />
              ) : (
                <User size={20} color="#666" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showNotifNudge && (
          <View style={styles.notifNudge}>
            <View style={styles.notifNudgeIconWrap}>
              <Bell size={18} color="#FFCE48" />
            </View>
            <View style={styles.notifNudgeBody}>
              <Text style={styles.notifNudgeTitle}>Turn on notifications</Text>
              <Text style={styles.notifNudgeText}>Get instant alerts for new job opportunities.</Text>
            </View>
            <TouchableOpacity
              style={styles.notifNudgeBtn}
              onPress={() => { setShowNotifNudge(false); notifee.openNotificationSettings(); }}
            >
              <Text style={styles.notifNudgeBtnText}>Enable</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifNudgeDismiss} onPress={() => setShowNotifNudge(false)}>
              <XIcon size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Pickup & Delivery — same toggle Profile has, surfaced here too so
            a provider doesn't have to leave the dashboard to find it. Flat
            (no shadow/elevation, no accent bar) so it doesn't read as an
            urgent one-time nudge like notifNudge — but a filled, bounded
            chip, not bare text, so it still reads as a distinct control and
            not a stray label. Not a skill test — gated on identity
            verification (DL/govt ID, already checked at registration), same
            as the toggle in Profile. */}
        <View style={[styles.pickupDropoffRow, !isAvailable && { opacity: 0.5 }]}>
          <View style={styles.pickupDropoffIconWrap}>
            <Package size={15} color="#0369A1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pickupDropoffLabel}>Pickup & Delivery</Text>
            {!isAvailable ? (
              <Text style={styles.pickupDropoffHint}>Go online to receive these</Text>
            ) : !isIdentityVerified ? (
              <Text style={styles.pickupDropoffHint}>Verify identity to enable</Text>
            ) : null}
          </View>
          {pickupDropoffSaving ? (
            <ActivityIndicator size="small" color="#FFCE48" />
          ) : (
            <Switch
              value={isAvailable && pickupDropoffEnabled}
              onValueChange={handleTogglePickupDropoff}
              disabled={!isAvailable || (!isIdentityVerified && !pickupDropoffEnabled)}
              trackColor={{ false: '#E5E7EB', true: '#FFCE48' }}
              thumbColor={Platform.OS === 'ios' ? '#fff' : (isAvailable && pickupDropoffEnabled) ? '#fff' : '#f4f3f4'}
              ios_backgroundColor="#E5E7EB"
            />
          )}
        </View>

        <View style={styles.locationHeader}>
          <View style={styles.locationBadgeWrapper}>
            <Navigation size={10} color="#FFCE48" fill="#FFCE48" />
            <ThemedText style={styles.locationBadgeLabel}>LIVE LOCATION</ThemedText>
            {isLocating && <ActivityIndicator size="small" color="#FFCE48" style={{ transform: [{ scale: 0.6 }] }} />}
          </View>
          <View style={styles.addressRow}>
            <ThemedText style={[styles.addressText, isLocating && { opacity: 0.5 }]} numberOfLines={1}>
              {address}
            </ThemedText>
            <View style={styles.greetingBadge}>
              <ThemedText style={styles.greetingText}>Hi, </ThemedText>
              <ThemedText style={styles.userNameHighlight}>{userName} 👋</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.sliderContainer}>
          {tabs.map((tab, index) => {
            const count = getTabCount(index);
            const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: tabPulseScales[index].value }] }));
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(index)}
                style={[styles.sliderTab, { width: tabWidth }, activeTab === index && styles.sliderTabActive]}
              >
                <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pulseStyle]}>
                  <ThemedText style={[
                    styles.sliderTabText,
                    activeTab === index && styles.sliderTabTextActive,
                  ]}>
                    {tab}
                  </ThemedText>
                  {count > 0 && (
                    <View style={[styles.tabCountBadge, activeTab === index && styles.tabCountBadgeActive]}>
                      <Text style={[styles.tabCountText, activeTab === index && styles.tabCountTextActive]}>{count}</Text>
                    </View>
                  )}
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.jobsList}
        contentContainerStyle={styles.jobsListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#FFCE48']}
            tintColor="#FFCE48"
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFCE48" />
            <ThemedText style={styles.loadingText}>Loading jobs...</ThemedText>
          </View>
        ) : filteredJobs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              {activeTab === 0 && !isAvailable ? "You're offline"
                : activeTab === 1 ? 'No ongoing jobs'
                : activeTab === 2 ? 'No booked slots'
                : activeTab === 3 ? 'No applications yet'
                : 'Waiting for job assignments...'}
            </ThemedText>
            <ThemedText style={styles.emptySubText}>
              {activeTab === 0 && !isAvailable ? 'Turn on availability at the top of the dashboard to see new jobs.'
                : activeTab === 0 ? 'Jobs posted by customers will appear here once assigned to you.'
                : ''}
            </ThemedText>
          </View>
        ) : (
          filteredJobs.map((job, i) => renderJobCard(job, i))
        )}
      </ScrollView>

      {/* Success overlay after applying for a job */}
      {showSuccessOverlay && (
        <View style={styles.successOverlayBg}>
          <Animated.View style={[styles.successOverlayCard, successOverlayStyle]}>
            <CheckCircle2 size={60} color="#10B981" />
            <ThemedText style={styles.successOverlayTitle}>Application Sent!</ThemedText>
            <ThemedText style={styles.successOverlaySubtitle}>You've been added to the Ongoing tab</ThemedText>
          </Animated.View>
        </View>
      )}

      {/* Chat notification slide-down banner */}
      <Animated.View style={[styles.chatNotification, notificationStyle]}>
        <View style={styles.chatNotifContent}>
          <MessageSquare size={20} color="#FFCE48" />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.chatNotifTitle}>New Message</ThemedText>
            <ThemedText style={styles.chatNotifSubtitle} numberOfLines={1}>
              {selectedJob?.title || 'Job'} - Customer sent a message
            </ThemedText>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowChatNotification(false)}>
          <Check size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Service Room Modal */}
      <Modal
        visible={showManageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <RNAnimated.View
            style={[styles.manageSheet, { transform: [{ translateY: panY }] }]}
          >
            {/* panHandlers scoped to just this handle, not the whole sheet —
                it used to cover the entire sheet including the ScrollView
                below, intercepting vertical drags meant for scrolling the
                content instead of dismissing the modal. */}
            <View style={styles.dragHandle} {...panResponder.panHandlers} />

            {/* Title */}
            <ThemedText style={styles.manageTitle}>Service Room</ThemedText>
            {selectedJob && (
              <ThemedText style={styles.manageSubtitle}>
                Active Job ID: #{selectedJob.id.slice(0, 8).toUpperCase()}
              </ThemedText>
            )}

            <View style={styles.manageDivider} />

            {!selectedJob && showManageModal && !isLoading && (
              // Deep-linked here (a "hired"/"job update" notification tap,
              // or the job-details "Enter Service Room" button) for a job
              // that isn't in the current active-jobs list anymore — it
              // likely already completed/got cancelled elsewhere. Without
              // this, the sheet just showed an empty title with nothing
              // else, no explanation.
              //
              // Gated on !isLoading: a cold-started notification tap calls
              // handleManageService() and opens this modal in the same tick
              // as mount, before loadJobs()'s very first fetch has resolved
              // — `jobs` is still an empty array at that instant, so
              // selectedJob is briefly undefined even though the job is
              // perfectly active, flashing this exact message before the
              // fetch completes and the real content renders. Waiting for
              // the first load to finish removes that false-positive flash.
              <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 12 }}>
                <ThemedText style={{ fontSize: 15, color: '#6B7280', textAlign: 'center' }}>
                  This job isn't active anymore — it may have already been completed or cancelled.
                </ThemedText>
                <TouchableOpacity
                  style={{ backgroundColor: '#FFCE48', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
                  onPress={() => setShowManageModal(false)}
                >
                  <ThemedText style={{ fontWeight: '700', color: '#111827' }}>Close</ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {selectedJob && (
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior="padding"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
              >
              <ScrollView ref={manageScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                {/* Live badge */}
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <ThemedText style={styles.liveBadgeText}>LIVE SERVICE IN PROGRESS</ThemedText>
                </View>

                {/* Requirement Details */}
                <ThemedText style={styles.requirementLabel}>REQUIREMENT DETAILS</ThemedText>
                <ThemedText style={styles.serviceJobTitle}>{selectedJob.title}</ThemedText>
                <ThemedText style={styles.serviceJobDesc}>{selectedJob.description}</ThemedText>

                {/* Customer card */}
                <View style={styles.customerCard}>
                  <View style={styles.customerAvatar}>
                    {selectedJob.employer?.image ? (
                      <Image source={{ uri: selectedJob.employer.image }} style={styles.customerAvatarImg} contentFit="cover" />
                    ) : (
                      <User size={24} color="#9CA3AF" />
                    )}
                  </View>
                  <View style={styles.customerInfo}>
                    <ThemedText style={styles.customerName}>
                      {selectedJob.employer?.name || 'Customer'} (Customer)
                    </ThemedText>
                    <ThemedText style={styles.customerBadge}>Verified Dodorez Silver User</ThemedText>
                  </View>
                  <View style={styles.customerContactBtns}>
                    <TouchableOpacity
                      style={[styles.contactBtn, { backgroundColor: '#DCFCE7' }]}
                      onPress={() => {
                        // This used to dial the customer's raw phone number through
                        // the device's native dialer — switched to the in-app VoIP
                        // call so it actually goes through our calling system
                        // (push notifications, call logs, etc.) like everywhere else.
                        setShowManageModal(false);
                        router.push({
                          pathname: '/chat' as any,
                          params: {
                            jobId: selectedJob.id,
                            name: selectedJob.employer?.name || 'Customer',
                            jobTitle: selectedJob.title,
                            autoCall: 'true',
                          },
                        });
                      }}
                    >
                      <Phone size={18} color="#16A34A" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.contactBtn, { backgroundColor: '#DBEAFE' }]}
                      onPress={() => {
                        setShowManageModal(false);
                        router.push({
                          pathname: '/chat' as any,
                          params: {
                            jobId: selectedJob.id,
                            name: selectedJob.employer?.name || 'Customer',
                            jobTitle: selectedJob.title,
                          },
                        });
                      }}
                    >
                      <MessageSquare size={18} color="#2563EB" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Navigate button — a remote job has no physical site to
                    navigate to at all. */}
                {selectedJob.serviceMode !== 'REMOTE' && (
                  <TouchableOpacity style={styles.navigateBtn} onPress={handleNavigateToSite}>
                    <NavIcon size={20} color="#fff" />
                    <ThemedText style={styles.navigateBtnText}>Navigate to Site (Maps)</ThemedText>
                  </TouchableOpacity>
                )}

                {/* Mark as Completed only becomes reachable once the job is
                    actually IN_PROGRESS (i.e. Start Job's location check has
                    passed) — until then this is a Start Job button instead,
                    so completing a job you never actually started/reached is
                    no longer possible from this screen. */}
                {selectedJob.status === 'IN_PROGRESS' ? (
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Please ensure you have finished all tasks before marking as completed.
                    </ThemedText>
                    <TouchableOpacity style={styles.completeJobBtn} onPress={handleCompleteJob}>
                      <CheckCircle size={20} color="#fff" />
                      <ThemedText style={styles.completeJobText}>Mark as Completed</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'ACCEPTED' && selectedJob.serviceMode === 'REMOTE' ? (
                  // A remote job has no physical presence to verify — skip
                  // the OTP/inspection step entirely and go straight to the
                  // same materials+invoice form ON_SITE jobs reach after
                  // completing inspection. Matches raise_invoice()'s
                  // ACCEPTED-status allowance for REMOTE jobs server-side.
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      This is a remote engagement — no on-site inspection needed. Send the customer your invoice when ready.
                    </ThemedText>
                    {materials.map((m, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 2 }]}
                          placeholder="Material"
                          placeholderTextColor="#9CA3AF"
                          value={m.name}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, name: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="Qty"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.quantity}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, quantity: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="$/ea"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.unit_cost}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, unit_cost: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setMaterials(prev => [...prev, { name: '', quantity: '', unit_cost: '' }])}
                    >
                      <ThemedText style={styles.cancelJobBtnText}>+ Add Material</ThemedText>
                    </TouchableOpacity>
                    <RNTextInput
                      style={[styles.otpEntryInput, { fontSize: 17, fontWeight: '700' }]}
                      placeholder="Invoice amount ($)"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      value={invoiceAmount}
                      onChangeText={setInvoiceAmount}
                      onFocus={scrollToFocusedInput}
                    />
                    <RNTextInput
                      style={styles.otpEntryInput}
                      placeholder="What did you do? (optional)"
                      placeholderTextColor="#9CA3AF"
                      value={invoiceNotes}
                      onChangeText={setInvoiceNotes}
                      onFocus={scrollToFocusedInput}
                    />
                    <TouchableOpacity
                      style={[styles.completeJobBtn, raisingInvoice && { opacity: 0.7 }]}
                      onPress={handleRaiseInvoice}
                      disabled={raisingInvoice}
                    >
                      <ThemedText style={styles.completeJobText}>
                        {raisingInvoice ? 'Sending…' : 'Send Invoice'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'ACCEPTED' && selectedJob.jobKind === 'PICKUP_DROPOFF' && manageJobDetail?.pickup_confirmed_at ? (
                  // Pickup already confirmed with a photo — same materials+
                  // invoice form as the REMOTE case above, just a different
                  // disclaimer. Matches raise_invoice()'s PICKUP_DROPOFF
                  // branch server-side (gated on pickup_confirmed_at, not
                  // inspection_completed_at).
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Pickup confirmed. Add any items/costs, then send the customer your invoice.
                    </ThemedText>
                    {materials.map((m, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 2 }]}
                          placeholder="Item"
                          placeholderTextColor="#9CA3AF"
                          value={m.name}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, name: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="Qty"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.quantity}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, quantity: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="$/ea"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.unit_cost}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, unit_cost: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setMaterials(prev => [...prev, { name: '', quantity: '', unit_cost: '' }])}
                    >
                      <ThemedText style={styles.cancelJobBtnText}>+ Add Item</ThemedText>
                    </TouchableOpacity>
                    <RNTextInput
                      style={[styles.otpEntryInput, { fontSize: 17, fontWeight: '700' }]}
                      placeholder="Invoice amount ($)"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      value={invoiceAmount}
                      onChangeText={setInvoiceAmount}
                      onFocus={scrollToFocusedInput}
                    />
                    <RNTextInput
                      style={styles.otpEntryInput}
                      placeholder="What did you do? (optional)"
                      placeholderTextColor="#9CA3AF"
                      value={invoiceNotes}
                      onChangeText={setInvoiceNotes}
                      onFocus={scrollToFocusedInput}
                    />
                    <TouchableOpacity
                      style={[styles.completeJobBtn, raisingInvoice && { opacity: 0.7 }]}
                      onPress={handleRaiseInvoice}
                      disabled={raisingInvoice}
                    >
                      <ThemedText style={styles.completeJobText}>
                        {raisingInvoice ? 'Sending…' : 'Send Invoice'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'ACCEPTED' && selectedJob.jobKind === 'PICKUP_DROPOFF' ? (
                  // The customer isn't physically at the pickup point (it's a
                  // store), so the OTP-gated flow below can't apply — a
                  // geofence-checked photo of what was picked up substitutes
                  // for it instead.
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Once you've got everything, take a photo to confirm pickup.
                    </ThemedText>
                    {pickupPhoto ? (
                      <Image source={{ uri: pickupPhoto.uri }} style={styles.pickupPhotoPreview} contentFit="cover" />
                    ) : null}
                    <TouchableOpacity style={styles.pickupPhotoBtn} onPress={handlePickPickupPhoto}>
                      <Camera size={18} color="#111827" />
                      <ThemedText style={styles.pickupPhotoBtnText}>
                        {pickupPhoto ? 'Retake Photo' : 'Take Photo'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.completeJobBtn, (!pickupPhoto || confirmingPickup) && { opacity: 0.5 }]}
                      onPress={handleConfirmPickup}
                      disabled={!pickupPhoto || confirmingPickup}
                    >
                      <CheckCircle size={20} color="#fff" />
                      <ThemedText style={styles.completeJobText}>
                        {confirmingPickup ? 'Confirming…' : 'Confirm Pickup'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'ACCEPTED' ? (
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Once you've arrived, ask the customer for the 4-digit code on their screen to start inspecting.
                    </ThemedText>
                    <TouchableOpacity
                      style={[styles.completeJobBtn, requestingOtp && { opacity: 0.7 }]}
                      onPress={handleRequestInspectionOtp}
                      disabled={requestingOtp}
                    >
                      <MapPin size={20} color="#fff" />
                      <ThemedText style={styles.completeJobText}>
                        {requestingOtp ? 'Sending…' : 'Request Inspection Code'}
                      </ThemedText>
                    </TouchableOpacity>
                    <View style={styles.otpContainer}>
                      <Pressable onPress={() => otpInputRef.current?.focus()} style={styles.otpBoxesRow}>
                        {[0, 1, 2, 3].map((idx) => {
                          const digit = otpInput[idx] || '';
                          const isFocused = otpInput.length === idx || (otpInput.length === 4 && idx === 3);
                          return (
                            <View
                              key={idx}
                              style={[
                                styles.otpBox,
                                digit ? styles.otpBoxFilled : null,
                                isFocused ? styles.otpBoxFocused : null,
                              ]}
                            >
                              <ThemedText style={[styles.otpDigit, digit ? styles.otpDigitFilled : null]}>
                                {digit}
                              </ThemedText>
                            </View>
                          );
                        })}
                      </Pressable>
                      <RNTextInput
                        ref={otpInputRef}
                        style={styles.hiddenOtpInput}
                        keyboardType="number-pad"
                        maxLength={4}
                        value={otpInput}
                        onChangeText={(text) => setOtpInput(text.replace(/[^0-9]/g, ''))}
                        onFocus={scrollToFocusedInput}
                        caretHidden
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.completeJobBtn, (verifyingOtp || otpInput.length !== 4) && { opacity: 0.5 }]}
                      onPress={handleVerifyInspectionOtp}
                      disabled={verifyingOtp || otpInput.length !== 4}
                    >
                      <ThemedText style={styles.completeJobText}>
                        {verifyingOtp ? 'Verifying…' : 'Verify & Start Inspection'}
                      </ThemedText>
                    </TouchableOpacity>
                    {/* Cancel is only offered before starting — once
                        IN_PROGRESS, the job must go through completion or a
                        dispute instead, same boundary the backend enforces. */}
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'INSPECTING' && !manageJobDetail?.inspection_completed_at ? (
                  <>
                    {inspectionSecondsRemaining > 0 ? (
                      <View style={styles.inspectionTimerCard}>
                        <ThemedText style={styles.inspectionTimerLabel}>Inspection in progress — minimum time remaining</ThemedText>
                        <ThemedText style={styles.inspectionTimerValue}>
                          {Math.floor(inspectionSecondsRemaining / 60)}:{String(inspectionSecondsRemaining % 60).padStart(2, '0')}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={styles.completeDisclaimer}>
                        You've inspected long enough — mark it complete when you're ready.
                      </ThemedText>
                    )}
                    <TouchableOpacity
                      style={[styles.completeJobBtn, (inspectionSecondsRemaining > 0 || completingInspection) && { opacity: 0.5 }]}
                      onPress={handleCompleteInspection}
                      disabled={completingInspection}
                    >
                      <CheckCircle size={20} color="#fff" />
                      <ThemedText style={styles.completeJobText}>
                        {completingInspection ? 'Completing…' : 'Complete Inspection'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'INSPECTING' && manageJobDetail?.inspection_completed_at ? (
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Add any raw materials needed, then send the customer your invoice.
                    </ThemedText>
                    {materials.map((m, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 2 }]}
                          placeholder="Material"
                          placeholderTextColor="#9CA3AF"
                          value={m.name}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, name: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="Qty"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.quantity}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, quantity: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                        <RNTextInput
                          style={[styles.otpEntryInput, { flex: 1 }]}
                          placeholder="$/ea"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={m.unit_cost}
                          onChangeText={(v) => setMaterials(prev => prev.map((mm, i) => i === idx ? { ...mm, unit_cost: v } : mm))}
                          onFocus={scrollToFocusedInput}
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setMaterials(prev => [...prev, { name: '', quantity: '', unit_cost: '' }])}
                    >
                      <ThemedText style={styles.cancelJobBtnText}>+ Add Material</ThemedText>
                    </TouchableOpacity>
                    <RNTextInput
                      style={[styles.otpEntryInput, { fontSize: 17, fontWeight: '700' }]}
                      placeholder="Invoice amount ($)"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      value={invoiceAmount}
                      onChangeText={setInvoiceAmount}
                      onFocus={scrollToFocusedInput}
                    />
                    <RNTextInput
                      style={styles.otpEntryInput}
                      placeholder="What did you inspect? (optional)"
                      placeholderTextColor="#9CA3AF"
                      value={invoiceNotes}
                      onChangeText={setInvoiceNotes}
                      onFocus={scrollToFocusedInput}
                    />
                    <TouchableOpacity
                      style={[styles.completeJobBtn, raisingInvoice && { opacity: 0.7 }]}
                      onPress={handleRaiseInvoice}
                      disabled={raisingInvoice}
                    >
                      <ThemedText style={styles.completeJobText}>
                        {raisingInvoice ? 'Sending…' : 'Send Invoice'}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelJobBtn}
                      onPress={() => setShowCancelJobModal(true)}
                    >
                      <XCircle size={18} color="#EF4444" />
                      <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : selectedJob.status === 'INVOICE_PENDING' ? (
                  <>
                    {manageJobDetail?.invoice?.status === 'COUNTERED' ? (
                      <>
                        <ThemedText style={styles.completeDisclaimer}>
                          Customer countered with ${manageJobDetail.invoice.counter_amount} — accept or reject.
                        </ThemedText>
                        <TouchableOpacity
                          style={[styles.completeJobBtn, respondingToCounter && { opacity: 0.7 }]}
                          onPress={() => handleRespondToCounter(true)}
                          disabled={respondingToCounter}
                        >
                          <ThemedText style={styles.completeJobText}>Accept ${manageJobDetail.invoice.counter_amount}</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelJobBtn}
                          onPress={() => handleRespondToCounter(false)}
                          disabled={respondingToCounter}
                        >
                          <ThemedText style={styles.cancelJobBtnText}>Reject — Offer Original Price</ThemedText>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <ThemedText style={styles.completeDisclaimer}>
                          {manageJobDetail?.invoice?.status === 'ACCEPTED'
                            ? 'Invoice accepted — waiting for the customer to pay.'
                            : manageJobDetail?.invoice?.status === 'COUNTER_REJECTED'
                            ? `You declined their offer — waiting for the customer to accept the original $${manageJobDetail.invoice.amount} or cancel.`
                            : 'Invoice sent — waiting for the customer to respond.'}
                        </ThemedText>
                        <TouchableOpacity
                          style={styles.cancelJobBtn}
                          onPress={() => setShowCancelJobModal(true)}
                        >
                          <XCircle size={18} color="#EF4444" />
                          <ThemedText style={styles.cancelJobBtnText}>Cancel This Job</ThemedText>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.completeDisclaimer}>
                      Start the job once you've arrived at the customer's location.
                    </ThemedText>
                    <TouchableOpacity style={styles.completeJobBtn} onPress={handleStartJob}>
                      <MapPin size={20} color="#fff" />
                      <ThemedText style={styles.completeJobText}>Start Job (Arrived at Site)</ThemedText>
                    </TouchableOpacity>
                  </>
                )}

                {/* Close */}
                <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowManageModal(false)}>
                  <ThemedText style={styles.closeModalText}>Close</ThemedText>
                </TouchableOpacity>
              </ScrollView>
              </KeyboardAvoidingView>
            )}
          </RNAnimated.View>
        </View>
      </Modal>

      {/* Cancel Job Reason Modal */}
      <Modal
        visible={showCancelJobModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelJobModal(false)}
      >
        <View style={styles.cancelJobOverlay}>
          <View style={styles.cancelJobModalCard}>
            <ThemedText style={styles.cancelJobModalTitle}>Withdraw from Job</ThemedText>
            <ThemedText style={styles.cancelJobModalSubtitle}>
              The customer will be notified. This may affect your reliability score.
            </ThemedText>

            <View style={{ gap: 8, marginTop: 16 }}>
              {PROVIDER_CANCEL_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.cancelReasonChip,
                    cancelJobReason === reason && styles.cancelReasonChipActive,
                  ]}
                  onPress={() => setCancelJobReason(reason)}
                >
                  <ThemedText style={[
                    styles.cancelReasonChipText,
                    cancelJobReason === reason && styles.cancelReasonChipTextActive,
                  ]}>
                    {reason}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {cancelJobReason === 'Other' && (
              <RNTextInput
                style={styles.cancelOtherInput}
                placeholder="Please describe the reason"
                placeholderTextColor="#9CA3AF"
                value={otherCancelJobReason}
                onChangeText={setOtherCancelJobReason}
                multiline
              />
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={styles.cancelJobModalSecondaryBtn}
                onPress={() => setShowCancelJobModal(false)}
              >
                <ThemedText style={styles.cancelJobModalSecondaryBtnText}>Go Back</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.cancelJobModalPrimaryBtn,
                  (!cancelJobReason || (cancelJobReason === 'Other' && !otherCancelJobReason.trim()) || cancellingJob) && { opacity: 0.5 },
                ]}
                disabled={!cancelJobReason || (cancelJobReason === 'Other' && !otherCancelJobReason.trim()) || cancellingJob}
                onPress={handleConfirmCancelJob}
              >
                <ThemedText style={styles.cancelJobModalPrimaryBtnText}>
                  {cancellingJob ? 'Cancelling...' : 'Confirm Cancel'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Exit App Modal — double-back-press to exit, matching the customer
          app's Home/Login screens */}
      <Modal visible={isExitModalVisible} transparent animationType="fade">
        <View style={styles.exitModalOverlay}>
          <View style={styles.exitModalContent}>
            <View style={styles.exitIconContainer}><AlertTriangle size={36} color="#F59E0B" /></View>
            <ThemedText style={styles.exitTitle}>Exit SkoFy?</ThemedText>
            <ThemedText style={styles.exitMessage}>Are you sure you want to close the app?</ThemedText>
            <View style={styles.exitActionRow}>
              <TouchableOpacity style={[styles.exitButton, styles.exitCancelButton]} onPress={() => setIsExitModalVisible(false)}>
                <ThemedText style={styles.exitCancelText}>No</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exitButton, styles.exitConfirmButton]}
                onPress={() => {
                  // Reset first — Android doesn't always fully destroy the
                  // JS process on exitApp(), so without this the modal can
                  // still be "visible" in the resumed state on next launch.
                  setIsExitModalVisible(false);
                  BackHandler.exitApp();
                }}
              >
                <ThemedText style={styles.exitConfirmText}>Yes</ThemedText>
                <LogOut size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Required Modal — replaces a plain native Alert.alert that
          used to just say "enable location access" with an "OK" button that
          did nothing actionable, regardless of whether the permission was
          merely not-yet-granted or permanently denied. */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.successOverlayBg}>
          <Animated.View entering={FadeInUp} style={styles.locationModalCard}>
            <View style={styles.locationModalIconWrap}>
              <MapPin size={32} color="#EF4444" />
            </View>
            <ThemedText style={styles.locationModalTitle}>Location Access Needed</ThemedText>
            <ThemedText style={styles.locationModalSubtitle}>
              We need to confirm you've reached the site before starting this job. Enable location access for Dodorez in your phone's settings, then come back and try again.
            </ThemedText>
            <TouchableOpacity
              style={styles.locationModalPrimaryBtn}
              onPress={() => { setShowLocationModal(false); Linking.openSettings(); }}
            >
              <ThemedText style={styles.locationModalPrimaryBtnText}>Open Settings</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.locationModalSecondaryBtn}
              onPress={() => setShowLocationModal(false)}
            >
              <ThemedText style={styles.locationModalSecondaryBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.ratingSheet}>
            <View style={styles.dragHandle} />
            <ThemedText style={styles.ratingTitle}>Rate Your Experience</ThemedText>
            <ThemedText style={styles.ratingSubtitle}>How was the customer?</ThemedText>

            {(['behaviour', 'negotiation', 'payment', 'environment'] as const).map((cat) => (
              <View key={cat} style={styles.ratingRow}>
                <ThemedText style={styles.ratingLabel}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </ThemedText>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRatings(prev => ({ ...prev, [cat]: star }))}
                    >
                      <Star
                        size={28}
                        color="#FFCE48"
                        fill={ratings[cat] >= star ? '#FFCE48' : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <RNTextInput
              style={styles.ratingComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor="#9CA3AF"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitRatingBtn, isSubmittingRating && { opacity: 0.7 }]}
              onPress={submitRating}
              disabled={isSubmittingRating}
            >
              {isSubmittingRating
                ? <ActivityIndicator size="small" color="#111827" />
                : <ThemedText style={styles.submitRatingText}>Submit Rating</ThemedText>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Final Success Modal */}
      <Modal
        visible={showFinalSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFinalSuccess(false)}
      >
        <View style={styles.successOverlayBg}>
          <Animated.View entering={FadeInUp} style={styles.finalSuccessCard}>
            <PartyPopper size={60} color="#FFCE48" />
            <ThemedText style={styles.finalSuccessTitle}>Job Completed!</ThemedText>
            <ThemedText style={styles.finalSuccessSubtitle}>
              Great work! Payment will be credited to your account shortly.
            </ThemedText>
            <TouchableOpacity
              style={styles.finalSuccessBtn}
              onPress={() => setShowFinalSuccess(false)}
            >
              <ThemedText style={styles.finalSuccessBtnText}>Continue</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
      {appAlert.element}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  notifNudge: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 12, marginTop: 8,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
    borderLeftWidth: 4, borderLeftColor: '#FFCE48',
  },
  notifNudgeIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFBEB',
    alignItems: 'center', justifyContent: 'center',
  },
  notifNudgeBody: { flex: 1 },
  notifNudgeTitle: { fontSize: 13, fontFamily: Fonts.poppinsBold, color: '#111827' },
  notifNudgeText: { fontSize: 11, fontFamily: Fonts.poppins, color: '#6B7280', marginTop: 1 },
  // Flat filled chip, not a shadowed card — see the comment where this is
  // used. No marginHorizontal on the outer row: the parent `header` view
  // already applies paddingHorizontal: 20, same as locationHeader right
  // below this, which has none of its own either — adding one here would
  // misalign this row's left edge against locationHeader's. The chip's own
  // inset comes from paddingHorizontal below instead, which only affects
  // content, not the row's outer edge.
  pickupDropoffRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
  },
  pickupDropoffIconWrap: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  pickupDropoffLabel: { fontSize: 13, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  pickupDropoffHint: { fontSize: 10.5, fontFamily: Fonts.poppins, color: '#9CA3AF', marginTop: 1 },
  notifNudgeBtn: {
    backgroundColor: '#FFCE48', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  notifNudgeBtnText: { fontSize: 12, fontFamily: Fonts.poppinsBold, color: '#111827' },
  notifNudgeDismiss: { padding: 4 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  loadingText: {
    marginTop: 10,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginTop: Platform.OS === 'android' ? 30 : 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  centeredLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  availabilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicatorCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  profileCircleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationHeader: {
    paddingBottom: 10,
  },
  locationBadgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  locationBadgeLabel: {
    fontSize: 9,
    fontFamily: Fonts.poppinsBold,
    color: '#FFCE48',
    letterSpacing: 1,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#111827',
    flex: 1,
  },
  greetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  greetingText: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
  },
  userNameHighlight: {
    fontSize: 12,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  sliderContainer: {
    flexDirection: 'row',
    height: 46,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    marginBottom: 10,
    padding: 4,
    gap: 4,
  },
  sliderTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  sliderTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sliderTabText: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#9CA3AF',
  },
  sliderTabTextActive: {
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  tabCountBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  tabCountBadgeActive: { backgroundColor: '#FFCE48' },
  tabCountText: { fontSize: 10, fontFamily: Fonts.poppinsBold, color: '#6B7280' },
  tabCountTextActive: { color: '#111827' },
  jobsList: {
    flex: 1,
  },
  jobsListContent: {
    padding: 20,
    paddingBottom: 30,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: '#D1D5DB',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  jobCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  jobCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobTitleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  directRequestBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  directRequestText: {
    fontSize: 9,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  feasibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  feasibilityText: {
    fontSize: 9,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF9E7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  distanceBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsBold,
    color: '#92400E',
  },
  jobTitle: {
    fontSize: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginRight: 8,
  },
  jobDescription: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    lineHeight: 18,
  },
  feasibilityInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 10,
  },
  feasibilityDetailText: {
    fontSize: 11,
    fontFamily: Fonts.poppins,
    flex: 1,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  skillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#FDE9C0',
    borderRadius: 8,
  },
  skillText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsMedium,
    color: '#92400E',
  },
  jobDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#374151',
  },
  secondsText: {
    color: '#FFCE48',
    fontFamily: Fonts.poppinsBold,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feeLabel: {
    fontSize: 11,
    fontFamily: Fonts.poppins,
    color: '#9CA3AF',
  },
  feeValue: {
    fontSize: 17,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  detailsButtonText: {
    fontSize: 13,
    fontFamily: Fonts.poppinsBold,
    color: '#374151',
  },
  acceptButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  acceptButtonText: {
    fontSize: 13,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },

  // Success overlay after applying for job
  successOverlayBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  successOverlayCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  successOverlayTitle: {
    fontSize: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginTop: 16,
  },
  successOverlaySubtitle: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },

  // Chat notification banner
  chatNotification: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  chatNotifContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatNotifTitle: {
    fontSize: 13,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  chatNotifSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#9CA3AF',
  },

  // Modal backdrop
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  cancelJobOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cancelJobModalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  cancelJobModalTitle: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  cancelJobModalSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    marginTop: 4,
  },
  cancelReasonChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  cancelReasonChipActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  cancelReasonChipText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#374151',
  },
  cancelReasonChipTextActive: {
    color: '#EF4444',
  },
  cancelOtherInput: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
    fontFamily: Fonts.poppins,
    fontSize: 14,
    color: '#111827',
  },
  cancelJobModalSecondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelJobModalSecondaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#374151',
  },
  cancelJobModalPrimaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  cancelJobModalPrimaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },

  // Exit App modal
  exitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  exitModalContent: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  exitIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  exitTitle: {
    fontSize: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginBottom: 8,
  },
  exitMessage: {
    fontSize: 15,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  exitActionRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  exitButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  exitCancelButton: {
    backgroundColor: '#F3F4F6',
  },
  exitCancelText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: '#6B7280',
  },
  exitConfirmButton: {
    backgroundColor: '#111827',
  },
  exitConfirmText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },

  // Service Room manage sheet
  manageSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    // Full-screen instead of a partial (maxHeight 90%) bottom sheet — the
    // Service Room's content (materials list, invoice fields, timer) could
    // run long enough to feel cramped in a partial sheet, and "sometimes
    // scroll doesn't move things up" traced to the drag-to-dismiss
    // PanResponder below covering the ENTIRE sheet (including the inner
    // ScrollView), fighting it for vertical touch gestures — scoping that
    // gesture to just the drag handle (see dragHandle below) needed the
    // extra room a full-height sheet gives that handle to live in on its own.
    height: '100%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  manageTitle: {
    fontSize: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },
  manageSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  manageDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  liveDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  liveBadgeText: {
    fontSize: 13,
    fontFamily: Fonts.poppinsBold,
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  requirementLabel: {
    fontSize: 11,
    fontFamily: Fonts.poppinsBold,
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  serviceJobTitle: {
    fontSize: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginBottom: 8,
  },
  serviceJobDesc: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginBottom: 2,
  },
  customerBadge: {
    fontSize: 12,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#16A34A',
  },
  customerContactBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  navigateBtnText: {
    fontSize: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  completeDisclaimer: {
    fontSize: 12,
    fontFamily: Fonts.poppins,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  completeJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  completeJobText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  cancelJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    marginBottom: 14,
  },
  cancelJobBtnText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#EF4444',
  },
  pickupPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
  },
  pickupPhotoBtnText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  pickupPhotoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: '#F3F4F6',
  },
  otpEntryInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    marginBottom: 10,
    fontSize: 14,
    color: '#111827',
    // No explicit background meant this picked up whatever the OS/native
    // TextInput default was — on a device with system dark mode, Android's
    // auto dark-theming for unstyled native inputs can wash the default-gray
    // placeholder text down to near-invisible against it. Forcing white here
    // and an explicit placeholderTextColor on each input below removes any
    // dependency on OS theme defaults.
    backgroundColor: '#fff',
  },
  otpContainer: {
    marginVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 64,
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  otpBox: {
    width: 58,
    height: 62,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  otpBoxFocused: {
    borderColor: '#6D28D9',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  otpDigit: {
    fontSize: 24,
    fontFamily: Fonts.poppinsBold,
    color: '#9CA3AF',
    textAlign: 'center',
    includeFontPadding: false,
  },
  otpDigitFilled: {
    color: '#6D28D9',
  },
  hiddenOtpInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
  inspectionTimerCard: {
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    paddingVertical: 20,
    marginBottom: 14,
  },
  inspectionTimerLabel: {
    fontSize: 13,
    color: '#6D28D9',
    fontFamily: Fonts.poppinsSemiBold,
    marginBottom: 6,
    textAlign: 'center',
  },
  inspectionTimerValue: {
    fontSize: 40,
    fontFamily: Fonts.poppinsBold,
    letterSpacing: 4,
    color: '#6D28D9',
    // Missing textAlign meant the block rendered left-leaning inside the
    // centered card; letterSpacing's trailing space on Android also isn't
    // always included in the Text element's measured width, clipping the
    // last character against the edge without this padding to give it room.
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 52,
    includeFontPadding: false,
  },
  closeModalBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeModalText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#9CA3AF',
  },

  // Rating modal
  ratingSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 32,
  },
  ratingTitle: {
    fontSize: 20,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  ratingSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  ratingLabel: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#374151',
    width: 110,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingComment: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 14,
    fontFamily: Fonts.poppins,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  submitRatingBtn: {
    backgroundColor: '#FFCE48',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitRatingText: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },

  // Final success modal
  finalSuccessCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  finalSuccessTitle: {
    fontSize: 24,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginTop: 16,
    textAlign: 'center',
  },
  finalSuccessSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  finalSuccessBtn: {
    backgroundColor: '#FFCE48',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
  },
  finalSuccessBtnText: {
    fontSize: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  locationModalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  locationModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginTop: 16,
    textAlign: 'center',
  },
  locationModalSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  locationModalPrimaryBtn: {
    backgroundColor: '#FFCE48',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  locationModalPrimaryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  locationModalSecondaryBtn: {
    paddingVertical: 12,
    marginTop: 4,
  },
  locationModalSecondaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#9CA3AF',
  },
});
