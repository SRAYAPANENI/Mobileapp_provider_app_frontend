import { useAppAlert } from '@/components/app-alert';
import { CHECK_LABELS, HoursForm } from '@/components/business/team-section';
import { Badge, Button, C, Monogram, Progress, Row, Section, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { defaultHours } from '@/components/business/work-hours';
import { JoinRequestProfile, SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Briefcase, CalendarClock, ChevronLeft, Clock, Lock, MapPin, ShieldCheck, Star, UserX } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

const RATING_LABELS: { key: keyof JoinRequestProfile['ratings']; label: string }[] = [
  { key: 'skill', label: 'Skill' }, { key: 'punctuality', label: 'On time' },
  { key: 'behaviour', label: 'Behaviour' }, { key: 'communication', label: 'Communication' },
];

// Someone asking to join the business (docs/BUSINESS_DISCOVERY_DESIGN.md):
// their work on Dodorez — skills, ratings, jobs, checks — and the hours they
// asked for. The owner decides here, and only here: a request is never
// accepted from a list without the person being seen. Their phone and email
// aren't shown; they come with joining.
export default function JoinRequestScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [profile, setProfile] = useState<JoinRequestProfile | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [offering, setOffering] = useState(false);

  const load = useCallback(() => {
    if (!memberId) {
      setGone('This request couldn’t be opened. Find it on your Business page.');
      return;
    }
    setGone(null);
    SkoFyApi.business.requestProfile(memberId)
      .then(setProfile)
      .catch((err: any) => setGone(err?.error_code === 'NOT_FOUND' || err?.status_code === 404
        ? 'This request has already been answered, or they withdrew it.'
        : err?.message ?? "Couldn't load their profile. Check your connection and try again."));
  }, [memberId]);
  useEffect(load, [load]);

  const done = (title: string, message: string) => {
    appAlert.show('success', title, message, [{ text: 'OK', variant: 'primary', onPress: () => router.back() }]);
  };

  const accept = async () => {
    if (!profile) return;
    setBusy('accept');
    try {
      await SkoFyApi.business.answerMemberHours(profile.member_id, true);
      done('Added to your team', `${profile.name ?? 'They'} can now take your team's jobs in the hours you agreed. Their contact details are on your team list.`);
    } catch (err: any) {
      appAlert.show('error', 'Not added', err?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // What's waiting: hours they asked for (the owner answers), or other hours
  // the owner already offered (waiting on them — nothing to accept here).
  // A status this app doesn't know yet reads as "no check yet", never a crash.
  const checkLabel = CHECK_LABELS[profile?.background_check_status ?? 'NOT_STARTED'] ?? CHECK_LABELS.NOT_STARTED;
  const offer = profile?.hours?.offer ?? null;
  const asked = offer?.from === 'MEMBER' ? offer : null;
  // A server from before the summary sent only the list: counted from it.
  const trades = profile?.trades ?? [];
  const skillsTotal = profile?.skills_total ?? profile?.skills.length ?? 0;
  const skillsVerified = profile?.skills_verified ?? profile?.skills.filter((k) => k.is_verified).length ?? 0;
  // Never more than a dozen drawn, whatever the server sends: hundreds of rows
  // held the app up for seconds (Back included) on a provider with every skill.
  const strongest = (profile?.skills ?? [])
    .slice()
    .sort((a, b) => Number(b.is_verified) - Number(a.is_verified) || b.skill_o_meter - a.skill_o_meter)
    .slice(0, 12);
  const offered = offer?.from === 'BUSINESS' ? offer : null;

  const decline = () => {
    if (!profile) return;
    appAlert.show('warning', offered ? 'Withdraw your offer?' : 'Decline this request?',
      offered ? 'Their request comes off your team list. They can ask again.' : 'They’re told, and can ask again later.', [
      { text: 'Keep', variant: 'secondary' },
      { text: offered ? 'Withdraw' : 'Decline', variant: 'destructive', onPress: async () => {
        setBusy('decline');
        try {
          // Answering needs their hours waiting; once ours are, it's withdrawn.
          if (offered) await SkoFyApi.business.removeMember(profile.member_id);
          else await SkoFyApi.business.answerMemberHours(profile.member_id, false);
          done(offered ? 'Withdrawn' : 'Request declined', 'It’s off your team list.');
        } catch (err: any) {
          appAlert.show('error', offered ? 'Not withdrawn' : 'Not declined', err?.message ?? 'Please try again.');
        } finally {
          setBusy(null);
        }
      } },
    ]);
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Request to join</ThemedText>
      </View>

      {gone ? (
        <View style={s.body}>
          <Section>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
              <UserX size={28} color={C.muted} />
              <ThemedText style={[u.body, { textAlign: 'center' }]}>{gone}</ThemedText>
              <Button small kind="secondary" label="Back" onPress={() => router.back()} />
            </View>
          </Section>
        </View>
      ) : !profile ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : (
        <>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: 24 }]}>
            {/* Who they are */}
            <View style={[u.card, s.hero]}>
              {profile.profile_image_url
                ? <Image source={{ uri: profile.profile_image_url }} style={s.photo} contentFit="cover" />
                : <Monogram name={profile.name} size={72} />}
              <ThemedText style={s.name} numberOfLines={2}>{profile.name ?? 'Provider'}</ThemedText>
              <View style={s.metaRow}>
                {!!profile.city && (
                  <View style={s.meta}><MapPin size={13} color={C.muted} /><ThemedText style={u.muted}>{profile.city}</ThemedText></View>
                )}
                {!!profile.member_since && (
                  <View style={s.meta}>
                    <CalendarClock size={13} color={C.muted} />
                    <ThemedText style={u.muted}>On Dodorez since {new Date(profile.member_since).getFullYear()}</ThemedText>
                  </View>
                )}
              </View>
              <Badge label="Wants to join your team" tone="info" />
            </View>

            {/* The headline numbers */}
            <View style={s.stats}>
              <Stat icon={<Star size={15} color="#D97706" fill="#F59E0B" />}
                value={profile.review_count > 0 ? profile.avg_rating.toFixed(1) : '—'}
                label={profile.review_count > 0 ? `${profile.review_count} review${profile.review_count === 1 ? '' : 's'}` : 'No reviews yet'} />
              <Stat icon={<Briefcase size={15} color={C.ink} />} value={String(profile.jobs_completed)} label="Jobs done" />
              <Stat icon={<Clock size={15} color={C.ink} />} value={profile.years_experience > 0 ? `${profile.years_experience}` : '—'}
                label={profile.years_experience === 1 ? 'Year of experience' : 'Years of experience'} />
            </View>

            {/* Checks and reliability */}
            <Section title="Checks" flush>
              <Row icon={<BadgeCheck size={18} color={profile.is_identity_verified ? C.ok : C.warn} />}
                tone={profile.is_identity_verified ? 'ok' : 'warn'}
                title={profile.is_identity_verified ? 'ID verified' : 'ID not verified yet'}
                detail={profile.is_identity_verified ? 'Dodorez checked their ID' : 'They can’t do jobs until it is'} />
              <Row last icon={<ShieldCheck size={18} color={C.ink} />}
                title="Background check"
                right={<Badge label={checkLabel.text} tone={checkLabel.tone} />}
                detail={profile.background_check_status === 'CLEAR' ? 'Already clear — nothing to run'
                  : 'Dodorez runs one when they join'} />
            </Section>

            <Section title="Reliability" flush>
              <Row title="Cancelled after hire" right={<ThemedText style={s.figure}>{profile.jobs_cancelled}</ThemedText>} />
              <Row last title="No-shows" right={<ThemedText style={[s.figure, profile.no_show_count > 0 && { color: C.bad }]}>{profile.no_show_count}</ThemedText>} />
            </Section>

            {profile.review_count > 0 && (
              <Section title="What customers say" flush>
                {RATING_LABELS.map(({ key, label }, i) => (
                  <Row key={key} last={i === RATING_LABELS.length - 1} title={label}
                    right={<ThemedText style={s.figure}>{profile.ratings[key] != null ? `${profile.ratings[key]!.toFixed(1)} ★` : '—'}</ThemedText>} />
                ))}
              </Section>
            )}

            {!!profile.bio?.trim() && (
              <Section title="About them">
                <ThemedText style={u.body}>{profile.bio.trim()}</ThemedText>
              </Section>
            )}

            {/* Their skills in brief — trades, then the strongest dozen — never
                the whole list (a provider with every skill sent 1,400 rows). */}
            {trades.length > 0 && (
              <Section title="Trades">
                <View style={s.trades}>
                  {trades.map((t) => (
                    <View key={t.name} style={[s.trade, t.verified > 0 && s.tradeProven]}>
                      <ThemedText style={s.tradeName} numberOfLines={1}>{t.name}</ThemedText>
                      <ThemedText style={u.muted} numberOfLines={1}>
                        {t.verified > 0 ? `${t.verified} verified` : 'Not tested'}{t.total > t.verified ? ` · ${t.total} listed` : ''}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            <Section title={`Strongest skills · ${skillsVerified} of ${skillsTotal} verified`} flush>
              {strongest.length === 0 ? (
                <Row last title="No skills added yet" />
              ) : strongest.map((skill, i) => (
                <View key={`${skill.profession}-${skill.name}`} style={[s.skill, i < strongest.length - 1 && s.line]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={u.label} numberOfLines={1}>{skill.name}</ThemedText>
                      <ThemedText style={u.muted} numberOfLines={1}>{skill.profession}</ThemedText>
                    </View>
                    <Badge label={skill.is_verified ? 'Verified' : 'Not tested'} tone={skill.is_verified ? 'ok' : 'neutral'} />
                  </View>
                  {skill.is_verified && <Progress value={skill.skill_o_meter} />}
                </View>
              ))}
            </Section>

            <Section title={offered ? 'Hours you offered' : 'Hours they asked for'}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color={C.ink} />
                <ThemedText style={[u.label, { flex: 1 }]}>{(offered ?? asked)?.label ?? 'Any time you need them'}</ThemedText>
              </View>
              {offered && (
                <ThemedText style={[u.muted, { marginTop: 6 }]}>
                  Waiting for {profile.name ?? 'them'} to accept, or send other hours. You’re told when they answer.
                </ThemedText>
              )}
              {offering && (
                <View style={{ marginTop: 12 }}>
                  <HoursForm flat initial={asked?.hours ?? defaultHours()} current={null}
                    onCancel={() => setOffering(false)}
                    onSend={async (hours) => {
                      try {
                        await SkoFyApi.business.offerMemberHours(profile.member_id, hours);
                        setOffering(false);
                        done('Hours offered', `${profile.name ?? 'They'} can accept them or send other hours.`);
                      } catch (err: any) {
                        appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
                      }
                    }} />
                </View>
              )}
            </Section>

            <View style={s.privacy}>
              <Lock size={13} color={C.muted} />
              <ThemedText style={[u.muted, { flex: 1 }]}>Their phone and email are shared with you once they join your team.</ThemedText>
            </View>
          </ScrollView>

          {/* The decision: accepting adds them on the hours they asked for.
              Once other hours are offered it's theirs to answer: withdraw only. */}
          {!offering && (
            <View style={padBottom(s.footer, bottomInset)}>
              {offered ? (
                <Button kind="danger" label="Withdraw" onPress={decline} busy={busy === 'decline'} disabled={!!busy} />
              ) : (
                <>
                  <Button label="Accept and add them" onPress={accept} busy={busy === 'accept'} disabled={!!busy} />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button kind="secondary" label="Offer other hours" onPress={() => setOffering(true)} disabled={!!busy} style={{ flex: 1 }} />
                    <Button kind="danger" label="Decline" onPress={decline} busy={busy === 'decline'} disabled={!!busy} style={{ flex: 1 }} />
                  </View>
                </>
              )}
            </View>
          )}
        </>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={[u.card, s.stat]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon}
        <ThemedText style={s.statValue}>{value}</ThemedText>
      </View>
      <ThemedText style={[u.muted, { textAlign: 'center' }]} numberOfLines={2}>{label}</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 22, lineHeight: 30, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 20 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  photo: { width: 72, height: 72, borderRadius: 22 },
  name: { fontSize: 19, lineHeight: 26, fontFamily: Fonts.poppinsBold, color: C.ink, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, paddingHorizontal: 8 },
  statValue: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: C.ink },
  figure: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: C.ink },
  skill: { gap: 8, paddingVertical: 12 },
  trades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trade: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', maxWidth: '100%' },
  tradeProven: { backgroundColor: C.okSoft },
  tradeName: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  footer: { gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
});
