import { useAppAlert } from '@/components/app-alert';
import { CloseBusiness } from '@/components/business/close-business';
import { BusinessDocumentForm } from '@/components/business/business-document-form';
import { BusinessInvites } from '@/components/business/business-invites';
import { BusinessProfileForm } from '@/components/business/business-profile-form';
import { OwnWorkSetting } from '@/components/business/own-work-setting';
import { SetupChecklist } from '@/components/business/setup-checklist';
import { TeamSection } from '@/components/business/team-section';
import { Badge, Button, C, Monogram, Progress, Row, Section, Tone, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { useMyBusiness } from '@/hooks/use-my-business';
import {
  BusinessDocument, BusinessDocumentKind, BusinessEarnings, BusinessInvite, MemberRole, SkoFyApi, Team, TeamMember,
} from '@/services/api';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertTriangle, BadgeCheck, Briefcase, Building2, ChevronLeft, FileText, Landmark, LogOut, Map as MapIcon, Pencil, Plus, ShieldCheck, Trash2, Users,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

const STATUS_BADGE: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Setting up', tone: 'neutral' },
  PENDING_REVIEW: { label: 'In review', tone: 'info' },
  APPROVED: { label: 'Verified', tone: 'ok' },
  REJECTED: { label: 'Needs changes', tone: 'bad' },
};
const ENTITY: Record<string, string> = { LLC: 'LLC', CORPORATION: 'Corporation', PARTNERSHIP: 'Partnership', SOLE_PROPRIETOR: 'Sole proprietor' };
const DOC_NAMES: Record<string, string> = { GENERAL_LIABILITY: 'General liability', WORKERS_COMP: "Workers' comp", LICENCE: 'Trade licence' };
const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: 'In review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Not accepted', tone: 'bad' },
  EXPIRED: { label: 'Expired', tone: 'bad' },
};
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// A business account (docs/BUSINESS_PROVIDERS_DESIGN.md): a company that
// provides through its team. The owner sets it up here — company details,
// insurance and licences, payouts with Stripe as a company — and sends it for
// review, then runs the team from it. Tax ID, owners and bank account are
// collected by Stripe, never here.
export default function BusinessScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  const { data, invites, board, canDispatch, refresh } = useMyBusiness();
  const [team, setTeam] = useState<Team | null>(null);
  const [earnings, setEarnings] = useState<BusinessEarnings | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingDoc, setAddingDoc] = useState<BusinessDocumentKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const role = data?.role;
  const business = data?.business;
  const owner = role === 'OWNER';

  // The team and money, for those who see them, each time the business
  // reloads; the rest comes from useMyBusiness.
  useEffect(() => {
    const has = !!data?.enabled && !!data.business;
    if (has && (data!.role === 'OWNER' || data!.role === 'DISPATCHER')) SkoFyApi.business.team().then(setTeam).catch(() => setTeam(null));
    else setTeam(null);
    if (has && data!.role === 'OWNER') SkoFyApi.business.earnings().then(setEarnings).catch(() => setEarnings(null));
    else setEarnings(null);
  }, [data]);
  const reload = refresh;

  const run = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await action();
      reload();
      if (success) appAlert.show('success', 'Done', success);
      return true;
    } catch (err: any) {
      appAlert.show('error', 'Not done', err?.message ?? 'Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setUpPayouts = () => run('payouts', async () => {
    const { url } = await SkoFyApi.business.payoutsLink();
    // Same return URL as an individual's payout setup (STRIPE_CONNECT_RETURN_URL).
    await WebBrowser.openAuthSessionAsync(url, 'skofyserviceproviderapp://connect-return');
    await SkoFyApi.business.payoutsStatus();
  });
  const managePayouts = () => run('payouts', async () => {
    const { url } = await SkoFyApi.business.payoutsDashboard();
    await WebBrowser.openBrowserAsync(url);
  });

  const answerInvite = async (invite: BusinessInvite, accept: boolean, acknowledged: boolean, authorizedCheck: boolean) => {
    try {
      const { message } = await SkoFyApi.business.answerInvite(invite.id, accept, acknowledged, authorizedCheck);
      appAlert.show('success', accept ? 'Welcome to the team' : 'Declined', message);
      reload();
    } catch (err: any) {
      appAlert.show('error', 'Not done', err?.message ?? 'Please try again.');
    }
  };

  const teamAction = (key: string, action: () => Promise<Team>) => run(key, async () => { setTeam(await action()); });
  const removeMember = (m: TeamMember) => appAlert.show('warning', m.status === 'INVITED' ? 'Cancel this invite?' : 'Remove from the team?',
    m.name ?? m.phone ?? '', [
      { text: 'Keep', variant: 'secondary' },
      { text: m.status === 'INVITED' ? 'Cancel invite' : 'Remove', variant: 'primary',
        onPress: () => teamAction(m.id, () => SkoFyApi.business.removeMember(m.id)) },
    ]);
  // Leaving is on notice: they ask, and go a week later — sooner if the
  // owner releases them. The owner can't keep them.
  const leaveTeam = () => appAlert.show('warning', 'Ask to leave?',
    `You'll leave ${business?.name ?? 'the team'} in 7 days — sooner if they release you. Finish or hand back your team jobs before then.`, [
    { text: 'Stay', variant: 'secondary' },
    { text: 'Ask to leave', variant: 'primary', onPress: () => run('leave', async () => {
      // The server says when, and which team jobs fall after that.
      const { message } = await SkoFyApi.business.leave();
      appAlert.show('success', 'You asked to leave', message);
    }) },
  ]);
  const stayOnTeam = () => run('leave', () => SkoFyApi.business.cancelLeave(), "You're staying on the team.");
  const removeDoc = (doc: BusinessDocument) => appAlert.show('warning', 'Remove this document?', DOC_NAMES[doc.kind], [
    { text: 'Keep', variant: 'secondary' },
    { text: 'Remove', variant: 'primary', onPress: () => run(doc.id, () => SkoFyApi.business.removeDocument(doc.id)) },
  ]);
  const startUpload = (kind: BusinessDocumentKind) => {
    setAddingDoc(kind);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const canEdit = owner && business?.status !== 'PENDING_REVIEW';
  const approved = business?.status === 'APPROVED';
  const payoutsDone = business?.connect_onboarding_status === 'COMPLETE';
  // Not on Stripe, yet not missing either: demo payouts (recorded, not sent).
  const demoPayouts = !!business && !payoutsDone && !business.missing.some((m) => m.startsWith('Payouts'));
  const openJobs = board?.open.filter((j) => !j.applied).length ?? 0;

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Business</ThemedText>
      </View>

      {!data ? <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} /> : !data.enabled ? (
        <View style={s.body}>
          <Section><ThemedText style={u.body}>Business accounts are coming soon.</ThemedText></Section>
        </View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} ref={scroll} contentContainerStyle={padBottom([s.body, { paddingBottom: 40 }], bottomInset)} keyboardShouldPersistTaps="handled">
          <BusinessInvites invites={invites} onAnswer={answerInvite} />

          {!business ? (
            <>
              <View style={s.intro}>
                <View style={s.introIcon}><Building2 size={28} color={C.brandInk} /></View>
                <ThemedText style={s.introTitle}>Run your business on Dodorez</ThemedText>
                <ThemedText style={[u.body, { textAlign: 'center' }]}>
                  For a registered company with its own insurance — an LLC, corporation, partnership or sole proprietor.
                </ThemedText>
              </View>
              <Section flush>
                <Row icon={<Users size={18} color={C.ink} />} title="One account for your team" detail="Apply for jobs and choose who does each one" />
                <Row icon={<BadgeCheck size={18} color={C.ink} />} title="A verified business" detail="Customers see your company name" />
                <Row last icon={<Landmark size={18} color={C.ink} />} title="Paid to the company" detail="Straight to your business bank account" />
              </Section>
              <Section title="Business details">
                <BusinessProfileForm submitLabel="Create business"
                  onSubmit={async (input) => { await run('create', () => SkoFyApi.business.create(input), 'Business created.'); }} />
              </Section>
            </>
          ) : (
            <>
              {/* Who the business is */}
              <View style={[u.card, s.hero]}>
                <Monogram name={business.name} size={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={s.heroName} numberOfLines={2}>{business.name}</ThemedText>
                  <ThemedText style={u.muted} numberOfLines={1}>
                    {business.legal_name} · {ENTITY[business.entity_type]} · {business.state}
                  </ThemedText>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <Badge {...STATUS_BADGE[business.status]} icon={approved ? <BadgeCheck size={12} color={C.ok} /> : undefined} />
                    {!owner && role && <Badge label={role === 'DISPATCHER' ? 'Dispatcher' : 'Worker'} tone="brand" />}
                  </View>
                </View>
                {canEdit && !editing && (
                  <TouchableOpacity style={s.iconButton} onPress={() => setEditing(true)} hitSlop={8}>
                    <Pencil size={17} color={C.ink} />
                  </TouchableOpacity>
                )}
              </View>

              {editing && (
                <Section title="Edit details">
                  {approved && <ThemedText style={[u.muted, { color: C.warn }]}>Changing the legal name, type or state sends it back for review.</ThemedText>}
                  <BusinessProfileForm initial={business} submitLabel="Save" onCancel={() => setEditing(false)}
                    onSubmit={async (input) => { if (await run('edit', () => SkoFyApi.business.update(input))) setEditing(false); }} />
                </Section>
              )}

              {addingDoc && (
                <Section title="Add a document">
                  <BusinessDocumentForm key={addingDoc} minLiability={data.min_liability} initialKind={addingDoc} onCancel={() => setAddingDoc(null)}
                    onError={(message) => appAlert.show('error', 'Not uploaded', message)}
                    onSubmit={async (doc) => {
                      if (await run('doc', () => SkoFyApi.business.addDocument(doc), "Uploaded — we'll review it.")) setAddingDoc(null);
                    }} />
                </Section>
              )}

              {owner && !approved && (
                <SetupChecklist business={business} minLiability={data.min_liability} canAct={canEdit} busy={busy}
                  onUpload={startUpload} onPayouts={setUpPayouts}
                  onSubmit={() => run('submit', SkoFyApi.business.submit, "Sent for review — we'll let you know.")} />
              )}

              {approved && !business.ready_for_on_site_work && (
                <Section title="Needs attention">
                  <ThemedText style={u.body}>Your team can’t be hired until this is fixed:</ThemedText>
                  {business.missing.map((m) => (
                    <View key={m} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <AlertTriangle size={16} color={C.warn} style={{ marginTop: 2 }} />
                      <ThemedText style={[u.body, { flex: 1 }]}>{m}</ThemedText>
                    </View>
                  ))}
                  {owner && business.missing.some((m) => m.startsWith('Payouts')) && (
                    <Button label="Set up payouts" busy={busy === 'payouts'} onPress={setUpPayouts} />
                  )}
                  {owner && business.missing.some((m) => !m.startsWith('Payouts')) && (
                    <Button kind="secondary" label="Upload a document" onPress={() => startUpload(
                      business.missing.some((m) => m.startsWith('A trade licence')) ? 'LICENCE' : 'GENERAL_LIABILITY')} />
                  )}
                </Section>
              )}

              {canDispatch && (
                <View style={s.tiles}>
                  <Tile icon={<Briefcase size={20} color={C.ink} />} title="Team jobs" onPress={() => router.push('/business-jobs' as any)}
                    detail={openJobs ? `${openJobs} open for your team` : 'Apply and assign'} hot={openJobs > 0} />
                  <Tile icon={<MapIcon size={20} color={C.ink} />} title="Team map" onPress={() => router.push('/business-map' as any)}
                    detail={board?.active.length ? `${board.active.length} under way` : 'Where everyone is'} />
                </View>
              )}

              {!owner && (
                <>
                {data.own_work_allowed && (
                  <OwnWorkSetting who="member" businessName={business.name} value={!!data.own_switch} busy={busy === 'own'}
                    onChange={(on) => { run('own', () => SkoFyApi.business.setOwnWork(on)); }} />
                )}
                <Section title="Your membership" flush>
                  {!data.own_work_allowed && (
                    <Row icon={<Briefcase size={18} color={C.ink} />} title={`Your jobs come through ${business.name}`}
                      detail="They show under Ongoing once you're given one" />
                  )}
                  <Row icon={<ShieldCheck size={18} color={C.ink} />} title="Your location"
                    detail={`${business.name} can see it only while you're on its jobs`} />
                  {data.leave_at ? (
                    <Row last icon={<LogOut size={18} color={C.warn} />} tone="warn"
                      title={`Leaving on ${new Date(data.leave_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                      detail={`Sooner if ${business.name} releases you. Finish or hand back your team jobs first.`}
                      right={<Button small kind="secondary" label="Stay" busy={busy === 'leave'} onPress={stayOnTeam} />} />
                  ) : (
                    <Row last icon={<LogOut size={18} color={C.bad} />} tone="bad" onPress={leaveTeam}
                      title={<ThemedText style={[u.label, { color: C.bad }]}>Ask to leave the team</ThemedText>}
                      detail="You go after 7 days’ notice — sooner if they release you" />
                  )}
                </Section>
                </>
              )}

              {team && (
                <TeamSection team={team} canManage={owner}
                  onInvite={async (phone, r: MemberRole) => {
                    try {
                      setTeam(await SkoFyApi.business.invite(phone, r));
                      appAlert.show('success', 'Invite sent', 'Ask them to sign in to the Dodorez Pro app with this number — the invite waits under Business.');
                    } catch (err: any) {
                      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
                      throw err;
                    }
                  }}
                  onChangeRole={(m, r) => teamAction(m.id, () => SkoFyApi.business.changeRole(m.id, r))}
                  onRemove={removeMember}
                  onRelease={(m) => appAlert.show('warning', `Release ${m.name ?? 'them'} now?`,
                    'They leave the team today instead of at the end of their notice.', [
                      { text: 'Keep notice', variant: 'secondary' },
                      { text: 'Release now', variant: 'primary', onPress: () => teamAction(m.id, () => SkoFyApi.business.releaseMember(m.id)) },
                    ])} />
              )}

              {owner && earnings && approved && (
                <Section title="Money">
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Stat label="Paid out" value={usd(earnings.total_earned)} />
                    <Stat label="Held for jobs" value={usd(earnings.pending)} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <ThemedText style={u.label}>Fees this month</ThemedText>
                      <ThemedText style={u.muted}>{usd(earnings.fees.fees_paid)} of {usd(earnings.fees.monthly_cap)} cap</ThemedText>
                    </View>
                    <Progress value={earnings.fees.monthly_cap ? earnings.fees.fees_paid / earnings.fees.monthly_cap : 0} />
                    <ThemedText style={[u.muted, { fontSize: 12 }]}>
                      Each member who earns has their own {usd(earnings.fees.monthly_cap / Math.max(earnings.fees.cap_seats ?? 1, 1))} cap
                      {(earnings.fees.cap_seats ?? 1) > 1 ? ` (${earnings.fees.cap_seats} so far)` : ''} — past it, {earnings.fees.rules?.after_cap_percent ?? 2}% on their work for the rest of the month.
                    </ThemedText>
                  </View>
                  {earnings.owed_to_dodorez > 0 && (
                    <ThemedText style={[u.muted, { color: C.warn }]}>{usd(earnings.owed_to_dodorez)} comes out of your next payouts.</ThemedText>
                  )}
                  {earnings.payouts.length > 0 && (
                    <View>
                      {earnings.payouts.slice(0, 5).map((p, i, all) => (
                        <Row key={`${p.job_id}-${p.purpose}`} last={i === all.length - 1} title={p.job_title}
                          detail={[p.worker_name, new Date(p.released_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}
                          right={<ThemedText style={u.label}>{usd(p.provider_amount)}</ThemedText>} />
                      ))}
                    </View>
                  )}
                </Section>
              )}

              <Section title="Insurance & licences" flush
                action={owner && !addingDoc ? (
                  <Button small kind="ghost" label="Add" icon={<Plus size={16} color={C.info} />} onPress={() => startUpload('GENERAL_LIABILITY')} />
                ) : undefined}>
                {business.documents.length === 0 ? (
                  <Row last icon={<FileText size={18} color={C.muted} />} title="Nothing uploaded yet"
                    detail={`General liability (${usd(data.min_liability)}+) and your trade licences`} />
                ) : business.documents.map((doc, i) => (
                  <Row key={doc.id} last={i === business.documents.length - 1} onPress={() => Linking.openURL(doc.file_url)}
                    icon={<FileText size={18} color={C.ink} />} tone={DOC_STATUS[doc.status].tone}
                    title={`${DOC_NAMES[doc.kind]}${doc.trade ? ` · ${doc.trade}` : ''}`}
                    detail={
                      <View style={{ gap: 4 }}>
                        <ThemedText style={u.muted} numberOfLines={1}>
                          {[doc.issuer, doc.coverage_limit ? usd(doc.coverage_limit) : null, doc.expires_on ? `ends ${date(doc.expires_on)}` : null]
                            .filter(Boolean).join(' · ') || 'Tap to view'}
                        </ThemedText>
                        {doc.review_note && doc.status === 'REJECTED' && <ThemedText style={[u.muted, { color: C.bad }]}>{doc.review_note}</ThemedText>}
                        <Badge {...DOC_STATUS[doc.status]} />
                      </View>
                    }
                    right={owner && doc.status !== 'APPROVED' ? (
                      <TouchableOpacity onPress={() => removeDoc(doc)} disabled={busy === doc.id} hitSlop={10}>
                        <Trash2 size={18} color={C.faint} />
                      </TouchableOpacity>
                    ) : undefined} />
                ))}
              </Section>

              {owner && (approved || payoutsDone) && (
                <Section title="Payouts" flush>
                  <Row last icon={<Landmark size={18} color={C.ink} />} tone={payoutsDone ? 'ok' : demoPayouts ? 'info' : 'warn'}
                    title={payoutsDone ? 'Paid to your company' : demoPayouts ? 'Test mode' : 'Set up payouts'}
                    detail={payoutsDone ? 'Through Stripe, to the business bank account'
                      : demoPayouts ? 'Payouts are recorded, not sent, until Stripe is set up'
                      : 'Stripe checks the company and takes the bank account'}
                    right={<Button small kind="secondary" label={payoutsDone ? 'Manage' : 'Set up'} busy={busy === 'payouts'}
                      onPress={payoutsDone ? managePayouts : setUpPayouts} />} />
                </Section>
              )}

              {owner && (
                <OwnWorkSetting who="owner" businessName={business.name} value={business.allow_independent_work} busy={busy === 'indep'}
                  onChange={(on) => { run('indep', () => SkoFyApi.business.setIndependentWork(on)); }}
                  members={team?.members} busyMemberId={busy}
                  onMemberChange={(m, on) => { teamAction(m.id, () => SkoFyApi.business.setMemberOwnWork(m.id, on)); }} />
              )}

              {owner && (
                <CloseBusiness businessName={business.name}
                  onClosed={(message) => { appAlert.show('success', 'Business closed', message); reload(); }}
                  onError={(message) => appAlert.show('error', 'Not closed', message)} />
              )}

              {(business.email || business.phone) && (
                <ThemedText style={[u.muted, { textAlign: 'center' }]}>{[business.email, business.phone].filter(Boolean).join('  ·  ')}</ThemedText>
              )}
            </>
          )}
        </KeyboardAwareScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

function Tile({ icon, title, detail, onPress, hot }: { icon: React.ReactNode; title: string; detail: string; onPress: () => void; hot?: boolean }) {
  return (
    <TouchableOpacity style={[u.card, s.tile, hot && s.tileHot]} activeOpacity={0.8} onPress={onPress}>
      <View style={[s.tileIcon, hot && { backgroundColor: C.brand }]}>{icon}</View>
      <ThemedText style={s.tileTitle}>{title}</ThemedText>
      <ThemedText style={u.muted} numberOfLines={1}>{detail}</ThemedText>
    </TouchableOpacity>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <ThemedText style={u.muted}>{label}</ThemedText>
      <ThemedText style={s.statValue}>{value}</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 22, lineHeight: 30, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 20 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroName: { fontSize: 19, lineHeight: 25, fontFamily: Fonts.poppinsBold, color: C.ink },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, alignSelf: 'flex-start' },
  intro: { alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 8 },
  introIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft, marginBottom: 4 },
  introTitle: { fontSize: 21, lineHeight: 28, fontFamily: Fonts.poppinsBold, color: C.ink, textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 4 },
  tileHot: { borderColor: '#F7DC8B', backgroundColor: '#FFFDF5' },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft, marginBottom: 6 },
  tileTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: C.bg, gap: 2 },
  statValue: { fontSize: 19, lineHeight: 26, fontFamily: Fonts.poppinsBold, color: C.ink },
});
