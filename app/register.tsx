import AnimatedBackground from '@/components/animated-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { GooglePlacesService, GooglePlaceSuggestion } from '@/services/google-places';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import FaceDetection from '@react-native-ml-kit/face-detection';
import * as ExpoLocation from 'expo-location';
import { router } from 'expo-router';
import {
  AlertTriangle,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Circle,
  Eye,
  EyeOff,
  FileText,
  Home,
  ImagePlus,
  Layers,
  LocateFixed,
  Mail,
  MapPin,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import CountryPicker, { Country, CountryCode } from 'react-native-country-picker-modal';
import Animated, {
  FadeIn,
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';

// Must match the `profession` values seeded in skofy-backend/scripts/seed_skills.py exactly —
// addSkillsByName() resolves by (name, profession) and getMySkills()/job matching rely on consistent naming.
const PROFESSIONS_DATA = [
  { id: '1', name: 'AC Technician', skills: ['Gas Refilling', 'Leak Repair', 'Cooling Fix', 'Filter Cleaning', 'AC Installation', 'Outer Unit Service', 'PCB Repair', 'Thermostat Replacement', 'Duct Sealing', 'Noise Reduction', 'Inverter AC Service', 'Cassette AC Service', 'Window AC Repair'] },
  { id: '2', name: 'Electrician', skills: ['Wiring', 'Switchboard Repair', 'Short Circuit Fix', 'Lighting Installation', 'Fan Repair', 'Panel Upgrade', 'Inverter Installation', 'Solar Wiring', 'MCB Replacement', 'Earthing Setup', 'Power Backup Setup', 'CCTV Wiring', 'Doorbell Installation', 'Exhaust Fan Fitting', 'Geyser Wiring'] },
  { id: '3', name: 'Plumber', skills: ['Pipe Leak Fix', 'Tap Repair', 'Drain Cleaning', 'Toilet Repair', 'Water Heater Install', 'Tank Cleaning', 'Basin Installation', 'Shower Fitting', 'Sewer Line Repair', 'Bathroom Renovation', 'Borewell Motor Repair', 'Overhead Tank Installation', 'Underground Tank Cleaning', 'Water Pump Repair'] },
  { id: '4', name: 'Carpenter', skills: ['Furniture Assembly', 'Cabinet Installation', 'Door Installation', 'Wood Repair', 'Trim Work', 'Wardrobe Installation', 'False Ceiling Work', 'Window Frame Repair', 'Modular Kitchen Fitting', 'Staircase Work', 'Wooden Flooring', 'Sofa Repair', 'Bed Frame Assembly', 'TV Unit Installation'] },
  { id: '5', name: 'Painter', skills: ['Interior Painting', 'Exterior Painting', 'Wallpaper Removal', 'Drywall Repair', 'Cabinet Refinishing', 'Texture Coat', 'Waterproof Paint', 'Wood Polish', 'Graffiti Removal', 'Stencil Painting', 'Metal Painting', 'Epoxy Floor Coating', 'Enamel Paint', 'Anti-Fungal Coating'] },
  { id: '6', name: 'House Cleaning', skills: ['Deep Cleaning', 'Move-in Cleaning', 'Carpet Cleaning', 'Window Cleaning', 'Regular Sweeping', 'Sofa Cleaning', 'Kitchen Deep Clean', 'Bathroom Scrubbing', 'Marble Polishing', 'Curtain Washing', 'Post-Construction Cleaning', 'Terrace Cleaning', 'Chimney Cleaning', 'Water Tank Cleaning', 'Mattress Cleaning'] },
  { id: '7', name: 'Vehicle Mechanic', skills: ['Engine Diagnostics', 'Brake Repair', 'Oil Change', 'Tire Replacement', 'Battery Testing', 'Car AC Repair', 'Denting & Painting', 'Transmission Repair', 'Bike Service', 'Car Washing', 'Windshield Repair', 'Headlight Restoration', 'Puncture Repair', 'Spark Plug Replacement', 'Car Interior Cleaning'] },
  { id: '8', name: 'Gardener', skills: ['Lawn Mowing', 'Tree Trimming', 'Garden Design', 'Weed Control', 'Irrigation Repair', 'Plant Potting', 'Hedge Trimming', 'Vertical Garden Setup', 'Terrace Garden Setup', 'Composting Setup', 'Fertilization', 'Plant Disease Treatment', 'Garden Lighting'] },
  { id: '9', name: 'Appliance Repair', skills: ['Washing Machine Repair', 'Refrigerator Repair', 'Microwave Repair', 'Dishwasher Repair', 'Oven Repair', 'Geyser Repair', 'Water Purifier Repair', 'Mixer Grinder Repair', 'TV Repair', 'Induction Cooktop Repair', 'Air Purifier Service', 'Chimney Repair', 'Dryer Repair', 'Pressure Cooker Repair'] },
  { id: '10', name: 'Home Salon', skills: ['Haircut – Men', 'Haircut – Women', 'Hair Color', 'Hair Smoothening', 'Manicure', 'Pedicure', 'Facial', 'Waxing', 'Threading', 'Mehendi / Henna', 'Makeup – Bridal', 'Makeup – Party', 'Head Massage', 'Body Scrub', 'Bleach'] },
  { id: '11', name: 'Pest Control', skills: ['Ant Control', 'Rodent Control', 'Bed Bug Treatment', 'Termite Treatment', 'Mosquito Control', 'Cockroach Treatment', 'Spider Control', 'Lizard Repellent', 'Fly Control', 'Fumigation', 'Pre-Construction Termite', 'Garden Pest Control'] },
  { id: '12', name: 'Water Purifier Technician', skills: ['RO Service', 'UV Filter Replacement', 'Membrane Replacement', 'Carbon Filter Service', 'TDS Check & Fix', 'Motor Repair – Purifier', 'Annual Maintenance', 'Installation – RO System', 'Water Softener Service'] },
  { id: '13', name: 'CCTV & Security', skills: ['CCTV Installation', 'DVR / NVR Setup', 'IP Camera Config', 'Video Doorbell Install', 'Alarm System Setup', 'Access Control Install', 'Intercom Setup', 'Motion Sensor Install', 'Remote Monitoring Setup'] },
  { id: '14', name: 'Solar Technician', skills: ['Solar Panel Installation', 'Inverter Setup – Solar', 'Panel Cleaning', 'Battery Bank Setup', 'Grid-Tie Configuration', 'Energy Audit', 'Fault Diagnosis – Solar', 'Wiring – Solar System'] },
  { id: '15', name: 'Waterproofing', skills: ['Roof Waterproofing', 'Bathroom Waterproofing', 'Terrace Waterproofing', 'Basement Waterproofing', 'Wall Seepage Fix', 'External Wall Coating', 'Swimming Pool Sealing', 'Overhead Tank Sealing'] },
  { id: '16', name: 'Packers & Movers', skills: ['Local Home Shifting', 'Office Relocation', 'Furniture Disassembly', 'Packing & Wrapping', 'Vehicle Transport', 'Storage Services', 'Piano & Heavy Item Move', 'International Relocation'] },
  { id: '17', name: 'Interior Designer', skills: ['Space Planning', '3D Visualization', 'Modular Kitchen Design', 'Bedroom Design', 'Living Room Design', 'False Ceiling Design', 'Lighting Design', 'Colour Consultation', 'Furniture Selection', 'Home Décor Styling', 'Bathroom Design', 'Office Interior Design'] },
  { id: '18', name: 'Fitness Trainer', skills: ['Weight Loss Training', 'Strength & Conditioning', 'Yoga Sessions', 'Zumba', 'Pilates', 'Crossfit', 'Diet & Nutrition Plan', 'Post-Natal Fitness', 'Kids Fitness', 'Senior Fitness', 'Marathon Coaching'] },
  { id: '19', name: 'Physiotherapist', skills: ['Back Pain Treatment', 'Sports Injury Rehab', 'Post-Surgery Rehab', 'Neck Pain Treatment', 'Knee Pain Therapy', 'Electrotherapy', 'Dry Needling', 'Elderly Mobility Care', 'Stroke Rehabilitation', 'Manual Therapy'] },
  { id: '20', name: 'Home Tutor', skills: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Language', 'Hindi Language', 'Computer Science', 'IIT-JEE Preparation', 'NEET Preparation', 'CBSE Board Coaching', 'Primary School Tuition', 'Music Lessons', 'Art & Drawing Classes'] },
  { id: '21', name: 'Cook / Chef', skills: ['Daily Meal Cooking', 'Party Catering', 'North Indian Cuisine', 'South Indian Cuisine', 'Chinese Cuisine', 'Continental Cuisine', 'Baking & Pastry', 'Healthy Meal Prep', 'Jain / Vegan Cooking', 'Biryani Specialist', 'Tandoor Cooking', 'Dessert Making'] },
  { id: '22', name: 'Caretaker', skills: ['Elder Companion Care', 'Medication Reminder', 'Mobility Assistance', 'Baby Care', 'Child Supervision', 'Night Duty Caretaking', 'Post-Hospitalization Care', 'Special Needs Care'] },
  { id: '23', name: 'IT Support', skills: ['Computer Repair', 'Laptop Repair', 'Virus Removal', 'Data Recovery', 'Network Setup', 'WiFi Configuration', 'Smart TV Setup', 'Printer Setup', 'Software Installation', 'Data Backup', 'CCTV Network Config', 'Smart Home Automation'] },
  { id: '24', name: 'Event Decorator', skills: ['Birthday Decoration', 'Wedding Decoration', 'Baby Shower Decoration', 'Corporate Event Setup', 'Floral Arrangement', 'Balloon Decoration', 'Stage Setup', 'Lighting – Events', 'Mehendi Ceremony Decor', 'Table & Chair Rental'] },
  { id: '25', name: 'Photography', skills: ['Wedding Photography', 'Portrait Photography', 'Product Photography', 'Real Estate Photography', 'Event Photography', 'Drone Photography', 'Video Editing', 'Maternity Shoot', 'Baby Photography', 'Pre-Wedding Shoot'] },
  { id: '26', name: 'Laundry', skills: ['Wash & Fold', 'Dry Cleaning', 'Ironing', 'Shoe Cleaning', 'Curtain Dry Cleaning', 'Sofa Cover Washing', 'Pickup & Delivery', 'Stain Removal'] },
  { id: '27', name: 'Mason', skills: ['Tile Fixing', 'Plastering', 'Brick Work', 'Floor Levelling', 'Concrete Work', 'Wall Construction', 'Demolition', 'Kitchen Counter Fitting', 'Marble / Granite Fixing', 'Roof Repair'] },
  { id: '28', name: 'Welder', skills: ['Gate Fabrication', 'Grille / Railing Work', 'Sheet Metal Work', 'Stainless Steel Work', 'Aluminium Fabrication', 'Structural Welding', 'TIG Welding', 'MIG Welding', 'Portable Welding'] },
  { id: '29', name: 'Glass & Glazing', skills: ['Window Glass Replacement', 'Shower Enclosure Install', 'Glass Partition Install', 'Mirror Fitting', 'Toughened Glass Work', 'Windshield Replacement', 'Glass Door Installation'] },
];

export default function RegisterScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);

  // Professions — fetched live from backend once the user is OTP-verified (authenticated)
  const [professionsList, setProfessionsList] = useState<string[]>(PROFESSIONS_DATA.map(p => p.name));
  const [profSkills, setProfSkills] = useState<Record<string, { id: string; name: string }[]>>({});

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobileNumber: '',
    otp: '',
    address: '',
    idNumber: '',
    password: '',
    confirmPassword: '',
    primaryProfession: '',
    skills: [] as string[],
    experience: '',
  });

  const [showProfessionModal, setShowProfessionModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);

  const availableSkills = useMemo(() => {
    if (!formData.primaryProfession) return [];
    const backendSkills = profSkills[formData.primaryProfession];
    if (backendSkills && backendSkills.length > 0) return backendSkills.map(s => s.name);
    // Offline fallback — use normalized comparison to avoid issues with whitespace
    const prof = PROFESSIONS_DATA.find(p => p.name.trim() === formData.primaryProfession.trim());
    return prof ? prof.skills : [];
  }, [formData.primaryProfession, profSkills]);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [idDocumentImage, setIdDocumentImage] = useState<string | null>(null);
  const [idDocumentBase64, setIdDocumentBase64] = useState<{ data: string; mime: string } | null>(null);
  const [workProofImage, setWorkProofImage] = useState<string | null>(null);
  const [workProofBase64, setWorkProofBase64] = useState<{ data: string; mime: string } | null>(null);
  const [proofOfSkillsMedia, setProofOfSkillsMedia] = useState<{ uri: string, skill: string, description: string, type: 'image' | 'video', mime?: string }[]>([]);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  // True when this phone already had a Customer account and is now adding a
  // Provider profile (dual-role, same identity) — as opposed to a genuinely
  // brand-new account. A password already exists for this identity, so the
  // password step below is skipped rather than calling setPassword without
  // the current_password it would then require.
  const [isAddingRole, setIsAddingRole] = useState(false);

  // Once authenticated (OTP verified), fetch the real profession list from the backend
  useEffect(() => {
    if (!isOtpVerified) return;
    SkoFyApi.skills.professions()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setProfessionsList(list);
      })
      .catch((err) => {
        // Falls back to the static PROFESSIONS_DATA already in state — fine
        // for the user, but log it so a backend outage here is visible.
        console.error('Failed to fetch professions list:', err);
      });
  }, [isOtpVerified]);

  // Fetch real skills (with backend UUIDs) for the selected profession
  useEffect(() => {
    if (!isOtpVerified || !formData.primaryProfession) return;
    SkoFyApi.skills.list(formData.primaryProfession)
      .then((list: any) => {
        if (Array.isArray(list) && list.length > 0) {
          setProfSkills(prev => ({ ...prev, [formData.primaryProfession]: list.map((s: any) => ({ id: s.id, name: s.name })) }));
        }
      })
      .catch((err) => {
        console.error('Failed to fetch skills list:', err);
      });
  }, [isOtpVerified, formData.primaryProfession]);

  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingMediaBatch, setPendingMediaBatch] = useState<{ uri: string, type: 'image' | 'video', mime?: string }[]>([]);
  const [pendingDescription, setPendingDescription] = useState('');
  const [selectedTagSkill, setSelectedTagSkill] = useState<string | null>(null);
  const [tagSkillSearch, setTagSkillSearch] = useState('');

  // Only skills the provider actually selected for their profession can be tagged on proof media —
  // not the full ALL_SKILLS catalog across every profession.
  const filteredRegisterSkills = useMemo(() => {
    if (!tagSkillSearch.trim()) return formData.skills;
    return formData.skills.filter(s => s.toLowerCase().includes(tagSkillSearch.toLowerCase()));
  }, [tagSkillSearch, formData.skills]);

  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [callingCode, setCallingCode] = useState('1');
  const [isCountryPickerVisible, setIsCountryPickerVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'delete';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  const showAlert = (type: 'success' | 'error' | 'delete', title: string, message: string) => {
    setCustomAlert({ visible: true, type, title, message });
  };

  const hideAlert = () => {
    setCustomAlert({ ...customAlert, visible: false });
  };

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [addressType, setAddressType] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [customLabel, setCustomLabel] = useState('');

  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [addressHeight, setAddressHeight] = useState(80);
  const [suggestions, setSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);
  const searchTimeoutRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Animation values
  const progressValue = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  // Form completion calculation for progress bar. When adding a role to an
  // existing account (isAddingRole), the password step doesn't apply — a
  // password already exists for this identity — so it's excluded from the
  // total instead of permanently blocking the submit button below 100%.
  const calculateProgress = () => {
    let completed = 0;
    const total = isAddingRole ? 10 : 11; // Professional details (Profession/Skills, Experience, Work Proof), [Password]
    if (formData.fullName) completed++;
    if (isOtpVerified) completed++;
    if (formData.address) completed++;
    if (addressType) completed++; // Always has a value
    if (formData.primaryProfession && formData.skills.length > 0) completed++;
    if (formData.experience) completed++;
    if (workProofImage) completed++;
    if (formData.idNumber) completed++;
    if (idDocumentImage) completed++;
    if (!isAddingRole && formData.password && formData.password === formData.confirmPassword && formData.password.length >= 6) completed++;
    if (agreedToTerms && agreedToPrivacy) completed++;

    return completed / total;
  };

  useEffect(() => {
    progressValue.value = withSpring(calculateProgress(), { damping: 15 });
  }, [formData, isOtpVerified, addressType, idDocumentImage, workProofImage, agreedToTerms, agreedToPrivacy, isAddingRole]);

  useEffect(() => {
    buttonScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { label: '', color: '#E5E7EB', width: '0%', score: 0 };
    if (pass.length < 6) return { label: 'Too Short', color: '#FF4B4B', width: '20%', score: 1 };

    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { label: 'Weak', color: '#FF4B4B', width: '33%', score: 2 };
    if (score <= 2) return { label: 'Medium', color: '#FFA500', width: '66%', score: 3 };
    return { label: 'Strong', color: '#4CAF50', width: '100%', score: 4 };
  };

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%` as any,
  }));

  const createButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const getCurrentLocation = async () => {
    setIsLocating(true);
    try {
      let { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        setIsLocating(false);
        return;
      }

      let location = await ExpoLocation.getCurrentPositionAsync({});
      const reverseGeocode = await ExpoLocation.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (reverseGeocode.length > 0) {
        const addr = reverseGeocode[0];
        const formattedAddr = `${addr.name || ''} ${addr.street || ''}, ${addr.city || ''}, ${addr.region || ''} ${addr.postalCode || ''} `.trim().replace(/^,/, '').trim();
        setFormData(prev => ({ ...prev, address: formattedAddr }));
        setSelectedCoords({ lat: location.coords.latitude, lng: location.coords.longitude });
        setSelectedCity(addr.city || undefined);
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Location Error', 'Failed to get current location. Please check your permissions.');
    } finally {
      setIsLocating(false);
    }
  };

  const renderHighlightedText = (text: string, matches: any[]) => {
    if (!matches || matches.length === 0) return <ThemedText style={styles.suggestionMainText}>{text}</ThemedText>;

    const parts = [];
    let lastOffset = 0;

    matches.forEach((match, index) => {
      // Add plain text before match
      if (match.offset > lastOffset) {
        parts.push(text.substring(lastOffset, match.offset));
      }
      // Add matched (bold) text
      parts.push(
        <ThemedText key={`match-${index}`} style={[styles.suggestionMainText, { fontFamily: Fonts.poppinsBold, color: themeColors.brand }]}>
          {text.substring(match.offset, match.offset + match.length)}
        </ThemedText>
      );
      lastOffset = match.offset + match.length;
    });

    // Add remaining plain text
    if (lastOffset < text.length) {
      parts.push(text.substring(lastOffset));
    }

    return <ThemedText style={styles.suggestionMainText}>{parts}</ThemedText>;
  };

  const handleSuggestionPress = async (item: GooglePlaceSuggestion) => {
    try {
      setIsSearching(true);
      setShowSuggestions(false);
      const details = await GooglePlacesService.getPlaceDetails(item.place_id);

      setFormData(prev => ({ ...prev, address: details.formatted_address }));
      setSelectedCoords({ lat: details.latitude, lng: details.longitude });
      setSelectedCity(details.city);
      setAddressHeight(56); // Reset height for new address
    } catch (error) {
      console.error('Details error:', error);
      showAlert('error', 'Location Details', 'Could not fetch location details. Please check your internet connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const onSelectCountry = (country: Country) => {
    setCountryCode(country.cca2);
    setCallingCode(country.callingCode[0]);
    setIsCountryPickerVisible(false);
    // Clear phone number if it exceeds new country's limit
    setFormData(prev => ({ ...prev, mobileNumber: '' }));
  };

  const getPhoneNumberLength = (cca2: CountryCode) => {
    const lengths: Record<string, number> = {
      'IN': 10,
      'US': 10,
      'GB': 10,
      'AE': 9,
      'KW': 8,
      'QA': 8,
      'SA': 9,
    };
    return lengths[cca2] || 10; // Default to 10
  };

  const [profileImageBase64, setProfileImageBase64] = useState<{ data: string; mime: string } | null>(null);
  const [checkingFace, setCheckingFace] = useState(false);

  // Profile photo must be a fresh camera shot of an actual face — not a
  // gallery pick, which could be any random/stock/someone-else's photo.
  // Camera-only stops the "wrong file" case; the on-device face check below
  // (Google ML Kit, fully local — no third-party service, no data leaves
  // the device) stops the "pointed the camera at a wall" case. Neither is
  // full liveness/anti-spoofing (e.g. a photo held up to the camera would
  // still pass) — that needs a dedicated KYC vendor, which this project
  // deliberately hasn't integrated yet.
  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // There's no gallery fallback for this photo anymore — a permanently
      // denied ("don't ask again") permission would otherwise be a dead end
      // with no way back in from this screen.
      if (permission.canAskAgain) {
        showAlert('error', 'Camera Required', 'Please allow camera access to take your profile photo.');
      } else {
        Alert.alert(
          'Camera Access Needed',
          'Camera access is turned off for Skofy. Enable it in Settings to take your profile photo.',
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
      // On-device detection itself failing (rare) shouldn't block
      // registration over a client-side check — let the photo through
      // rather than getting the provider stuck with no way past this step.
      // Logged (not swallowed silently) since the most likely real cause
      // during development is the native module not being linked yet —
      // this makes that failure mode visible instead of looking like the
      // check quietly "passed".
      console.warn('Face detection failed, allowing photo through:', err);
    } finally {
      setCheckingFace(false);
    }

    const mime = asset.mimeType ?? 'image/jpeg';
    setProfileImage(asset.uri);
    if (asset.base64) setProfileImageBase64({ data: asset.base64, mime });
  };

  const pickImage = async (type: 'document' | 'workProof') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      if (type === 'document') {
        setIdDocumentImage(asset.uri);
        if (asset.base64) setIdDocumentBase64({ data: asset.base64, mime });
      } else if (type === 'workProof') {
        setWorkProofImage(asset.uri);
        if (asset.base64) setWorkProofBase64({ data: asset.base64, mime });
      }
    }
  };

  const MAX_PROOFS_PER_SKILL = 5;

  const pickMultipleMedia = async () => {
    if (formData.skills.length === 0) {
      showAlert('error', 'Add Skills First', 'Please select your skills above before adding skill proof media.');
      return;
    }

    // Note: deliberately NOT requesting base64 here — forcing base64 extraction on a
    // multi-MB video file can hang or crash the picker on real devices. Skill-proof
    // media (image or video) is always uploaded via multipart instead (see submit handler).
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
      setPendingDescription('');
      setSelectedTagSkill(null);
      setTagSkillSearch('');
      setShowTagModal(true);
    }
  };

  const handleTagSkill = () => {
    if (pendingMediaBatch.length > 0 && selectedTagSkill) {
      const countForSkill = proofOfSkillsMedia.filter(m => m.skill === selectedTagSkill).length;
      const remaining = MAX_PROOFS_PER_SKILL - countForSkill;
      if (remaining <= 0) {
        showAlert('error', 'Limit Reached', `You can add up to ${MAX_PROOFS_PER_SKILL} proof files per skill.`);
        return;
      }

      const toAdd = pendingMediaBatch.slice(0, remaining);
      setProofOfSkillsMedia(prev => [...prev, ...toAdd.map(item => ({
        uri: item.uri,
        skill: selectedTagSkill,
        description: pendingDescription,
        type: item.type,
        mime: item.mime,
      }))]);

      if (pendingMediaBatch.length > toAdd.length) {
        showAlert('error', 'Some Files Skipped', `Only added ${toAdd.length} of ${pendingMediaBatch.length} files — "${selectedTagSkill}" is now at the ${MAX_PROOFS_PER_SKILL}-file limit.`);
      }

      setPendingMediaBatch([]);
      setPendingDescription('');
      setSelectedTagSkill(null);
      setTagSkillSearch('');
      setShowTagModal(false);
    }
  };

  const removeMedia = (index: number) => {
    setProofOfSkillsMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendOtp = async () => {
    const requiredLength = getPhoneNumberLength(countryCode);
    if (formData.mobileNumber.length === requiredLength) {
      try {
        await SkoFyApi.auth.sendOTP(`+${callingCode}${formData.mobileNumber}`);
        setIsOtpSent(true);
      } catch (error) {
        showAlert('error', 'OTP Error', 'Failed to send OTP. Please check your mobile number.');
      }
    }
  };

  const handleVerifyOtp = async () => {
    if (formData.otp.length >= 4) {
      try {
        const user = await SkoFyApi.auth.verifyOTP(`+${callingCode}${formData.mobileNumber}`, formData.otp);
        // is_new_role (not is_new_user) is what actually gates whether
        // there's a Provider profile left to fill in — is_new_user alone
        // can't distinguish "brand-new account" from "this phone already
        // has a Customer account and just got a Provider profile added"
        // (dual-role support, same identity/phone). Only a phone that
        // already has a Provider profile is genuinely "already registered."
        if (!user.is_new_role) {
          showAlert('error', 'Already Registered', 'This mobile number already has an account. Please use "Login here" below instead.');
          return;
        }
        setIsAddingRole(!user.is_new_user);
        setIsOtpVerified(true);
        setIsOtpSent(false);
        showAlert('success', 'Verified', 'Mobile number verified successfully! ✨');
      } catch (error: any) {
        showAlert('error', 'Verification Failed', error?.message || 'The OTP you entered is incorrect. Please try again.');
      }
    }
  };

  const getInputStyle = (name: string) => [
    styles.input,
    {
      backgroundColor: themeColors.inputBackground,
      color: themeColors.text,
      borderColor: focusedInput === name ? themeColors.brand : (themeColors as any).inputBorder,
      borderWidth: 1,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <AnimatedBackground />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <View style={styles.topProgressBarContainer}>
          <Animated.View style={[styles.topProgressBar, progressBarStyle, { backgroundColor: themeColors.brand }]} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <ChevronLeft size={24} color={themeColors.text} />
            </TouchableOpacity>

            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              contentFit="contain"
            />

            <ThemedText style={styles.title}>Register as a SkoFy Provider</ThemedText>
            <ThemedText style={styles.subtitle}>Register to start providing services and grow your business</ThemedText>
          </View>

          {/* Section: Personal Details */}
          <Animated.View entering={FadeInLeft.delay(200).springify()} style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionLabel}>Personal Details</ThemedText>

              <TouchableOpacity
                style={styles.photoContainer}
                onPress={pickProfilePhoto}
                disabled={checkingFace}
              >
                <View style={[styles.photoCircle, profileImage ? { borderWidth: 2, borderColor: themeColors.brand } : {}]}>
                  {checkingFace ? (
                    <ActivityIndicator size="small" color={themeColors.brand} />
                  ) : profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.profilePreview} />
                  ) : (
                    <Camera size={24} color={themeColors.icon} />
                  )}
                  <View style={[styles.plusBadge, { backgroundColor: themeColors.brand }]}>
                    <Plus size={12} color="#000" strokeWidth={3} />
                  </View>
                </View>
                <ThemedText style={styles.photoLabel}>
                  {checkingFace ? 'Checking photo…' : profileImage ? 'Retake Photo' : 'Take Profile Photo'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Full Name<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TextInput
                style={getInputStyle('fullName')}
                placeholder="Full Name"
                placeholderTextColor={themeColors.icon}
                value={formData.fullName}
                onChangeText={(text) => setFormData(prev => ({ ...prev, fullName: text }))}
                onFocus={() => setFocusedInput('fullName')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Email Address</ThemedText>
              <View style={[...getInputStyle('email'), { flexDirection: 'row', alignItems: 'center' }]}>
                <Mail size={18} color={themeColors.icon} style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, color: themeColors.text, fontFamily: Fonts.poppins, fontSize: 15 }}
                  placeholder="you@example.com"
                  placeholderTextColor={themeColors.icon}
                  value={formData.email}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {!!formData.email && !formData.email.includes('@') && (
                <ThemedText style={{ fontSize: 12, color: '#EF4444', marginTop: 4, fontFamily: Fonts.poppins }}>
                  Please enter a valid email address.
                </ThemedText>
              )}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Mobile Number<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <View style={styles.phoneInputContainer}>
                <TouchableOpacity
                  style={[styles.countryPickerButton, {
                    backgroundColor: themeColors.inputBackground,
                    borderColor: isCountryPickerVisible ? themeColors.brand : (themeColors as any).inputBorder,
                    borderWidth: 1,
                  }]}
                  onPress={() => !isOtpVerified && setIsCountryPickerVisible(true)}
                  disabled={isOtpVerified}
                >
                  <CountryPicker
                    countryCode={countryCode}
                    withFilter={true}
                    withFlag={true}
                    withEmoji={false}
                    withCallingCode={false}
                    withAlphaFilter={true}
                    onSelect={onSelectCountry}
                    visible={isCountryPickerVisible}
                    onClose={() => setIsCountryPickerVisible(false)}
                    containerButtonStyle={{ padding: 0, margin: 0 }}
                    theme={{
                      backgroundColor: themeColors.background,
                      onBackgroundTextColor: themeColors.text,
                      fontSize: 16,
                      fontFamily: Fonts.poppins,
                    }}
                  />
                  <ThemedText style={styles.callingCodeText}>+{callingCode}</ThemedText>
                  <ChevronDown size={14} color={themeColors.icon} />
                </TouchableOpacity>
                <TextInput
                  style={[getInputStyle('mobileNumber'), { flex: 1 }]}
                  placeholder="Mobile Number"
                  placeholderTextColor={themeColors.icon}
                  keyboardType="numeric"
                  numberOfLines={1}
                  value={formData.mobileNumber}
                  onChangeText={(text) => {
                    // Only allow numbers
                    const cleaned = text.replace(/[^0-9]/g, '');
                    setFormData(prev => ({ ...prev, mobileNumber: cleaned }));
                  }}
                  onFocus={() => setFocusedInput('mobileNumber')}
                  onBlur={() => setFocusedInput(null)}
                  editable={!isOtpVerified}
                  maxLength={getPhoneNumberLength(countryCode)}
                />
              </View>

              {!isOtpVerified && !isOtpSent && (
                <TouchableOpacity
                  style={[styles.verifyButtonAction, { marginTop: 12 }]}
                  onPress={handleSendOtp}
                >
                  <ThemedText style={styles.verifyButtonText}>Verify with OTP</ThemedText>
                </TouchableOpacity>
              )}

              {isOtpVerified && (
                <View style={[styles.verifiedBadge, { marginTop: 12 }]}>
                  <CheckCircle2 size={16} color="#4CAF50" />
                  <ThemedText style={styles.verifiedText}>Mobile Number Verified</ThemedText>
                  <TouchableOpacity onPress={() => setIsOtpVerified(false)} style={{ marginLeft: 'auto' }}>
                    <ThemedText style={{ color: themeColors.brand, fontSize: 12, fontFamily: Fonts.poppinsBold }}>Edit</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {isOtpSent && (
              <Animated.View entering={FadeIn} style={styles.otpSection}>
                <View style={styles.otpHeader}>
                  <ThemedText style={styles.fieldLabel}>Enter OTP</ThemedText>
                  <TouchableOpacity onPress={() => setIsOtpSent(false)}>
                    <X size={16} color={themeColors.icon} />
                  </TouchableOpacity>
                </View>
                <View style={styles.otpInputRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={[getInputStyle('otp'), { flex: 1, paddingRight: 50 }]}
                      placeholder="Enter 4-6 digit OTP"
                      placeholderTextColor={themeColors.icon}
                      keyboardType="numeric"
                      secureTextEntry={!showOtp}
                      value={formData.otp}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, otp: text }))}
                      onFocus={() => setFocusedInput('otp')}
                      onBlur={() => setFocusedInput(null)}
                      maxLength={6}
                    />
                    <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowOtp(!showOtp)}>
                      {showOtp ? (
                        <EyeOff size={20} color={themeColors.icon} />
                      ) : (
                        <Eye size={20} color={themeColors.icon} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.verifyConfirmButton, { backgroundColor: themeColors.brandDark }]}
                    onPress={handleVerifyOtp}
                  >
                    <ThemedText style={styles.verifyConfirmText}>Verify</ThemedText>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Password Fields — not applicable when adding a role to an
                existing account (dual-role): a password already exists for
                this identity, and this screen's submit step deliberately
                skips setPassword() in that case. */}
            {!isAddingRole && (
            <>
            <View style={[styles.inputGroup, { marginTop: 16 }]}>
              <ThemedText style={styles.fieldLabel}>Create Password<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={[getInputStyle('password'), { flex: 1, paddingRight: 50 }]}
                  placeholder="Password"
                  placeholderTextColor={themeColors.icon}
                  secureTextEntry={!showPassword}
                  value={formData.password}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={themeColors.icon} />
                  ) : (
                    <Eye size={20} color={themeColors.icon} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Strength Indicator */}
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarBackground}>
                  <View
                    style={[
                      styles.strengthBarActive,
                      {
                        width: getPasswordStrength(formData.password).width as any,
                        backgroundColor: getPasswordStrength(formData.password).color
                      }
                    ]}
                  />
                </View>
                {formData.password.length > 0 && (
                  <ThemedText style={[styles.strengthText, { color: getPasswordStrength(formData.password).color }]}>
                    {getPasswordStrength(formData.password).label}
                  </ThemedText>
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Confirm Password<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={[getInputStyle('confirmPassword'), { flex: 1, paddingRight: 50 }]}
                  placeholder="Confirm Password"
                  placeholderTextColor={themeColors.icon}
                  secureTextEntry={!showConfirmPassword}
                  value={formData.confirmPassword}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, confirmPassword: text }))}
                  onFocus={() => setFocusedInput('confirmPassword')}
                  onBlur={() => setFocusedInput(null)}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={themeColors.icon} />
                  ) : (
                    <Eye size={20} color={themeColors.icon} />
                  )}
                </TouchableOpacity>
              </View>
              {formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword && (
                <ThemedText style={styles.passwordErrorText}>Passwords do not match</ThemedText>
              )}
              {formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword && (
                <View style={styles.passwordMatchRow}>
                  <CheckCircle2 size={14} color="#4CAF50" />
                  <ThemedText style={styles.passwordMatchText}>Passwords match</ThemedText>
                </View>
              )}
            </View>
            </>
            )}
          </Animated.View>

          {/* Section: Contact Information */}
          <Animated.View entering={FadeInLeft.delay(400).springify()} style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Contact Information</ThemedText>

            <View style={[styles.inputGroup, { marginTop: 16 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <ThemedText style={styles.fieldLabel}>Address<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
                <TouchableOpacity
                  style={styles.locationButton}
                  onPress={getCurrentLocation}
                  disabled={isLocating}
                >
                  <LocateFixed size={14} color={themeColors.brand} />
                  <ThemedText style={styles.locationButtonText}>
                    {isLocating ? 'Locating...' : 'Current Location'}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.locationInputContainer}>
                <View style={styles.inputIconWrapper}>
                  <MapPin size={20} color={themeColors.brand} />
                </View>
                <TextInput
                  style={[getInputStyle('address'), styles.inputWithIcon, { height: Math.max(90, addressHeight) }]}
                  placeholder="Search House No, Street or Area..."
                  placeholderTextColor={themeColors.icon}
                  value={formData.address}
                  onChangeText={(text) => {
                    setFormData(prev => ({ ...prev, address: text }));
                    setSearchError(null);
                    setSelectedCity(undefined); // address typed manually — structured city no longer valid

                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    if (abortControllerRef.current) abortControllerRef.current.abort();

                    if (text.length > 2) {
                      setShowSuggestions(true);
                      setSearchError(null);
                      setSuggestions([]); // Clear old results while searching
                      searchTimeoutRef.current = setTimeout(async () => {
                        try {
                          setIsSearching(true);
                          abortControllerRef.current = new AbortController();
                          const results = await GooglePlacesService.searchAddress(text);
                          setSuggestions(results);
                          if (results.length === 0) {
                            setSearchError('No locations found');
                          }
                        } catch (error: any) {
                          if (error.name !== 'AbortError') {
                            console.error('Search error:', error);
                            setSearchError('Could not fetch locations. Check internet.');
                          }
                        } finally {
                          setIsSearching(false);
                        }
                      }, 300);
                    } else {
                      setShowSuggestions(false);
                      setSuggestions([]);
                    }
                  }}
                  onFocus={() => setFocusedInput('address')}
                  onBlur={() => {
                    setFocusedInput(null);
                    // Delay close to allow tap on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  multiline
                  onContentSizeChange={(e) => setAddressHeight(e.nativeEvent.contentSize.height)}
                  textAlignVertical="top"
                />
                {isSearching && (
                  <View style={styles.inputLoader}>
                    <ActivityIndicator size="small" color={themeColors.brand} />
                  </View>
                )}
              </View>

              {showSuggestions && (suggestions.length > 0 || searchError || isSearching) && (
                <View style={[styles.suggestionsDropdown, isSearching && { minHeight: 80, justifyContent: 'center' }]}>
                  {isSearching ? (
                    <View style={styles.searchingContainer}>
                      <ActivityIndicator size="small" color={themeColors.brand} />
                      <ThemedText style={styles.searchingText}>Searching locations...</ThemedText>
                    </View>
                  ) : searchError ? (
                    <View style={styles.errorContainer}>
                      <ThemedText style={styles.errorText}>{searchError}</ThemedText>
                      <TouchableOpacity onPress={() => setShowSuggestions(false)}>
                        <ThemedText style={styles.manualText}>Enter address manually</ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <ScrollView
                      style={{ maxHeight: 250 }}
                      keyboardShouldPersistTaps="always"
                      nestedScrollEnabled={true}
                    >
                      {suggestions.map((item) => (
                        <TouchableOpacity
                          key={item.place_id}
                          style={styles.suggestionItem}
                          onPress={() => handleSuggestionPress(item)}
                        >
                          <View style={styles.suggestionIconBox}>
                            <MapPin size={18} color={themeColors.icon} fill={themeColors.inputBorder} />
                          </View>
                          <View style={{ flex: 1 }}>
                            {renderHighlightedText(item.structured_formatting.main_text, item.structured_formatting.main_text_matched_substrings || [])}
                            <View style={styles.suggestionDetails}>
                              {item.distance && (
                                <ThemedText style={styles.suggestionDistance}>{item.distance}</ThemedText>
                              )}
                              <ThemedText style={styles.suggestionSecondaryText} numberOfLines={1}>
                                {item.structured_formatting.secondary_text}
                              </ThemedText>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={styles.locateOnMapBtn} onPress={getCurrentLocation}>
                        <LocateFixed size={18} color={themeColors.brand} />
                        <ThemedText style={styles.locateOnMapText}>Locate on Map</ThemedText>
                      </TouchableOpacity>
                    </ScrollView>
                  )}
                </View>
              )}
            </View>

            {formData.address && !showSuggestions && !isSearching && (
              <Animated.View entering={FadeIn} style={styles.addressPreviewCard}>
                <View style={styles.previewHeader}>
                  <ThemedText style={styles.previewTitle}>Selected Address</ThemedText>
                  <MapPin size={14} color="#10B981" />
                </View>
                <ThemedText style={styles.previewAddress}>{formData.address}</ThemedText>
                {selectedCoords && (
                  <View style={styles.coordsRow}>
                    <ThemedText style={styles.coordsText}>Coordinates: {selectedCoords.lat.toFixed(4)}, {selectedCoords.lng.toFixed(4)}</ThemedText>
                    <View style={styles.validBadge}>
                      <CheckCircle2 size={10} color="#059669" />
                      <ThemedText style={styles.validText}>Verified</ThemedText>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}

            <View style={styles.addressTypeContainer}>
              <ThemedText style={[styles.fieldLabel, { marginBottom: 12 }]}>Save As</ThemedText>
              <View style={styles.typeChips}>
                {(['Home', 'Work', 'Other'] as const).map((type) => {
                  const Icon = type === 'Home' ? Home : type === 'Work' ? Briefcase : Layers;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setAddressType(type)}
                      style={[
                        styles.typeChip,
                        addressType === type && { backgroundColor: themeColors.brand, borderColor: themeColors.brand }
                      ]}
                    >
                      <Icon size={16} color={addressType === type ? '#000' : themeColors.icon} />
                      <ThemedText style={[
                        styles.typeChipText,
                        addressType === type && { color: '#000', fontFamily: Fonts.poppinsBold }
                      ]}>
                        {type}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {addressType === 'Other' && (
              <Animated.View entering={FadeIn} style={{ marginTop: 16 }}>
                <ThemedText style={styles.fieldLabel}>Custom Label</ThemedText>
                <TextInput
                  style={getInputStyle('customLabel')}
                  placeholder="e.g. GYM, Parent's House"
                  placeholderTextColor={themeColors.icon}
                  value={customLabel}
                  onChangeText={setCustomLabel}
                  onFocus={() => setFocusedInput('customLabel')}
                  onBlur={() => setFocusedInput(null)}
                />
              </Animated.View>
            )}
          </Animated.View>

          {/* Section: Professional Details */}
          <Animated.View entering={FadeInLeft.delay(500).springify()} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Briefcase size={20} color={themeColors.brand} />
              <View>
                <ThemedText style={styles.sectionLabelSmall}>Professional Details</ThemedText>
                <ThemedText style={styles.sectionSubLabel}>(Showcase your expertise)</ThemedText>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Primary Profession<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TouchableOpacity
                style={[getInputStyle('primaryProfession'), { justifyContent: 'center' }]}
                onPress={() => setShowProfessionModal(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: formData.primaryProfession ? themeColors.text : themeColors.icon, fontFamily: Fonts.poppins, fontSize: 15 }}>
                    {formData.primaryProfession || 'Select Profession'}
                  </Text>
                  <ChevronDown size={20} color={themeColors.icon} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Skills<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TouchableOpacity
                style={[getInputStyle('skills'), { justifyContent: 'center' }]}
                onPress={() => {
                  if (!formData.primaryProfession) {
                    showAlert('error', 'Profession Required', 'Please select a primary profession first to see relevant skills.');
                    return;
                  }
                  setShowSkillsModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: formData.skills.length > 0 ? themeColors.text : themeColors.icon, fontFamily: Fonts.poppins, fontSize: 15, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {formData.skills.length > 0 ? formData.skills.join(', ') : 'Select Skills'}
                  </Text>
                  <ChevronDown size={20} color={themeColors.icon} />
                </View>
              </TouchableOpacity>
              <ThemedText style={{ fontSize: 11, color: themeColors.icon, fontFamily: Fonts.poppins, marginTop: 6 }}>
                You can add more skills and other professions anytime from your profile after signing up.
              </ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Years of Experience<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TextInput
                style={getInputStyle('experience')}
                placeholder="Ex: 5"
                placeholderTextColor={themeColors.icon}
                keyboardType="numeric"
                value={formData.experience}
                onChangeText={(text) => setFormData(prev => ({ ...prev, experience: text }))}
                onFocus={() => setFocusedInput('experience')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={{ marginTop: 8, marginBottom: 16 }}>
              <ThemedText style={styles.fieldLabel}>Upload Work Proof Certificate<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              {workProofImage ? (
                <View style={styles.documentPreviewContainer}>
                  <Image source={{ uri: workProofImage }} style={styles.documentPreview} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.removeDocButton}
                    onPress={() => setWorkProofImage(null)}
                  >
                    <X size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() => pickImage('workProof')}
                >
                  <FileText size={24} color={themeColors.brand} />
                  <ThemedText style={styles.uploadBoxText}>Tap to upload work certificate</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ marginTop: 8 }}>
              <ThemedText style={styles.fieldLabel}>Proof of Skills (Photos/Videos)</ThemedText>
              <ThemedText style={[styles.sectionSubLabel, { marginBottom: 12 }]}>
                Add media showing your previous work — up to {MAX_PROOFS_PER_SKILL} per skill.
              </ThemedText>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {proofOfSkillsMedia.map((item, index) => (
                  <View key={index} style={styles.mediaPreviewSquare}>
                    {item.type === 'video' ? (
                      <View style={[styles.documentPreview, { backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' }]}>
                        <Play size={20} color="#FFF" fill="#FFF" />
                      </View>
                    ) : (
                      <Image source={{ uri: item.uri }} style={styles.documentPreview} contentFit="cover" />
                    )}
                    <View style={styles.skillTagBadge}>
                      <ThemedText style={styles.skillTagText}>{item.skill}</ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.removeDocButtonSmall}
                      onPress={() => removeMedia(index)}
                    >
                      <X size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ))}

                {proofOfSkillsMedia.length < formData.skills.length * MAX_PROOFS_PER_SKILL && (
                  <TouchableOpacity
                    style={styles.addMediaSquare}
                    onPress={pickMultipleMedia}
                  >
                    <ImagePlus size={24} color={themeColors.brand} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Section: National Identity Verification */}
          <Animated.View entering={FadeInLeft.delay(600).springify()} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <ShieldCheck size={20} color={themeColors.brand} />
              <View>
                <ThemedText style={styles.sectionLabelSmall}>National Identity Verification</ThemedText>
                <ThemedText style={styles.sectionSubLabel}>(Recommended for account recovery)</ThemedText>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>National ID Number</ThemedText>
              <TextInput
                style={getInputStyle('idNumber')}
                placeholder="Ex: 1234 5678 9012"
                placeholderTextColor={themeColors.icon}
                value={formData.idNumber}
                onChangeText={(text) => setFormData(prev => ({ ...prev, idNumber: text }))}
                onFocus={() => setFocusedInput('idNumber')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={{ marginTop: 8 }}>
              <ThemedText style={styles.fieldLabel}>Upload ID Document</ThemedText>
              {idDocumentImage ? (
                <View style={styles.documentPreviewContainer}>
                  <Image source={{ uri: idDocumentImage }} style={styles.documentPreview} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.removeDocButton}
                    onPress={() => setIdDocumentImage(null)}
                  >
                    <X size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() => pickImage('document')}
                >
                  <Upload size={24} color={themeColors.brand} />
                  <ThemedText style={styles.uploadBoxText}>Tap to upload ID document (JPG/PNG)</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <ThemedText style={styles.statusLabel}>Verification Status: <Text style={{ color: themeColors.brand, fontFamily: Fonts.poppinsBold }}>Pending</Text></ThemedText>
          </Animated.View>

          {/* Section: Consent & Compliance */}
          <Animated.View entering={FadeInLeft.delay(800).springify()} style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Consent & Compliance</ThemedText>

            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
              >
                {agreedToTerms ? (
                  <CheckCircle2 size={22} color={themeColors.brand} />
                ) : (
                  <Circle size={22} color={themeColors.icon} />
                )}
                <ThemedText style={styles.checkboxLabel}>I agree to <Text style={{ color: themeColors.brand }}>Terms & Conditions</Text></ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setAgreedToPrivacy(!agreedToPrivacy)}
              >
                {agreedToPrivacy ? (
                  <CheckCircle2 size={22} color={themeColors.brand} />
                ) : (
                  <Circle size={22} color={themeColors.icon} />
                )}
                <ThemedText style={styles.checkboxLabel}>I consent to <Text style={{ color: themeColors.brand }}>Privacy Policy</Text></ThemedText>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Footer Button */}
          <Animated.View style={createButtonStyle}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: themeColors.brand, opacity: (calculateProgress() === 1 && !isSubmitting) ? 1 : 0.7 }]}
              onPress={async () => {
                if (isSubmitting) return;
                if (formData.email && !formData.email.includes('@')) {
                  showAlert('error', 'Invalid Email', 'Please enter a valid email address or leave it blank.');
                  return;
                }
                setIsSubmitting(true);
                try {
                  // Prefer the city resolved by Google Places / GPS reverse-geocode (accurate,
                  // pulled from the address's actual "locality" component). Only fall back to
                  // guessing from the raw address string if the user typed an address manually
                  // without picking a suggestion.
                  const cityFromAddress = selectedCity || (formData.address
                    ? formData.address.split(',').map(s => s.trim()).find(s => s.length > 2)
                    : undefined);

                  await SkoFyApi.auth.updateProfile({
                    name: formData.fullName,
                    email: formData.email.trim() || undefined,
                    bio: formData.experience
                      ? `${formData.experience} years of experience as a ${formData.primaryProfession}`
                      : undefined,
                    years_experience: parseInt(formData.experience, 10) || 0,
                    city: cityFromAddress,
                  });

                  // Save id_number and city via provider PATCH
                  if (formData.idNumber || selectedCoords) {
                    await SkoFyApi.provider.updateProfile({
                      id_number: formData.idNumber || undefined,
                      city: cityFromAddress,
                    });
                  }

                  // Save skills
                  if (formData.skills.length > 0 && formData.primaryProfession) {
                    await SkoFyApi.skills.addSkillsByName(
                      formData.skills.map(s => ({ name: s, profession: formData.primaryProfession }))
                    );
                  }

                  if (profileImageBase64) {
                    await SkoFyApi.provider.uploadProfileImage(profileImageBase64.data, profileImageBase64.mime);
                  }

                  // Save ID proof, work proof, and skill proof documents (non-fatal — visible
                  // in profile afterwards, but shouldn't block account creation if upload fails).
                  // Failures here used to be totally silent — the account would be created with
                  // no documents and nobody (user or us, debugging) would know why.
                  const failedDocs: string[] = [];
                  if (idDocumentBase64) {
                    await SkoFyApi.provider.addDocument({
                      doc_type: 'ID_PROOF',
                      image_base64: idDocumentBase64.data,
                      mime_type: idDocumentBase64.mime,
                    }).catch((err) => {
                      console.error('Failed to upload ID proof:', err);
                      failedDocs.push('ID proof');
                    });
                  }
                  if (workProofBase64) {
                    await SkoFyApi.provider.addDocument({
                      doc_type: 'WORK_PROOF',
                      image_base64: workProofBase64.data,
                      mime_type: workProofBase64.mime,
                    }).catch((err) => {
                      console.error('Failed to upload work proof:', err);
                      failedDocs.push('Work proof');
                    });
                  }
                  // Skill-proof media (image or video) always goes through the multipart
                  // upload path — keeps a single, reliable code path for both media types.
                  for (const item of proofOfSkillsMedia) {
                    await SkoFyApi.provider.addDocumentFile({
                      fileUri: item.uri,
                      mimeType: item.mime ?? (item.type === 'video' ? 'video/mp4' : 'image/jpeg'),
                      doc_type: 'SKILL_PROOF',
                      skill_name: item.skill,
                      description: item.description || undefined,
                    }).catch((err) => {
                      console.error(`Failed to upload skill proof for ${item.skill}:`, err);
                      failedDocs.push(`${item.skill} proof`);
                    });
                  }

                  // Save GPS coords if available
                  if (selectedCoords) {
                    await SkoFyApi.provider.updateLocation(selectedCoords.lat, selectedCoords.lng);
                  }

                  // Skipped when adding a role to an existing account — a
                  // password already exists for this identity, and
                  // setPassword() would require current_password to change it.
                  if (formData.password && !isAddingRole) {
                    await SkoFyApi.auth.setPassword(formData.password);
                  }
                  if (failedDocs.length > 0) {
                    showAlert(
                      'error',
                      'Account Created',
                      `Your account is ready, but these documents didn't upload: ${failedDocs.join(', ')}. Please re-upload them from your profile.`,
                    );
                  }
                  // Land on Profile (not the dashboard) so they immediately see their skills
                  // section and discover they can add more skills/professions anytime.
                  router.replace('/(tabs)/profile' as any);
                } catch (e: any) {
                  showAlert('error', 'Registration Failed', e?.message ?? 'Failed to create account. Please try again.');
                  setIsSubmitting(false);
                }
              }}
              disabled={calculateProgress() < 1 || isSubmitting}
            >
              <ThemedText style={styles.createButtonText}>{isSubmitting ? 'Creating Account...' : 'Create Account'}</ThemedText>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 20 }}>
            <ThemedText style={{ opacity: 0.6, fontFamily: Fonts.poppins, color: themeColors.text }}>Already have an account? </ThemedText>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <ThemedText style={{ color: themeColors.brand, fontFamily: Fonts.poppinsBold }}>Login here</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Profession Modal */}
      <Modal visible={showProfessionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Profession</ThemedText>
              <TouchableOpacity onPress={() => setShowProfessionModal(false)}>
                <X size={24} color={themeColors.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {professionsList.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.modalItem, formData.primaryProfession === name && { backgroundColor: themeColors.brand + '15' }]}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, primaryProfession: name, skills: [] }));
                    setShowProfessionModal(false);
                  }}
                >
                  <ThemedText style={[styles.modalItemText, formData.primaryProfession === name && { fontFamily: Fonts.poppinsBold, color: themeColors.brand }]}>
                    {name}
                  </ThemedText>
                  {formData.primaryProfession === name && <CheckCircle2 size={20} color={themeColors.brand} />}
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Skills Modal */}
      <Modal visible={showSkillsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Skills</ThemedText>
              <TouchableOpacity onPress={() => setShowSkillsModal(false)}>
                <X size={24} color={themeColors.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {availableSkills.map((skill) => {
                const isSelected = formData.skills.includes(skill);
                return (
                  <TouchableOpacity
                    key={skill}
                    style={[styles.modalItem, isSelected && { backgroundColor: themeColors.brand + '15' }]}
                    onPress={() => {
                      if (isSelected) {
                        setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }));
                      } else {
                        setFormData(prev => ({ ...prev, skills: [...prev.skills, skill] }));
                      }
                    }}
                  >
                    <ThemedText style={[styles.modalItemText, isSelected && { fontFamily: Fonts.poppinsBold, color: themeColors.text }]}>
                      {skill}
                    </ThemedText>
                    {isSelected ? <CheckCircle2 size={20} color={themeColors.brand} /> : <Circle size={20} color={themeColors.icon} />}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 40 }} />
            </ScrollView>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: themeColors.brand, margin: 24, marginTop: 0, height: 50, borderRadius: 25 }]}
              onPress={() => setShowSkillsModal(false)}
            >
              <ThemedText style={[styles.createButtonText, { fontSize: 16 }]}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Skill Tag Modal */}
      <Modal visible={showTagModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, maxHeight: '90%', flex: 1, marginTop: 'auto', borderTopLeftRadius: 32, borderTopRightRadius: 32, minHeight: '0%' }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Add Skill Proof</ThemedText>
              <TouchableOpacity onPress={() => setShowTagModal(false)}>
                <X size={24} color={themeColors.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Media preview — supports a batch of multiple files */}
              {pendingMediaBatch.length > 0 && (
                <View style={{ paddingVertical: 16, paddingHorizontal: 16, backgroundColor: themeColors.inputBackground }}>
                  <ThemedText style={{ fontSize: 13, fontFamily: Fonts.poppinsSemiBold, color: themeColors.icon, marginBottom: 10 }}>
                    {pendingMediaBatch.length} file{pendingMediaBatch.length !== 1 ? 's' : ''} selected
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {pendingMediaBatch.map((item, idx) => (
                        <View key={idx} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#000', overflow: 'hidden', position: 'relative' }}>
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
                  <ThemedText style={[styles.fieldLabel, { marginBottom: 8 }]}>Description</ThemedText>
                  <TextInput
                    style={[{
                      borderWidth: 1,
                      borderColor: themeColors.inputBorder,
                      borderRadius: 16,
                      padding: 14,
                      fontSize: 14,
                      fontFamily: Fonts.poppins,
                      color: themeColors.text,
                      minHeight: 80,
                      backgroundColor: themeColors.inputBackground,
                      textAlignVertical: 'top',
                    }]}
                    placeholder="What does this photo/video show?"
                    placeholderTextColor={themeColors.icon}
                    value={pendingDescription}
                    onChangeText={setPendingDescription}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* Skill Search & Select */}
                <View>
                  <ThemedText style={[styles.fieldLabel, { marginBottom: 8 }]}>Tag a Skill</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: themeColors.inputBackground, borderWidth: 1, borderColor: themeColors.inputBorder, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
                    <Layers size={16} color={themeColors.icon} />
                    <TextInput
                      style={{ flex: 1, fontSize: 14, fontFamily: Fonts.poppins, color: themeColors.text }}
                      placeholder="Search skills..."
                      placeholderTextColor={themeColors.icon}
                      value={tagSkillSearch}
                      onChangeText={setTagSkillSearch}
                    />
                  </View>

                  {selectedTagSkill && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                      <CheckCircle2 size={14} color="#10B981" />
                      <ThemedText style={{ flex: 1, fontSize: 13, fontFamily: Fonts.poppinsBold, color: '#166534' }}>{selectedTagSkill}</ThemedText>
                      <TouchableOpacity onPress={() => setSelectedTagSkill(null)}>
                        <X size={16} color={themeColors.icon} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {formData.skills.length === 0 ? (
                    <ThemedText style={{ fontSize: 13, color: themeColors.icon, fontFamily: Fonts.poppins }}>
                      Select your skills first (above) before tagging proof media.
                    </ThemedText>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {filteredRegisterSkills.map(skill => (
                        <TouchableOpacity
                          key={skill}
                          onPress={() => setSelectedTagSkill(skill)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 20,
                            backgroundColor: selectedTagSkill === skill ? themeColors.brand : themeColors.brand + '15',
                            borderWidth: 1,
                            borderColor: selectedTagSkill === skill ? '#D97706' : themeColors.brand + '50',
                          }}
                        >
                          <ThemedText style={{ color: themeColors.text, fontFamily: Fonts.poppinsBold, fontSize: 12 }}>{skill}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Submit */}
            <View style={{ padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopWidth: 1, borderTopColor: themeColors.inputBorder }}>
              <TouchableOpacity
                style={[styles.createButton, { backgroundColor: themeColors.brand, height: 50, borderRadius: 25, opacity: selectedTagSkill ? 1 : 0.4 }]}
                onPress={handleTagSkill}
                disabled={!selectedTagSkill}
              >
                <ThemedText style={[styles.createButtonText, { fontSize: 15 }]}>
                  Add {pendingMediaBatch.length > 1 ? `${pendingMediaBatch.length} Files` : 'Proof'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={customAlert.visible} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <Animated.View entering={FadeIn.duration(300)} style={styles.customAlertContainer}>
            <View style={[styles.alertIconContainer, { backgroundColor: customAlert.type === 'success' ? '#ECFDF5' : customAlert.type === 'delete' ? '#FEF2F2' : '#FEF2F2' }]}>
              {customAlert.type === 'success' ? (
                <CheckCircle2 size={32} color="#10B981" />
              ) : customAlert.type === 'delete' ? (
                <Trash2 size={32} color="#EF4444" />
              ) : (
                <AlertTriangle size={32} color="#EF4444" />
              )}
            </View>

            <ThemedText style={styles.alertTitle}>{customAlert.title}</ThemedText>
            <ThemedText style={styles.alertMessage}>{customAlert.message}</ThemedText>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: customAlert.type === 'success' ? '#10B981' : '#EF4444' }]}
              onPress={hideAlert}
            >
              <ThemedText style={styles.alertButtonText}>Got it!</ThemedText>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal >

    </ThemedView >
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
  },
  modalScroll: {
    paddingHorizontal: 24,
    flex: 1,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderRadius: 12,
  },
  modalItemText: {
    fontSize: 15,
    fontFamily: Fonts.poppins,
  },
  container: {
    flex: 1,
  },
  topProgressBarContainer: {
    height: 4,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
    position: 'absolute',
    top: 0,
    zIndex: 100,
  },
  topProgressBar: {
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 5,
    padding: 8,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: Fonts.poppinsBold,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.5,
    paddingHorizontal: 20,
    fontFamily: Fonts.poppins,
  },
  section: {
    backgroundColor: t.background,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 18,
    fontFamily: Fonts.poppinsBold,
  },
  sectionLabelSmall: {
    fontSize: 16,
    fontFamily: Fonts.poppinsBold,
  },
  sectionSubLabel: {
    fontSize: 11,
    opacity: 0.5,
    fontFamily: Fonts.poppins,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    marginBottom: 8,
  },
  requiredMark: {
    fontSize: 14,
    fontFamily: Fonts.poppinsBold,
    color: '#EF4444',
  },
  photoContainer: {
    alignItems: 'center',
  },
  photoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    overflow: 'hidden',
  },
  profilePreview: {
    width: '100%',
    height: '100%',
  },
  plusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  photoLabel: {
    fontSize: 11,
    opacity: 0.6,
    fontFamily: Fonts.poppinsBold,
  },
  inputGroup: {
    marginBottom: 16,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countryPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 8,
  },
  // No divider line here on purpose — with only 3 elements (flag, code,
  // chevron) in a compact pill, a hard divider reads as visual clutter;
  // consistent gap spacing groups them just as clearly without it.
  callingCodeText: {
    fontFamily: Fonts.poppinsBold,
    fontSize: 15,
  },
  input: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.poppins,
  },
  verifyButtonAction: {
    backgroundColor: '#FFCE48',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCE48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonText: {
    color: '#000',
    fontFamily: Fonts.poppinsBold,
    fontSize: 14,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  verifiedText: {
    color: '#166534',
    fontSize: 13,
    fontFamily: Fonts.poppinsBold,
  },
  otpSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  otpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  otpInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  verifyConfirmButton: {
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
  },
  verifyConfirmText: {
    color: '#FFF',
    fontFamily: Fonts.poppinsBold,
    fontSize: 14,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  locationButtonText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsBold,
    color: '#FFB800',
  },
  addressTypeContainer: {
    marginTop: 8,
  },
  typeChips: {
    flexDirection: 'row',
    gap: 12,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  typeChipText: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: Fonts.poppinsSemiBold,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
    top: 18,
  },
  dropdownIcon: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
    top: 18,
  },
  inputIconWrapper: {
    position: 'absolute',
    left: 16,
    top: 18,
    zIndex: 2,
  },
  inputWithIcon: {
    flex: 1,
    paddingLeft: 48,
    paddingRight: 16,
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 20,
    paddingBottom: 16,
    borderRadius: 20,
  },
  suggestionsDropdown: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionMainText: {
    fontSize: 15,
    color: '#111827',
    fontFamily: Fonts.poppinsSemiBold,
  },
  suggestionDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  suggestionDistance: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingRight: 6,
  },
  suggestionSecondaryText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
    flex: 1,
  },
  locateOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  locateOnMapText: {
    fontSize: 13,
    color: '#344054',
    fontFamily: Fonts.poppinsBold,
  },
  inputLoader: {
    position: 'absolute',
    right: 12,
    top: 18,
  },
  searchingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingText: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
    textAlign: 'center',
    marginBottom: 8,
  },
  manualText: {
    fontSize: 13,
    color: '#FFCE48',
    fontFamily: Fonts.poppinsBold,
  },
  addressPreviewCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 12,
    fontFamily: Fonts.poppinsBold,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  previewAddress: {
    fontSize: 14,
    color: '#344054',
    fontFamily: Fonts.poppinsSemiBold,
    lineHeight: 20,
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  coordsText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: Fonts.poppins,
  },
  validBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  validText: {
    fontSize: 10,
    color: '#059669',
    fontFamily: Fonts.poppinsBold,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontFamily: Fonts.poppinsSemiBold,
    flex: 1,
  },
  uploadBox: {
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadBoxText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: Fonts.poppinsSemiBold,
  },
  documentPreviewContainer: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  documentPreview: {
    width: '100%',
    height: '100%',
  },
  removeDocButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPreviewSquare: {
    width: 76,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addMediaSquare: {
    width: 76,
    height: 76,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeDocButtonSmall: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: Fonts.poppinsSemiBold,
    marginTop: 16,
    color: '#6B7280',
  },
  createButton: {
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#FFCE48',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  createButtonText: {
    fontFamily: Fonts.poppinsBold,
    fontSize: 18,
    color: '#000',
  },
  skillTagBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  skillTagText: {
    color: '#FFF',
    fontSize: 9,
    fontFamily: Fonts.poppinsBold,
    textAlign: 'center',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
  },
  strengthContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  strengthBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthBarActive: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 11,
    fontFamily: Fonts.poppinsBold,
    minWidth: 60,
  },
  passwordErrorText: {
    color: '#FF4B4B',
    fontSize: 11,
    fontFamily: Fonts.poppins,
    marginTop: 4,
  },
  passwordMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  passwordMatchText: {
    color: '#4CAF50',
    fontSize: 11,
    fontFamily: Fonts.poppins,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  customAlertContainer: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
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
    fontFamily: Fonts.poppinsBold,
    color: '#111827',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 14,
    fontFamily: Fonts.poppins,
    color: '#6B7280',
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
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  });
}
