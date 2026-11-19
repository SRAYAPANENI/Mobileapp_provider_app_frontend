import { StyleSheet } from 'react-native';
import { Fonts } from '@/constants/theme';

// The Service Room's look — the same values it had as a sheet on the
// dashboard, shared by the screen (app/service-room.tsx) and its steps.

export const roomStyles = StyleSheet.create({
  // Buttons and notes the steps share.
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#16A34A', paddingVertical: 16, borderRadius: 16, marginBottom: 14,
  },
  primaryBtnText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: '#fff' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2', marginBottom: 14,
  },
  dangerBtnText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#EF4444' },
  /** A quiet secondary action (+ Add Item). */
  addRowBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed', backgroundColor: '#F9FAFB', marginBottom: 14,
  },
  addRowBtnText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#374151' },
  note: {
    fontSize: 12, fontFamily: Fonts.poppins, color: '#9CA3AF', textAlign: 'center', marginBottom: 14, lineHeight: 18,
  },
  noteWarn: { color: '#B45309' },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, marginBottom: 10,
    fontSize: 14, color: '#111827',
    // Always white: an unstyled native input took the OS's dark-mode colours,
    // washing out its placeholder.
    backgroundColor: '#fff',
  },
  inputBig: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 6, marginBottom: 6 },

  // The 4-digit inspection code.
  otpLabel: { fontSize: 12, fontFamily: Fonts.poppinsSemiBold, color: '#9CA3AF', textAlign: 'center', marginTop: 12 },
  otpContainer: { marginVertical: 14, alignItems: 'center', justifyContent: 'center', position: 'relative', height: 64 },
  otpBoxesRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, width: '100%' },
  otpBox: {
    width: 58, height: 62, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  otpBoxFocused: { borderColor: '#FFCE48', borderWidth: 2, backgroundColor: '#FFFFFF' },
  otpDigit: {
    fontSize: 24, lineHeight: 30, fontFamily: Fonts.poppinsBold, color: '#9CA3AF', textAlign: 'center', includeFontPadding: false,
  },
  otpDigitFilled: { color: '#111827' },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },

  // The pickup.
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14,
    borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', marginBottom: 14,
  },
  photoBtnText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  photoPreview: { width: '100%', height: 160, borderRadius: 16, marginBottom: 14, backgroundColor: '#F3F4F6' },
  paidWithRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 10 },
  paidWithChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#fff' },
  paidWithChipOn: { backgroundColor: '#FFFBEB', borderColor: '#FFCE48' },
  paidWithText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#374151' },
  paidWithTextOn: { fontFamily: Fonts.poppinsBold, color: '#111827' },
  vehicleNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, marginBottom: 10,
    borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
  },
  vehicleNoteText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#1E3A8A' },
});
