import AnimatedBrandMark from '@/components/animated-brand-mark';
import React, { useState, useEffect, useMemo } from 'react';
import { SkoFyApi } from '@/services/api';
import { getCurrentVoipToken } from '@/services/callManager';
import { kmToMiles, milesToKm } from '@/services/schedulingEngine';
import messaging from '@react-native-firebase/messaging';
import { StyleSheet, View, TouchableOpacity, ScrollView, Platform, Dimensions, Modal, Switch, TextInput, RefreshControl, SafeAreaView, Pressable, BackHandler, PanResponder, Animated as RNAnimated, ActivityIndicator, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Settings,
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  HelpCircle,
  MapPin,
  Briefcase,
  Star,
  CheckCircle2,
  Play,
  Plus,
  MoreHorizontal,
  XCircle,
  Lock,
  FileText,
  MessageSquare,
  ChevronLeft,
  Search,
  User,
  Info,
  ChevronDown,
  CalendarDays,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Landmark,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import FaceDetection from '@react-native-ml-kit/face-detection';
import * as WebBrowser from 'expo-web-browser';
import { Calendar } from 'react-native-calendars';
import Animated, { FadeInUp, FadeInDown, FadeInRight, FadeIn, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { Camera, Image as ImageIcon, Trash2, Edit2, AlertTriangle, Layers, Zap, Clock, Trophy } from 'lucide-react-native';

// How long the timed-out question's feedback (Incorrect + explanation, or
// the final score card) stays visible before the skill test auto-advances —
// long enough to actually read it, short enough that a timeout doesn't feel
// like it's stalled the test.
const TIMEOUT_AUTO_ADVANCE_DELAY_MS = 2000;

// Must match the `profession` values seeded in skofy-backend/scripts/seed_skills.py exactly —
// GET /skills?profession=X does a literal string match against the DB.
const PROVIDER_PROFESSIONS = [
  { name: 'AC Technician', skills: ['Gas Refilling', 'Leak Repair', 'Cooling Fix', 'Filter Cleaning', 'AC Installation', 'Outer Unit Service', 'PCB Repair', 'Thermostat Replacement', 'Duct Sealing', 'Noise Reduction', 'Inverter AC Service', 'Cassette AC Service', 'Window AC Repair'] },
  { name: 'Electrician', skills: ['Wiring', 'Switchboard Repair', 'Short Circuit Fix', 'Lighting Installation', 'Fan Repair', 'Panel Upgrade', 'Inverter Installation', 'Solar Wiring', 'MCB Replacement', 'Earthing Setup', 'Power Backup Setup', 'CCTV Wiring', 'Doorbell Installation', 'Exhaust Fan Fitting', 'Geyser Wiring'] },
  { name: 'Plumber', skills: ['Pipe Leak Fix', 'Tap Repair', 'Drain Cleaning', 'Toilet Repair', 'Water Heater Install', 'Tank Cleaning', 'Basin Installation', 'Shower Fitting', 'Sewer Line Repair', 'Bathroom Renovation', 'Borewell Motor Repair', 'Overhead Tank Installation', 'Underground Tank Cleaning', 'Water Pump Repair'] },
  { name: 'Carpenter', skills: ['Furniture Assembly', 'Cabinet Installation', 'Door Installation', 'Wood Repair', 'Trim Work', 'Wardrobe Installation', 'False Ceiling Work', 'Window Frame Repair', 'Modular Kitchen Fitting', 'Staircase Work', 'Wooden Flooring', 'Sofa Repair', 'Bed Frame Assembly', 'TV Unit Installation'] },
  { name: 'Painter', skills: ['Interior Painting', 'Exterior Painting', 'Wallpaper Removal', 'Drywall Repair', 'Cabinet Refinishing', 'Texture Coat', 'Waterproof Paint', 'Wood Polish', 'Graffiti Removal', 'Stencil Painting', 'Metal Painting', 'Epoxy Floor Coating', 'Enamel Paint', 'Anti-Fungal Coating'] },
  { name: 'House Cleaning', skills: ['Deep Cleaning', 'Move-in Cleaning', 'Carpet Cleaning', 'Window Cleaning', 'Regular Sweeping', 'Sofa Cleaning', 'Kitchen Deep Clean', 'Bathroom Scrubbing', 'Marble Polishing', 'Curtain Washing', 'Post-Construction Cleaning', 'Terrace Cleaning', 'Chimney Cleaning', 'Water Tank Cleaning', 'Mattress Cleaning'] },
  { name: 'Vehicle Mechanic', skills: ['Engine Diagnostics', 'Brake Repair', 'Oil Change', 'Tire Replacement', 'Battery Testing', 'Car AC Repair', 'Denting & Painting', 'Transmission Repair', 'Bike Service', 'Car Washing', 'Windshield Repair', 'Headlight Restoration', 'Puncture Repair', 'Spark Plug Replacement', 'Car Interior Cleaning'] },
  { name: 'Gardener', skills: ['Lawn Mowing', 'Tree Trimming', 'Garden Design', 'Weed Control', 'Irrigation Repair', 'Plant Potting', 'Hedge Trimming', 'Vertical Garden Setup', 'Terrace Garden Setup', 'Composting Setup', 'Fertilization', 'Plant Disease Treatment', 'Garden Lighting'] },
  { name: 'Appliance Repair', skills: ['Washing Machine Repair', 'Refrigerator Repair', 'Microwave Repair', 'Dishwasher Repair', 'Oven Repair', 'Geyser Repair', 'Water Purifier Repair', 'Mixer Grinder Repair', 'TV Repair', 'Induction Cooktop Repair', 'Air Purifier Service', 'Chimney Repair', 'Dryer Repair', 'Pressure Cooker Repair'] },
  { name: 'Home Salon', skills: ['Haircut – Men', 'Haircut – Women', 'Hair Color', 'Hair Smoothening', 'Manicure', 'Pedicure', 'Facial', 'Waxing', 'Threading', 'Mehendi / Henna', 'Makeup – Bridal', 'Makeup – Party', 'Head Massage', 'Body Scrub', 'Bleach'] },
  { name: 'Pest Control', skills: ['Ant Control', 'Rodent Control', 'Bed Bug Treatment', 'Termite Treatment', 'Mosquito Control', 'Cockroach Treatment', 'Spider Control', 'Lizard Repellent', 'Fly Control', 'Fumigation', 'Pre-Construction Termite', 'Garden Pest Control'] },
  { name: 'Water Purifier Technician', skills: ['RO Service', 'UV Filter Replacement', 'Membrane Replacement', 'Carbon Filter Service', 'TDS Check & Fix', 'Motor Repair – Purifier', 'Annual Maintenance', 'Installation – RO System', 'Water Softener Service'] },
  { name: 'CCTV & Security', skills: ['CCTV Installation', 'DVR / NVR Setup', 'IP Camera Config', 'Video Doorbell Install', 'Alarm System Setup', 'Access Control Install', 'Intercom Setup', 'Motion Sensor Install', 'Remote Monitoring Setup'] },
  { name: 'Solar Technician', skills: ['Solar Panel Installation', 'Inverter Setup – Solar', 'Panel Cleaning', 'Battery Bank Setup', 'Grid-Tie Configuration', 'Energy Audit', 'Fault Diagnosis – Solar', 'Wiring – Solar System'] },
  { name: 'Waterproofing', skills: ['Roof Waterproofing', 'Bathroom Waterproofing', 'Terrace Waterproofing', 'Basement Waterproofing', 'Wall Seepage Fix', 'External Wall Coating', 'Swimming Pool Sealing', 'Overhead Tank Sealing'] },
  { name: 'Packers & Movers', skills: ['Local Home Shifting', 'Office Relocation', 'Furniture Disassembly', 'Packing & Wrapping', 'Vehicle Transport', 'Storage Services', 'Piano & Heavy Item Move', 'International Relocation'] },
  { name: 'Interior Designer', skills: ['Space Planning', '3D Visualization', 'Modular Kitchen Design', 'Bedroom Design', 'Living Room Design', 'False Ceiling Design', 'Lighting Design', 'Colour Consultation', 'Furniture Selection', 'Home Décor Styling', 'Bathroom Design', 'Office Interior Design'] },
  { name: 'Fitness Trainer', skills: ['Weight Loss Training', 'Strength & Conditioning', 'Yoga Sessions', 'Zumba', 'Pilates', 'Crossfit', 'Diet & Nutrition Plan', 'Post-Natal Fitness', 'Kids Fitness', 'Senior Fitness', 'Marathon Coaching'] },
  { name: 'Physiotherapist', skills: ['Back Pain Treatment', 'Sports Injury Rehab', 'Post-Surgery Rehab', 'Neck Pain Treatment', 'Knee Pain Therapy', 'Electrotherapy', 'Dry Needling', 'Elderly Mobility Care', 'Stroke Rehabilitation', 'Manual Therapy'] },
  { name: 'Home Tutor', skills: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Language', 'Hindi Language', 'Computer Science', 'IIT-JEE Preparation', 'NEET Preparation', 'CBSE Board Coaching', 'Primary School Tuition', 'Music Lessons', 'Art & Drawing Classes'] },
  { name: 'Cook / Chef', skills: ['Daily Meal Cooking', 'Party Catering', 'North Indian Cuisine', 'South Indian Cuisine', 'Chinese Cuisine', 'Continental Cuisine', 'Baking & Pastry', 'Healthy Meal Prep', 'Jain / Vegan Cooking', 'Biryani Specialist', 'Tandoor Cooking', 'Dessert Making'] },
  { name: 'Caretaker', skills: ['Elder Companion Care', 'Medication Reminder', 'Mobility Assistance', 'Baby Care', 'Child Supervision', 'Night Duty Caretaking', 'Post-Hospitalization Care', 'Special Needs Care'] },
  { name: 'IT Support', skills: ['Computer Repair', 'Laptop Repair', 'Virus Removal', 'Data Recovery', 'Network Setup', 'WiFi Configuration', 'Smart TV Setup', 'Printer Setup', 'Software Installation', 'Data Backup', 'CCTV Network Config', 'Smart Home Automation'] },
  { name: 'Event Decorator', skills: ['Birthday Decoration', 'Wedding Decoration', 'Baby Shower Decoration', 'Corporate Event Setup', 'Floral Arrangement', 'Balloon Decoration', 'Stage Setup', 'Lighting – Events', 'Mehendi Ceremony Decor', 'Table & Chair Rental'] },
  { name: 'Photography', skills: ['Wedding Photography', 'Portrait Photography', 'Product Photography', 'Real Estate Photography', 'Event Photography', 'Drone Photography', 'Video Editing', 'Maternity Shoot', 'Baby Photography', 'Pre-Wedding Shoot'] },
  { name: 'Laundry', skills: ['Wash & Fold', 'Dry Cleaning', 'Ironing', 'Shoe Cleaning', 'Curtain Dry Cleaning', 'Sofa Cover Washing', 'Pickup & Delivery', 'Stain Removal'] },
  { name: 'Mason', skills: ['Tile Fixing', 'Plastering', 'Brick Work', 'Floor Levelling', 'Concrete Work', 'Wall Construction', 'Demolition', 'Kitchen Counter Fitting', 'Marble / Granite Fixing', 'Roof Repair'] },
  { name: 'Welder', skills: ['Gate Fabrication', 'Grille / Railing Work', 'Sheet Metal Work', 'Stainless Steel Work', 'Aluminium Fabrication', 'Structural Welding', 'TIG Welding', 'MIG Welding', 'Portable Welding'] },
  { name: 'Glass & Glazing', skills: ['Window Glass Replacement', 'Shower Enclosure Install', 'Glass Partition Install', 'Mirror Fitting', 'Toughened Glass Work', 'Windshield Replacement', 'Glass Door Installation'] },
];

const { width, height: windowHeight } = Dimensions.get('window');

interface ApiJob {
  job_id: string;
  title: string;
  description: string;
  urgency: string;
  job_status: string;
  budget_min: number | null;
  budget_max: number | null;
  inspection_fee: number;
  final_amount: number | null;
  scheduled_at: string | null;
  proposed_fee: number | null;
  app_status: string | null;
  created_at: string;
  // The customer's review of the provider for this job (what the customer gave)
  review?: {
    skill_rating: number;
    punctuality_rating: number;
    behaviour_rating: number;
    communication_rating: number;
    overall_rating: number;
    comment: string | null;
  } | null;
  // The provider's own review of the customer for this job (what the provider gave)
  customer_review?: {
    payment_rating: number;
    behaviour_rating: number;
    negotiation_rating: number;
    environment_rating: number;
    overall_rating: number;
    comment: string | null;
  } | null;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  // This screen had grown to 12 stacked content blocks (identity, earnings,
  // stats, availability, skills/tests, verification docs, portfolio, job
  // history) all in one scroll — reads as cluttered because it's actually
  // 4 different jobs-to-be-done bolted together. Grouping into tabs instead
  // of splitting into separate routes/screens: solves the "everything at
  // once" problem without a bigger navigation/routing change.
  type ProfileTab = 'profile' | 'verification' | 'earnings' | 'availability';
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('profile');
  // All 4 tabs share one ScrollView (simplest way to keep each tab's
  // existing content untouched) — switching tabs doesn't reset its scroll
  // offset on its own. Without this, scrolling deep into a long tab (e.g.
  // Verification) then switching to a much shorter one (e.g. Earnings)
  // would land you scrolled past the end of the new tab's content instead
  // of at its top.
  const profileScrollRef = React.useRef<ScrollView>(null);
  const handleProfileTabChange = (tab: ProfileTab) => {
    setActiveProfileTab(tab);
    profileScrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const [checkingFace, setCheckingFace] = useState(false);
  const [isJobHistoryOpen, setIsJobHistoryOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [testSkillId, setTestSkillId] = useState<string | null>(null);
  const [testSkillName, setTestSkillName] = useState<string | null>(null);
  const [testQuestion, setTestQuestion] = useState<{
    sessionId: string; questionNumber: number; totalQuestions: number;
    question: string; options: string[]; skillArea: string;
  } | null>(null);
  // submitTestAnswer already selects and saves the next question on the
  // backend — this stashes what it returns so handleNextQuestion can swap
  // to it instantly instead of making a second round-trip (a plain
  // getTestQuestion call) just to re-fetch what the server already picked.
  // A ref, not state: purely a same-render handoff between two handlers,
  // not something that should trigger a re-render on its own.
  const pendingNextQuestionRef = React.useRef<{
    sessionId: string; questionNumber: number; totalQuestions: number;
    question: string; options: string[]; skillArea: string;
  } | null>(null);
  // Holds the timer for the timeout auto-advance below — cleared whenever
  // the user manually advances (or closes the test) first, so a stale
  // auto-advance can't fire a second time on top of the manual one and
  // skip a question / double-trigger the results screen.
  const timeoutAutoAdvanceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The skill-test session currently on screen. sessionId stays constant
  // across questions within one attempt (only question_number changes), so
  // this only needs updating on start/close, not on every next-question
  // swap. Exists so a submitTestAnswer response that resolves AFTER the
  // user has closed the test (or started a new one) can be recognized as
  // stale and skipped — without this, that stale response would still call
  // setTestFeedback/setFinalTestResult/pendingNextQuestionRef and could
  // stomp a since-started new test's state with the old one's result.
  const activeSessionIdRef = React.useRef<string | null>(null);
  const [testTimer, setTestTimer] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  // Mirrors isSubmittingAnswer for the one place that actually needs to
  // block a double-submit: a manual "Submit" tap and the timer hitting 0 in
  // the same render tick would both read the same stale (still-false) state
  // value and both pass the guard, since setState doesn't take effect until
  // the next render. A ref has no such delay — set synchronously, read
  // synchronously, so whichever call runs first (JS is single-threaded)
  // always locks the other out, no matter how close together they land.
  const isSubmittingRef = React.useRef(false);
  const [testFeedback, setTestFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [finalTestResult, setFinalTestResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [showResultsScreen, setShowResultsScreen] = useState(false);
  const [skillEligibility, setSkillEligibility] = useState<Record<string, {
    eligible: boolean; reason: string; jobs_completed: number; jobs_required: number; retry_after_minutes?: number | null;
  }>>({});
  const [skillScore, setSkillScore] = useState(0);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [providerName, setProviderName] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [providerBio, setProviderBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);
  const [pickupDropoffSaving, setPickupDropoffSaving] = useState(false);
  const [avgRating, setAvgRating] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [avgSkillRating, setAvgSkillRating] = useState<number | null>(null);
  const [avgPunctualityRating, setAvgPunctualityRating] = useState<number | null>(null);
  const [avgBehaviourRating, setAvgBehaviourRating] = useState<number | null>(null);
  const [avgCommunicationRating, setAvgCommunicationRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [isTestMinimized, setIsTestMinimized] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Job Preferences state
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  // In miles for the UI (US launch) — only converted to/from km at the
  // backend boundary (preferred_radius_km), to avoid rounding drift from
  // converting back and forth on every +/- tap.
  const [preferredRadiusMiles, setPreferredRadiusMiles] = useState(6);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Edit Profile state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editYearsExp, setEditYearsExp] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Earnings — real data from Stripe/the payments ledger, replacing the old
  // client-side-only fake wallet (which had its own simulated balance and a
  // bank-account/UPI entry form that never talked to a real backend).
  const [isEarningsModalOpen, setIsEarningsModalOpen] = useState(false);
  const [earnings, setEarnings] = useState({ totalEarned: 0, pending: 0, jobsPaidOut: 0 });
  const [recentPayouts, setRecentPayouts] = useState<{ jobId: string; jobTitle: string; amount: number; paidAt: string | null }[]>([]);
  const [isDashboardLinkLoading, setIsDashboardLinkLoading] = useState(false);

  const getLocalISODate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [jobHistory, setJobHistory] = useState<ApiJob[]>([]);

  // Available Slots State
  const [availableSlots, setAvailableSlots] = useState<{ id: string, date: string, startTime: string, endTime: string }[]>([]);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [newSlotDate, setNewSlotDate] = useState<Date>(new Date());
  const [newSlotStart, setNewSlotStart] = useState<Date | null>(null);
  const [newSlotEnd, setNewSlotEnd] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'start' | 'end' | null>(null);

  const activeSlots = useMemo(() => {
    return availableSlots.filter(slot => {
      // Parse slot.date (YYYY-MM-DD) carefully
      const [year, month, day] = slot.date.split('-').map(Number);
      const [endHour, endMin] = slot.endTime.split(':').map(Number);
      const slotEnd = new Date(year, month - 1, day, endHour, endMin, 0, 0);
      return slotEnd.getTime() > now;
    });
  }, [availableSlots, now]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Lightweight — just the provider-level fields (name, bio, availability, ratings).
  // Re-run on every screen focus so toggling "Available" on the Dashboard tab (which
  // stays mounted in the background, same as this screen) shows up here without
  // needing a manual pull-to-refresh.
  const refreshProviderProfile = React.useCallback(async () => {
    try {
      const profile: any = await SkoFyApi.provider.getProfile();
      const name = profile?.name || '';
      const city = profile?.city || '';
      const bio = profile?.bio || '';
      const email = profile?.email || '';
      const exp = profile?.years_experience ?? 0;
      setProviderName(name);
      setProviderPhone(profile?.phone || '');
      setProviderBio(bio);
      setYearsExperience(exp);
      setIsAvailable(!!profile?.is_available);
      setIsIdentityVerified(!!profile?.is_identity_verified);
      setAvgRating(profile?.avg_rating ?? 0);
      setJobsCompleted(profile?.jobs_completed ?? 0);
      setAvgSkillRating(profile?.avg_skill_rating ?? null);
      setAvgPunctualityRating(profile?.avg_punctuality_rating ?? null);
      setAvgBehaviourRating(profile?.avg_behaviour_rating ?? null);
      setAvgCommunicationRating(profile?.avg_communication_rating ?? null);
      setReviewCount(profile?.review_count ?? 0);
      setPreferredRadiusMiles(Math.round(kmToMiles(profile?.preferred_radius_km ?? 10)));
      if (profile?.hci_score != null) setSkillScore(Math.round(profile.hci_score));
      if (profile?.profile_image_url) setProfileImage(profile.profile_image_url);
      if (profile?.connect_onboarding_status) setConnectStatus(profile.connect_onboarding_status);
      if (profile?.background_check_status) setBackgroundCheckStatus(profile.background_check_status);
      if (profile?.license_verification_status) setLicenseStatus(profile.license_verification_status);
      setEditName(name);
      setEditEmail(email);
      setEditBio(bio);
      setEditCity(city);
      setEditYearsExp(exp > 0 ? String(exp) : '');
    } catch {
      // non-fatal — keep whatever was last loaded
    }
  }, []);

  // Pulled out of fetchAllProfileData so the focus-effect below can refresh
  // just this on every tab switch — the dashboard has its own Pickup &
  // Delivery toggle now (same underlying provider_skills row), and this
  // screen stays mounted in the background across tab switches, so without
  // a focus-triggered refresh here, toggling it on the dashboard and
  // switching to Profile would show stale is_verified state until the app
  // fully remounted.
  const refreshSkills = React.useCallback(async () => {
    try {
      const skills: any[] = await SkoFyApi.skills.getMySkills();
      setApiSkills(skills || []);
      // Fetch test eligibility for each skill in parallel — drives the Take Test / Upgrade Test / Verified button states
      const results = await Promise.all((skills || []).map((s: any) =>
        SkoFyApi.skills.getTestEligibility(s.skill_id).then(e => [s.skill_id, e] as const).catch(() => null)
      ));
      const map: typeof skillEligibility = {};
      for (const r of results) {
        if (r) map[r[0]] = r[1];
      }
      setSkillEligibility(map);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      refreshProviderProfile();
      refreshSkills();
    }, [refreshProviderProfile, refreshSkills])
  );

  // Shared by initial load AND pull-to-refresh — each call is caught independently so one
  // failing endpoint can never silently block the others from updating (Promise.allSettled,
  // not Promise.all).
  const fetchAllProfileData = React.useCallback(async () => {
    const profileCall = refreshProviderProfile();
    const earningsCall = refreshEarnings();
    const skillsCall = refreshSkills();

    const professionsCall = SkoFyApi.skills.professions()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setProfessionsList(list);
      })
      .catch((err) => console.error('Failed to fetch professions list:', err));

    const historyCall = SkoFyApi.jobs.getHistory()
      .then((jobs: any[]) => setJobHistory(jobs || []))
      .catch((err) => console.error('Failed to fetch job history:', err));

    const documentsCall = SkoFyApi.provider.getDocuments()
      .then((docs) => {
        const idDoc = (docs || []).find(d => d.doc_type === 'ID_PROOF');
        setIdentityDocUrl(idDoc?.media_url ?? null);

        const galleryDocs = (docs || []).filter(d => d.doc_type === 'WORK_PROOF' || d.doc_type === 'SKILL_PROOF');
        setProofs(galleryDocs.map(d => ({
          id: d.id,
          uri: d.media_url,
          videoUrl: d.media_type === 'VIDEO' ? d.media_url : undefined,
          skill: d.skill_name || 'General',
          type: d.media_type === 'VIDEO' ? 'video' : 'image',
          description: d.description || '',
        })));
      })
      .catch((err) => console.error('Failed to fetch documents:', err));

    const slotsCall = SkoFyApi.provider.getSlots()
      .then((slots) => {
        setAvailableSlots((slots || []).map(s => ({
          id: s.id,
          date: s.date,
          startTime: s.start_time,
          endTime: s.end_time,
        })));
      })
      .catch((err) => console.error('Failed to fetch availability slots:', err));

    await Promise.allSettled([profileCall, earningsCall, skillsCall, professionsCall, historyCall, documentsCall, slotsCall]);
  }, []);

  const loadProfile = React.useCallback(async () => {
    setIsProfileLoading(true);
    await fetchAllProfileData();
    setIsProfileLoading(false);
  }, [fetchAllProfileData]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const pan = React.useRef(new RNAnimated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: RNAnimated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      }
    })
  ).current;

  const contextPan = React.useRef(new RNAnimated.ValueXY({ x: 0, y: 0 })).current;
  const contextPanResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        contextPan.setOffset({
          x: (contextPan.x as any)._value,
          y: (contextPan.y as any)._value
        });
        contextPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: RNAnimated.event(
        [null, { dx: contextPan.x, dy: contextPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        contextPan.flattenOffset();
      }
    })
  ).current;
  const [apiSkills, setApiSkills] = useState<{ skill_id: string; name: string; profession: string; is_verified: boolean; skill_o_meter: number }[]>([]);

  const [proofs, setProofs] = useState<{ id: string; uri: string; videoUrl?: string; skill: string; type: string; description: string }[]>([]);
  const [identityDocUrl, setIdentityDocUrl] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] = useState<'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'RESTRICTED'>('NOT_STARTED');
  const [backgroundCheckStatus, setBackgroundCheckStatus] = useState<'NOT_STARTED' | 'PENDING' | 'CLEAR' | 'CONSIDER' | 'FAILED'>('NOT_STARTED');
  const [licenseStatus, setLicenseStatus] = useState<'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'>('NOT_SUBMITTED');
  const [isConnectLoading, setIsConnectLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [addSkillProfession, setAddSkillProfession] = useState('');
  const [addSkillList, setAddSkillList] = useState<{ id: string; name: string }[]>([]);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [professionsList, setProfessionsList] = useState<string[]>(PROVIDER_PROFESSIONS.map(p => p.name));
  const [pendingMediaBatch, setPendingMediaBatch] = useState<{ uri: string, type: 'image' | 'video', mime?: string }[]>([]);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [tagDescription, setTagDescription] = useState('');
  const [selectedTagSkill, setSelectedTagSkill] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState('');

  // Only skills this provider has actually added to their profile can be tagged on proof media —
  // not the full ALL_SKILLS_LIST catalog across every profession.
  const filteredSkills = useMemo(() => {
    const ownSkills = apiSkills.map(s => s.name);
    if (!skillSearch.trim()) return ownSkills;
    return ownSkills.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()));
  }, [skillSearch, apiSkills]);

  // Must match PICKUP_DROPOFF_SKILL_NAME in skofy-backend/app/services/provider_service.py —
  // gated on identity verification there, not a skill test, so this reads the
  // same provider_skills row every other skill uses, just via a plain toggle.
  const pickupDropoffEnabled = apiSkills.some(s => s.name === 'Pickup & Delivery Errands' && s.is_verified);
  // Excluded from the "Skill Assessments" list below — it has its own toggle
  // above instead. Left in as-is, it would show a real "Upgrade Test" button
  // (verified + not maxed + never tested => eligible), inviting a Claude-
  // generated skill test for a capability that's deliberately identity-gated,
  // not competency-gated — contradicting the entire point of the toggle.
  const assessableSkills = useMemo(
    () => apiSkills.filter(s => s.name !== 'Pickup & Delivery Errands'),
    [apiSkills]
  );

  const handleTogglePickupDropoff = async (value: boolean) => {
    if (value && !isIdentityVerified) {
      Alert.alert('Identity verification required', 'Complete identity verification (in Settings) before enabling Pickup & Delivery.');
      return;
    }
    setPickupDropoffSaving(true);
    try {
      const skills = await SkoFyApi.skills.setPickupDropoffEnabled(value);
      setApiSkills(skills || []);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update Pickup & Delivery.');
    } finally {
      setPickupDropoffSaving(false);
    }
  };
  // --- Android Hardware Back Handler ---
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        if (showTagModal) { setShowTagModal(false); return true; }
        if (isViewAllOpen) { setIsViewAllOpen(false); return true; }
        if (isViewerOpen) { setIsViewerOpen(false); return true; }
        if (isJobHistoryOpen) { setIsJobHistoryOpen(false); return true; }
        if (isAssessmentOpen) { setIsAssessmentOpen(false); return true; }
        if (isSettingsOpen) { setIsSettingsOpen(false); return true; }
        if (isPasswordOpen) { setIsPasswordOpen(false); return true; }
        if (isTermsOpen) { setIsTermsOpen(false); return true; }
        if (isPhotoSheetOpen) { setIsPhotoSheetOpen(false); return true; }
        return false; // let system handle (exit)
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => subscription.remove();
    }, [showTagModal, isViewAllOpen, isViewerOpen, isJobHistoryOpen, isAssessmentOpen, isSettingsOpen, isPasswordOpen, isTermsOpen, isPhotoSheetOpen])
  );

  const getEligibilityMessage = (e?: { reason: string; jobs_completed: number; jobs_required: number; retry_after_minutes?: number | null }) => {
    if (!e) return 'You are not eligible to take this test right now.';
    if (e.reason === 'cooldown') return `Please wait ${e.retry_after_minutes} more minute(s) before retaking this test.`;
    if (e.reason === 'needs_more_jobs') return `Complete ${e.jobs_required - e.jobs_completed} more job(s) in this skill before retesting for an upgrade.`;
    return 'You are not eligible to take this test right now.';
  };

  const refreshSkillsAndEligibility = async () => {
    const skills: any[] | null = await SkoFyApi.skills.getMySkills().catch(() => null);
    if (!skills) return;
    setApiSkills(skills);
    const entries = await Promise.all(skills.map((s: any) =>
      SkoFyApi.skills.getTestEligibility(s.skill_id).then(e => [s.skill_id, e] as const).catch(() => null)
    ));
    const map: typeof skillEligibility = {};
    for (const r of entries) if (r) map[r[0]] = r[1];
    setSkillEligibility(map);
  };

  const startTest = async (skillId: string, skillName: string) => {
    const eligibility = skillEligibility[skillId];
    if (eligibility && !eligibility.eligible) {
      showAlert('error', 'Not Eligible', getEligibilityMessage(eligibility));
      return;
    }
    setIsLoadingQuestion(true);
    try {
      const q = await SkoFyApi.skills.getTestQuestion(skillId);
      activeSessionIdRef.current = q.session_id;
      setTestSkillId(skillId);
      setTestSkillName(skillName);
      setTestQuestion({
        sessionId: q.session_id,
        questionNumber: q.question_number,
        totalQuestions: q.total_questions,
        question: q.question,
        options: q.options,
        skillArea: q.skill_area,
      });
      setSelectedAnswer(null);
      setTestFeedback(null);
      setFinalTestResult(null);
      setShowResultsScreen(false);
      setTestTimer(30);
      setIsAssessmentOpen(true);
      setIsTestMinimized(false);
      pan.setValue({ x: 0, y: 50 });
    } catch (e: any) {
      showAlert('error', 'Could Not Start Test', e?.message || 'Please try again.');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!testQuestion || !testSkillId || isSubmittingRef.current) return null;
    const submittedSessionId = testQuestion.sessionId;
    isSubmittingRef.current = true;
    setIsSubmittingAnswer(true);
    try {
      const result = await SkoFyApi.skills.submitTestAnswer(testSkillId, submittedSessionId, selectedAnswer ?? '');
      // The test may have been closed (or a new one started) while this was
      // in flight — activeSessionIdRef now points somewhere else (or
      // nowhere). Applying this response anyway would show a since-closed
      // question's feedback/score on top of whatever's on screen now.
      if (activeSessionIdRef.current !== submittedSessionId) return null;
      setTestFeedback({ isCorrect: result.is_correct, explanation: result.explanation });
      if (result.session_complete) {
        setFinalTestResult({ score: result.score ?? 0, passed: !!result.passed });
        await refreshSkillsAndEligibility();
      } else if (result.next_question) {
        const nq = result.next_question;
        pendingNextQuestionRef.current = {
          sessionId: nq.session_id,
          questionNumber: nq.question_number,
          totalQuestions: nq.total_questions,
          question: nq.question,
          options: nq.options,
          skillArea: nq.skill_area,
        };
      }
      return result;
    } catch (e: any) {
      showAlert('error', 'Submission Failed', e?.message || 'Please try again.');
      return null;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmittingAnswer(false);
    }
  };

  const handlePrimaryButtonPress = () => {
    // A manual tap always wins over a still-pending timeout auto-advance —
    // without this, both would fire and skip a question / double-trigger
    // the results screen.
    if (timeoutAutoAdvanceRef.current) {
      clearTimeout(timeoutAutoAdvanceRef.current);
      timeoutAutoAdvanceRef.current = null;
    }
    if (!testFeedback) {
      handleSubmitAnswer();
    } else if (testQuestion && testQuestion.questionNumber >= testQuestion.totalQuestions) {
      setShowResultsScreen(true);
    } else {
      handleNextQuestion();
    }
  };

  const handleNextQuestion = async () => {
    if (!testSkillId || !testQuestion) return;

    // The common path: submitTestAnswer already handed us the next
    // question, so just swap to it — no network call, no loading spinner.
    if (pendingNextQuestionRef.current) {
      setTestQuestion(pendingNextQuestionRef.current);
      pendingNextQuestionRef.current = null;
      setSelectedAnswer(null);
      setTestFeedback(null);
      setTestTimer(30);
      return;
    }

    // Defensive fallback only — shouldn't normally happen, since submitting
    // an answer always returns next_question when the session isn't over.
    setIsLoadingQuestion(true);
    try {
      const q = await SkoFyApi.skills.getTestQuestion(testSkillId, testQuestion.sessionId);
      setTestQuestion({
        sessionId: q.session_id,
        questionNumber: q.question_number,
        totalQuestions: q.total_questions,
        question: q.question,
        options: q.options,
        skillArea: q.skill_area,
      });
      setSelectedAnswer(null);
      setTestFeedback(null);
      setTestTimer(30);
    } catch (e: any) {
      showAlert('error', 'Could Not Load Question', e?.message || 'Please try again.');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const closeTest = () => {
    // Otherwise a still-pending auto-advance from a timeout right before
    // closing could fire after a new test session has already started,
    // forcing that new session straight to the results screen.
    if (timeoutAutoAdvanceRef.current) {
      clearTimeout(timeoutAutoAdvanceRef.current);
      timeoutAutoAdvanceRef.current = null;
    }
    // So an in-flight submitTestAnswer response that resolves after this
    // closes (or after a new test has since started) is recognized as
    // stale and its result discarded instead of applied — see
    // activeSessionIdRef's declaration for why this matters.
    activeSessionIdRef.current = null;
    setIsAssessmentOpen(false);
    setTestSkillId(null);
    setTestSkillName(null);
    setTestQuestion(null);
    setSelectedAnswer(null);
    setTestFeedback(null);
    setFinalTestResult(null);
    setShowResultsScreen(false);
  };

  useEffect(() => {
    let timer: any;
    if (isAssessmentOpen && !isTestMinimized && !finalTestResult && !testFeedback && testTimer > 0 && !isSubmittingAnswer) {
      timer = setInterval(() => setTestTimer(prev => prev - 1), 1000);
    } else if (testTimer === 0 && isAssessmentOpen && !isTestMinimized && !finalTestResult && !testFeedback) {
      // Auto-submit on timeout (counts as wrong, test continues normally) —
      // and, since there's no one left to tap "Next Question"/"View
      // Results", auto-advance ourselves once the feedback has had a beat
      // to be seen: straight to the score card if that was the last
      // question, otherwise straight to the next one.
      handleSubmitAnswer().then(result => {
        if (!result) return;
        timeoutAutoAdvanceRef.current = setTimeout(() => {
          timeoutAutoAdvanceRef.current = null;
          if (result.session_complete) {
            setShowResultsScreen(true);
          } else {
            handleNextQuestion();
          }
        }, TIMEOUT_AUTO_ADVANCE_DELAY_MS);
      });
    }
    return () => clearInterval(timer);
  }, [isAssessmentOpen, isTestMinimized, testTimer, testFeedback, finalTestResult, isSubmittingAnswer]);

  const [isSavingSlot, setIsSavingSlot] = useState(false);

  const handleAddSlot = async () => {
    if (!newSlotStart || !newSlotEnd) {
      showAlert('error', 'Incomplete Times', 'Please select both start and end times.');
      return;
    }
    if (newSlotEnd <= newSlotStart) {
      showAlert('error', 'Invalid Time', 'End time must be after start time.');
      return;
    }

    // Prevent scheduling in the past
    if (newSlotStart.getTime() < Date.now()) {
      showAlert('error', 'Invalid Time', 'You cannot schedule a slot in the past.');
      return;
    }

    const dateStr = getLocalISODate(newSlotDate);
    const startStr = formatTime(newSlotStart);
    const endStr = formatTime(newSlotEnd);

    // Check overlaps (fast client-side check — the backend re-validates too)
    const overlaps = availableSlots.some(slot => {
      if (slot.date !== dateStr) return false;
      return (startStr < slot.endTime && endStr > slot.startTime);
    });

    if (overlaps) {
      showAlert('error', 'Overlap Detected', 'This slot overlaps with an existing slot on the same day.');
      return;
    }

    setIsSavingSlot(true);
    try {
      const saved = await SkoFyApi.provider.addSlot({ date: dateStr, start_time: startStr, end_time: endStr });
      setAvailableSlots(prev => [...prev, {
        id: saved.id,
        date: saved.date,
        startTime: saved.start_time,
        endTime: saved.end_time,
      }].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));

      setNewSlotStart(null);
      setNewSlotEnd(null);
      showAlert('success', 'Slot Added', 'Your availability slot has been scheduled successfully. ✨');
    } catch (err: any) {
      showAlert('error', 'Could Not Add Slot', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    const prevSlots = availableSlots;
    setAvailableSlots(prev => prev.filter(s => s.id !== slotId));
    try {
      await SkoFyApi.provider.deleteSlot(slotId);
    } catch {
      setAvailableSlots(prevSlots);
      showAlert('error', 'Could Not Remove Slot', 'Something went wrong. Please try again.');
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    const prevSkills = apiSkills;
    setApiSkills(prev => prev.filter(s => s.skill_id !== skillId));
    try {
      await SkoFyApi.skills.removeSkill(skillId);
      showAlert('delete', 'Skill Removed', 'The skill has been removed from your profile.');
    } catch {
      setApiSkills(prevSkills);
      showAlert('error', 'Could Not Remove Skill', 'Something went wrong. Please try again.');
    }
  };

  const handleDeleteProof = async (docId: string) => {
    const prevProofs = proofs;
    setProofs(prev => prev.filter(p => p.id !== docId));
    try {
      await SkoFyApi.provider.deleteDocument(docId);
      showAlert('delete', 'Item Removed', 'The photo/video has been removed from your gallery.');
    } catch {
      setProofs(prevProofs);
      showAlert('error', 'Could Not Remove Item', 'Something went wrong. Please try again.');
    }
  };

  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'delete';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  const formatTime = (d: Date | null) => {
    if (!d) return '--:--';
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchAllProfileData();
    setRefreshing(false);
  }, [fetchAllProfileData]);

  const showAlert = (type: 'success' | 'error' | 'delete', title: string, message: string) => {
    setCustomAlert({ visible: true, type, title, message });
  };

  const hideAlert = () => {
    setCustomAlert({ ...customAlert, visible: false });
  };

  const MAX_PROOFS_PER_SKILL = 5;

  const pickMultipleMedia = async () => {
    if (apiSkills.length === 0) {
      showAlert('error', 'Add a Skill First', 'Please add a skill to your profile before adding skill proof media.');
      return;
    }

    // Deliberately NOT requesting base64 here — forcing base64 extraction on a multi-MB
    // video file can hang or crash the picker on real devices. Always upload via
    // multipart instead (works for both images and videos, see handleAddProof).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PROOFS_PER_SKILL,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPendingMediaBatch(result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' as const : 'image' as const,
        mime: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      })));
      setSelectedTagSkill(null);
      setTagDescription('');
      setSkillSearch('');
      setShowTagModal(true);
    }
  };

  const handleAddProof = async () => {
    if (pendingMediaBatch.length === 0 || !selectedTagSkill) return;

    const countForSkill = proofs.filter(p => p.skill === selectedTagSkill).length;
    const remaining = MAX_PROOFS_PER_SKILL - countForSkill;
    if (remaining <= 0) {
      showAlert('error', 'Limit Reached', `You can add up to ${MAX_PROOFS_PER_SKILL} proof files per skill.`);
      return;
    }

    const toUpload = pendingMediaBatch.slice(0, remaining);
    const uploaded: typeof proofs = [];

    setIsUploadingProof(true);
    try {
      for (const item of toUpload) {
        const doc = await SkoFyApi.provider.addDocumentFile({
          fileUri: item.uri,
          mimeType: item.mime ?? (item.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          doc_type: 'SKILL_PROOF',
          skill_name: selectedTagSkill,
          description: tagDescription || undefined,
        });
        uploaded.push({
          id: doc.id,
          uri: doc.media_url,
          videoUrl: doc.media_type === 'VIDEO' ? doc.media_url : undefined,
          skill: selectedTagSkill,
          description: tagDescription,
          type: item.type,
        });
      }
      setProofs(prev => [...uploaded, ...prev]);

      const wasTrimmed = pendingMediaBatch.length > toUpload.length;
      setPendingMediaBatch([]);
      setSelectedTagSkill(null);
      setTagDescription('');
      setSkillSearch('');
      setShowTagModal(false);

      if (wasTrimmed) {
        showAlert('error', 'Some Files Skipped', `Only added ${toUpload.length} files — "${selectedTagSkill}" is now at the ${MAX_PROOFS_PER_SKILL}-file limit.`);
      } else {
        showAlert('success', 'Proof Added', `${uploaded.length} file${uploaded.length !== 1 ? 's' : ''} uploaded and tagged successfully! ✨`);
      }
    } catch {
      if (uploaded.length > 0) setProofs(prev => [...uploaded, ...prev]);
      showAlert('error', 'Upload Failed', uploaded.length > 0
        ? `${uploaded.length} of ${toUpload.length} files uploaded before the error. Please try the rest again.`
        : 'Could not save your proof. Please try again.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleOpenConnectOnboarding = async () => {
    setIsConnectLoading(true);
    try {
      const { url } = await SkoFyApi.provider.getConnectOnboardingLink();
      // Must match STRIPE_CONNECT_RETURN_URL on the backend exactly — this is
      // what openAuthSessionAsync watches for to know the flow is done and
      // auto-close the browser, rather than leaving the provider stranded on
      // Stripe's page with no way back into the app.
      await WebBrowser.openAuthSessionAsync(url, 'skofyserviceproviderapp://connect-return');
      // Stripe's hosted flow doesn't push a completion event back to us —
      // re-check status the moment the browser closes (whether the provider
      // finished, backed out, or just needs another pass at requirements).
      const status = await SkoFyApi.provider.getConnectStatus();
      setConnectStatus(status.connect_onboarding_status);
    } catch {
      showAlert('error', 'Could Not Start Setup', 'Please try again in a moment.');
    } finally {
      setIsConnectLoading(false);
    }
  };

  const handleUploadLicense = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      if (asset.base64) {
        await SkoFyApi.provider.addDocument({
          doc_type: 'TRADE_LICENSE',
          image_base64: asset.base64,
          mime_type: asset.mimeType ?? 'image/jpeg',
        });
      } else {
        await SkoFyApi.provider.addDocumentFile({
          fileUri: asset.uri,
          mimeType: asset.mimeType ?? 'image/jpeg',
          doc_type: 'TRADE_LICENSE',
        });
      }
      setLicenseStatus('PENDING_REVIEW');
      showAlert('success', 'License Submitted', 'Your trade license is under review.');
    } catch {
      showAlert('error', 'Upload Failed', 'Could not submit your license. Please try again.');
    }
  };

  const refreshEarnings = React.useCallback(async () => {
    try {
      const data = await SkoFyApi.provider.getEarnings();
      setEarnings({ totalEarned: data.total_earned, pending: data.pending, jobsPaidOut: data.jobs_paid_out });
      setRecentPayouts(data.recent_payouts.map(p => ({ jobId: p.job_id, jobTitle: p.job_title, amount: p.amount, paidAt: p.paid_at })));
    } catch {
      // non-fatal — keep whatever was last loaded
    }
  }, []);

  const handleOpenConnectDashboard = async () => {
    setIsDashboardLinkLoading(true);
    try {
      // No client-side pre-check here on purpose: the backend reconciles
      // with Stripe directly rather than trusting the locally-cached
      // connectStatus, which can be stale (e.g. onboarding finished in a
      // session where the follow-up status refresh never fired). Blocking
      // on stale local state here would incorrectly stop an actually-
      // eligible provider from opening their own dashboard.
      const { url } = await SkoFyApi.provider.getConnectDashboardLink();
      await WebBrowser.openBrowserAsync(url);
    } catch (err: any) {
      showAlert(
        'error',
        'Could Not Open Dashboard',
        err?.message ?? 'Please try again in a moment.'
      );
    } finally {
      setIsDashboardLinkLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showAlert('error', 'Name Required', 'Please enter your name.');
      return;
    }
    if (editEmail.trim() && !editEmail.includes('@')) {
      showAlert('error', 'Invalid Email', 'Please enter a valid email address or leave it blank.');
      return;
    }
    setIsSavingProfile(true);
    try {
      await SkoFyApi.provider.updateProfile({
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        bio: editBio.trim() || undefined,
        city: editCity.trim() || undefined,
        years_experience: editYearsExp ? parseInt(editYearsExp, 10) : undefined,
      });
      setProviderName(editName.trim());
      setProviderBio(editBio.trim());
      setYearsExperience(editYearsExp ? parseInt(editYearsExp, 10) : 0);
      setIsEditProfileOpen(false);
      showAlert('success', 'Profile Updated', 'Your profile has been saved successfully.');
    } catch (e: any) {
      showAlert('error', 'Update Failed', e?.message || 'Could not save profile. Try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchSkillsForProfession = async (profession: string) => {
    setAddSkillProfession(profession);
    try {
      const list = await SkoFyApi.skills.list(profession);
      if (Array.isArray(list) && list.length > 0) {
        setAddSkillList(list.map((s: any) => ({ id: s.id, name: s.name })));
      } else {
        const fallback = PROVIDER_PROFESSIONS.find(p => p.name === profession)?.skills ?? [];
        setAddSkillList(fallback.map(n => ({ id: '', name: n })));
      }
    } catch {
      const fallback = PROVIDER_PROFESSIONS.find(p => p.name === profession)?.skills ?? [];
      setAddSkillList(fallback.map(n => ({ id: '', name: n })));
    }
  };

  const handleAddSkill = async (skillName: string, skillId?: string) => {
    setIsAddingSkill(true);
    try {
      if (skillId) {
        await SkoFyApi.skills.addSkill(skillId);
      } else {
        await SkoFyApi.skills.addSkillsByName([{ name: skillName, profession: addSkillProfession }]);
      }
      // No success alert here on purpose — this modal is meant for picking
      // several skills in a row, and a blocking confirmation modal after
      // every single tap (stacked on top of this already-open one) forced
      // the user to dismiss it before picking the next skill, which is what
      // read as the picker "getting stuck" on multi-select. The chip itself
      // flipping to its disabled "✓ already added" state below (once
      // apiSkills updates) is the confirmation now.
      await refreshSkillsAndEligibility();
    } catch {
      showAlert('error', 'Error', 'Failed to add skill. Please try again.');
    } finally {
      setIsAddingSkill(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      showAlert('error', 'Current Password Required', 'Enter your current password to change it.');
      return;
    }
    if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      showAlert('error', 'Weak Password', 'Password must be at least 8 characters and contain a letter and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('error', 'Mismatch', 'Passwords do not match.');
      return;
    }
    setIsSavingPassword(true);
    try {
      await SkoFyApi.auth.setPassword(newPassword, currentPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordOpen(false);
      showAlert('success', 'Password Updated', 'Your password has been changed successfully. Please log in again on any other device.');
    } catch (e: any) {
      showAlert('error', 'Failed', e?.message || 'Could not update password. Try again.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleToggleAvailability = async () => {
    const next = !isAvailable;
    setIsAvailable(next);
    try {
      await SkoFyApi.provider.setAvailability(next);
    } catch {
      setIsAvailable(!next);
    }
  };

  const handleSavePreferences = async () => {
    setIsSavingPreferences(true);
    try {
      await SkoFyApi.provider.setPreferences(Math.round(milesToKm(preferredRadiusMiles)));
      setIsPreferencesOpen(false);
    } catch (e: any) {
      showAlert('error', 'Failed', e?.message || 'Could not save preferences. Try again.');
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleLogout = async () => {
    // Local logout proceeds regardless — this is just telling the server to
    // invalidate the refresh token server-side.
    try {
      // Best-effort — a failure here shouldn't block logout, it would just
      // mean the backend deletes the token by user_id next login instead of
      // right now (see auth_service.py's logout docstring for why this
      // exists at all: without it, a logged-out device kept ringing for
      // incoming calls indefinitely).
      const fcmToken = await messaging().getToken().catch(() => undefined);
      const voipToken = getCurrentVoipToken() ?? undefined;
      await SkoFyApi.auth.logout(fcmToken, voipToken);
    } catch (err) {
      console.error('Server-side logout failed:', err);
    }
    router.replace('/login');
  };

  // Camera-only, same as registration — a gallery pick could be any
  // random/stock/someone-else's photo. The on-device face check (Google ML
  // Kit, fully local, no third-party service) catches "pointed at a wall";
  // it isn't full liveness/anti-spoofing (a photo held up to the camera
  // would still pass), which would need a dedicated KYC vendor this project
  // hasn't integrated.
  const handleImagePicker = async () => {
    setIsPhotoSheetOpen(false);

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      // There's no gallery fallback for this photo anymore — a permanently
      // denied ("don't ask again") permission would otherwise be a dead end
      // with no way back in from this screen.
      if (permissionResult.canAskAgain) {
        showAlert('error', 'Camera Required', 'Please allow camera access to update your photo.');
      } else {
        Alert.alert(
          'Camera Access Needed',
          'Camera access is turned off for Skofy. Enable it in Settings to update your photo.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
        );
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setCheckingFace(true);
    try {
      const faces = await FaceDetection.detect(asset.uri);
      if (!faces || faces.length === 0) {
        showAlert('error', 'No Face Detected', "We couldn't find a face in that photo. Please retake it with your face clearly visible.");
        return;
      }
    } catch (err) {
      // On-device detection itself failing (rare) shouldn't block the
      // update over a client-side check — let the photo through rather
      // than leaving the provider stuck with no way to update their photo.
      // Logged (not swallowed silently) since the most likely real cause
      // during development is the native module not being linked yet.
      console.warn('Face detection failed, allowing photo through:', err);
    } finally {
      setCheckingFace(false);
    }

    const prevImage = profileImage;
    setProfileImage(asset.uri);
    try {
      const base64 = asset.base64;
      if (base64) {
        const mime = asset.mimeType ?? 'image/jpeg';
        await SkoFyApi.provider.uploadProfileImage(base64, mime);
      }
      setTimeout(() => {
        showAlert('success', 'Profile Updated', 'Your profile photo has been updated successfully! ✨');
      }, 500);
    } catch (err) {
      // This used to show a "Profile Updated" success alert unconditionally,
      // even when the upload failed — and left the UI showing the new photo
      // locally while the server still had the old one.
      console.error('Failed to upload profile photo:', err);
      setProfileImage(prevImage);
      showAlert('error', 'Error', 'Failed to update profile photo. Try again.');
    }
  };

  const removeImage = async () => {
    // This used to only clear local state — the server never learned the
    // photo was removed, so it would reappear on the next profile refetch.
    const prevImage = profileImage;
    setProfileImage(null);
    setIsPhotoSheetOpen(false);
    try {
      await SkoFyApi.provider.removeProfileImage();
      setTimeout(() => {
        showAlert('delete', 'Photo Removed', 'Your profile photo has been removed.');
      }, 500);
    } catch (err) {
      console.error('Failed to remove profile photo:', err);
      setProfileImage(prevImage);
      showAlert('error', 'Error', 'Failed to remove photo. Try again.');
    }
  };

  const renderJobHistoryItem = (item: ApiJob, index: number) => {
    const isCompleted = item.job_status === 'COMPLETED';
    const isCancelled = item.job_status === 'CANCELLED';
    const statusLabel = isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : item.job_status;
    // Bidding is retired — final_amount (the settled, post-inspection-invoice
    // price) is the real number; proposed_fee only survives on pre-migration
    // applications.
    const fee = item.final_amount ?? item.proposed_fee ?? item.inspection_fee ?? 0;
    const dateStr = item.scheduled_at
      ? new Date(item.scheduled_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date(item.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

    return (
      <Animated.View
        key={item.job_id}
        entering={FadeInDown.delay(400 + index * 100)}
        style={styles.historyCard}
      >
        <View style={styles.historyHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <ThemedText style={styles.historyTitle}>{item.title}</ThemedText>
            <ThemedText style={styles.historySubtitle}>{dateStr} • {item.urgency}</ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isCompleted ? '#ECFDF5' : isCancelled ? '#FEF2F2' : '#FEF9C3' }]}>
            <ThemedText style={[styles.statusText, { color: isCompleted ? '#10B981' : isCancelled ? '#EF4444' : '#92400E' }]}>
              {statusLabel}
            </ThemedText>
          </View>
        </View>

        <View style={styles.ratingSection}>
          <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#6B7280', fontFamily: Fonts.poppins, flex: 1 }} numberOfLines={2}>
            {item.description}
          </ThemedText>
          <ThemedText style={styles.priceText}>
            {fee > 0 ? `$${fee.toLocaleString()}` : '—'}
          </ThemedText>
        </View>

        {item.review && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <ThemedText style={{ fontSize: 11, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Rating from Customer
              </ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Star size={14} color="#FFCE48" fill="#FFCE48" />
                <ThemedText style={{ fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' }}>
                  {item.review.overall_rating.toFixed(1)}
                </ThemedText>
              </View>
            </View>
            {item.review.comment && (
              <ThemedText style={{ fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 }}>
                "{item.review.comment}"
              </ThemedText>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Skill {item.review.skill_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#FFCE48', width: `${(item.review.skill_rating / 5) * 100}%` }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Punctuality {item.review.punctuality_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#FFCE48', width: `${(item.review.punctuality_rating / 5) * 100}%` }} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Behaviour {item.review.behaviour_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#FFCE48', width: `${(item.review.behaviour_rating / 5) * 100}%` }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Communication {item.review.communication_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#FFCE48', width: `${(item.review.communication_rating / 5) * 100}%` }} />
                </View>
              </View>
            </View>
          </View>
        )}

        {item.customer_review && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF2FF' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <ThemedText style={{ fontSize: 11, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Your Rating of Customer
              </ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Star size={14} color="#FFCE48" fill="#FFCE48" />
                <ThemedText style={{ fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' }}>
                  {item.customer_review.overall_rating.toFixed(1)}
                </ThemedText>
              </View>
            </View>
            {item.customer_review.comment && (
              <ThemedText style={{ fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 }}>
                "{item.customer_review.comment}"
              </ThemedText>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Payment {item.customer_review.payment_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#EEF2FF', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#6366F1', width: `${(item.customer_review.payment_rating / 5) * 100}%` }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Behaviour {item.customer_review.behaviour_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#EEF2FF', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#6366F1', width: `${(item.customer_review.behaviour_rating / 5) * 100}%` }} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Negotiation {item.customer_review.negotiation_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#EEF2FF', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#6366F1', width: `${(item.customer_review.negotiation_rating / 5) * 100}%` }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 10, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280', marginBottom: 4 }}>
                  Environment {item.customer_review.environment_rating}/5
                </ThemedText>
                <View style={{ height: 4, backgroundColor: '#EEF2FF', borderRadius: 2 }}>
                  <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#6366F1', width: `${(item.customer_review.environment_rating / 5) * 100}%` }} />
                </View>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.historyHelpBtn}
          onPress={() => router.push(`/support-chat?jobId=${item.job_id}` as any)}
        >
          <MessageSquare size={16} color="#6B7280" />
          <ThemedText style={styles.historyHelpText}>Help & Support</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: '#F9FAFB' }]}>
      {isProfileLoading && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#F9FAFB', zIndex: 999,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <ActivityIndicator size="large" color="#FFCE48" />
          <ThemedText style={{ marginTop: 12, fontSize: 13, lineHeight: 19, color: '#9CA3AF', fontFamily: Fonts.poppins }}>
            Loading your profile...
          </ThemedText>
        </View>
      )}
      <View style={[styles.headerFixed, { paddingTop: Math.max(insets.top, 20) + 5 }]}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            {/* Profile has no bottom tab bar to fall back on (it's hidden
                app-wide — see (tabs)/_layout.tsx), so without this there was
                no way back at all. Falls back to the dashboard only when
                there's nothing left on the stack to go back to (e.g. a deep
                link straight into Profile). */}
            <TouchableOpacity
              style={[styles.settingsHeaderBtn, { marginRight: 10 }]}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            >
              <ChevronLeft size={24} color="#111827" />
            </TouchableOpacity>
            <AnimatedBrandMark size={32} nameSize={22} centered={false} pro />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.settingsHeaderBtn}
              onPress={() => setIsSettingsOpen(true)}
            >
              <Settings size={22} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stays fixed above the scroll — switching tabs shouldn't require
            scrolling back up to find it. Icons + a gold accent on the
            active tab (matching this app's established "selected" color
            everywhere else — bottom nav, active job tab badges) instead of
            plain white-on-gray, which read as too subtle to register as
            tappable navigation rather than static labels. */}
        <View style={styles.profileTabRow}>
          {([
            { key: 'profile', label: 'Profile', Icon: User },
            { key: 'verification', label: 'Verification', Icon: Shield },
            { key: 'earnings', label: 'Earnings', Icon: Wallet },
            { key: 'availability', label: 'Availability', Icon: CalendarDays },
          ] as { key: ProfileTab; label: string; Icon: typeof User }[]).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.profileTabBtn, activeProfileTab === tab.key && styles.profileTabBtnActive]}
              onPress={() => handleProfileTabChange(tab.key)}
            >
              <tab.Icon size={16} color={activeProfileTab === tab.key ? '#FFCE48' : '#9CA3AF'} />
              <ThemedText style={[styles.profileTabText, activeProfileTab === tab.key && styles.profileTabTextActive]}>
                {tab.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        ref={profileScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#FFCE48']} // Android
            tintColor="#FFCE48" // iOS
          />
        }
      >
        {activeProfileTab === 'profile' && (
        <>
        {/* Profile Card */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.profileCard}>
          {/* Pinned to the card, not the name text — the name can wrap to
              two lines ("Chandra ravipati"), and an inline icon riding
              along with just the wrappable text ends up floating next to
              whichever line it lands on instead of reading as "edit this
              card". Styled like the avatar's own edit badge for the same
              reason: a bare icon with no touch-target padding or
              background doesn't read as a button at all. */}
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => setIsEditProfileOpen(true)}>
            <Edit2 size={15} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.profileInfoRow}>
            <View style={styles.avatarWrapper}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#FFCE48', alignItems: 'center', justifyContent: 'center' }]}>
                  <ThemedText style={{ fontSize: 28, lineHeight: 34, fontFamily: Fonts.poppinsSemiBold, color: '#1a1a1a' }}>
                    {providerName ? providerName.charAt(0).toUpperCase() : '?'}
                  </ThemedText>
                </View>
              )}
              <TouchableOpacity
                style={styles.editAvatarBtn}
                onPress={() => setIsPhotoSheetOpen(true)}
              >
                <Edit2 size={14} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.mainInfo}>
              <ThemedText style={styles.profileName}>{providerName || 'Provider'}</ThemedText>
              {yearsExperience > 0 && (
                <ThemedText style={styles.profileRole}>{yearsExperience} {yearsExperience === 1 ? 'year' : 'years'} experience</ThemedText>
              )}
              {providerBio ? <ThemedText numberOfLines={2} style={{ fontSize: 11, lineHeight: 17, color: '#6B7280', fontFamily: Fonts.poppins, marginTop: 2 }}>{providerBio}</ThemedText> : null}
              <TouchableOpacity style={[styles.availabilityBadge, !isAvailable && { backgroundColor: '#F3F4F6' }]} onPress={handleToggleAvailability}>
                <View style={[styles.onlineDot, !isAvailable && { backgroundColor: '#9CA3AF' }]} />
                <ThemedText style={[styles.availabilityText, !isAvailable && { color: '#6B7280' }]}>
                  {isAvailable ? 'Available Now' : 'Unavailable'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {/* HCI Meter */}
          <View style={styles.skillMeterContainer}>
            <View style={styles.skillMeterLeft}>
              <ThemedText style={styles.sectionTitleSmall}>HCI Meter</ThemedText>
              <ThemedText style={styles.sectionSubtitleSmall}>Human Capital Index</ThemedText>
              {reviewCount === 0 ? (
                <ThemedText style={{ fontSize: 11, lineHeight: 17, color: '#9CA3AF', fontFamily: Fonts.poppins, marginTop: 4 }}>
                  Not enough data yet — complete a job to see these
                </ThemedText>
              ) : (
                <View style={styles.meterTags}>
                  {(() => {
                    const skillGood = (avgSkillRating ?? 0) >= 4.0;
                    return (
                      <View style={[styles.meterTag, { backgroundColor: skillGood ? '#FFFBEB' : '#F9FAFB' }]}>
                        <CheckCircle2 size={12} color={skillGood ? '#D97706' : '#9CA3AF'} />
                        <ThemedText style={[styles.meterTagText, { color: skillGood ? '#D97706' : '#9CA3AF' }]}>
                          Skill Quality {avgSkillRating != null ? avgSkillRating.toFixed(1) : '—'}★
                        </ThemedText>
                      </View>
                    );
                  })()}
                  {(() => {
                    const punctualGood = (avgPunctualityRating ?? 0) >= 4.0;
                    return (
                      <View style={[styles.meterTag, { backgroundColor: punctualGood ? '#F0FDF4' : '#F9FAFB' }]}>
                        <CheckCircle2 size={12} color={punctualGood ? '#16A34A' : '#9CA3AF'} />
                        <ThemedText style={[styles.meterTagText, { color: punctualGood ? '#16A34A' : '#9CA3AF' }]}>
                          Timeliness {avgPunctualityRating != null ? avgPunctualityRating.toFixed(1) : '—'}★
                        </ThemedText>
                      </View>
                    );
                  })()}
                  {(() => {
                    const behaviourGood = (avgBehaviourRating ?? 0) >= 4.0;
                    return (
                      <View style={[styles.meterTag, { backgroundColor: behaviourGood ? '#EFF6FF' : '#F9FAFB' }]}>
                        <CheckCircle2 size={12} color={behaviourGood ? '#3B82F6' : '#9CA3AF'} />
                        <ThemedText style={[styles.meterTagText, { color: behaviourGood ? '#3B82F6' : '#9CA3AF' }]}>
                          Behaviour {avgBehaviourRating != null ? avgBehaviourRating.toFixed(1) : '—'}★
                        </ThemedText>
                      </View>
                    );
                  })()}
                  {(() => {
                    const commGood = (avgCommunicationRating ?? 0) >= 4.0;
                    return (
                      <View style={[styles.meterTag, { backgroundColor: commGood ? '#FDF4FF' : '#F9FAFB' }]}>
                        <CheckCircle2 size={12} color={commGood ? '#A855F7' : '#9CA3AF'} />
                        <ThemedText style={[styles.meterTagText, { color: commGood ? '#A855F7' : '#9CA3AF' }]}>
                          Communication {avgCommunicationRating != null ? avgCommunicationRating.toFixed(1) : '—'}★
                        </ThemedText>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
            <View style={styles.meterCircleWrapper}>
              {(() => {
                const size = 70;
                const strokeWidth = 6;
                const center = size / 2;
                const radius = (size - strokeWidth) / 2;
                const circumference = 2 * Math.PI * radius;
                const progress = (Math.min(100, Math.max(0, skillScore)) / 100) * circumference;
                return (
                  <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
                    <Svg width={size} height={size}>
                      <Circle cx={center} cy={center} r={radius} stroke={themeColors.borderSubtle} strokeWidth={strokeWidth} fill="none" />
                      <Circle
                        cx={center} cy={center} r={radius}
                        stroke="#FFCE48" strokeWidth={strokeWidth} fill="none"
                        strokeDasharray={`${progress} ${circumference}`}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${center} ${center})`}
                      />
                    </Svg>
                    <View style={StyleSheet.absoluteFill}>
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ThemedText style={styles.meterPercentage}>{skillScore}%</ThemedText>
                      </View>
                    </View>
                  </View>
                );
              })()}
              <View style={styles.sparkleIcon}>
                <Star size={12} color="#FFCE48" fill="#FFCE48" />
              </View>
            </View>
          </View>
        </Animated.View>
        </>
        )}

        {activeProfileTab === 'earnings' && (
        <>
        {/* Earnings Card — real totals from completed, paid-out jobs */}
        <Animated.View entering={FadeInUp.delay(300)} style={styles.walletCardMini}>
          <View style={styles.walletHeaderMini}>
            <View style={styles.walletLabelGroup}>
              <View style={styles.walletIconCircle}>
                <Wallet size={18} color="#D97706" />
              </View>
              <ThemedText style={styles.walletTitleMini}>Earnings</ThemedText>
            </View>
            <TouchableOpacity onPress={() => setIsEarningsModalOpen(true)} style={styles.withdrawSmallBtn}>
              <ArrowUpRight size={14} color="#D97706" />
              <ThemedText style={styles.withdrawSmallText}>Details</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={styles.walletBalanceRowMini}>
            <ThemedText style={styles.currencyMini}>$</ThemedText>
            <ThemedText style={styles.balanceMini}>{earnings.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</ThemedText>
          </View>
          <View style={styles.walletStatsMini}>
            <View style={styles.walletStatItemMini}>
              <ArrowDownLeft size={12} color="#10B981" />
              <ThemedText style={styles.walletStatTextMini}>
                {earnings.pending > 0
                  ? `$${earnings.pending.toFixed(2)} pending from jobs in progress`
                  : 'Paid out automatically to your bank by Stripe'}
              </ThemedText>
            </View>
          </View>
        </Animated.View>
        </>
        )}

        {activeProfileTab === 'profile' && (
        <>
        {/* Stats Section */}
        <ThemedText style={[styles.sectionTitle, { marginTop: 32, marginLeft: 20 }]}>Work Samples</ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScroll}
        >
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{jobsCompleted}</ThemedText>
            <ThemedText style={styles.statLabel}>Total Gigs{"\n"}Completed</ThemedText>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <Star size={16} color="#F59E0B" fill="#F59E0B" />
              <ThemedText style={[styles.statValue, { marginLeft: 4 }]}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</ThemedText>
            </View>
            <ThemedText style={styles.statLabel}>Avg. Rating</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>
              {(() => {
                // Only count COMPLETED jobs as earned — cancelled ones were
                // never actually paid out. final_amount (the settled,
                // post-inspection-invoice price) is the real number now;
                // proposed_fee only survives on pre-migration applications.
                const total = jobHistory
                  .filter(j => j.job_status === 'COMPLETED')
                  .reduce((sum, j) => sum + (j.final_amount ?? j.proposed_fee ?? j.inspection_fee ?? 0), 0);
                return total > 0 ? `$${total.toLocaleString()}` : '$0';
              })()}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Total{"\n"}Earned</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>
              {(() => {
                const done = jobHistory.filter(j => j.job_status === 'COMPLETED').length;
                const total = jobHistory.filter(j => j.job_status === 'COMPLETED' || j.job_status === 'CANCELLED').length;
                if (total === 0) return '—';
                return `${Math.round((done / total) * 100)}%`;
              })()}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Completion{"\n"}Rate</ThemedText>
          </View>
        </ScrollView>
        </>
        )}

        {activeProfileTab === 'availability' && (
        <>
        {/* Online Status — the master switch for whether jobs (including
            Pickup & Delivery below) can reach this provider at all. Lives
            here too, not just on the Dashboard header, since Availability
            is now the one place to manage everything about being
            reachable for work. */}
        <Animated.View entering={FadeInUp.delay(60)} style={[styles.sectionHeaderInner, { marginTop: 20 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <ThemedText style={styles.sectionTitleSmall}>Online Status</ThemedText>
            <ThemedText style={{ fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', marginTop: 2 }}>
              {isAvailable ? "You're visible and can receive new job offers." : "You're offline — turn on to start receiving jobs."}
            </ThemedText>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={() => handleToggleAvailability()}
            trackColor={{ false: '#D1D5DB', true: '#FFCE48' }}
            thumbColor="#fff"
          />
        </Animated.View>

        {/* Available Slots Section */}
        <View style={styles.sectionHeaderInner}>
          <View>
            <ThemedText style={styles.sectionTitleSmall}>Available Slots</ThemedText>
            <ThemedText style={styles.sectionSubtitleSmall}>Manage your booking schedule</ThemedText>
          </View>
          <TouchableOpacity onPress={() => {
            const today = new Date();
            setNewSlotDate(today);
            const start = new Date(today);
            start.setHours(9, 0, 0, 0);
            const end = new Date(today);
            end.setHours(17, 0, 0, 0);
            setNewSlotStart(start);
            setNewSlotEnd(end);
            setIsSlotModalOpen(true);
          }}>
            <ThemedText style={styles.viewAllBtn}>Manage</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, gap: 12 }}>
          {activeSlots.length === 0 ? (
            <ThemedText style={{ color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, marginTop: 10 }}>No slots added. Tap Manage to schedule.</ThemedText>
          ) : (
            activeSlots.slice(0, 5).map(slot => {
              const [y, m, d] = slot.date.split('-').map(Number);
              const dateObj = new Date(y, m - 1, d);
              return (
                <View key={slot.id} style={styles.slotCardSmall}>
                  <ThemedText style={styles.slotDateText}>{dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</ThemedText>
                  <ThemedText style={styles.slotTimeText}>{slot.startTime} - {slot.endTime}</ThemedText>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Pickup & Delivery — a capability toggle, not a skill test. Anyone
            can physically pick something up and drop it off; the thing
            being verified is identity/trust, which registration already
            checks (DL / govt ID), not competency. Lives here rather than
            under Verification since it's a self-directed availability
            preference, not a trust/competency check. */}
        <Animated.View entering={FadeInUp.delay(100)} style={[styles.skillsSection, !isAvailable && { opacity: 0.5 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <ThemedText style={styles.sectionTitleSmall}>Pickup & Delivery</ThemedText>
              <ThemedText style={{ fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', marginTop: 2 }}>
                {!isAvailable
                  ? 'Go online to receive these.'
                  : isIdentityVerified
                  ? 'Get notified for jobs that need something picked up and dropped off.'
                  : 'Complete identity verification to enable this.'}
              </ThemedText>
            </View>
            {pickupDropoffSaving ? (
              <ActivityIndicator size="small" color="#FFCE48" />
            ) : (
              <Switch
                value={isAvailable && pickupDropoffEnabled}
                onValueChange={handleTogglePickupDropoff}
                disabled={!isAvailable || (!isIdentityVerified && !pickupDropoffEnabled)}
                trackColor={{ false: '#D1D5DB', true: '#FFCE48' }}
                thumbColor="#fff"
              />
            )}
          </View>
        </Animated.View>
        </>
        )}

        {activeProfileTab === 'verification' && (
        <>
        {/* Skills & Proof of Work */}
        <View style={styles.sectionHeader}>
          <View>
            <ThemedText style={styles.sectionTitle}>Skills & Proof of Work</ThemedText>
            <ThemedText style={styles.sectionDescription}>
              Employers can verify real workthrough photos & videos uploaded by the worker.
            </ThemedText>
          </View>
        </View>

        {/* Skill Assessment Section */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.skillsSection}>
          <View style={styles.skillsHeaderRow}>
            <ThemedText style={styles.sectionTitleSmall}>Skill Assessments</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ThemedText style={styles.skillCountText}>{assessableSkills.length} Skill{assessableSkills.length !== 1 ? 's' : ''}</ThemedText>
              <TouchableOpacity
                onPress={() => { setAddSkillProfession(''); setAddSkillList([]); setIsAddSkillOpen(true); }}
                style={{ backgroundColor: '#FFCE48', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Plus size={13} color="#000" />
                <ThemedText style={{ fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#000' }}>Add</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {assessableSkills.length === 0 ? (
            <ThemedText style={{ color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, textAlign: 'center', paddingVertical: 16 }}>
              No skills added yet. Tap "Add" to get started.
            </ThemedText>
          ) : (
            <ScrollView
              style={{ maxHeight: 320 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={styles.skillsListFull}
            >
              {assessableSkills.map((skillItem, index) => {
                const skill = skillItem.name;
                const verified = skillItem.is_verified;
                const eligibility = skillEligibility[skillItem.skill_id];
                const isEligible = eligibility ? eligibility.eligible : false;

                // skill_o_meter: 0–1 → map to level label
                const meterPct = skillItem.skill_o_meter * 100;
                const isMaxed = meterPct >= 100;
                const levelLabel = meterPct >= 70 ? 'Expert' : meterPct >= 35 ? 'Intermediate' : 'Beginner';
                const levelBg = levelLabel === 'Expert' ? '#FEF2F2' : levelLabel === 'Intermediate' ? '#F0F9FF' : '#F9FAFB';
                const levelBorder = levelLabel === 'Expert' ? '#FCA5A5' : levelLabel === 'Intermediate' ? '#BAE6FD' : '#E5E7EB';
                const levelColor = levelLabel === 'Expert' ? '#DC2626' : levelLabel === 'Intermediate' ? '#0284C7' : '#6B7280';

                // Button state: verified+maxed (done) | verified+upgrade available | verified+locked (needs jobs/cooldown) | take test | locked (cooldown on first attempt)
                const buttonState = verified
                  ? (isMaxed ? 'maxed' : isEligible ? 'upgrade' : 'verified_locked')
                  : (isEligible ? 'take_test' : 'locked');

                return (
                  <View key={skillItem.skill_id} style={styles.skillItemFull}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={styles.skillMainInfo}>
                      <ThemedText style={styles.skillMainLabel}>{skill}</ThemedText>
                      <ThemedText style={{ fontSize: 11, lineHeight: 17, color: '#9CA3AF', fontFamily: Fonts.poppins }}>{skillItem.profession}</ThemedText>
                      <View style={styles.skillBadgeRow}>
                        <View style={[styles.levelBadgeMini, { backgroundColor: levelBg, borderColor: levelBorder }]}>
                          <ThemedText style={[styles.levelTextMini, { color: levelColor }]}>{levelLabel}</ThemedText>
                        </View>
                        <ThemedText style={styles.skillStatsSmall}>⭐ {verified ? '+50 Points' : 'Level Up Available'}</ThemedText>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (buttonState === 'maxed') return;
                          if (buttonState === 'verified_locked' || buttonState === 'locked') {
                            showAlert('error', eligibility?.reason === 'cooldown' ? 'Cooling Period Active' : 'Not Eligible Yet', getEligibilityMessage(eligibility));
                            return;
                          }
                          startTest(skillItem.skill_id, skill);
                        }}
                        style={[
                          styles.testActionBtn,
                          (buttonState === 'maxed' || buttonState === 'verified_locked') && { backgroundColor: '#10B981', shadowColor: '#10B981' },
                          buttonState === 'locked' && { backgroundColor: '#F3F4F6', shadowOpacity: 0, shadowColor: 'transparent', elevation: 0 }
                        ]}
                      >
                        {buttonState === 'maxed' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} color="#fff" />
                            <ThemedText style={[styles.testBtnText, { color: '#fff' }]}>Max Level</ThemedText>
                          </View>
                        ) : buttonState === 'verified_locked' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} color="#fff" />
                            <ThemedText style={[styles.testBtnText, { color: '#fff' }]}>Verified</ThemedText>
                          </View>
                        ) : buttonState === 'locked' ? (
                          <ThemedText style={[styles.testBtnText, { color: '#9CA3AF' }]}>
                            {eligibility?.reason === 'cooldown' ? `Wait ${eligibility.retry_after_minutes}m` : 'Locked'}
                          </ThemedText>
                        ) : buttonState === 'upgrade' ? (
                          <ThemedText style={styles.testBtnText}>Upgrade Test</ThemedText>
                        ) : (
                          <ThemedText style={styles.testBtnText}>Take Test</ThemedText>
                        )}
                      </TouchableOpacity>
                      {buttonState === 'verified_locked' && eligibility?.reason === 'needs_more_jobs' && (
                        <ThemedText style={{ fontSize: 10, lineHeight: 16, color: '#6B7280', marginTop: 4, fontFamily: Fonts.poppins, textAlign: 'right', maxWidth: 110 }}>
                          {eligibility.jobs_required - eligibility.jobs_completed} more job(s) to upgrade
                        </ThemedText>
                      )}
                    </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveSkill(skillItem.skill_id)}
                      style={styles.skillDeleteBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* Identity Document */}
        {identityDocUrl && (
          <View style={[styles.gallerySection, { marginBottom: 16 }]}>
            <View style={styles.sectionHeaderInner}>
              <ThemedText style={styles.sectionTitleSmall}>Identity Document</ThemedText>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedMedia({ type: 'identity', uri: identityDocUrl });
                  setIsViewerOpen(true);
                }}
              >
                <Image
                  source={{ uri: identityDocUrl }}
                  style={{ width: 140, height: 90, borderRadius: 12, backgroundColor: '#F3F4F6' }}
                  contentFit="cover"
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Payouts & Verification — must all clear before you can be hired */}
        <View style={[styles.gallerySection, { marginBottom: 16 }]}>
          <View style={styles.sectionHeaderInner}>
            <ThemedText style={styles.sectionTitleSmall}>Payouts & Verification</ThemedText>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            {/* Connect (payouts) */}
            <View style={styles.verificationRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.verificationLabel}>Payout Setup</ThemedText>
                <ThemedText style={[styles.verificationSubtext, connectStatus === 'RESTRICTED' && { color: '#DC2626' }]}>
                  {connectStatus === 'COMPLETE' ? 'Ready to receive payouts'
                    : connectStatus === 'RESTRICTED' ? 'Action needed — tap to fix'
                    : connectStatus === 'IN_PROGRESS' ? 'Setup in progress'
                    : 'Set up how you get paid'}
                </ThemedText>
              </View>
              {connectStatus === 'COMPLETE' ? (
                <CheckCircle2 size={22} color="#16A34A" />
              ) : (
                <TouchableOpacity
                  style={styles.verificationActionBtn}
                  onPress={handleOpenConnectOnboarding}
                  disabled={isConnectLoading}
                >
                  {isConnectLoading ? (
                    <ActivityIndicator size="small" color="#D97706" />
                  ) : (
                    <ThemedText style={styles.verificationActionText}>
                      {connectStatus === 'NOT_STARTED' ? 'Set Up' : connectStatus === 'RESTRICTED' ? 'Fix Now' : 'Continue'}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Background check */}
            <View style={styles.verificationRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.verificationLabel}>Background Check</ThemedText>
                <ThemedText style={styles.verificationSubtext}>
                  {backgroundCheckStatus === 'CLEAR' ? 'Cleared'
                    : backgroundCheckStatus === 'CONSIDER' ? 'Under review'
                    : backgroundCheckStatus === 'FAILED' ? 'Did not clear'
                    : backgroundCheckStatus === 'PENDING' ? 'In progress'
                    : 'Not started yet'}
                </ThemedText>
              </View>
              {backgroundCheckStatus === 'CLEAR' ? (
                <CheckCircle2 size={22} color="#16A34A" />
              ) : (
                <Lock size={20} color="#9CA3AF" />
              )}
            </View>

            {/* Trade license */}
            <View style={styles.verificationRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.verificationLabel}>Trade License</ThemedText>
                <ThemedText style={[styles.verificationSubtext, licenseStatus === 'REJECTED' && { color: '#DC2626' }]}>
                  {licenseStatus === 'APPROVED' ? 'Approved'
                    : licenseStatus === 'PENDING_REVIEW' ? 'Under review'
                    : licenseStatus === 'REJECTED' ? 'Rejected — re-upload needed'
                    : 'Upload your license'}
                </ThemedText>
              </View>
              {licenseStatus === 'APPROVED' ? (
                <CheckCircle2 size={22} color="#16A34A" />
              ) : (
                <TouchableOpacity style={styles.verificationActionBtn} onPress={handleUploadLicense}>
                  <ThemedText style={styles.verificationActionText}>
                    {licenseStatus === 'NOT_SUBMITTED' || licenseStatus === 'REJECTED' ? 'Upload' : 'Pending'}
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Proof of Work - Discovery Gallery */}
        <View style={styles.gallerySection}>
          <View style={styles.sectionHeaderInner}>
            <ThemedText style={styles.sectionTitleSmall}>Work Proof Gallery</ThemedText>
            <TouchableOpacity onPress={() => setIsViewAllOpen(true)}>
              <ThemedText style={styles.viewAllBtn}>View All</ThemedText>
            </TouchableOpacity>
          </View>

          {proofs.length === 0 && (
            <ThemedText style={{ color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, paddingHorizontal: 20, paddingVertical: 12 }}>
              No work proof added yet. Tap "Add Skill Proof" below to upload photos or videos.
            </ThemedText>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaHorizontalScroll}
            snapToInterval={280 + 16}
            decelerationRate="fast"
          >
            {proofs.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.92}
                onPress={() => {
                  setSelectedMedia(item);
                  setIsViewerOpen(true);
                }}
                style={styles.mediaGalleryCard}
              >
                {/* Full-bleed thumbnail — like YouTube */}
                <Image
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFill as any}
                  contentFit="cover"
                  transition={400}
                />

                {/* Dark gradient at bottom */}
                <View style={styles.cardGradientOverlay} />

                {/* Delete button — top-left, mirrors the type badge on the right */}
                <TouchableOpacity
                  onPress={() => handleDeleteProof(item.id)}
                  style={styles.proofDeleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={14} color="#fff" />
                </TouchableOpacity>

                {/* Centred play button — only for videos */}
                {item.type === 'video' && (
                  <View style={styles.centrePlayBtn}>
                    <Play size={22} color="#fff" fill="#fff" />
                  </View>
                )}

                {/* Top-right type badge */}
                <View style={[styles.typeBadge, {
                  backgroundColor: item.type === 'video' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.82)',
                }]}>
                  {item.type === 'video'
                    ? <Play size={9} color="#fff" fill="#fff" />
                    : <ImageIcon size={9} color="#111" />}
                  <ThemedText style={[styles.typeBadgeText, {
                    color: item.type === 'video' ? '#fff' : '#111',
                  }]}>
                    {item.type === 'video' ? 'VIDEO' : 'PHOTO'}
                  </ThemedText>
                </View>

                {/* Skill label at bottom */}
                <View style={styles.cardBottomRow}>
                  <ThemedText style={styles.cardSkillTag} numberOfLines={1}>{item.skill}</ThemedText>
                </View>
              </TouchableOpacity>
            ))}

          </ScrollView>
        </View>

        <TouchableOpacity style={styles.addProofBtn} onPress={pickMultipleMedia}>
          <View style={styles.plusIconWrap}>
            <Plus size={18} color="#D97706" />
          </View>
          <ThemedText style={styles.addProofText}>Add Skill Proof</ThemedText>
          <ChevronRight size={18} color="#D97706" />
        </TouchableOpacity>
        <ThemedText style={styles.uploadTip}>Upload photos or videos for completed tasks. ➡️</ThemedText>
        </>
        )}

        {activeProfileTab === 'earnings' && (
        <>
        {/* Job History */}
        <View style={styles.sectionHeaderInner}>
          <ThemedText style={styles.sectionTitleSmall}>Job History</ThemedText>
          <TouchableOpacity onPress={() => setIsJobHistoryOpen(true)}>
            <ThemedText style={styles.viewAllBtn}>View All</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ paddingBottom: 20 }}>
          {jobHistory.length === 0 ? (
            <ThemedText style={{ color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 24 }}>
              No job history yet. Completed jobs will appear here.
            </ThemedText>
          ) : (
            jobHistory.slice(0, 3).map((item, index) => renderJobHistoryItem(item, index))
          )}
        </View>
        </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Settings Modal - Mirrored from Customer App */}
      <Modal
        visible={isSettingsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsSettingsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Settings</ThemedText>
              <TouchableOpacity onPress={() => setIsSettingsOpen(false)}>
                <XCircle size={26} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.settingsList}>
              <View style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}>
                <View style={styles.settingInfo}>
                  <Bell size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Push Notifications</ThemedText>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: '#D1D5DB', true: '#FFCE48' }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  router.push('/notifications');
                }}
              >
                <View style={styles.settingInfo}>
                  <Bell size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Notification Inbox</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => { setIsSettingsOpen(false); setTimeout(() => setIsEditProfileOpen(true), 400); }}
              >
                <View style={styles.settingInfo}>
                  <Edit2 size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Edit Profile</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  setTimeout(() => setIsPreferencesOpen(true), 400);
                }}
              >
                <View style={styles.settingInfo}>
                  <MapPin size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Job Preferences</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  setTimeout(() => setIsPasswordOpen(true), 500);
                }}
              >
                <View style={styles.settingInfo}>
                  <Lock size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Change Password</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  setTimeout(handleOpenConnectDashboard, 500);
                }}
              >
                <View style={styles.settingInfo}>
                  <Landmark size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Manage Payouts</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  setTimeout(() => setIsTermsOpen(true), 500);
                }}
              >
                <View style={styles.settingInfo}>
                  <FileText size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Terms & Conditions</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingItem, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  router.push('/help-support' as any);
                }}
              >
                <View style={styles.settingInfo}>
                  <MessageSquare size={20} color="#6B7280" />
                  <ThemedText style={styles.settingLabel}>Help & Support</ThemedText>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem} onPress={handleLogout}>
                <View style={styles.settingInfo}>
                  <LogOut size={20} color="#EF4444" />
                  <ThemedText style={[styles.settingLabel, { color: '#EF4444' }]}>Logout</ThemedText>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setIsSettingsOpen(false)}
            >
              <ThemedText style={styles.closeModalButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={isEditProfileOpen} animationType="slide" onRequestClose={() => setIsEditProfileOpen(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={[styles.modalHeaderInner, { paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setIsEditProfileOpen(false)} style={styles.headerBackBtn}>
              <XCircle size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.modalHeaderTitle}>Edit Profile</ThemedText>
            <TouchableOpacity onPress={handleSaveProfile} disabled={isSavingProfile} style={{ paddingHorizontal: 8 }}>
              <ThemedText style={{ color: '#D97706', fontFamily: Fonts.poppinsSemiBold, fontSize: 15, lineHeight: 21 }}>
                {isSavingProfile ? 'Saving…' : 'Save'}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View>
              <ThemedText style={styles.inputLabel}>Full Name *</ThemedText>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
                style={[styles.editableInput, { marginTop: 6 }]}
              />
            </View>
            <View>
              <ThemedText style={styles.inputLabel}>Mobile Number</ThemedText>
              <View style={[styles.editableInput, { marginTop: 6, justifyContent: 'center', backgroundColor: '#F3F4F6' }]}>
                <ThemedText style={{ color: '#6B7280', fontFamily: Fonts.poppins, fontSize: 15, lineHeight: 21 }}>
                  {providerPhone || 'Not set'}
                </ThemedText>
              </View>
              <ThemedText style={{ fontSize: 11, lineHeight: 17, color: '#9CA3AF', fontFamily: Fonts.poppins, marginTop: 4 }}>
                Contact support to change your registered mobile number.
              </ThemedText>
            </View>
            <View>
              <ThemedText style={styles.inputLabel}>Email</ThemedText>
              <TextInput
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.editableInput, { marginTop: 6 }]}
              />
            </View>
            <View>
              <ThemedText style={styles.inputLabel}>Bio</ThemedText>
              <TextInput
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Tell customers about yourself"
                multiline
                numberOfLines={3}
                style={[styles.editableInput, { marginTop: 6, height: 80, textAlignVertical: 'top' }]}
              />
            </View>
            <View>
              <ThemedText style={styles.inputLabel}>City</ThemedText>
              <TextInput
                value={editCity}
                onChangeText={setEditCity}
                placeholder="e.g. Hyderabad"
                style={[styles.editableInput, { marginTop: 6 }]}
              />
            </View>
            <View>
              <ThemedText style={styles.inputLabel}>Years of Experience</ThemedText>
              <TextInput
                value={editYearsExp}
                onChangeText={setEditYearsExp}
                placeholder="e.g. 5"
                keyboardType="numeric"
                style={[styles.editableInput, { marginTop: 6 }]}
              />
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>

      {/* Job Preferences Modal */}
      <Modal visible={isPreferencesOpen} animationType="slide" onRequestClose={() => setIsPreferencesOpen(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={[styles.modalHeaderInner, { paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setIsPreferencesOpen(false)} style={styles.headerBackBtn}>
              <XCircle size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.modalHeaderTitle}>Job Preferences</ThemedText>
            <TouchableOpacity onPress={handleSavePreferences} disabled={isSavingPreferences} style={{ paddingHorizontal: 8 }}>
              <ThemedText style={{ color: '#D97706', fontFamily: Fonts.poppinsSemiBold, fontSize: 15, lineHeight: 21 }}>
                {isSavingPreferences ? 'Saving…' : 'Save'}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View>
              <ThemedText style={styles.inputLabel}>Maximum Travel Distance</ThemedText>
              <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#9CA3AF', fontFamily: Fonts.poppins, marginTop: 4, marginBottom: 12 }}>
                You'll only be notified about jobs within this distance from you.
              </ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity
                  onPress={() => setPreferredRadiusMiles(prev => Math.max(1, prev - 5))}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }}
                >
                  <ThemedText style={{ fontSize: 20, lineHeight: 26, fontFamily: Fonts.poppinsSemiBold }}>−</ThemedText>
                </TouchableOpacity>
                <ThemedText style={{ fontSize: 24, lineHeight: 30, fontFamily: Fonts.poppinsBold, minWidth: 90, textAlign: 'center' }}>
                  {preferredRadiusMiles} mi
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setPreferredRadiusMiles(prev => Math.min(62, prev + 5))}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }}
                >
                  <ThemedText style={{ fontSize: 20, lineHeight: 26, fontFamily: Fonts.poppinsSemiBold }}>+</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>

      {/* Terms & Conditions Modal */}
      <Modal visible={isTermsOpen} animationType="slide" onRequestClose={() => setIsTermsOpen(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={[styles.modalHeaderInner, { paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setIsTermsOpen(false)} style={styles.headerBackBtn}>
              <XCircle size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.modalHeaderTitle}>Terms & Conditions</ThemedText>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.termsContent}>
            <ThemedText style={styles.termsTitle}>1. Provider Agreement</ThemedText>
            <ThemedText style={styles.termsText}>
              As a Dodorez Pro, you agree to represent yourself accurately, maintain
              high quality standards, and follow all safety protocols while serving customers.
            </ThemedText>
            <ThemedText style={styles.termsTitle}>2. Platform Usage</ThemedText>
            <ThemedText style={styles.termsText}>
              Dodorez provides the technology to connect you with clients. We do not employ you directly;
              you are an independent professional utilizing our marketplace tools.
            </ThemedText>
            <ThemedText style={styles.termsTitle}>3. Payment Policy</ThemedText>
            <ThemedText style={styles.termsText}>
              Payments are processed according to the agreed-upon rates for each job. Platform fees are
              deducted before the final payout to your verified account.
            </ThemedText>
            <ThemedText style={styles.termsTitle}>4. Scheduling & Conflicts</ThemedText>
            <ThemedText style={styles.termsText}>
              It is the provider's responsibility to manage their calendar. Frequent cancellations
              may lead to platform suspension.
            </ThemedText>
          </ScrollView>
        </ThemedView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={isPasswordOpen} animationType="fade" transparent onRequestClose={() => setIsPasswordOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { justifyContent: 'center', padding: 20 }]}
          behavior="padding"
          automaticOffset
        >
          <View style={[styles.modalContent, { borderRadius: 24 }]}>
            <ThemedText style={[styles.modalTitle, { marginBottom: 20 }]}>Security Update</ThemedText>
            <View style={styles.inputStack}>
              <ThemedText style={styles.inputLabel}>Current Password</ThemedText>
              <TextInput
                placeholder="Enter current password"
                secureTextEntry
                style={styles.editableInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <ThemedText style={[styles.inputLabel, { marginTop: 16 }]}>New Password</ThemedText>
              <TextInput
                placeholder="Min 8 characters, 1 letter + 1 number"
                secureTextEntry
                style={styles.editableInput}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <ThemedText style={[styles.inputLabel, { marginTop: 16 }]}>Confirm New Password</ThemedText>
              <TextInput
                placeholder="Repeat password"
                secureTextEntry
                style={styles.editableInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => { setIsPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              >
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.updateBtn, isSavingPassword && { opacity: 0.6 }]}
                onPress={handleChangePassword}
                disabled={isSavingPassword}
              >
                <ThemedText style={styles.updateBtnText}>{isSavingPassword ? 'Saving…' : 'Update'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AI Skill Assessment Modal -> Floating Widget */}
      {isAssessmentOpen && (
        <RNAnimated.View style={[
          styles.floatingTestWidget,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
        ]}>
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <View style={styles.dragPill} />
          </View>

          {isTestMinimized ? (
            <View style={styles.minimizedContent}>
              <ThemedText style={styles.minTitle}>{testSkillName} Test</ThemedText>
              <ThemedText style={styles.minSub}>{testTimer}s elapsed - Paused</ThemedText>
              <TouchableOpacity onPress={() => setIsTestMinimized(false)} style={styles.resumeBtn}>
                <ThemedText style={styles.resumeBtnText}>Resume</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.expandedContent}>
              <View style={[styles.assessHeader, { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 16 }]}>
                <TouchableOpacity onPress={() => setIsTestMinimized(true)}>
                  <ChevronDown size={28} color="#000" />
                </TouchableOpacity>
                <ThemedText style={styles.assessBrand}>Dodorez Test</ThemedText>
                <TouchableOpacity onPress={closeTest}>
                  <XCircle size={24} color="#000" />
                </TouchableOpacity>
              </View>

              {showResultsScreen && finalTestResult ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
                  <View style={{
                    width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center',
                    backgroundColor: finalTestResult.passed ? '#ECFDF5' : '#FEF2F2',
                  }}>
                    {finalTestResult.passed
                      ? <CheckCircle2 size={36} color="#10B981" />
                      : <XCircle size={36} color="#EF4444" />}
                  </View>
                  <ThemedText style={{ fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' }}>
                    {finalTestResult.passed ? 'Skill Verified!' : 'Not Quite — Try Again Later'}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 14, lineHeight: 20, color: '#6B7280', fontFamily: Fonts.poppins }}>
                    Score: {finalTestResult.score}%
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#9CA3AF', fontFamily: Fonts.poppins, textAlign: 'center', paddingHorizontal: 20 }}>
                    {finalTestResult.passed
                      ? `${testSkillName} has been added to your verified skills.`
                      : 'You can retry this test after the cooldown period.'}
                  </ThemedText>
                  <TouchableOpacity onPress={closeTest} style={[styles.nextBtn, { width: '100%', marginTop: 8 }]}>
                    <ThemedText style={styles.nextBtnText}>Done</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : !testQuestion || isLoadingQuestion ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#FFCE48" />
                </View>
              ) : (
                <>
                  {/* The question/options/feedback area used to be an
                      unbounded absolute-positioned View with no scroll —
                      a long AI-generated explanation (routine for a wrong
                      answer, which typically has to explain what's right
                      AND why the selection was wrong) could push the
                      "Next Question" button past the bottom of the screen
                      with no way to reach it. Bounding this area and
                      making it scroll, while keeping the button as a
                      sibling *after* it (not inside), keeps the button
                      always visible/pinned regardless of content length. */}
                  <ScrollView
                    // Fixed chrome around this area (widget's top offset 50 +
                    // drag handle 30 + header ~45 + footer/button ~76) is
                    // ~201px — verified against the actual style values, not
                    // guessed. Reserving 260 leaves a small safety margin for
                    // status-bar/notch variance Dimensions.get('window')
                    // doesn't always capture, while still showing
                    // meaningfully more content before scrolling is needed.
                    style={{ maxHeight: Math.max(300, windowHeight - 260) }}
                    // Visible (unlike most decorative ScrollViews in this
                    // file) — this one can genuinely overflow with a long
                    // AI-generated explanation, so "there's more below"
                    // needs to be discoverable, not just technically reachable.
                    showsVerticalScrollIndicator={true}
                  >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <ThemedText style={styles.assessStepText}>{testQuestion.questionNumber} of {testQuestion.totalQuestions} Questions</ThemedText>
                    <View style={styles.assessTimer}>
                      <Clock size={14} color="#EF4444" />
                      <ThemedText style={styles.assessTimerText}>{testTimer}s</ThemedText>
                    </View>
                  </View>

                  <View style={styles.assessProgressContainer}>
                    <View style={[styles.assessProgress, { width: `${(testQuestion.questionNumber / testQuestion.totalQuestions) * 100}%` }]} />
                  </View>

                  <Animated.View key={testQuestion.questionNumber} entering={FadeInRight} style={styles.assessCard}>
                    <ThemedText style={styles.assessQuestion}>{testQuestion.question}</ThemedText>

                    <View style={styles.optionsList}>
                      {testQuestion.options.map((opt, idx) => {
                        const letter = ['A', 'B', 'C', 'D'][idx];
                        const isSelected = selectedAnswer === opt;
                        return (
                          <TouchableOpacity
                            key={idx}
                            disabled={!!testFeedback}
                            style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                            onPress={() => setSelectedAnswer(opt)}
                          >
                            <View style={[styles.optionCircle, isSelected && styles.optionCircleSelected]}>
                              <ThemedText style={[styles.optionIdText, isSelected && { color: '#fff' }]}>{letter}</ThemedText>
                            </View>
                            <ThemedText style={styles.optionText}>{opt}</ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {testFeedback && (
                      <View style={{
                        marginTop: 12, padding: 12, borderRadius: 12,
                        backgroundColor: testFeedback.isCorrect ? '#ECFDF5' : '#FEF2F2',
                      }}>
                        <ThemedText style={{ fontFamily: Fonts.poppinsBold, fontSize: 13, lineHeight: 19, color: testFeedback.isCorrect ? '#10B981' : '#EF4444', marginBottom: 4 }}>
                          {testFeedback.isCorrect ? 'Correct!' : 'Incorrect'}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#6B7280', fontFamily: Fonts.poppins }}>
                          {testFeedback.explanation}
                        </ThemedText>
                      </View>
                    )}
                  </Animated.View>
                  </ScrollView>

                  <View style={[styles.assessFooter, { paddingHorizontal: 0, paddingBottom: 0 }]}>
                    <TouchableOpacity
                      style={[styles.nextBtn, (!selectedAnswer && !testFeedback) && { opacity: 0.5 }, { width: '100%' }]}
                      disabled={(!selectedAnswer && !testFeedback) || isSubmittingAnswer}
                      onPress={handlePrimaryButtonPress}
                    >
                      <ThemedText style={styles.nextBtnText}>
                        {isSubmittingAnswer
                          ? 'Submitting...'
                          : testFeedback
                            ? (testQuestion.questionNumber >= testQuestion.totalQuestions ? 'View Result' : 'Next Question')
                            : 'Submit Answer'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* Draggable Skill Context Tooltip (Local to Widget) */}
                  <RNAnimated.View
                    {...contextPanResponder.panHandlers}
                    style={[
                      styles.contextCard,
                      { transform: [{ translateX: contextPan.x }, { translateY: contextPan.y }] }
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <ThemedText style={styles.contextHeader}>Skill Context</ThemedText>
                      <MoreHorizontal size={14} color="#9CA3AF" />
                    </View>
                    <ThemedText style={styles.contextItem}>Skill: {testSkillName}</ThemedText>
                    <ThemedText style={styles.contextItem}>Difficulty: {testQuestion.skillArea}</ThemedText>
                  </RNAnimated.View>
                </>
              )}
            </View>
          )}
        </RNAnimated.View>
      )}

      {/* Photo Options Modal */}
      <Modal visible={isPhotoSheetOpen} transparent animationType="fade" onRequestClose={() => setIsPhotoSheetOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsPhotoSheetOpen(false)}
        >
          <View style={styles.photoSheet}>
            <View style={styles.photoSheetHeader}>
              <ThemedText style={styles.photoSheetTitle}>Profile Photo</ThemedText>
            </View>

            <TouchableOpacity style={styles.photoOption} onPress={handleImagePicker} disabled={checkingFace}>
              <View style={[styles.optionIconBox, { backgroundColor: '#E0F2FE' }]}>
                {checkingFace ? (
                  <ActivityIndicator size="small" color="#0EA5E9" />
                ) : (
                  <Camera size={20} color="#0EA5E9" />
                )}
              </View>
              <ThemedText style={styles.photoOptionText}>{checkingFace ? 'Checking photo…' : 'Take Photo'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.photoOption, { borderBottomWidth: 0 }]} onPress={removeImage}>
              <View style={[styles.optionIconBox, { backgroundColor: '#FEF2F2' }]}>
                <Trash2 size={20} color="#EF4444" />
              </View>
              <ThemedText style={[styles.photoOptionText, { color: '#EF4444' }]}>Remove Photo</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Media Viewer Modal */}
      <Modal visible={isViewerOpen} transparent animationType="fade" onRequestClose={() => setIsViewerOpen(false)}>
        <View style={styles.viewerOverlay}>
          <View style={[styles.viewerContainer, { flex: 1 }]}>
            <View style={[styles.viewerHeader, { paddingTop: insets.top + 10 }]}>
              <View>
                <ThemedText style={styles.viewerSkill}>{selectedMedia?.skill}</ThemedText>
                <ThemedText style={styles.viewerType}>
                  {selectedMedia?.type === 'video' ? 'Video Demonstration' : selectedMedia?.type === 'identity' ? 'Identity Document' : 'Work Proof Photo'}
                </ThemedText>
              </View>
              <TouchableOpacity style={styles.viewerClose} onPress={() => setIsViewerOpen(false)}>
                <XCircle size={32} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.mediaDisplayArea}>
              {selectedMedia?.type === 'video' ? (
                <Video
                  source={{ uri: selectedMedia.videoUrl }}
                  posterSource={{ uri: selectedMedia.uri }}
                  usePoster={true}
                  style={styles.fullVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                />
              ) : (
                <Image source={{ uri: selectedMedia?.uri }} style={styles.fullImage} contentFit="contain" />
              )}
            </View>

            {selectedMedia?.description && (
              <View style={styles.viewerFooter}>
                <ThemedText style={styles.viewerDescription}>{selectedMedia.description}</ThemedText>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* View All Portfolio Modal */}
      <Modal visible={isViewAllOpen} animationType="slide" onRequestClose={() => setIsViewAllOpen(false)}>
        <View style={styles.viewAllContainer}>
          <View style={[styles.viewAllHeader, { paddingTop: insets.top, height: 60 + insets.top }]}>
            <TouchableOpacity onPress={() => setIsViewAllOpen(false)} style={styles.viewAllBack}>
              <ChevronLeft size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.viewAllTitle}>Work Portfolio</ThemedText>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={styles.viewAllGrid}>
            <View style={styles.gridRow}>
              {proofs.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.gridItem}
                  onPress={() => {
                    setSelectedMedia(item);
                    setIsViewerOpen(true);
                  }}
                >
                  <Image source={{ uri: item.uri }} style={styles.gridImg} contentFit="cover" transition={300} />
                  {item.type === 'video' && (
                    <View style={styles.gridPlayIcon}>
                      <Play size={16} color="#fff" fill="#fff" />
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDeleteProof(item.id)}
                    style={[styles.proofDeleteBtn, { top: 8, left: 8 }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={14} color="#fff" />
                  </TouchableOpacity>
                  <View style={styles.gridTag}>
                    <ThemedText style={styles.gridTagText}>{item.skill}</ThemedText>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Skill Tagging Modal */}
      <Modal visible={showTagModal} transparent animationType="slide" onRequestClose={() => setShowTagModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding" automaticOffset>
          <View style={styles.tagModalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Add Skill Proof</ThemedText>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <XCircle size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Media Preview — supports a batch of multiple files */}
              {pendingMediaBatch.length > 0 && (
                <View style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
                  <ThemedText style={{ fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#9CA3AF', marginBottom: 10 }}>
                    {pendingMediaBatch.length} file{pendingMediaBatch.length !== 1 ? 's' : ''} selected
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {pendingMediaBatch.map((item, idx) => (
                        <View key={idx} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#000', overflow: 'hidden' }}>
                          {item.type === 'video' ? (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
                              <Play size={22} color="#fff" fill="#fff" />
                            </View>
                          ) : (
                            <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                          )}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              <View style={{ padding: 20, gap: 16 }}>
                {/* Description */}
                <View>
                  <ThemedText style={styles.tagFieldLabel}>Description</ThemedText>
                  <TextInput
                    style={styles.tagDescInput}
                    placeholder="Describe what this photo/video shows..."
                    placeholderTextColor="#9CA3AF"
                    value={tagDescription}
                    onChangeText={setTagDescription}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Skill Search */}
                <View>
                  <ThemedText style={styles.tagFieldLabel}>Tag a Skill</ThemedText>
                  <View style={styles.tagSearchBar}>
                    <Search size={16} color="#9CA3AF" />
                    <TextInput
                      style={styles.tagSearchInput}
                      placeholder="Search skills..."
                      placeholderTextColor="#9CA3AF"
                      value={skillSearch}
                      onChangeText={setSkillSearch}
                    />
                  </View>

                  {selectedTagSkill && (
                    <View style={styles.selectedSkillBadge}>
                      <CheckCircle2 size={14} color="#10B981" />
                      <ThemedText style={styles.selectedSkillBadgeText}>{selectedTagSkill}</ThemedText>
                      <TouchableOpacity onPress={() => setSelectedTagSkill(null)}>
                        <XCircle size={16} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {apiSkills.length === 0 ? (
                    <ThemedText style={{ fontSize: 13, lineHeight: 19, color: '#9CA3AF', fontFamily: Fonts.poppins, paddingVertical: 8 }}>
                      Add a skill to your profile first before tagging proof media.
                    </ThemedText>
                  ) : (
                    <View style={styles.tagGrid}>
                      {filteredSkills.map(skill => (
                        <TouchableOpacity
                          key={skill}
                          onPress={() => setSelectedTagSkill(skill)}
                          style={[styles.tagItem, selectedTagSkill === skill && styles.tagItemSelected]}
                        >
                          <ThemedText style={[styles.tagText, selectedTagSkill === skill && styles.tagTextSelected]}>{skill}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Submit Button */}
            <View style={styles.tagSubmitRow}>
              <TouchableOpacity
                style={[styles.tagSubmitBtn, (!selectedTagSkill || isUploadingProof) && { opacity: 0.4 }]}
                onPress={handleAddProof}
                disabled={!selectedTagSkill || isUploadingProof}
              >
                <ThemedText style={styles.tagSubmitText}>
                  {isUploadingProof
                    ? `Uploading${pendingMediaBatch.length > 1 ? ` ${pendingMediaBatch.length} Files` : ''}...`
                    : `Add ${pendingMediaBatch.length > 1 ? `${pendingMediaBatch.length} Files` : 'to Portfolio'}`}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full Job History Modal */}
      <Modal visible={isJobHistoryOpen} animationType="slide" onRequestClose={() => setIsJobHistoryOpen(false)}>
        <View style={styles.viewAllContainer}>
          <View style={[styles.viewAllHeader, { paddingTop: insets.top, height: 60 + insets.top }]}>
            <TouchableOpacity onPress={() => setIsJobHistoryOpen(false)} style={styles.viewAllBack}>
              <ChevronLeft size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.viewAllTitle}>Complete Job History</ThemedText>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
            {jobHistory.length === 0 ? (
              <ThemedText style={{ color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, textAlign: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
                No job history yet. Completed jobs will appear here.
              </ThemedText>
            ) : (
              jobHistory.map((item, index) => renderJobHistoryItem(item, index))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Available Slots Management Modal */}
      <Modal visible={isSlotModalOpen} animationType="slide" onRequestClose={() => setIsSlotModalOpen(false)}>
        <View style={styles.viewAllContainer}>
          <View style={[styles.viewAllHeader, { paddingTop: insets.top, height: 60 + insets.top }]}>
            <TouchableOpacity onPress={() => setIsSlotModalOpen(false)} style={styles.viewAllBack}>
              <ChevronLeft size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.viewAllTitle}>Availability Schedule</ThemedText>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={{ padding: 20 }}>
            <View style={styles.slotAddContainer}>
              <ThemedText style={styles.slotFormTitle}>Add New Slot</ThemedText>
              <ThemedText style={styles.slotFormSub}>Declare your working hours so customers can book you.</ThemedText>

              <View style={{ gap: 16 }}>
                <View style={{ gap: 8 }}>
                  <ThemedText style={styles.slotInputLabel}>Select Date</ThemedText>
                  <TouchableOpacity style={styles.slotPickerFullBtn} onPress={() => setPickerMode('date')}>
                    <CalendarDays size={18} color="#6B7280" />
                    <ThemedText style={styles.slotPickerText}>
                      {newSlotDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <ThemedText style={styles.slotInputLabel}>Start Time</ThemedText>
                    <TouchableOpacity style={styles.slotPickerFullBtn} onPress={() => setPickerMode('start')}>
                      <Clock size={16} color="#6B7280" />
                      <ThemedText style={styles.slotPickerText}>
                        {formatTime(newSlotStart)}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flex: 1, gap: 8 }}>
                    <ThemedText style={styles.slotInputLabel}>End Time</ThemedText>
                    <TouchableOpacity style={styles.slotPickerFullBtn} onPress={() => setPickerMode('end')}>
                      <Clock size={16} color="#6B7280" />
                      <ThemedText style={styles.slotPickerText}>
                        {formatTime(newSlotEnd)}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.slotAddSubmitBtn, { marginTop: 24, opacity: isSavingSlot ? 0.6 : 1 }]}
                onPress={handleAddSlot}
                disabled={isSavingSlot}
              >
                <ThemedText style={styles.slotAddSubmitText}>{isSavingSlot ? 'Scheduling...' : 'Schedule Slot'}</ThemedText>
              </TouchableOpacity>
            </View>

            <ThemedText style={[styles.slotFormTitle, { marginTop: 32, marginBottom: 12 }]}>Your Scheduled Slots</ThemedText>
            {activeSlots.length === 0 && (
              <ThemedText style={styles.slotFormSub}>You have no open availability.</ThemedText>
            )}
            {activeSlots.map(slot => (
              <View key={slot.id} style={styles.slotListItem}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.slotListDate}>
                    {(() => {
                      const [y, m, d] = slot.date.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
                    })()}
                  </ThemedText>
                  <ThemedText style={styles.slotListTime}>{slot.startTime} to {slot.endTime}</ThemedText>
                </View>
                <TouchableOpacity onPress={() => handleDeleteSlot(slot.id)} style={styles.slotDeleteBtn}>
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal >

      {/* Web Custom Picker Modal */}
      {/* Custom Picker Modal (Universal) */}
      {
        pickerMode !== null && (
          <Modal visible={true} transparent animationType="fade" onRequestClose={() => setPickerMode(null)}>
            <Pressable style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]} onPress={() => setPickerMode(null)}>
              <Animated.View entering={ZoomIn.duration(200)} style={styles.webPickerCard}>
                <View style={styles.webPickerHeader}>
                  <ThemedText style={styles.webPickerTitle}>
                    {pickerMode === 'date' ? 'Select Date' : pickerMode === 'start' ? 'Start Time' : 'End Time'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => setPickerMode(null)}>
                    <XCircle size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {pickerMode === 'date' ? (
                  <View style={{ alignItems: 'center' }}>
                    <Calendar
                      onDayPress={(day: any) => {
                        const selectedDate = new Date(day.timestamp);
                        setNewSlotDate(selectedDate);

                        // Sync start and end times to the newly selected date
                        if (newSlotStart) {
                          const newStart = new Date(selectedDate);
                          newStart.setHours(newSlotStart.getHours(), newSlotStart.getMinutes(), 0, 0);
                          setNewSlotStart(newStart);
                        }
                        if (newSlotEnd) {
                          const newEnd = new Date(selectedDate);
                          newEnd.setHours(newSlotEnd.getHours(), newSlotEnd.getMinutes(), 0, 0);
                          setNewSlotEnd(newEnd);
                        }
                      }}
                      markedDates={{
                        [getLocalISODate(newSlotDate)]: { selected: true, selectedColor: '#FFCE48', selectedTextColor: '#000' }
                      }}
                      theme={{
                        todayTextColor: '#FFCE48',
                        selectedDayBackgroundColor: '#FFCE48',
                        selectedDayTextColor: '#000',
                        arrowColor: '#FFCE48',
                        textMonthFontFamily: Fonts.poppinsBold,
                        textDayHeaderFontFamily: Fonts.poppinsSemiBold,
                        textDayFontFamily: Fonts.poppins,
                        calendarBackground: '#ffffff',
                      }}
                      minDate={new Date().toISOString().split('T')[0]}
                      style={{ borderRadius: 12, width: '100%' }}
                    />
                    <TouchableOpacity
                      style={[styles.slotAddSubmitBtn, { width: '100%', marginTop: 20 }]}
                      onPress={() => setPickerMode(null)}
                    >
                      <ThemedText style={styles.slotAddSubmitText}>Confirm Date</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <View style={styles.timePickerContainer}>
                      <View style={styles.timeColumn}>
                        <ThemedText style={styles.timeColumnTitle}>Hour</ThemedText>
                        <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                          {Array.from({ length: 24 }, (_, i) => i).map(h => {
                            const currentVal = pickerMode === 'start' ? newSlotStart : newSlotEnd;
                            const isSelected = currentVal && currentVal.getHours() === h;
                            return (
                              <TouchableOpacity
                                key={h}
                                style={[styles.timeOption, isSelected && styles.timeOptionSelected]}
                                onPress={() => {
                                  const d = new Date(newSlotDate);
                                  d.setHours(h, currentVal ? currentVal.getMinutes() : 0);
                                  if (pickerMode === 'start') setNewSlotStart(d);
                                  else setNewSlotEnd(d);
                                }}
                              >
                                <ThemedText style={[styles.timeOptionText, isSelected && styles.timeOptionTextSelected]}>
                                  {h.toString().padStart(2, '0')}
                                </ThemedText>
                                {isSelected && <View style={styles.selectedDot} />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                      <View style={styles.timeColumnDivider} />
                      <View style={styles.timeColumn}>
                        <ThemedText style={styles.timeColumnTitle}>Minute</ThemedText>
                        <ScrollView style={styles.timePickerScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => {
                            const currentVal = pickerMode === 'start' ? newSlotStart : newSlotEnd;
                            const isSelected = currentVal && currentVal.getMinutes() === m;
                            return (
                              <TouchableOpacity
                                key={m}
                                style={[styles.timeOption, isSelected && styles.timeOptionSelected]}
                                onPress={() => {
                                  const d = new Date(newSlotDate);
                                  d.setHours(currentVal ? currentVal.getHours() : 9, m);
                                  if (pickerMode === 'start') setNewSlotStart(d);
                                  else setNewSlotEnd(d);
                                }}
                              >
                                <ThemedText style={[styles.timeOptionText, isSelected && styles.timeOptionTextSelected]}>
                                  {m.toString().padStart(2, '0')}
                                </ThemedText>
                                {isSelected && <View style={styles.selectedDot} />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.slotAddSubmitBtn, { width: '100%', marginTop: 20 }]}
                      onPress={() => setPickerMode(null)}
                    >
                      <ThemedText style={styles.slotAddSubmitText}>Confirm Time</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            </Pressable>
          </Modal>
        )
      }

      {/* Custom Alert Modal */}
      {/* Earnings Modal — real totals + payout history, Stripe manages the
          actual bank account and payout schedule on its own hosted dashboard */}
      <Modal visible={isEarningsModalOpen} animationType="slide" transparent={false} onRequestClose={() => setIsEarningsModalOpen(false)}>
        <View style={styles.walletModalContainer}>
          <View style={[styles.walletHeaderLarge, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
            <TouchableOpacity onPress={() => setIsEarningsModalOpen(false)} style={styles.headerBackBtn}>
              <ChevronLeft size={28} color="#000" />
            </TouchableOpacity>
            <ThemedText style={styles.walletHeaderTitleLarge}>Earnings</ThemedText>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.walletContentArea}>
            <View style={styles.walletBalanceCardLarge}>
              <ThemedText style={styles.walletBalanceLabelLarge}>Total Paid Out</ThemedText>
              <ThemedText style={styles.walletBalanceValueLarge}>${earnings.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</ThemedText>
              <View style={styles.walletBalanceBadgeLarge}>
                <Zap size={14} color="#D97706" />
                <ThemedText style={styles.walletBalanceBadgeTextLarge}>{earnings.jobsPaidOut} job{earnings.jobsPaidOut === 1 ? '' : 's'} paid</ThemedText>
              </View>
            </View>

            {earnings.pending > 0 && (
              <View style={[styles.walletBalanceCardLarge, { marginTop: 12 }]}>
                <ThemedText style={styles.walletBalanceLabelLarge}>Pending (jobs in progress)</ThemedText>
                <ThemedText style={[styles.walletBalanceValueLarge, { fontSize: 24 }]}>${earnings.pending.toFixed(2)}</ThemedText>
              </View>
            )}

            <View style={styles.withdrawalSection}>
              <TouchableOpacity
                style={styles.withdrawalConfirmBtn}
                onPress={handleOpenConnectDashboard}
                disabled={isDashboardLinkLoading}
              >
                {isDashboardLinkLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <ThemedText style={styles.withdrawalConfirmBtnText}>Manage Payouts on Stripe</ThemedText>
                )}
              </TouchableOpacity>
              <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#6B7280', fontFamily: Fonts.poppins, textAlign: 'center', marginTop: 10 }}>
                Your bank account and payout schedule are managed directly through Stripe — money is deposited automatically after each completed job.
              </ThemedText>
            </View>

            <ThemedText style={[styles.sectionTitleSmall, { marginTop: 24 }]}>Recent Payouts</ThemedText>
            {recentPayouts.length === 0 ? (
              <ThemedText style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, paddingVertical: 12 }}>
                Nothing paid out yet — this fills in as jobs complete.
              </ThemedText>
            ) : (
              recentPayouts.map(p => (
                <View key={p.jobId} style={styles.paymentInfoDisplay}>
                  <Landmark size={20} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.paymentInfoTextLarge}>{p.jobTitle}</ThemedText>
                    <ThemedText style={styles.paymentInfoSubTextLarge}>
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' }}>
                    ${p.amount.toFixed(2)}
                  </ThemedText>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Add Skill Modal */}
      <Modal visible={isAddSkillOpen} animationType="slide" transparent onRequestClose={() => setIsAddSkillOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: themeColors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <ThemedText style={{ fontSize: 20, lineHeight: 26, fontFamily: Fonts.poppinsBold, color: themeColors.textPrimary }}>
                {addSkillProfession ? addSkillProfession : 'Select Profession'}
              </ThemedText>
              <TouchableOpacity onPress={() => setIsAddSkillOpen(false)}>
                <XCircle size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!addSkillProfession ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {/* "Personal Errands" is excluded here — it's gated on identity
                    verification via the dedicated Pickup & Delivery toggle
                    above, not addable/testable through this generic flow. */}
                {professionsList.filter(name => name !== 'Personal Errands').map(name => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => fetchSkillsForProfession(name)}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                  >
                    <ThemedText style={{ fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsSemiBold, color: themeColors.textPrimary }}>{name}</ThemedText>
                    <ChevronRight size={18} color={themeColors.border} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <TouchableOpacity
                  onPress={() => { setAddSkillProfession(''); setAddSkillList([]); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}
                >
                  <ChevronLeft size={16} color="#FFCE48" />
                  <ThemedText style={{ fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#FFCE48' }}>Change Profession</ThemedText>
                </TouchableOpacity>
                <ThemedText style={{ fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: themeColors.textSecondary, marginBottom: 16 }}>
                  Tap a skill to add it to your profile
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 20 }}>
                  {addSkillList.map(skill => {
                    const alreadyAdded = apiSkills.some(s => s.name === skill.name);
                    return (
                      <TouchableOpacity
                        key={skill.name}
                        disabled={alreadyAdded || isAddingSkill}
                        onPress={() => handleAddSkill(skill.name, skill.id)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                          borderColor: alreadyAdded ? themeColors.border : '#FFCE48',
                          backgroundColor: alreadyAdded ? themeColors.inputFilled : 'transparent',
                          opacity: alreadyAdded ? 0.5 : 1,
                        }}
                      >
                        <ThemedText style={{ fontSize: 13, fontFamily: alreadyAdded ? Fonts.poppins : Fonts.poppinsSemiBold, color: alreadyAdded ? themeColors.textMuted : themeColors.textPrimary }}>
                          {skill.name}{alreadyAdded ? ' ✓' : ' +'}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={customAlert.visible} transparent animationType="fade" onRequestClose={hideAlert}>
        <View style={[styles.modalOverlay, { justifyContent: 'center', padding: 20 }]}>
          <Animated.View entering={FadeIn.duration(300)} style={styles.customAlertContainer}>
            <View style={[styles.alertIconContainer, { backgroundColor: customAlert.type === 'success' ? '#ECFDF5' : customAlert.type === 'delete' ? '#FEF2F2' : '#FFFBEB' }]}>
              {customAlert.type === 'success' ? (
                <CheckCircle2 size={32} color="#10B981" />
              ) : customAlert.type === 'delete' ? (
                <Trash2 size={32} color="#EF4444" />
              ) : (
                <AlertTriangle size={32} color="#F59E0B" />
              )}
            </View>

            <ThemedText style={styles.alertTitle}>{customAlert.title}</ThemedText>
            <ThemedText style={styles.alertMessage}>{customAlert.message}</ThemedText>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: customAlert.type === 'success' ? '#10B981' : customAlert.type === 'delete' ? '#EF4444' : '#F59E0B' }]}
              onPress={hideAlert}
            >
              <ThemedText style={styles.alertButtonText}>Got it!</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

    </ThemedView>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
  container: {
    flex: 1,
  },
  headerFixed: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    backgroundColor: t.card,
    paddingBottom: 15,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: t.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  profileTabRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    backgroundColor: t.surface,
    borderRadius: 14,
    padding: 4,
    // A visible border, not just a background-color shift, so the whole
    // row reads as its own distinct control sitting under the header
    // rather than blending into it (both are light/white-ish otherwise).
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  profileTabBtn: {
    flex: 1,
    flexDirection: 'column',
    gap: 3,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  profileTabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  profileTabText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#9CA3AF',
  },
  profileTabTextActive: {
    color: '#111827',
    fontFamily: Fonts.poppinsBold,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: t.card,
    margin: 20,
    borderRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  // Same visual language as editAvatarBtn (white circle, subtle border +
  // shadow) so both read as the same kind of control, just pinned to the
  // card's corner instead of the avatar's.
  editProfileBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: t.card,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    zIndex: 1,
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: t.borderSubtle,
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: t.card,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  mainInfo: {
    flex: 1,
    // Clears the absolutely-positioned editProfileBtn pinned to the card's
    // top-right corner, so a long name wrapping to two lines can't render
    // underneath/behind it.
    paddingRight: 40,
  },
  profileName: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  profileRole: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginBottom: 8,
  },
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  availabilityText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#10B981',
  },
  skillMeterContainer: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  skillMeterLeft: {
    flex: 1,
  },
  sectionTitleSmall: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  sectionSubtitleSmall: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginBottom: 12,
  },
  meterTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  meterTagText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
  },
  meterCircleWrapper: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meterPercentage: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  sparkleIcon: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  sectionDescription: {
    fontSize: 13,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  skillsSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  skillsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  skillCountText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  skillsListFull: {
    gap: 12,
  },
  skillItemFull: {
    backgroundColor: t.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  skillDeleteBtn: {
    marginLeft: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillMainInfo: {
    flex: 1,
  },
  skillMainLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  skillStatsSmall: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textMuted,
  },
  testActionBtn: {
    backgroundColor: '#FFCE48',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#FFCE48',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  testBtnText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  gallerySection: {
    marginTop: 32,
  },
  sectionHeaderInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  viewAllBtn: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: '#FFCE48',
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  verificationLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  verificationSubtext: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginTop: 2,
  },
  verificationActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  verificationActionText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsBold,
    color: '#D97706',
  },
  mediaHorizontalScroll: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 16,
    paddingBottom: 20,
  },
  mediaGalleryCard: {
    width: 280,
    height: 180,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 6,
  },
  proofDeleteBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  typeBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 3,
  },
  typeBadgeText: {
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Fonts.poppinsBold,
    letterSpacing: 0.5,
  },
  cardGradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0)',
    // Simulated gradient via shadow trick
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -30 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  cardBottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centrePlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    zIndex: 4,
  },
  cardSkillTag: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
  },
  miniPlayIcon: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  addProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    margin: 20,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderStyle: 'dashed',
    gap: 12,
  },
  plusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addProofText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#B45309',
  },
  uploadTip: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  statsScroll: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 12,
  },
  statCard: {
    backgroundColor: t.card,
    width: 130,
    height: 90,
    padding: 16,
    borderRadius: 20,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statValue: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 16,
  },
  reviewsList: {
    paddingHorizontal: 20,
    gap: 15,
  },
  reviewCard: {
    backgroundColor: t.card,
    padding: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  reviewUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reviewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  reviewedJob: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.borderSubtle,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFCE48',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#D97706',
  },
  assessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: t.borderSubtle,
  },
  assessBrand: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  assessTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
    marginBottom: 4,
  },
  assessSub: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
    marginBottom: 24,
  },
  assessProgressContainer: {
    height: 6,
    backgroundColor: t.borderSubtle,
    borderRadius: 3,
    marginBottom: 12,
  },
  assessProgress: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  assessStepText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  assessTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  assessTimerText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: '#EF4444',
  },
  assessCard: {
    backgroundColor: t.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  assessQuestion: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 24,
    lineHeight: 24,
  },
  optionsList: {
    gap: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    backgroundColor: t.surface,
  },
  optionItemSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  optionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: t.card,
  },
  optionCircleSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  optionIdText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textSecondary,
  },
  optionText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
    flex: 1,
  },
  contextCard: {
    position: 'absolute',
    right: -20,
    top: -20,
    backgroundColor: t.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    width: 140,
    zIndex: 10,
  },
  contextHeader: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 4,
  },
  contextItem: {
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginBottom: 2,
  },
  aiFeedbackArea: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  aiLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  aiStatus: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppins,
    color: '#3B82F6',
    fontStyle: 'italic',
  },
  confidenceCircle: {
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: t.border,
    paddingLeft: 15,
  },
  confidenceNum: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: '#10B981',
  },
  confidenceLabel: {
    fontSize: 9,
    lineHeight: 15,
    fontFamily: Fonts.poppinsBold,
    color: t.textSecondary,
    marginTop: -2,
  },
  assessFooter: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  nextBtn: {
    height: 56,
    backgroundColor: '#FFCE48',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCE48',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  nextBtnText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  levelBadgeMini: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
  },
  levelTextMini: {
    fontSize: 8,
    lineHeight: 14,
    fontFamily: Fonts.poppinsBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skillBadgeRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 6,
  },
  mediaTypeIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 2,
  },
  mediaTypeText: {
    color: '#fff',
    fontSize: 8,
    lineHeight: 14,
    fontFamily: Fonts.poppinsBold,
    textTransform: 'uppercase',
  },
  mediaTypeIconSmall: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  playIconOverlayLarge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  exitBtn: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#000',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitBtnText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#000',
  },
  skillTagFloating: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(255,206,72,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  skillTagFloatingSmall: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  skillTagText: {
    fontSize: 9,
    lineHeight: 15,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  skillTagTextSmall: {
    fontSize: 8,
    lineHeight: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  mediaCardImg: {
    width: '100%',
    height: '100%',
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  viewerContainer: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  viewerSkill: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
  },
  viewerType: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppins,
  },
  viewerClose: {
    padding: 8,
  },
  mediaDisplayArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  viewerFooter: {
    padding: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerDescription: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Fonts.poppins,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: t.card,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  settingsList: {
    gap: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  settingLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  closeModalButton: {
    backgroundColor: t.surface,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  closeModalButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: t.textMuted,
  },
  modalHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: t.card,
    borderBottomWidth: 1,
    borderBottomColor: t.borderSubtle,
  },
  modalHeaderTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  termsContent: {
    padding: 24,
  },
  termsTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 8,
    marginTop: 16,
  },
  termsText: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  inputStack: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
    marginBottom: 8,
  },
  editableInput: {
    backgroundColor: t.surface,
    borderRadius: 16,
    padding: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: t.textPrimary,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: t.surface,
  },
  updateBtn: {
    backgroundColor: '#FFCE48',
  },
  cancelBtnText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: t.textSecondary,
  },
  updateBtnText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  photoSheet: {
    backgroundColor: t.card,
    width: '90%',
    borderRadius: 24,
    padding: 24,
    alignSelf: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  photoSheetHeader: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.borderSubtle,
    paddingBottom: 12,
  },
  photoSheetTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  photoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoOptionText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#344054',
  },
  customAlertContainer: {
    backgroundColor: t.card,
    width: '85%',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    alignSelf: 'center',
  },
  alertIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  alertButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  viewAllContainer: {
    flex: 1,
    backgroundColor: t.card,
  },
  viewAllHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: t.borderSubtle,
  },
  viewAllBack: {
    padding: 4,
  },
  viewAllTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  viewAllGrid: {
    padding: 16,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  gridItem: {
    width: (width - 44) / 2,
    height: 160,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    marginBottom: 4,
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridPlayIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridTag: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  gridTagText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Fonts.poppinsBold,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: '#FFCE4815',
    borderWidth: 1,
    borderColor: '#FFCE48',
  },
  tagText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  tagItemSelected: {
    backgroundColor: '#FFCE48',
    borderColor: '#D97706',
  },
  tagTextSelected: {
    color: '#000',
  },
  tagModalContent: {
    backgroundColor: t.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    flex: 1,
    marginTop: 'auto',
  },
  tagMediaPreview: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    position: 'relative',
  },
  tagPreviewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tagVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  tagPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  tagVideoLabel: {
    color: '#fff',
    fontFamily: Fonts.poppinsBold,
    fontSize: 14,
  },
  tagFieldLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginBottom: 8,
  },
  tagDescInput: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: t.textPrimary,
    minHeight: 80,
    backgroundColor: t.surface,
  },
  tagSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  tagSearchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: t.textPrimary,
  },
  selectedSkillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  selectedSkillBadgeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: '#166534',
  },
  tagSubmitRow: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: t.borderSubtle,
  },
  tagSubmitBtn: {
    backgroundColor: '#FFCE48',
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCE48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  tagSubmitText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  historyCard: {
    backgroundColor: t.card,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  historySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppins,
    color: t.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Fonts.poppinsBold,
  },
  ratingSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingValue: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    marginLeft: 4,
  },
  priceText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppins,
    fontStyle: 'italic',
    color: t.textSecondary,
    backgroundColor: t.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  metricsContainer: {
    gap: 10,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricLabel: {
    width: 80,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  metricBar: {
    flex: 1,
    height: 4,
    backgroundColor: t.borderSubtle,
    borderRadius: 2,
  },
  metricFill: {
    height: '100%',
    backgroundColor: '#FFCE48',
    borderRadius: 2,
  },
  historyHelpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: t.borderSubtle,
    marginTop: 16,
    paddingTop: 16,
  },
  historyHelpText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  cancellationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  cancellationReasonText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#EF4444',
  },
  floatingTestWidget: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: t.card,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
    zIndex: 9999,
  },
  dragHandleArea: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragPill: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  minimizedContent: {
    padding: 20,
    paddingTop: 0,
    alignItems: 'center',
  },
  minTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    marginBottom: 4,
    color: t.textPrimary,
  },
  minSub: {
    fontSize: 13,
    lineHeight: 19,
    color: t.textSecondary,
    marginBottom: 16,
    fontFamily: Fonts.poppins,
  },
  resumeBtn: {
    backgroundColor: '#FFCE48',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  resumeBtnText: {
    fontFamily: Fonts.poppinsBold,
    fontSize: 14,
    color: '#000',
  },
  expandedContent: {
    padding: 24,
    paddingTop: 0,
  },
  slotCardSmall: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    borderRadius: 16,
    padding: 12,
    minWidth: 120,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 4,
  },
  slotDateText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  slotTimeText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  slotAddContainer: {
    backgroundColor: t.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: t.border,
  },
  slotFormTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  slotFormSub: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
    marginBottom: 24,
  },
  slotInputLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: t.textSecondary,
    marginBottom: 8,
  },
  slotPickerFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: t.border,
    gap: 12,
  },
  slotPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 6,
  },
  slotPickerText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  slotAddSubmitBtn: {
    backgroundColor: '#FFCE48',
    paddingVertical: 14,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotAddSubmitText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  slotListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  slotListDate: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  slotListTime: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  slotDeleteBtn: {
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  webPickerCard: {
    backgroundColor: t.card,
    borderRadius: 24,
    width: '90%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  webPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  webPickerTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  timePickerScroll: {
    maxHeight: 300,
  },
  timePickerContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  timeColumn: {
    flex: 1,
  },
  timeColumnTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  timeOption: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 4,
  },
  timeOptionSelected: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FFCE48',
  },
  timeOptionText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  timeOptionTextSelected: {
    fontFamily: Fonts.poppinsBold,
    color: '#D97706',
  },
  walletCardMini: {
    backgroundColor: t.card,
    marginHorizontal: 20,
    marginTop: -8,
    marginBottom: 20,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFFBEB',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  walletHeaderMini: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  walletLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletTitleMini: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: '#92400E',
  },
  withdrawSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  withdrawSmallText: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsBold,
    color: '#D97706',
  },
  walletBalanceRowMini: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  currencyMini: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  balanceMini: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
  },
  walletStatsMini: {
    marginTop: 8,
    flexDirection: 'row',
  },
  walletStatItemMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  walletStatTextMini: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Fonts.poppinsMedium,
    color: '#10B981',
  },
  walletModalContainer: {
    flex: 1,
    backgroundColor: t.surface,
  },
  walletHeaderLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: t.card,
    borderBottomWidth: 1,
    borderBottomColor: t.borderSubtle,
  },
  walletHeaderTitleLarge: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  walletContentArea: {
    flex: 1,
    padding: 20,
  },
  walletBalanceCardLarge: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  walletBalanceLabelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppins,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  walletBalanceValueLarge: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
    marginBottom: 16,
  },
  walletBalanceBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,206,72,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  walletBalanceBadgeTextLarge: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppinsMedium,
    color: '#FFCE48',
  },
  withdrawalSection: {
    backgroundColor: t.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: t.borderSubtle,
  },
  withdrawInputGroup: {
    marginTop: 16,
    marginBottom: 20,
  },
  withdrawInputLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsMedium,
    color: t.textSecondary,
    marginBottom: 8,
  },
  withdrawAmountInput: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: t.borderSubtle,
    paddingVertical: 8,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  methodOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  methodOptionActive: {
    borderColor: '#FFCE48',
    backgroundColor: '#FFFBEB',
  },
  methodText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsBold,
    color: t.textSecondary,
  },
  methodTextActive: {
    color: '#D97706',
  },
  paymentInfoDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  paymentInfoTextLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: t.textPrimary,
  },
  paymentInfoSubTextLarge: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.poppins,
    color: t.textSecondary,
  },
  addPaymentPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    marginBottom: 24,
    justifyContent: 'center',
  },
  addPaymentPromptText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsMedium,
    color: t.textSecondary,
  },
  withdrawalConfirmBtn: {
    backgroundColor: '#FFCE48',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  withdrawalConfirmBtnText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsBold,
    color: '#000',
  },
  methodSelectorLarge: {
    flexDirection: 'row',
    backgroundColor: t.border,
    padding: 4,
    borderRadius: 12,
    marginBottom: 24,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  methodTabActive: {
    backgroundColor: t.card,
  },
  methodTabText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
  },
  methodTabTextActive: {
    color: '#000',
  },
  inputStackLarge: {
    gap: 20,
    marginBottom: 32,
  },
  inputFieldLarge: {
    gap: 8,
  },
  fieldLabelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.textSecondary,
    marginLeft: 4,
  },
  fieldInputLarge: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppins,
    color: t.textPrimary,
  },
  saveBankBtnLarge: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveBankBtnTextLarge: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  timeColumnDivider: {
    width: 1,
    backgroundColor: t.borderSubtle,
    marginVertical: 40,
  },
  selectedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D97706',
    marginTop: 2,
  },
  });
}
