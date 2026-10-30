import AnimatedBackground from '@/components/animated-background';
import { CodeTimerRow } from '@/components/code-timer-row';
import { useCodeTimer } from '@/hooks/use-code-timer';
import { API_BASE_URL } from '@/services/api-config';
import AnimatedBrandMark from '@/components/animated-brand-mark';
import { AcceptedIdDocuments } from '@/components/accepted-id-documents';
import { byProfession, mainProfession, prefetchSkillCatalogue, SkillPicker, type PickedSkill } from '@/components/skill-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi, TokenStore } from '@/services/api';
import { isEmail, tidyEmail } from '@/services/email';
import { NAME_PART_MAX, hasFullName, namePayload } from '@/services/name';
import { PASSWORD_RULE, isValidPassword } from '@/services/password';
import { registerFcmToken } from '@/services/callManager';
import { GooglePlacesService, GooglePlaceSuggestion } from '@/services/google-places';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import FaceDetection from '@react-native-ml-kit/face-detection';
import * as ExpoLocation from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
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
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/scaled-text';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { UsPhonePrefix, US_CALLING_CODE, US_PHONE_INPUT_MAX, formatUsPhone, isUsPhone, usPhoneDigits } from '@/components/us-phone-prefix';
import Animated, {
  FadeIn,
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';

// Runs the tasks at most `limit` at a time — uploads in parallel without
// choking a phone's connection with six videos at once.
async function runLimited(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

const nameOf = (f: { firstName: string; middleName: string; lastName: string }) =>
  ({ first: f.firstName, middle: f.middleName, last: f.lastName });

export default function RegisterScreen() {
  const bottomInset = useBottomInset();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);


  // Set by login.tsx when it redirects here after finding no Provider
  // profile for a number (is_new_role) — see that screen's own comment.
  // THIS screen's own verifyOTP call, moments later for the same number,
  // will always see is_new_user=false by then (the identity row was
  // already created by login.tsx's call) regardless of whether this is a
  // genuinely brand-new person or an existing Customer adding a Provider
  // role — the two cases are indistinguishable from this call alone.
  // resumedIsNewUser carries the ORIGINAL, authoritative answer captured
  // before any of that happened, so isAddingRole (which controls whether
  // the password step is skipped) still comes out correct for a
  // brand-new person instead of being misread as "existing account,
  // adding a role" just because Login happened to touch it first.
  const { prefillPhone, resumedIsNewUser } = useLocalSearchParams<{ prefillPhone?: string; resumedIsNewUser?: string }>();

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    mobileNumber: prefillPhone ?? '',
    otp: '',
    address: '',
    idNumber: '',
    password: '',
    confirmPassword: '',
    skills: [] as PickedSkill[],
    experience: '',
  });


  // Skills from any profession (a handyman who also mows lawns and tutors),
  // as many as they offer.
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  // "Show me as": the one title on job cards — the provider's choice, else the
  // profession most of their skills are in.
  const [shownAs, setShownAs] = useState('');
  const [showShownAsModal, setShowShownAsModal] = useState(false);
  const headline = shownAs && formData.skills.some(s => s.profession === shownAs) ? shownAs : mainProfession(formData.skills);
  const skillNames = useMemo(() => formData.skills.map(s => s.name), [formData.skills]);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [idDocumentImage, setIdDocumentImage] = useState<string | null>(null);
  const [idDocumentBase64, setIdDocumentBase64] = useState<{ data: string; mime: string } | null>(null);
  const [workProofImage, setWorkProofImage] = useState<string | null>(null);
  const [workProofBase64, setWorkProofBase64] = useState<{ data: string; mime: string } | null>(null);
  const [proofOfSkillsMedia, setProofOfSkillsMedia] = useState<{ uri: string, skill: string, description: string, type: 'image' | 'video', mime?: string }[]>([]);
  const [isOtpSent, setIsOtpSent] = useState(false);
  // The server's answer that this email belongs to someone else, shown under the field.
  const [emailTaken, setEmailTaken] = useState(false);
  // How long the code lasts, and when "Resend" works again.
  const codeTimer = useCodeTimer();
  const [isOtpVerified, setIsOtpVerified] = useState(false);

  // Is the typed email someone else's? Checked on its own, never as part of
  // sending the number's code: when they leave the field and right after the
  // number is verified (the check needs that signed-in session, so it can't
  // be used to test which emails have accounts). The save checks again.
  const emailAsked = useRef('');
  const checkEmail = async (typed: string) => {
    if (!isOtpVerified || !typed.trim() || !isEmail(typed)) return;
    const email = tidyEmail(typed);
    emailAsked.current = email;
    try {
      const { available } = await SkoFyApi.auth.checkEmail(email);
      if (emailAsked.current === email) setEmailTaken(!available);
    } catch {
      // No answer: the save still checks.
    }
  };
  useEffect(() => {
    if (isOtpVerified) checkEmail(formData.email);
  }, [isOtpVerified]);
  // True when this phone already had a Customer account and is now adding a
  // Provider profile (dual-role, same identity) — as opposed to a genuinely
  // brand-new account. A password already exists for this identity, so the
  // password step below is skipped rather than calling setPassword without
  // the current_password it would then require.
  const [isAddingRole, setIsAddingRole] = useState(false);


  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingMediaBatch, setPendingMediaBatch] = useState<{ uri: string, type: 'image' | 'video', mime?: string }[]>([]);
  const [pendingDescription, setPendingDescription] = useState('');
  const [selectedTagSkill, setSelectedTagSkill] = useState<string | null>(null);
  const [tagSkillSearch, setTagSkillSearch] = useState('');

  // Only skills the provider actually selected for their profession can be tagged on proof media —
  // not the full ALL_SKILLS catalog across every profession.
  const filteredRegisterSkills = useMemo(() => {
    if (!tagSkillSearch.trim()) return skillNames;
    return skillNames.filter(s => s.toLowerCase().includes(tagSkillSearch.toLowerCase()));
  }, [tagSkillSearch, skillNames]);

  const toggleSkill = (skill: PickedSkill) => {
    if (formData.skills.some(s => s.id === skill.id)) {
      setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== skill.id) }));
      // Proof media tagged to a skill they dropped no longer applies.
      setProofOfSkillsMedia(prev => prev.filter(m => m.skill !== skill.name));
    } else {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, skill] }));
    }
  };

  // Signed in from here on: load the skill list now so the picker opens ready.
  useEffect(() => {
    if (isOtpVerified) prefetchSkillCatalogue();
  }, [isOtpVerified]);

  const openSkillPicker = () => {
    // The catalogue needs the signed-in session the code check gives.
    if (!isOtpVerified) {
      showAlert('error', 'Verify Your Number First', 'Verify your mobile number above, then pick your skills.');
      return;
    }
    setShowSkillPicker(true);
  };

  // US launch: US numbers only — the server accepts only +1 numbers.
  const callingCode = US_CALLING_CODE;
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'delete';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  // Runs once the alert is dismissed — e.g. leave for Profile only after the
  // provider has read which documents didn't upload (the alert lives on this
  // screen, so leaving first would close it unseen).
  const afterAlert = useRef<(() => void) | null>(null);

  const showAlert = (type: 'success' | 'error' | 'delete', title: string, message: string) => {
    setCustomAlert({ visible: true, type, title, message });
  };

  const hideAlert = () => {
    setCustomAlert({ ...customAlert, visible: false });
    const next = afterAlert.current;
    afterAlert.current = null;
    next?.();
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
  // What the save is doing now, shown on the button ("Uploading proofs 2 of 5…").
  const [saveStage, setSaveStage] = useState('');
  // Steps already saved: "Try again" after a failure picks up where it stopped
  // instead of re-uploading everything (and setting the password twice, which
  // the server refuses). Keys carry the value, so an edited field is re-sent.
  const savedSteps = useRef(new Set<string>());
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
    // National ID Number / ID Document are intentionally NOT counted toward
    // the required total — the ID section's own subtitle tells the user
    // they're "Recommended for account recovery," not mandatory. They used
    // to count here anyway, so Create Account silently stayed disabled
    // below 100% until a user filled in fields the UI told them were
    // optional, with no field-level error explaining why the button was
    // stuck. Still tracked below (idNumberFilled/idDocFilled) so filling
    // them in nudges the progress bar, just not required to reach 100%.
    const total = isAddingRole ? 8 : 9; // Professional details (Profession/Skills, Experience), [Password]
    // The photo is required: customers need to recognise who's at the door.
    if (profileImage) completed++;
    if (hasFullName(nameOf(formData))) completed++;
    if (isOtpVerified) completed++;
    if (formData.address) completed++;
    if (addressType) completed++; // Always has a value
    if (formData.skills.length > 0) completed++;
    if (formData.experience) completed++;
    // Work proof is optional (it nudges the bar, like the ID fields below).
    if (!isAddingRole && formData.password && formData.password === formData.confirmPassword && isValidPassword(formData.password)) completed++;
    if (agreedToTerms && agreedToPrivacy) completed++;

    const idNumberFilled = formData.idNumber ? 1 : 0;
    const idDocFilled = idDocumentImage ? 1 : 0;
    const workProofFilled = workProofImage ? 1 : 0;
    return Math.min(1, (completed + idNumberFilled + idDocFilled + workProofFilled) / total);
  };

  // Mirrors calculateProgress()'s own required checks exactly — surfaced to
  // the user when they tap a not-yet-complete Create Account button, since
  // a silently-disabled button with no explanation left them guessing which
  // of several sections they'd missed.
  const getMissingSteps = (): string[] => {
    const missing: string[] = [];
    if (!profileImage) missing.push('Profile Photo');
    if (!hasFullName(nameOf(formData))) missing.push('First and last name');
    if (!isOtpVerified) missing.push('Mobile Number Verification (tap "Verify with OTP")');
    if (!formData.address) missing.push('Address');
    if (formData.skills.length === 0) missing.push('Skills');
    if (!formData.experience) missing.push('Years of Experience');
    else if (Number(formData.experience) > 60) missing.push('Years of Experience (0 to 60)');
    if (!isAddingRole && !(formData.password && formData.password === formData.confirmPassword && isValidPassword(formData.password))) {
      missing.push(`Password (${PASSWORD_RULE.toLowerCase()}, matching in both fields)`);
    }
    if (!(agreedToTerms && agreedToPrivacy)) missing.push('Agree to Terms & Conditions and Privacy Policy');
    return missing;
  };

  useEffect(() => {
    progressValue.value = withTiming(calculateProgress(), { duration: 350 });
  }, [formData, isOtpVerified, addressType, idDocumentImage, workProofImage, agreedToTerms, agreedToPrivacy, isAddingRole, profileImage]);

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
    if (pass.length < 8) return { label: 'Too Short', color: '#FF4B4B', width: '20%', score: 1 };
    // The server needs a letter and a number — not "Weak", not allowed at all.
    if (!isValidPassword(pass)) return { label: 'Add a letter and a number', color: '#FF4B4B', width: '25%', score: 1 };

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
          'Camera access is turned off for Dodorez Pro. Enable it in Settings to take your profile photo.',
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
    if (!isUsPhone(formData.mobileNumber)) {
      showAlert('error', 'Invalid Number', 'Enter a valid 10-digit phone number.');
      return;
    }
    try {
      const res = await SkoFyApi.auth.sendOTP(`+${callingCode}${formData.mobileNumber}`, 'register');
      setIsOtpSent(true);
      codeTimer.start(res.expires_in_seconds);
    } catch (error: any) {
      // Already registered here: the server says so before sending a code.
      if (error?.error_code === 'ALREADY_REGISTERED') {
        showAlert('error', 'Already Registered', 'This mobile number already has a provider account. Please use "Login here" below instead.');
        return;
      }
      showAlert('error', 'OTP Error', error?.message || 'Failed to send OTP. Please check your mobile number.');
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(formData.otp)) {
      showAlert('error', 'Invalid Code', 'Enter the 6-digit code sent to your phone.');
    } else if (codeTimer.expired) {
      showAlert('error', 'Code Expired', 'That code has expired. Tap Resend for a new one.');
    } else {
      try {
        const user = await SkoFyApi.auth.verifyOTP(`+${callingCode}${formData.mobileNumber}`, formData.otp);
        // Signing in removes this account's push tokens from its other phones
        // (and from this one), so this phone registers its own again at once.
        registerFcmToken();
        // is_new_role (not is_new_user) is what actually gates whether
        // there's a Provider profile left to fill in — is_new_user alone
        // can't distinguish "brand-new account" from "this phone already
        // has a Customer account and just got a Provider profile added"
        // (dual-role support, same identity/phone).
        //
        // !is_new_role alone isn't enough to mean "already registered,"
        // though — verify_otp auto-creates a bare account for ANY phone
        // that completes OTP, including via the Login screen (which now
        // redirects here on is_new_role, see login.tsx). Re-verifying the
        // SAME number here afterward would see is_new_role=false (that
        // bare account now exists) and, without the profile_complete
        // check, incorrectly bounce back to Login as "already
        // registered" — Login says no account, Register says already
        // registered, forever. profile_complete distinguishes a genuinely
        // finished registration from a bare shell still named "New
        // Provider" with nothing else filled in yet, which is exactly the
        // case that belongs here, not back at Login.
        if (!user.is_new_role && user.profile_complete) {
          showAlert('error', 'Already Registered', 'This mobile number already has an account. Please use "Login here" below instead.');
          return;
        }
        TokenStore.markRegistering().catch(() => {});
        const isNewUser = resumedIsNewUser != null ? resumedIsNewUser === '1' : user.is_new_user;
        setIsAddingRole(!isNewUser);
        // A new sign-in (maybe another number): nothing is saved for it yet.
        savedSteps.current.clear();
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
          contentContainerStyle={padBottom(styles.scrollContent, bottomInset)}
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

            <AnimatedBrandMark size={44} nameSize={26} />

            <ThemedText style={styles.title}>Register as a Pro</ThemedText>
            <ThemedText style={styles.subtitle}>Register to start providing services and grow your business</ThemedText>
          </View>

          {/* Section: Personal Details */}
          <Animated.View entering={FadeInLeft.delay(200)} style={styles.section}>
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
                  {!profileImage && !checkingFace && <ThemedText style={styles.requiredMark}> *</ThemedText>}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>First name<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TextInput
                style={getInputStyle('firstName')}
                placeholder="First name"
                placeholderTextColor={themeColors.icon}
                value={formData.firstName}
                onChangeText={(text) => setFormData(prev => ({ ...prev, firstName: text }))}
                maxLength={NAME_PART_MAX}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
                onFocus={() => setFocusedInput('firstName')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Middle name</ThemedText>
              <TextInput
                style={getInputStyle('middleName')}
                placeholder="Optional"
                placeholderTextColor={themeColors.icon}
                value={formData.middleName}
                onChangeText={(text) => setFormData(prev => ({ ...prev, middleName: text }))}
                maxLength={NAME_PART_MAX}
                autoCapitalize="words"
                autoComplete="name-middle"
                textContentType="middleName"
                onFocus={() => setFocusedInput('middleName')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Last name<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TextInput
                style={getInputStyle('lastName')}
                placeholder="Last name"
                placeholderTextColor={themeColors.icon}
                value={formData.lastName}
                onChangeText={(text) => setFormData(prev => ({ ...prev, lastName: text }))}
                maxLength={NAME_PART_MAX}
                autoCapitalize="words"
                autoComplete="name-family"
                textContentType="familyName"
                onFocus={() => setFocusedInput('lastName')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Email Address</ThemedText>
              <View style={[...getInputStyle('email'), { flexDirection: 'row', alignItems: 'center' }]}>
                <Mail size={18} color={themeColors.icon} style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, color: themeColors.text, fontFamily: Fonts.poppins, fontSize: 15, lineHeight: 21 }}
                  placeholder="you@example.com"
                  placeholderTextColor={themeColors.icon}
                  value={formData.email}
                  onChangeText={(text) => { setFormData(prev => ({ ...prev, email: text })); setEmailTaken(false); emailAsked.current = ''; }}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => { setFocusedInput(null); checkEmail(formData.email); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {!!formData.email.trim() && (!isEmail(formData.email) || emailTaken) && (
                <ThemedText style={{ fontSize: 12, lineHeight: 18, color: '#EF4444', marginTop: 4, fontFamily: Fonts.poppins }}>
                  {emailTaken ? 'This email is already used by another account.' : 'Enter a valid email, like name@example.com.'}
                </ThemedText>
              )}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Mobile Number<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <View style={styles.phoneInputContainer}>
                <UsPhonePrefix
                  style={[styles.countryPickerButton, { backgroundColor: themeColors.inputBackground, borderColor: (themeColors as any).inputBorder, borderWidth: 1 }]}
                  textStyle={styles.callingCodeText}
                />
                <TextInput
                  style={[getInputStyle('mobileNumber'), { flex: 1 }]}
                  placeholder="Mobile Number"
                  placeholderTextColor={themeColors.icon}
                  keyboardType="numeric"
                  numberOfLines={1}
                  value={formatUsPhone(formData.mobileNumber)}
                  onChangeText={(text) => {
                    // Only allow numbers
                    const cleaned = usPhoneDigits(text);
                    setFormData(prev => ({ ...prev, mobileNumber: cleaned }));
                  }}
                  onFocus={() => setFocusedInput('mobileNumber')}
                  onBlur={() => setFocusedInput(null)}
                  editable={!isOtpVerified}
                  maxLength={US_PHONE_INPUT_MAX}
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
                    <ThemedText style={{ color: themeColors.brand, fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppinsBold }}>Edit</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {isOtpSent && (
              <Animated.View entering={FadeIn} style={styles.otpSection}>
                <View style={styles.otpHeader}>
                  <ThemedText style={styles.fieldLabel}>Enter OTP</ThemedText>
                  <TouchableOpacity onPress={() => { setIsOtpSent(false); setFormData((prev) => ({ ...prev, otp: '' })); codeTimer.reset(); }} hitSlop={8}>
                    <X size={16} color={themeColors.icon} />
                  </TouchableOpacity>
                </View>
                <View style={styles.otpInputRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={[getInputStyle('otp'), { flex: 1, paddingRight: 50 }]}
                      placeholder="6-digit code"
                      placeholderTextColor={themeColors.icon}
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                      textContentType="oneTimeCode"
                      secureTextEntry={!showOtp}
                      value={formData.otp}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, otp: text.replace(/\D/g, '') }))}
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
                <CodeTimerRow timer={codeTimer} onResend={handleSendOtp} />
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
                  placeholder={PASSWORD_RULE}
                  autoCapitalize="none"
                  autoCorrect={false}
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
                  autoCapitalize="none"
                  autoCorrect={false}
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
          <Animated.View entering={FadeInLeft.delay(400)} style={styles.section}>
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
          <Animated.View entering={FadeInLeft.delay(500)} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Briefcase size={20} color={themeColors.brand} />
              <View>
                <ThemedText style={styles.sectionLabelSmall}>Professional Details</ThemedText>
                <ThemedText style={styles.sectionSubLabel}>(Showcase your expertise)</ThemedText>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Skills you offer<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <ThemedText style={styles.skillsHint}>Everything you can do, from any field: fixing fans, walking dogs, tutoring math — add them all.</ThemedText>
              {/* One set of chips, not grouped by profession: they're the
                  provider's skills, not a profession they've signed up to. */}
              {formData.skills.length > 0 && (
                <View style={[styles.skillChips, { marginTop: 12 }]}>
                  {formData.skills.map(skill => (
                    <TouchableOpacity key={skill.id} onPress={() => toggleSkill(skill)} style={styles.skillChip} hitSlop={4}>
                      <ThemedText style={styles.skillChipText}>{skill.name}</ThemedText>
                      <X size={14} color={themeColors.text} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity style={[getInputStyle('skills'), { justifyContent: 'center' }]} onPress={openSkillPicker}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Plus size={18} color={themeColors.text} />
                  <Text style={{ flex: 1, color: themeColors.text, fontFamily: Fonts.poppinsSemiBold, fontSize: 15, lineHeight: 21 }}>
                    {formData.skills.length > 0 ? 'Add or change skills' : 'Choose your skills'}
                  </Text>
                  {formData.skills.length > 0 && (
                    <Text style={{ color: themeColors.icon, fontFamily: Fonts.poppins, fontSize: 13 }}>{formData.skills.length} added</Text>
                  )}
                </View>
              </TouchableOpacity>
              <ThemedText style={styles.skillsHint}>Each skill gets jobs once you pass its short test. Add more anytime from your profile.</ThemedText>
            </View>

            {formData.skills.length > 0 && (
              <View style={styles.inputGroup}>
                <ThemedText style={styles.fieldLabel}>Show me as</ThemedText>
                <TouchableOpacity style={[getInputStyle('shownAs'), { justifyContent: 'center' }]} onPress={() => setShowShownAsModal(true)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: themeColors.text, fontFamily: Fonts.poppins, fontSize: 15, lineHeight: 21 }}>{headline}</Text>
                    <ChevronDown size={20} color={themeColors.icon} />
                  </View>
                </TouchableOpacity>
                <ThemedText style={styles.skillsHint}>Your main title on job cards, picked from your skills. Change it if you like.</ThemedText>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>Years of Experience<ThemedText style={styles.requiredMark}> *</ThemedText></ThemedText>
              <TextInput
                style={getInputStyle('experience')}
                placeholder="Ex: 5"
                placeholderTextColor={themeColors.icon}
                keyboardType="number-pad"
                maxLength={2}
                value={formData.experience}
                onChangeText={(text) => setFormData(prev => ({ ...prev, experience: text.replace(/\D/g, '') }))}
                onFocus={() => setFocusedInput('experience')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <View style={{ marginTop: 8, marginBottom: 16 }}>
              <ThemedText style={styles.fieldLabel}>Upload Work Proof Certificate (optional)</ThemedText>
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

          {/* Section: Identity Verification */}
          <Animated.View entering={FadeInLeft.delay(600)} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <ShieldCheck size={20} color={themeColors.brand} />
              <View>
                <ThemedText style={styles.sectionLabelSmall}>Identity Verification</ThemedText>
                <ThemedText style={styles.sectionSubLabel}>(Required before you can apply for jobs)</ThemedText>
              </View>
            </View>

            <AcceptedIdDocuments />

            <View style={styles.inputGroup}>
              <ThemedText style={styles.fieldLabel}>ID number</ThemedText>
              <TextInput
                style={getInputStyle('idNumber')}
                placeholder="e.g. your driver's license number"
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
                  <ThemedText style={styles.uploadBoxText}>Tap to upload a photo of the front of your ID (JPG/PNG)</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <ThemedText style={styles.statusLabel}>Verification Status: <Text style={{ color: themeColors.brand, fontFamily: Fonts.poppinsBold }}>Pending</Text></ThemedText>
          </Animated.View>

          {/* Section: Consent & Compliance */}
          <Animated.View entering={FadeInLeft.delay(800)} style={styles.section}>
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
                <ThemedText style={styles.checkboxLabel}>I consent to <Text style={{ color: themeColors.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_BASE_URL}/legal/privacy`)}>Privacy Policy</Text></ThemedText>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Footer Button */}
          <Animated.View style={createButtonStyle}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: themeColors.brand, opacity: (calculateProgress() === 1 && !isSubmitting) ? 1 : 0.7 }]}
              onPress={async () => {
                if (isSubmitting) return;
                const missing = getMissingSteps();
                if (missing.length > 0) {
                  showAlert('error', 'Almost There', `Please complete: ${missing.join(', ')}.`);
                  return;
                }
                if (formData.email.trim() && !isEmail(formData.email)) {
                  showAlert('error', 'Invalid Email', 'Please enter a valid email address or leave it blank.');
                  return;
                }
                if (formData.email.trim() && emailTaken) {
                  showAlert('error', 'Email Already Used', "This email is already used by another account. Use a different email, or leave it blank.");
                  return;
                }
                setIsSubmitting(true);
                setSaveStage('Saving your profile...');
                const done = savedSteps.current;
                // Runs a step once; a retry skips it if it already went through.
                const step = async (key: string, run: () => Promise<unknown>) => {
                  if (done.has(key)) return;
                  await run();
                  done.add(key);
                };
                // A short stand-in for a picked file, so a different file is a new step.
                const fileKey = (f: { data: string }) => `${f.data.length}:${f.data.slice(-24)}`;
                try {
                  // Prefer the city resolved by Google Places / GPS reverse-geocode (accurate,
                  // pulled from the address's actual "locality" component). Only fall back to
                  // guessing from the raw address string if the user typed an address manually
                  // without picking a suggestion.
                  const cityFromAddress = selectedCity || (formData.address
                    ? formData.address.split(',').map(s => s.trim()).find(s => s.length > 2)
                    : undefined);

                  // First and always: it creates the provider profile the rest hangs on,
                  // and is safe to send again.
                  await SkoFyApi.auth.updateProfile({
                    ...namePayload(nameOf(formData)),
                    email: formData.email.trim() ? tidyEmail(formData.email) : undefined,
                    bio: formData.experience
                      ? `${formData.experience} years of experience as a ${headline}`
                      : undefined,
                    years_experience: parseInt(formData.experience, 10) || 0,
                    city: cityFromAddress,
                  });

                  // The rest of the account, all at once: none depends on another.
                  setSaveStage('Setting up your account...');
                  const essentials: Promise<void>[] = [
                    // Skipped when adding a role to an existing account — a
                    // password already exists for this identity, and
                    // setPassword() would require current_password to change it.
                    ...(formData.password && !isAddingRole
                      ? [step('password', async () => {
                        // If an earlier try's reply was lost (timeout), the password may
                        // already be set — the server then asks for the "current" one.
                        // On a brand-new account, that password can only be ours.
                        const sentBefore = done.has('password:sent');
                        done.add('password:sent');
                        await SkoFyApi.auth.setPassword(formData.password).catch((err) => {
                          if (!(sentBefore && err?.error_code === 'CURRENT_PASSWORD_REQUIRED')) throw err;
                        });
                      })] : []),
                    // By catalogue id, so each keeps its own profession (they can come
                    // from several) and nothing new is ever created by name.
                    ...formData.skills.map(skill => step(`skill:${skill.id}`, () => SkoFyApi.skills.addSkill(skill.id))),
                  ];
                  if (formData.idNumber || selectedCoords) {
                    essentials.push(step(`provider:${formData.idNumber}|${cityFromAddress}`, () => SkoFyApi.provider.updateProfile({
                      id_number: formData.idNumber || undefined,
                      city: cityFromAddress,
                    })));
                  }
                  if (selectedCoords) {
                    essentials.push(step(`location:${selectedCoords.lat},${selectedCoords.lng}`,
                      () => SkoFyApi.provider.updateLocation(selectedCoords.lat, selectedCoords.lng)));
                  }
                  if (profileImageBase64) {
                    essentials.push(step(`photo:${fileKey(profileImageBase64)}`,
                      () => SkoFyApi.provider.uploadProfileImage(profileImageBase64.data, profileImageBase64.mime)));
                  }
                  // allSettled, so every step gets its chance before a failure is
                  // shown — the retry then only redoes what didn't go through.
                  const failure = (await Promise.allSettled(essentials)).find(r => r.status === 'rejected');
                  if (failure) throw (failure as PromiseRejectedResult).reason;

                  // Save ID proof, work proof, and skill proof documents (non-fatal — visible
                  // in profile afterwards, but shouldn't block account creation if upload fails).
                  // Failures here used to be totally silent — the account would be created with
                  // no documents and nobody (user or us, debugging) would know why.
                  const failedDocs: string[] = [];
                  const uploads: { key: string; label: string; run: () => Promise<unknown> }[] = [];
                  if (idDocumentBase64) {
                    uploads.push({ key: `id:${fileKey(idDocumentBase64)}`, label: 'ID proof', run: () => SkoFyApi.provider.addDocument({
                      doc_type: 'ID_PROOF',
                      image_base64: idDocumentBase64.data,
                      mime_type: idDocumentBase64.mime,
                    }) });
                  }
                  if (workProofBase64) {
                    uploads.push({ key: `work:${fileKey(workProofBase64)}`, label: 'Work proof', run: () => SkoFyApi.provider.addDocument({
                      doc_type: 'WORK_PROOF',
                      image_base64: workProofBase64.data,
                      mime_type: workProofBase64.mime,
                    }) });
                  }
                  // Skill-proof media (image or video) always goes through the multipart
                  // upload path — keeps a single, reliable code path for both media types.
                  for (const item of proofOfSkillsMedia) {
                    uploads.push({ key: `proof:${item.uri}`, label: `${item.skill} proof`, run: () => SkoFyApi.provider.addDocumentFile({
                      fileUri: item.uri,
                      mimeType: item.mime ?? (item.type === 'video' ? 'video/mp4' : 'image/jpeg'),
                      doc_type: 'SKILL_PROOF',
                      skill_name: item.skill,
                      description: item.description || undefined,
                    }) });
                  }
                  const toUpload = uploads.filter(u => !done.has(u.key));
                  let finished = 0;
                  if (toUpload.length > 0) setSaveStage(`Uploading documents 0 of ${toUpload.length}...`);
                  await runLimited(toUpload.map(u => async () => {
                    await step(u.key, u.run).catch((err) => {
                      console.error(`Failed to upload ${u.label}:`, err);
                      failedDocs.push(u.label);
                    });
                    finished++;
                    setSaveStage(`Uploading documents ${finished} of ${toUpload.length}...`);
                  }), 2);

                  // Land on Profile (not the dashboard) so they immediately see their skills
                  // section and discover they can add more skills/professions anytime.
                  await TokenStore.finishRegistering().catch(() => {});
                  const goToProfile = () => router.replace('/(tabs)/profile' as any);
                  if (failedDocs.length > 0) {
                    setSaveStage('Account created');
                    afterAlert.current = goToProfile;
                    showAlert(
                      'error',
                      'Account Created',
                      `Your account is ready, but these documents didn't upload: ${failedDocs.join(', ')}. Please re-upload them from your profile.`,
                    );
                  } else {
                    goToProfile();
                  }
                } catch (e: any) {
                  if (e?.error_code === 'EMAIL_ALREADY_EXISTS') setEmailTaken(true);
                  showAlert('error', 'Registration Failed', e?.message ?? 'Failed to create account. Please try again.');
                  setIsSubmitting(false);
                  setSaveStage('');
                }
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color="#000" />
                  <ThemedText style={styles.createButtonText}>{saveStage || 'Creating Account...'}</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.createButtonText}>Create Account</ThemedText>
              )}
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

      <SkillPicker
        visible={showSkillPicker}
        onClose={() => setShowSkillPicker(false)}
        isPicked={(skill) => formData.skills.some(s => s.id === skill.id)}
        onPick={toggleSkill}
        note={formData.skills.length > 0 ? `${formData.skills.length} selected` : undefined}
        excludeProfessions={['Personal Errands']}
      />

      <Modal statusBarTranslucent navigationBarTranslucent visible={showShownAsModal} transparent animationType="slide" onRequestClose={() => setShowShownAsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={padBottom([styles.modalContent, { backgroundColor: themeColors.background }], bottomInset)}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Show me as</ThemedText>
              <TouchableOpacity onPress={() => setShowShownAsModal(false)}>
                <X size={24} color={themeColors.icon} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              {byProfession(formData.skills).map(({ profession, skills }) => (
                <TouchableOpacity
                  key={profession}
                  style={[styles.modalItem, headline === profession && { backgroundColor: themeColors.brand + '15' }]}
                  onPress={() => { setShownAs(profession); setShowShownAsModal(false); }}
                >
                  <ThemedText style={[styles.modalItemText, headline === profession && { fontFamily: Fonts.poppinsBold }]}>
                    {profession} · {skills.length} skill{skills.length === 1 ? '' : 's'}
                  </ThemedText>
                  {headline === profession && <CheckCircle2 size={20} color={themeColors.brand} />}
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Skill Tag Modal */}
      <Modal statusBarTranslucent navigationBarTranslucent visible={showTagModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding" automaticOffset>
          <View style={padBottom([styles.modalContent, { backgroundColor: themeColors.background, maxHeight: '90%', flex: 1, marginTop: 'auto', borderTopLeftRadius: 32, borderTopRightRadius: 32, minHeight: '0%' }], bottomInset)}>
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
                  <ThemedText style={{ fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: themeColors.icon, marginBottom: 10 }}>
                    {pendingMediaBatch.length} file{pendingMediaBatch.length !== 1 ? 's' : ''} selected
                  </ThemedText>
                  <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
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
                      lineHeight: 20,
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
                      style={{ flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppins, color: themeColors.text }}
                      placeholder="Search skills..."
                      placeholderTextColor={themeColors.icon}
                      value={tagSkillSearch}
                      onChangeText={setTagSkillSearch}
                    />
                  </View>

                  {selectedTagSkill && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                      <CheckCircle2 size={14} color="#10B981" />
                      <ThemedText style={{ flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#166534' }}>{selectedTagSkill}</ThemedText>
                      <TouchableOpacity onPress={() => setSelectedTagSkill(null)}>
                        <X size={16} color={themeColors.icon} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {formData.skills.length === 0 ? (
                    <ThemedText style={{ fontSize: 13, lineHeight: 19, color: themeColors.icon, fontFamily: Fonts.poppins }}>
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
                          <ThemedText style={{ color: themeColors.text, fontFamily: Fonts.poppinsBold, fontSize: 12, lineHeight: 18 }}>{skill}</ThemedText>
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
        </KeyboardAvoidingView>
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
    lineHeight: 24,
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
    lineHeight: 21,
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
  title: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: Fonts.poppinsBold,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
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
    lineHeight: 24,
    fontFamily: Fonts.poppinsBold,
  },
  sectionLabelSmall: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
  },
  sectionSubLabel: {
    fontSize: 11,
    lineHeight: 17,
    opacity: 0.5,
    fontFamily: Fonts.poppins,
  },
  fieldLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    marginBottom: 8,
  },
  requiredMark: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.poppinsBold,
    color: '#EF4444',
  },
  photoContainer: {
    alignItems: 'center',
  },
  skillsHint: {
    fontSize: 12,
    lineHeight: 18,
    color: t.icon,
    fontFamily: Fonts.poppins,
    marginTop: 6,
  },
  skillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.brand + '26',
    borderWidth: 1,
    borderColor: t.brand + '80',
  },
  skillChipText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.poppinsSemiBold,
    color: t.text,
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
    lineHeight: 17,
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
    lineHeight: 21,
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
    lineHeight: 19,
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
    lineHeight: 17,
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
    lineHeight: 19,
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
    lineHeight: 21,
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
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingRight: 6,
  },
  suggestionSecondaryText: {
    fontSize: 12,
    lineHeight: 18,
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
    lineHeight: 19,
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
    lineHeight: 19,
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
    lineHeight: 20,
    color: '#6B7280',
    fontFamily: Fonts.poppins,
    textAlign: 'center',
    marginBottom: 8,
  },
  manualText: {
    fontSize: 13,
    lineHeight: 19,
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
    lineHeight: 18,
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
    lineHeight: 16,
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
    lineHeight: 16,
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
    lineHeight: 20,
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
    lineHeight: 18,
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
    lineHeight: 18,
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
    lineHeight: 15,
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
    lineHeight: 17,
    fontFamily: Fonts.poppinsBold,
    minWidth: 60,
  },
  passwordErrorText: {
    color: '#FF4B4B',
    fontSize: 11,
    lineHeight: 17,
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
    lineHeight: 17,
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
    lineHeight: 26,
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
    lineHeight: 22,
    fontFamily: Fonts.poppinsBold,
    color: '#fff',
  },
  });
}
