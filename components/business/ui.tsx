import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, StyleProp, StyleSheet, Switch, TouchableOpacity, View, ViewStyle } from 'react-native';

// The business screens' building blocks (docs/BUSINESS_PROVIDERS_DESIGN.md) —
// one look for sections, rows, badges and buttons, so each screen is laid out
// from these rather than styling its own.

export const C = {
  bg: '#F6F7F9', card: '#FFFFFF', line: '#ECEEF2', ink: '#0F172A', body: '#334155', muted: '#64748B', faint: '#94A3B8',
  brand: '#FFCE48', brandSoft: '#FFF7DB', brandInk: '#7A5600',
  ok: '#047857', okSoft: '#ECFDF5', warn: '#B45309', warnSoft: '#FFFBEB', bad: '#B91C1C', badSoft: '#FEF2F2',
  info: '#1D4ED8', infoSoft: '#EFF6FF',
};
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'brand';
const TONES: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: C.ok, bg: C.okSoft }, warn: { fg: C.warn, bg: C.warnSoft }, bad: { fg: C.bad, bg: C.badSoft },
  info: { fg: C.info, bg: C.infoSoft }, neutral: { fg: C.muted, bg: '#F1F5F9' }, brand: { fg: C.brandInk, bg: C.brandSoft },
};

/** A job's stage in words and colour — the board, a job's page. */
export function jobStage(status: string, setOff = false): { label: string; tone: Tone } {
  if (status === 'ACCEPTED' && setOff) return { label: 'On the way', tone: 'brand' };
  return STAGES[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), tone: 'neutral' };
}
const STAGES: Record<string, { label: string; tone: Tone }> = {
  ACCEPTED: { label: 'Booked', tone: 'info' }, INSPECTING: { label: 'Inspecting', tone: 'brand' },
  INVOICE_PENDING: { label: 'Quote sent', tone: 'warn' }, IN_PROGRESS: { label: 'Working', tone: 'ok' },
  COMPLETED: { label: 'Done', tone: 'ok' }, CANCELLED: { label: 'Cancelled', tone: 'neutral' }, DISPUTED: { label: 'Under review', tone: 'bad' },
};

/** A titled group: small caps heading, optional action at the right, then a card. */
export function Section({ title, action, children, flush }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; flush?: boolean;
}) {
  return (
    <View style={u.section}>
      {(title || action) && (
        <View style={u.sectionHead}>
          {title ? <ThemedText style={u.sectionTitle}>{title}</ThemedText> : <View />}
          {action}
        </View>
      )}
      <View style={[u.card, flush && u.cardFlush]}>{children}</View>
    </View>
  );
}

/** One line in a card: icon tile, title and detail, then whatever sits at the right. */
export function Row({ icon, title, detail, right, onPress, last, chevron, tone = 'neutral' }: {
  icon?: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; right?: React.ReactNode;
  onPress?: () => void; last?: boolean; chevron?: boolean; tone?: Tone;
}) {
  const body = (
    <View style={[u.row, !last && u.rowLine]}>
      {icon && <View style={[u.iconTile, { backgroundColor: TONES[tone].bg }]}>{icon}</View>}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <ThemedText style={u.rowTitle}>{title}</ThemedText> : title}
        {typeof detail === 'string' ? <ThemedText style={u.rowDetail}>{detail}</ThemedText> : detail}
      </View>
      {right}
      {chevron && <ChevronRight size={18} color={C.faint} />}
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{body}</TouchableOpacity> : body;
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: React.ReactNode }) {
  return (
    <View style={[u.badge, { backgroundColor: TONES[tone].bg }]}>
      {icon}
      <ThemedText style={[u.badgeText, { color: TONES[tone].fg }]}>{label}</ThemedText>
    </View>
  );
}

/** Initials on a soft square — a business's mark or a member's face. */
export function Monogram({ name, size = 40, tone = 'brand' }: { name: string | null | undefined; size?: number; tone?: Tone }) {
  const letters = (name ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View style={[u.mono, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: TONES[tone].bg }]}>
      <ThemedText style={[u.monoText, { fontSize: size * 0.38, lineHeight: size * 0.5, color: TONES[tone].fg }]}>{letters}</ThemedText>
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', busy, disabled, icon, small, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean;
  disabled?: boolean; icon?: React.ReactNode; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const k = BUTTONS[kind];
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={disabled || busy}
      style={[u.button, small && u.buttonSmall, { backgroundColor: k.bg, borderColor: k.border }, (disabled && !busy) && u.dim, style]}>
      {busy ? <ActivityIndicator color={k.fg} size="small" /> : (
        <>
          {icon}
          <ThemedText style={[u.buttonText, small && u.buttonTextSmall, { color: k.fg }]} numberOfLines={1}>{label}</ThemedText>
        </>
      )}
    </TouchableOpacity>
  );
}
const BUTTONS = {
  primary: { bg: C.brand, fg: C.ink, border: C.brand },
  secondary: { bg: C.card, fg: C.ink, border: '#D9DDE3' },
  ghost: { bg: 'transparent', fg: C.info, border: 'transparent' },
  danger: { bg: C.card, fg: C.bad, border: '#F3C9C9' },
};

/** On/off, in the app's colours — a white thumb on Android too, where the
 * system accent (teal) is the default and clashes with the yellow track. */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <Switch value={value} onValueChange={onChange} disabled={disabled}
      trackColor={{ true: C.brand, false: '#E2E8F0' }} ios_backgroundColor="#E2E8F0"
      thumbColor={Platform.OS === 'ios' ? undefined : value ? '#FFFFFF' : '#F8FAFC'} />
  );
}

/** A labelled form field. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <ThemedText style={u.label}>{label}</ThemedText>
        {hint && <ThemedText style={[u.muted, { fontSize: 12 }]}>{hint}</ThemedText>}
      </View>
      {children}
    </View>
  );
}

/** A thin bar from 0 to 1. */
export function Progress({ value }: { value: number }) {
  return (
    <View style={u.track}>
      <View style={[u.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

export const u = StyleSheet.create({
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: Fonts.poppinsSemiBold, color: C.muted },
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: C.line,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardFlush: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  iconTile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  rowDetail: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: C.muted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold },
  mono: { alignItems: 'center', justifyContent: 'center' },
  monoText: { fontFamily: Fonts.poppinsBold },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1 },
  buttonSmall: { height: 36, paddingHorizontal: 14, borderRadius: 10 },
  buttonText: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold },
  buttonTextSmall: { fontSize: 13, lineHeight: 18 },
  dim: { opacity: 0.45 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#EEF0F3', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.brand },
  body: { fontSize: 13.5, lineHeight: 20, fontFamily: Fonts.poppins, color: C.body },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: C.muted },
  label: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: C.body },
  input: {
    borderWidth: 1, borderColor: '#DDE1E7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14.5, fontFamily: Fonts.poppins, color: C.ink, backgroundColor: '#FBFCFD',
  },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#DDE1E7', backgroundColor: C.card },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.body },
  chipTextOn: { color: '#FFFFFF' },
});
