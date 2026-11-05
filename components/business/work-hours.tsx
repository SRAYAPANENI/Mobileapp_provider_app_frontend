import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { WorkHours } from '@/services/api';
import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { C, u } from './ui';

// Work hours with an employer (docs/EMPLOYER_PARTNERS_DESIGN.md): the same
// hours on each chosen day, in the member's own time zone. Inside them, jobs
// come through the business; outside them, the member works for themselves.
// The server decides whose a job is (skofy-backend app/domain/work_hours.py);
// what's here only shows it.

const DAYS: { day: number; short: string }[] = [
  { day: 1, short: 'Mon' }, { day: 2, short: 'Tue' }, { day: 3, short: 'Wed' }, { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' }, { day: 6, short: 'Sat' }, { day: 7, short: 'Sun' },
];
const STEP = 30;            // minutes, for the − / + buttons
const DAY_END = 24 * 60;

/** The phone's time zone, like "America/Chicago" — "UTC" if it can't be read. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "Chicago time", for showing which zone hours are in. */
export function tzLabel(tz: string): string {
  return `${(tz.split('/').pop() ?? tz).replace(/_/g, ' ')} time`;
}

/** These hours as edited by someone on this phone: in its time zone. */
export const inMyZone = (h: WorkHours): WorkHours => ({ ...h, tz: deviceTimeZone() });

/** What an invite starts with: weekdays, 9 to 5, here. */
export function defaultHours(): WorkHours {
  return { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', tz: deviceTimeZone() };
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** "Mon–Fri · 09:00–17:00", as the server writes it. */
export function hoursLabel(h: WorkHours): string {
  const days = [...h.days].sort((a, b) => a - b);
  if (days.length === 7 && h.start === '00:00' && h.end === '24:00') return 'All the time';
  const names = days.map((d) => DAYS[d - 1].short);
  const run = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = days.length === 7 ? 'Every day' : run ? `${names[0]}–${names[names.length - 1]}` : names.join(', ');
  return `${dayText} · ${h.start}–${h.end}`;
}

export const sameHours = (a: WorkHours, b: WorkHours) =>
  a.start === b.start && a.end === b.end && a.tz === b.tz
  && [...a.days].sort().join() === [...b.days].sort().join();

/** Whether `at` falls in these hours, in their time zone. Null if the phone
 * can't tell (an old Intl): then the server's answer is the one that counts. */
export function inHours(h: WorkHours, at: Date): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: h.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const day = DAYS.findIndex((d) => d.short === get('weekday')) + 1;
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    if (!day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    const now = hour * 60 + minute;
    return h.days.includes(day) && minutes(h.start) <= now && now < minutes(h.end);
  } catch {
    return null;
  }
}

const PRESETS: { label: string; days: number[]; start: string; end: string }[] = [
  { label: 'Weekdays 9–5', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  { label: 'Weekends', days: [6, 7], start: '09:00', end: '17:00' },
  { label: 'Every day', days: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '20:00' },
];

interface Props {
  value: WorkHours;
  onChange: (next: WorkHours) => void;
}

/** Days and hours, in 30-minute steps. Always valid: at least one day, and the
 * end after the start on the same day. */
export function WorkHoursEditor({ value, onChange }: Props) {
  const start = minutes(value.start);
  const end = minutes(value.end);
  const toggleDay = (day: number) => {
    const has = value.days.includes(day);
    if (has && value.days.length === 1) return;          // at least one day
    onChange({ ...value, days: has ? value.days.filter((d) => d !== day) : [...value.days, day].sort((a, b) => a - b) });
  };
  const setStart = (next: number) => {
    const s = Math.max(0, Math.min(next, DAY_END - STEP));
    onChange({ ...value, start: hhmm(s), end: hhmm(Math.max(end, s + STEP)) });
  };
  const setEnd = (next: number) => onChange({ ...value, end: hhmm(Math.max(start + STEP, Math.min(next, DAY_END))) });

  return (
    <View style={s.box}>
      <View style={s.presets}>
        {PRESETS.map((p) => {
          const on = sameHours(value, { ...p, tz: value.tz });
          return (
            <TouchableOpacity key={p.label} style={[u.chip, s.preset, on && u.chipOn]} activeOpacity={0.8}
              onPress={() => onChange({ ...value, days: p.days, start: p.start, end: p.end })}>
              <ThemedText style={[u.chipText, s.presetText, on && u.chipTextOn]}>{p.label}</ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      <ThemedText style={u.label}>Days</ThemedText>
      <View style={s.days}>
        {DAYS.map(({ day, short }) => {
          const on = value.days.includes(day);
          return (
            <TouchableOpacity key={day} style={[s.day, on && s.dayOn]} onPress={() => toggleDay(day)} activeOpacity={0.8}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={short}>
              <ThemedText style={[s.dayText, on && s.dayTextOn]}>{short.slice(0, 2)}</ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.times}>
        <TimeStepper label="From" value={value.start} onLess={() => setStart(start - STEP)} onMore={() => setStart(start + STEP)}
          lessDisabled={start === 0} moreDisabled={start >= DAY_END - STEP} />
        <TimeStepper label="To" value={value.end} onLess={() => setEnd(end - STEP)} onMore={() => setEnd(end + STEP)}
          lessDisabled={end <= start + STEP} moreDisabled={end >= DAY_END} />
      </View>
      <ThemedText style={u.muted}>{hoursLabel(value)} · {tzLabel(value.tz)}</ThemedText>
    </View>
  );
}

function TimeStepper({ label, value, onLess, onMore, lessDisabled, moreDisabled }: {
  label: string; value: string; onLess: () => void; onMore: () => void; lessDisabled: boolean; moreDisabled: boolean;
}) {
  return (
    <View style={s.time}>
      <ThemedText style={u.label}>{label}</ThemedText>
      <View style={s.stepper}>
        <TouchableOpacity style={[s.step, lessDisabled && u.dim]} onPress={onLess} disabled={lessDisabled}
          accessibilityLabel={`${label} earlier`}>
          <Minus size={16} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.timeValue}>{value}</ThemedText>
        <TouchableOpacity style={[s.step, moreDisabled && u.dim]} onPress={onMore} disabled={moreDisabled}
          accessibilityLabel={`${label} later`}>
          <Plus size={16} color={C.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 10 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { paddingVertical: 7, paddingHorizontal: 12 },
  presetText: { fontSize: 12.5 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  day: {
    flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#DDE1E7', backgroundColor: C.card,
  },
  dayOn: { backgroundColor: C.ink, borderColor: C.ink },
  dayText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.body },
  dayTextOn: { color: '#FFFFFF' },
  times: { flexDirection: 'row', gap: 12 },
  time: { flex: 1, gap: 6 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#DDE1E7', borderRadius: 12, padding: 4, backgroundColor: '#FBFCFD',
  },
  step: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  timeValue: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
});
