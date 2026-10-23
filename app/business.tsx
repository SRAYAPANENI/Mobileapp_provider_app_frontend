import { useAppAlert } from '@/components/app-alert';
import { BusinessDocumentForm } from '@/components/business/business-document-form';
import { BusinessInvites } from '@/components/business/business-invites';
import { BusinessProfileForm } from '@/components/business/business-profile-form';
import { TeamSection } from '@/components/business/team-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessDocument, BusinessEarnings, BusinessInvite, MemberRole, MyBusiness, SkoFyApi, Team, TeamMember } from '@/services/api';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Building2, CheckCircle2, ChevronLeft, CircleAlert, FileText, Landmark, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StatusBar, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  DRAFT: { title: 'Set up your business', body: 'Add your insurance and licences, set up payouts, then send it for review.' },
  PENDING_REVIEW: { title: 'With our team for review', body: "We check your details, insurance and licences — usually within 2 business days." },
  APPROVED: { title: 'Approved', body: 'Your business is verified on Dodorez.' },
  REJECTED: { title: 'Needs changes', body: '' },
};
const DOC_NAMES: Record<string, string> = {
  GENERAL_LIABILITY: 'General liability', WORKERS_COMP: "Workers' comp", LICENCE: 'Trade licence',
};
const DOC_STATUS: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: 'In review', color: '#92400E' },
  APPROVED: { label: 'Approved', color: '#065F46' },
  REJECTED: { label: 'Not accepted', color: '#B91C1C' },
  EXPIRED: { label: 'Expired', color: '#B91C1C' },
};
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// A business account (docs/BUSINESS_PROVIDERS_DESIGN.md): a company that
// provides through its team. The owner sets it up here — company details,
// insurance and licences, payouts with Stripe as a company — and sends it for
// review. Tax ID, owners and bank account are collected by Stripe, never here.
export default function BusinessScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [data, setData] = useState<MyBusiness | null>(null);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [earnings, setEarnings] = useState<BusinessEarnings | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    SkoFyApi.business.mine().then((next) => {
      setData(next);
      if (!next.enabled) return;
      SkoFyApi.business.invites().then(setInvites).catch(() => setInvites([]));
      if (next.role === 'OWNER' || next.role === 'DISPATCHER') SkoFyApi.business.team().then(setTeam).catch(() => setTeam(null));
      else setTeam(null);
      if (next.role === 'OWNER' && next.business) SkoFyApi.business.earnings().then(setEarnings).catch(() => setEarnings(null));
      else setEarnings(null);
    }).catch((err: any) => appAlert.show('error', 'Could not load', err?.message ?? 'Please try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);

  const run = async (key: string, action: () => Promise<MyBusiness | void>, success?: string) => {
    setBusy(key);
    try {
      const next = await action();
      if (next) setData(next);
      if (success) appAlert.show('success', 'Done', success);
    } catch (err: any) {
      appAlert.show('error', 'Not done', err?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const setUpPayouts = () => run('payouts', async () => {
    const { url } = await SkoFyApi.business.payoutsLink();
    // Same return URL as an individual's payout setup (STRIPE_CONNECT_RETURN_URL).
    await WebBrowser.openAuthSessionAsync(url, 'skofyserviceproviderapp://connect-return');
    await SkoFyApi.business.payoutsStatus();
    return SkoFyApi.business.mine();
  });

  const managePayouts = () => run('payouts', async () => {
    const { url } = await SkoFyApi.business.payoutsDashboard();
    await WebBrowser.openBrowserAsync(url);
  });

  const answerInvite = async (invite: BusinessInvite, accept: boolean, acknowledged: boolean, authorizedCheck: boolean) => {
    try {
      const { message } = await SkoFyApi.business.answerInvite(invite.id, accept, acknowledged, authorizedCheck);
      appAlert.show('success', accept ? 'Welcome to the team' : 'Declined', message);
      load();
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
  const leaveTeam = () => appAlert.show('warning', 'Leave this team?', "You won't get its jobs any more.", [
    { text: 'Stay', variant: 'secondary' },
    { text: 'Leave', variant: 'primary', onPress: () => run('leave', async () => { await SkoFyApi.business.leave(); load(); }) },
  ]);

  const removeDoc = (doc: BusinessDocument) => appAlert.show('warning', 'Remove this document?', DOC_NAMES[doc.kind], [
    { text: 'Keep', variant: 'secondary' },
    { text: 'Remove', variant: 'primary', onPress: () => run(doc.id, () => SkoFyApi.business.removeDocument(doc.id)) },
  ]);

  const business = data?.business;
  const owner = data?.role === 'OWNER';
  const canEdit = owner && business?.status !== 'PENDING_REVIEW';
  const payoutsDone = business?.connect_onboarding_status === 'COMPLETE';

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Business account</ThemedText>
      </View>

      {!data ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : !data.enabled ? (
        <View style={s.body}><ThemedText style={s.muted}>Business accounts are coming soon.</ThemedText></View>
      ) : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)} keyboardShouldPersistTaps="handled">
          <BusinessInvites invites={invites} onAnswer={answerInvite} />
          {!business ? (
            <View style={s.card}>
              <View style={s.row}><Building2 size={18} color="#111827" /><ThemedText style={s.cardTitle}>Work as a business</ThemedText></View>
              <ThemedText style={s.muted}>
                For a registered company — an LLC, corporation, partnership or sole proprietor — with its own insurance.
                Customers see your business name, and it's paid to the company's bank account.
              </ThemedText>
              <BusinessProfileForm submitLabel="Create business"
                onSubmit={(input) => run('create', () => SkoFyApi.business.create(input), 'Business created.')} />
            </View>
          ) : (
            <>
              <View style={[s.card, business.status === 'REJECTED' && s.cardWarn]}>
                <ThemedText style={s.cardTitle}>{STATUS_TEXT[business.status].title}</ThemedText>
                <ThemedText style={s.muted}>{business.status === 'REJECTED' ? business.review_note : STATUS_TEXT[business.status].body}</ThemedText>
                {business.ready_for_on_site_work ? (
                  <View style={s.row}><CheckCircle2 size={16} color="#065F46" /><ThemedText style={s.ok}>Ready to take on-site jobs</ThemedText></View>
                ) : (
                  <>
                    <ThemedText style={s.label}>Still needed to take jobs</ThemedText>
                    {business.missing.map((m) => (
                      <View key={m} style={s.row}><CircleAlert size={15} color="#92400E" /><ThemedText style={s.item}>{m}</ThemedText></View>
                    ))}
                  </>
                )}
                {owner && (business.status === 'DRAFT' || business.status === 'REJECTED') && (
                  <TouchableOpacity style={s.primary} disabled={busy === 'submit'}
                    onPress={() => run('submit', SkoFyApi.business.submit, "Sent for review — we'll let you know.")}>
                    {busy === 'submit' ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Send for review</ThemedText>}
                  </TouchableOpacity>
                )}
              </View>

              {owner && (
                <View style={s.card}>
                  <View style={s.row}>
                    <ThemedText style={[s.cardTitle, { flex: 1 }]}>Team can also work for themselves</ThemedText>
                    <Switch value={business.allow_independent_work} trackColor={{ true: '#FFCE48' }} disabled={busy === 'indep'}
                      onValueChange={(on) => run('indep', () => SkoFyApi.business.setIndependentWork(on))} />
                  </View>
                  <ThemedText style={s.muted}>
                    If on, members can take their own jobs too — never customers they served for {business.name} in the last year.
                    You never see their own jobs.
                  </ThemedText>
                </View>
              )}

              {!owner && (
                <View style={s.card}>
                  <ThemedText style={s.cardTitle}>You're on the {business.name} team</ThemedText>
                  <ThemedText style={s.muted}>As {data.role === 'DISPATCHER' ? 'a dispatcher' : 'a worker'}. While you're on its jobs, {business.name} can see your location.</ThemedText>
                  {business.allow_independent_work ? (
                    <View style={s.row}>
                      <ThemedText style={[s.item, { flex: 1 }]}>Also take jobs for myself</ThemedText>
                      <Switch value={!!data.own_switch} trackColor={{ true: '#FFCE48' }} disabled={busy === 'own'}
                        onValueChange={(on) => run('own', () => SkoFyApi.business.setOwnWork(on))} />
                    </View>
                  ) : (
                    <ThemedText style={s.muted}>Your jobs come through {business.name}.</ThemedText>
                  )}
                  <TouchableOpacity style={s.secondary} onPress={leaveTeam} disabled={busy === 'leave'}>
                    <ThemedText style={s.secondaryText}>Leave the team</ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {(data.role === 'OWNER' || data.role === 'DISPATCHER') && (
                <TouchableOpacity style={s.primary} onPress={() => router.push('/business-jobs' as any)}>
                  <ThemedText style={s.primaryText}>Team jobs — apply and assign</ThemedText>
                </TouchableOpacity>
              )}

              {team && (
                <TeamSection team={team} canManage={owner}
                  onInvite={async (phone, role: MemberRole) => {
                    try {
                      setTeam(await SkoFyApi.business.invite(phone, role));
                      appAlert.show('success', 'Invite sent', "They'll see it under Business account in their Dodorez Pro app.");
                    } catch (err: any) {
                      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
                      throw err;
                    }
                  }}
                  onChangeRole={(m, role) => teamAction(m.id, () => SkoFyApi.business.changeRole(m.id, role))}
                  onRemove={removeMember} />
              )}

              <View style={s.card}>
                <View style={s.row}>
                  <Building2 size={18} color="#111827" />
                  <ThemedText style={[s.cardTitle, { flex: 1 }]}>{business.name}</ThemedText>
                  {canEdit && !editing && <TouchableOpacity onPress={() => setEditing(true)}><ThemedText style={s.link}>Edit</ThemedText></TouchableOpacity>}
                </View>
                {editing ? (
                  <BusinessProfileForm initial={business} submitLabel="Save" onCancel={() => setEditing(false)}
                    onSubmit={(input) => run('edit', async () => { const next = await SkoFyApi.business.update(input); setEditing(false); return next; })} />
                ) : (
                  <>
                    <ThemedText style={s.item}>{business.legal_name} · {business.entity_type.replace('_', ' ').toLowerCase()} · {business.state}</ThemedText>
                    {(business.email || business.phone) && <ThemedText style={s.muted}>{[business.email, business.phone].filter(Boolean).join(' · ')}</ThemedText>}
                    {business.status === 'APPROVED' && canEdit && (
                      <ThemedText style={s.hint}>Changing the legal name, type or state sends it back for review.</ThemedText>
                    )}
                  </>
                )}
              </View>

              {owner && earnings && (
                <View style={s.card}>
                  <ThemedText style={s.cardTitle}>Money</ThemedText>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}><ThemedText style={s.muted}>Paid out</ThemedText><ThemedText style={s.cardTitle}>{usd(earnings.total_earned)}</ThemedText></View>
                    <View style={{ flex: 1 }}><ThemedText style={s.muted}>Held for jobs</ThemedText><ThemedText style={s.cardTitle}>{usd(earnings.pending)}</ThemedText></View>
                  </View>
                  <ThemedText style={s.muted}>
                    Fees this month {usd(earnings.fees.fees_paid)} of the {usd(earnings.fees.monthly_cap)} cap
                    {earnings.owed_to_dodorez > 0 ? ` · ${usd(earnings.owed_to_dodorez)} comes out of your next payouts` : ''}
                  </ThemedText>
                  {earnings.payouts.slice(0, 5).map((p) => (
                    <ThemedText key={`${p.job_id}-${p.purpose}`} style={s.muted}>
                      {p.job_title}{p.worker_name ? ` (${p.worker_name})` : ''} · {usd(p.provider_amount)}
                    </ThemedText>
                  ))}
                </View>
              )}

              {owner && (
                <View style={s.card}>
                  <View style={s.row}><Landmark size={18} color="#111827" /><ThemedText style={s.cardTitle}>Payouts</ThemedText></View>
                  <ThemedText style={s.muted}>
                    {payoutsDone ? "Set up — you're paid to the company's bank account."
                      : 'Stripe verifies the company (tax ID and owners) and takes the bank account. Dodorez never sees them.'}
                  </ThemedText>
                  <TouchableOpacity style={payoutsDone ? s.secondary : s.primary} disabled={busy === 'payouts'}
                    onPress={payoutsDone ? managePayouts : setUpPayouts}>
                    {busy === 'payouts' ? <ActivityIndicator color="#111827" /> : (
                      <ThemedText style={payoutsDone ? s.secondaryText : s.primaryText}>
                        {payoutsDone ? 'Manage payouts' : business.connect_onboarding_status === 'NOT_STARTED' ? 'Set up payouts with Stripe' : 'Continue payout setup'}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.card}>
                <View style={s.row}><FileText size={18} color="#111827" /><ThemedText style={s.cardTitle}>Insurance and licences</ThemedText></View>
                {business.documents.length === 0 && (
                  <ThemedText style={s.muted}>Upload your general liability certificate ({usd(data.min_liability)} or more) and the licences your trades need.</ThemedText>
                )}
                {business.documents.map((doc) => (
                  <View key={doc.id} style={s.doc}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText style={s.item}>{DOC_NAMES[doc.kind]}{doc.trade ? ` — ${doc.trade}` : ''}</ThemedText>
                      <ThemedText style={s.muted}>
                        {[doc.issuer, doc.number, doc.coverage_limit ? usd(doc.coverage_limit) : null,
                          doc.expires_on ? `ends ${new Date(doc.expires_on + 'T00:00:00').toLocaleDateString()}` : null].filter(Boolean).join(' · ')}
                      </ThemedText>
                      <ThemedText style={[s.status, { color: DOC_STATUS[doc.status].color }]}>{DOC_STATUS[doc.status].label}</ThemedText>
                      {doc.review_note && doc.status === 'REJECTED' && <ThemedText style={s.hint}>{doc.review_note}</ThemedText>}
                      <TouchableOpacity onPress={() => Linking.openURL(doc.file_url)}><ThemedText style={s.link}>View file</ThemedText></TouchableOpacity>
                    </View>
                    {owner && doc.status !== 'APPROVED' && (
                      <TouchableOpacity onPress={() => removeDoc(doc)} disabled={busy === doc.id}><Trash2 size={18} color="#9CA3AF" /></TouchableOpacity>
                    )}
                  </View>
                ))}
                {owner && (addingDoc ? (
                  <BusinessDocumentForm minLiability={data.min_liability} onCancel={() => setAddingDoc(false)}
                    onError={(message) => appAlert.show('error', 'Not uploaded', message)}
                    onSubmit={(doc) => run('doc', async () => { const next = await SkoFyApi.business.addDocument(doc); setAddingDoc(false); return next; },
                      "Uploaded — we'll review it.")} />
                ) : (
                  <TouchableOpacity style={s.secondary} onPress={() => setAddingDoc(true)}>
                    <ThemedText style={s.secondaryText}>Add insurance or a licence</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { paddingHorizontal: 16, gap: 12 },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  cardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  label: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#374151', marginTop: 4 },
  item: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#92400E' },
  ok: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#065F46' },
  status: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  doc: { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  primary: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48', marginTop: 4 },
  primaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6', marginTop: 4 },
  secondaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
});
