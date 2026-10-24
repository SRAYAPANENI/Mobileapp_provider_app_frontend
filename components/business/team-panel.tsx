import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { MyBusinessState } from '@/hooks/use-my-business';
import { router } from 'expo-router';
import { AlertTriangle, Check, Clock, Inbox, Map as MapIcon, Settings2, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, jobStage, Monogram, Row, Section, u } from './ui';

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'As soon as possible';
const go = (pathname: string, params?: Record<string, string>) => router.push((params ? { pathname, params } : pathname) as any);

// The home screen's Team side (docs/BUSINESS_PROVIDERS_DESIGN.md §3–4): what
// the team can take and what it's doing, each one tap from acting on it.
// Choosing who does a job happens on Team jobs, opened on that job.
export function TeamPanel({ state }: { state: MyBusinessState }) {
  const business = state.data?.business;
  const board = state.board;
  if (!business) return null;
  const open = board?.open ?? [];
  const active = board?.active ?? [];
  const setOff = (j: (typeof active)[number]) => !!(j.navigation_started_at || j.arrived_at || j.checked_in_at);

  return (
    <View style={{ gap: 20 }}>
      <View style={s.tools}>
        <Tool icon={<Users size={16} color={C.ink} />} label="Team jobs" onPress={() => go('/business-jobs')} />
        <Tool icon={<MapIcon size={16} color={C.ink} />} label="Map" onPress={() => go('/business-map')} />
        <Tool icon={<Settings2 size={16} color={C.ink} />} label="Business" onPress={() => go('/business')} />
      </View>

      {!business.ready_for_on_site_work && (
        <TouchableOpacity style={s.warn} activeOpacity={0.8} onPress={() => go('/business')}>
          <AlertTriangle size={16} color={C.warn} />
          <ThemedText style={[u.label, { flex: 1, color: C.warn }]} numberOfLines={2}>
            Your team can’t be hired yet — {business.missing[0] ? business.missing[0][0].toLowerCase() + business.missing[0].slice(1) : 'see what’s missing'}.
          </ThemedText>
        </TouchableOpacity>
      )}

      <Section title={`Open for your team · ${open.length}`} flush>
        {open.length === 0 ? (
          <Row last icon={<Inbox size={18} color={C.muted} />} title="Nothing new right now"
            detail="Jobs that reach anyone on your team show here" />
        ) : open.map((j, i) => (
          <View key={j.job_id} style={[s.job, i < open.length - 1 && s.line]}>
            <TouchableOpacity style={{ flex: 1, gap: 3 }} activeOpacity={0.7} onPress={() => go('/job-details', { id: j.job_id })}>
              <ThemedText style={s.title} numberOfLines={1}>{j.title}</ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Clock size={12} color={C.muted} />
                <ThemedText style={u.muted} numberOfLines={1}>
                  {when(j.scheduled_at)}{j.reached_member_ids.length ? ` · ${j.reached_member_ids.length} matched` : ''}
                </ThemedText>
              </View>
            </TouchableOpacity>
            {j.applied
              ? <Badge label="Applied" tone="ok" icon={<Check size={12} color={C.ok} />} />
              : <Button small label="Assign" onPress={() => go('/business-jobs', { jobId: j.job_id })} />}
          </View>
        ))}
      </Section>

      <Section title={`Under way · ${active.length}`} flush>
        {active.length === 0 ? (
          <Row last icon={<Users size={18} color={C.muted} />} title="No jobs under way"
            detail="Jobs a customer hires your team for show here" />
        ) : active.map((j, i) => (
          <Row key={j.job_id} last={i === active.length - 1} chevron onPress={() => go('/business-job', { jobId: j.job_id })}
            icon={<Monogram name={j.worker_name ?? '?'} size={38} tone={j.worker_name ? 'brand' : 'neutral'} />}
            title={j.title}
            detail={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Badge {...jobStage(j.status, setOff(j))} />
                <ThemedText style={[u.muted, { flexShrink: 1 }]} numberOfLines={1}>{j.worker_name ?? 'Unassigned'}</ThemedText>
              </View>
            } />
        ))}
      </Section>
    </View>
  );
}

function Tool({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.tool} activeOpacity={0.8} onPress={onPress}>
      {icon}
      <ThemedText style={s.toolText} numberOfLines={1}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  tools: { flexDirection: 'row', gap: 8 },
  tool: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40,
    borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  toolText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.warnSoft, borderWidth: 1, borderColor: '#F7DC8B' },
  job: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
