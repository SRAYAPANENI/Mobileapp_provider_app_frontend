import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { AlertTriangle, CheckCircle, ChevronLeft, MessageSquare, Navigation as NavIcon, Phone, Star, User, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showDialog } from '@/components/alert-host';
import { ArrivalPanel, WaitResult } from '@/components/arrival-panel';
import { CareJobPanel } from '@/components/care-job-panel';
import { DeliveryHandover } from '@/components/delivery-handover';
import { ExtraWorkPanel } from '@/components/extra-work-panel';
import { InspectionReportForm } from '@/components/inspection-report-form';
import { InspectionStatus } from '@/components/inspection-status';
import { ReportIssueModal } from '@/components/report-issue-modal';
import { CancelJobSheet } from '@/components/service-room/cancel-job-sheet';
import { InspectionCode } from '@/components/service-room/inspection-code';
import { InvoiceForm } from '@/components/service-room/invoice-form';
import { PickupStep } from '@/components/service-room/pickup-step';
import { roomStyles } from '@/components/service-room/styles';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useServiceRoomJob, type RoomJob } from '@/hooks/use-service-room-job';
import { SkoFyApi } from '@/services/api';
import { callTapAllowed } from '@/services/callManager';
import { currentPosition } from '@/services/live-position';
import { isBuyForMe, isDelivered, isDelivery, isOrderCollected, navigationTarget, purchaseSummary } from '@/services/pickupDelivery';
import { emitRoomEvent, markServiceRoomOpen } from '@/services/service-room';

// A hired job's room: who it's for, where, and the one step to do now —
// arrive, check in, inspect, invoice, collect, deliver, complete.
//
// A screen of its own (it was a sheet drawn inside the dashboard, which
// redrew it on every GPS fix and list reload — the scrolling caught). It
// reads and watches its own job (hooks/use-service-room-job.ts), each step
// keeps its own form state (components/service-room/*), and every action is
// on THIS job — Start, Complete and Cancel used to act on the dashboard's
// "active" job, which with more than one booked job could be another one.
// The dashboard hears what happened (services/service-room.ts) for its job
// lock and the rating.

export default function ServiceRoomScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { job, detail, loading, failed, ended, active, refresh, setDetail, retry } = useServiceRoomJob(jobId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Known as open, so a second "open this room" (from the map, a chat) comes back to it.
  useEffect(() => (jobId ? markServiceRoomOpen(jobId) : undefined), [jobId]);

  // Closes this room and whatever is open over it (the map, a chat) — the job
  // can end while another screen is on top, and a plain "back" would close
  // that one and leave the dead room behind. Once only: the room's own action
  // and the job-ended signal can both ask.
  const navigation = useNavigation();
  const route = useRoute();
  const closedRef = useRef(false);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const state = navigation.getState();
    const at = state?.routes.findIndex((r) => r.key === route.key) ?? -1;
    if (state && at > 0) router.dismiss(state.routes.length - at);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  };
  // Over while open (cancelled, completed by the customer): it was said; close.
  useEffect(() => { if (ended) close(); }, [ended]);

  /** The job is over here; the dashboard updates its lock. */
  const leave = (event: 'completed' | 'ended') => {
    if (jobId) emitRoomEvent({ type: event, jobId });
    close();
  };

  const complete = async () => {
    if (!job) return;
    try {
      await SkoFyApi.jobs.markComplete(job.id);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // Already completed (the customer marked it first): still finished — on to the rating.
      if (!msg.includes('IN_PROGRESS')) {
        showDialog('Could Not Complete Job', msg || 'Could not mark the job as completed. Please try again.', undefined, { type: 'error' });
        return;
      }
    }
    leave('completed');
  };

  const customerAbsent = (message?: string) => {
    showDialog('Job Cancelled', message ?? "The customer wasn't there — the visiting fee is yours.", undefined, { type: 'success' });
    leave('ended');
  };

  const refused = () => {
    showDialog('Item Refused', 'The job is cancelled and your trip fee is kept. Thanks for checking.', undefined, { type: 'success' });
    leave('ended');
  };

  const openChat = (autoCall: boolean) => {
    if (!job) return;
    if (autoCall && !callTapAllowed()) return;
    router.push({
      pathname: '/chat' as any,
      params: { jobId: job.id, name: job.customer.name, jobTitle: job.title, ...(autoCall ? { autoCall: 'true' } : {}) },
    });
  };

  const navigate = () => {
    if (!job) return;
    // A delivery goes to the pickup first, then to the drop-off.
    const target = navigationTarget(job, detail);
    if (!target) return;
    router.push({
      pathname: '/navigate-to-site' as any,
      params: {
        lat: String(target.lat), lng: String(target.lng), title: target.title, jobId: job.id,
        stop: target.stop, customerName: job.customer.name,
      },
    });
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={close} style={st.headerBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={st.headerMiddle}>
          <ThemedText style={st.headerTitle}>Service Room</ThemedText>
          {!!jobId && <ThemedText style={st.headerSub}>Job #{String(jobId).slice(0, 8).toUpperCase()}</ThemedText>}
        </View>
        <View style={st.headerBtn} />
      </View>

      {loading && !detail ? (
        <View style={st.centre}><ActivityIndicator color="#FFCE48" size="large" /></View>
      ) : failed || !job || (!active && !ended) ? (
        // Gone (finished, cancelled elsewhere) or not readable: said, with a way out.
        <View style={st.centre}>
          <ThemedText style={st.goneText}>
            {failed && !detail
              ? "This job couldn't be loaded. Check your connection and try again."
              : "This job isn't active anymore — it may have already been completed or cancelled."}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {failed && !detail && (
              <TouchableOpacity style={[st.goneBtn, st.goneBtnQuiet]} onPress={retry}>
                <ThemedText style={st.goneBtnText}>Try again</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.goneBtn} onPress={close}>
              <ThemedText style={st.goneBtnText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <KeyboardAwareScrollView
          bottomOffset={24}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 + bottomInset }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StatusBanner job={job} detail={detail} />

          <ThemedText style={st.label}>REQUIREMENT DETAILS</ThemedText>
          <ThemedText style={st.jobTitle}>{job.title}</ThemedText>
          {!!job.businessName && <ThemedText style={st.jobDesc}>For {job.businessName}</ThemedText>}
          {!!job.description && <ThemedText style={st.jobDesc}>{job.description}</ThemedText>}

          {/* The customer, and the two ways to reach them. */}
          <View style={st.customerCard}>
            <View style={st.avatar}>
              {job.customer.image
                ? <Image source={{ uri: job.customer.image }} style={st.avatarImg} contentFit="cover" />
                : <User size={24} color="#9CA3AF" />}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={st.customerName} numberOfLines={2}>{job.customer.name}</ThemedText>
              {/* What providers said about paying them — it used to say "Verified
                  Dodorez Silver User" for everyone, which meant nothing. */}
              {job.customer.reviewCount > 0 && job.customer.avgPaymentRating != null ? (
                <View style={st.ratingRow}>
                  <Star size={12} color="#F59E0B" fill="#F59E0B" />
                  <ThemedText style={st.ratingText}>
                    {job.customer.avgPaymentRating.toFixed(1)} for paying · {job.customer.reviewCount} rating{job.customer.reviewCount === 1 ? '' : 's'}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={st.ratingText}>New customer</ThemedText>
              )}
            </View>
            <TouchableOpacity style={[st.contactBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => openChat(true)} accessibilityLabel="Call the customer">
              <Phone size={18} color="#16A34A" />
            </TouchableOpacity>
            <TouchableOpacity style={[st.contactBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => openChat(false)} accessibilityLabel="Message the customer">
              <MessageSquare size={18} color="#2563EB" />
            </TouchableOpacity>
          </View>

          {isDelivery(job) && <TripCard detail={detail} />}

          {/* No site to go to for an online job, or one at the provider's own place. */}
          {job.serviceMode !== 'REMOTE' && detail?.shape?.venue !== 'PROVIDER_PLACE' && navigationTarget(job, detail) && (
            <TouchableOpacity style={st.navigateBtn} onPress={navigate}>
              <NavIcon size={20} color="#fff" />
              <ThemedText style={st.navigateBtnText}>
                {navigationTarget(job, detail)?.title === 'Drop-off' ? 'Navigate to Drop-off (Maps)' : 'Navigate to Site (Maps)'}
              </ThemedText>
            </TouchableOpacity>
          )}

          <StepPanel
            job={job}
            detail={detail}
            refresh={refresh}
            setDetail={setDetail}
            onComplete={complete}
            onCustomerAbsent={customerAbsent}
            onRefused={refused}
            onCancel={() => setCancelOpen(true)}
            onReport={() => setReportOpen(true)}
          />
        </KeyboardAwareScrollView>
      )}

      {!!jobId && (
        <>
          <CancelJobSheet jobId={jobId} visible={cancelOpen} onClose={() => setCancelOpen(false)} onCancelled={() => { setCancelOpen(false); leave('ended'); }} />
          <ReportIssueModal
            jobId={jobId}
            visible={reportOpen}
            onClose={() => setReportOpen(false)}
            // Disputed: off the active list, under review.
            onFiled={() => { setReportOpen(false); leave('ended'); }}
          />
        </>
      )}
    </View>
  );
}

// ── The banner: where the job is, said truly ────────────────────────────────
// It said "LIVE SERVICE IN PROGRESS" from the moment of hire, and while disputed.

function StatusBanner({ job, detail }: { job: RoomJob; detail: any }) {
  const delivery = isDelivery(job);
  const [text, tone] = ((): [string, 'live' | 'info' | 'wait' | 'warn'] => {
    switch (job.status) {
      case 'IN_PROGRESS':
        return delivery && !isDelivered(detail) ? ['ON THE WAY TO THE DROP-OFF', 'live'] : ['LIVE SERVICE IN PROGRESS', 'live'];
      case 'INSPECTING': return ['INSPECTING', 'info'];
      case 'INVOICE_PENDING': return ['INVOICE SENT — WAITING FOR THE CUSTOMER', 'wait'];
      case 'DISPUTED': return ['UNDER REVIEW', 'warn'];
      default:
        return delivery
          ? [detail?.pickup_confirmed_at ? 'COLLECTED' : 'HIRED — HEAD TO THE PICKUP', 'info']
          : [job.serviceMode === 'REMOTE' ? 'HIRED — ONLINE JOB' : 'HIRED — HEAD TO THE JOB', 'info'];
    }
  })();
  const colors = {
    live: { bg: '#FEF2F2', fg: '#EF4444' },
    info: { bg: '#EFF6FF', fg: '#1D4ED8' },
    wait: { bg: '#FFFBEB', fg: '#B45309' },
    warn: { bg: '#FFF7ED', fg: '#C2410C' },
  }[tone];
  return (
    <View style={[st.banner, { backgroundColor: colors.bg }]}>
      <View style={[st.bannerDot, { borderColor: colors.fg }]} />
      <ThemedText style={[st.bannerText, { color: colors.fg }]}>{text}</ThemedText>
    </View>
  );
}

// ── A trip's details ───────────────────────────────────────────────────────

function TripCard({ detail }: { detail: any }) {
  if (!detail) return null;
  const summary = purchaseSummary(detail);
  return (
    <View style={st.tripCard}>
      {!!summary && <ThemedText style={st.tripStrong}>{summary}</ThemedText>}
      {!!detail.pickup_address && <ThemedText style={st.tripText}>Pick up at: {detail.pickup_address}</ThemedText>}
      {!!detail.dropoff_address && <ThemedText style={st.tripText}>Deliver to: {detail.dropoff_address}</ThemedText>}
      {!!detail.pickup_details?.recipient_name && (
        // Tap to phone them, when there's a number.
        <TouchableOpacity
          disabled={!detail.pickup_details?.recipient_phone}
          onPress={() => Linking.openURL(`tel:${detail.pickup_details.recipient_phone}`)}
        >
          <ThemedText style={st.tripText}>
            Hand it to: {detail.pickup_details.recipient_name}
            {detail.pickup_details?.recipient_phone ? ` · call ${detail.pickup_details.recipient_phone}` : ''} — they have the drop-off code
          </ThemedText>
        </TouchableOpacity>
      )}
      {!!detail.dropoff_notes && <ThemedText style={st.tripText}>Instructions: {detail.dropoff_notes}</ThemedText>}
    </View>
  );
}

// ── The step to do now ─────────────────────────────────────────────────────

function StepPanel({ job, detail, refresh, setDetail, onComplete, onCustomerAbsent, onRefused, onCancel, onReport }: {
  job: RoomJob;
  detail: any;
  refresh: () => Promise<any>;
  setDetail: (d: any) => void;
  onComplete: () => void;
  onCustomerAbsent: (message?: string) => void;
  onRefused: () => void;
  onCancel: () => void;
  onReport: () => void;
}) {
  const s = roomStyles;
  const status = job.status;
  const delivery = isDelivery(job);
  const buying = delivery && isBuyForMe(detail);
  // Once the order is collected the server refuses a cancel (it'd be left with
  // the provider) — a dispute instead.
  const collected = isOrderCollected({ jobKind: job.jobKind, pickup_confirmed_at: detail?.pickup_confirmed_at });
  const showError = (title: string, message: string) => showDialog(title, message, undefined, { type: 'error' });
  const onRefresh = () => { void refresh(); };

  const cancelButton = (
    <TouchableOpacity style={s.dangerBtn} onPress={collected ? onReport : onCancel}>
      {collected ? <AlertTriangle size={18} color="#EF4444" /> : <XCircle size={18} color="#EF4444" />}
      <ThemedText style={s.dangerBtnText}>{collected ? 'Report an Issue' : 'Cancel This Job'}</ThemedText>
    </TouchableOpacity>
  );

  if (status === 'DISPUTED') {
    return <ThemedText style={s.note}>This job is under review. Our team will get back to you within 24 hours.</ThemedText>;
  }

  // Priced up front (booked and paid): check-in, hand-over, updates, hand-back.
  if (detail?.steps?.includes('PAY_UPFRONT') && !detail?.steps?.includes('PICKUP_PROOF')) {
    return (
      <CareJobPanel
        job={detail}
        getCoords={currentPosition}
        onChanged={onRefresh}
        onComplete={onComplete}
        onCustomerAbsent={onCustomerAbsent}
        onMessage={(kind, title, message) => showDialog(title, message, undefined, { type: kind })}
      />
    );
  }

  if (status === 'IN_PROGRESS' && delivery && !isDelivered(detail)) {
    return (
      <>
        {/* "I'm at the drop-off": tells the customer, and starts the waiting clock there when agreed. */}
        <ArrivalPanel
          jobId={job.id}
          stop="dropoff"
          arrivedAt={detail?.dropoff_arrived_at}
          customerExpected={false}
          wait={detail?.trip_wait}
          getCoords={currentPosition}
          onArrived={onRefresh}
          onCustomerAbsent={onCustomerAbsent}
          onError={showError}
        />
        <DeliveryHandover
          key={job.id}
          jobId={job.id}
          onDelivered={() => { setDetail({ ...detail, delivered_at: new Date().toISOString() }); onRefresh(); }}
          recipientName={detail?.pickup_details?.recipient_name}
          photoUrl={detail?.dropoff_photo_url}
          onPhotoSaved={onRefresh}
          arrived={!!detail?.dropoff_arrived_at}
        />
      </>
    );
  }

  if (status === 'IN_PROGRESS') {
    return (
      <>
        {/* A delivered trip: what waiting paid, now no clock is running. */}
        <WaitResult wait={detail?.trip_wait} />
        <ExtraWorkPanel jobId={job.id} onMessage={(kind, title, message) => showDialog(title, message, undefined, { type: kind })} />
        <ThemedText style={s.note}>Please ensure you have finished all tasks before marking as completed.</ThemedText>
        <TouchableOpacity style={s.primaryBtn} onPress={onComplete}>
          <CheckCircle size={20} color="#fff" />
          <ThemedText style={s.primaryBtnText}>Mark as Completed</ThemedText>
        </TouchableOpacity>
      </>
    );
  }

  if (status === 'ACCEPTED' && job.serviceMode === 'REMOTE') {
    // No visit to check: straight to the invoice (raise_invoice allows ACCEPTED for REMOTE).
    return (
      <>
        <ThemedText style={s.note}>This is a remote engagement — no on-site inspection needed. Send the customer your invoice when ready.</ThemedText>
        <InvoiceForm jobId={job.id} kind="remote" onSent={onRefresh} />
        {cancelButton}
      </>
    );
  }

  if (status === 'ACCEPTED' && delivery && detail?.pickup_confirmed_at && !detail?.steps?.includes('PAY_UPFRONT')) {
    // A quoted pickup, collected: invoiced now (a trip's fare was paid at booking).
    return (
      <>
        <ThemedText style={s.note}>
          {buying
            ? `Pickup confirmed. The items${detail?.goods_amount != null ? ` ($${Number(detail.goods_amount).toFixed(2)})` : ''} are paid back to you from the customer's held shopping money — invoice only your delivery charge.`
            : 'Pickup confirmed. Add any items/costs, then send the customer your invoice.'}
        </ThemedText>
        <InvoiceForm jobId={job.id} kind="pickup" buyingForCustomer={buying} onSent={onRefresh} />
        {cancelButton}
      </>
    );
  }

  if (status === 'ACCEPTED' && delivery) {
    return (
      <>
        <PickupStep
          job={job}
          detail={detail}
          onArrived={onRefresh}
          onCollected={setDetail}
          onRefused={onRefused}
          onCustomerAbsent={onCustomerAbsent}
        />
        {cancelButton}
      </>
    );
  }

  if (status === 'ACCEPTED' && detail?.shape?.venue === 'PROVIDER_PLACE') {
    // At the provider's own place: they're home — no "I'm here"; the customer
    // comes and shows their code (the server's check-in code for a quoted job).
    return (
      <>
        <InspectionCode jobId={job.id} onVerified={onRefresh} arrived atYourPlace />
        {cancelButton}
      </>
    );
  }

  if (status === 'ACCEPTED') {
    return (
      <>
        <ArrivalPanel
          jobId={job.id}
          arrivedAt={detail?.arrived_at}
          customerExpected={(detail?.shape?.venue ?? 'CUSTOMER_PLACE') === 'CUSTOMER_PLACE'}
          getCoords={currentPosition}
          onArrived={onRefresh}
          onCustomerAbsent={onCustomerAbsent}
          onError={showError}
        />
        <InspectionCode jobId={job.id} onVerified={onRefresh} arrived={!!detail?.arrived_at} />
        {cancelButton}
      </>
    );
  }

  if (status === 'INSPECTING' && !detail?.inspection_completed_at) {
    return (
      <>
        <InspectionReportForm jobId={job.id} getCoords={currentPosition} onSubmitted={onRefresh} onError={showError} />
        {cancelButton}
      </>
    );
  }

  if (status === 'INSPECTING') {
    return (
      <>
        <InspectionStatus
          jobId={job.id}
          confidence={detail?.inspection_confidence}
          disputed={!!detail?.inspection_disputed_at}
          onChanged={onRefresh}
          onError={showError}
        />
        <ThemedText style={s.note}>Add any raw materials needed, then send the customer your invoice.</ThemedText>
        <InvoiceForm jobId={job.id} kind="inspected" onSent={onRefresh} />
        {cancelButton}
      </>
    );
  }

  if (status === 'INVOICE_PENDING') {
    return <InvoicePending job={job} detail={detail} setDetail={setDetail} onRefresh={onRefresh} cancelButton={cancelButton} />;
  }

  return null;
}

// ── The invoice is with the customer ───────────────────────────────────────

function InvoicePending({ job, detail, setDetail, onRefresh, cancelButton }: {
  job: RoomJob; detail: any; setDetail: (d: any) => void; onRefresh: () => void; cancelButton: React.ReactNode;
}) {
  const s = roomStyles;
  const [responding, setResponding] = useState(false);
  const collected = isOrderCollected({ jobKind: job.jobKind, pickup_confirmed_at: detail?.pickup_confirmed_at });
  const invoice = detail?.invoice;

  const respond = async (accept: boolean) => {
    setResponding(true);
    try {
      await SkoFyApi.jobs.respondToCounter(job.id, accept);
      // Rejecting puts the original amount back on offer; either way, read it again.
      setDetail(await SkoFyApi.jobs.get(job.id));
    } catch (err: any) {
      showDialog('Failed', err?.message ?? 'Please try again.', undefined, { type: 'error' });
    } finally {
      setResponding(false);
    }
  };

  return (
    <>
      {detail?.inspection_completed_at && detail?.inspection_confidence !== 'CONFIRMED' && (
        <InspectionStatus
          jobId={job.id}
          confidence={detail?.inspection_confidence}
          disputed={!!detail?.inspection_disputed_at}
          onChanged={onRefresh}
          onError={(title, message) => showDialog(title, message, undefined, { type: 'error' })}
        />
      )}
      {invoice?.status === 'COUNTERED' ? (
        <>
          <ThemedText style={s.note}>Customer countered with ${invoice.counter_amount} — accept or reject.</ThemedText>
          <TouchableOpacity style={[s.primaryBtn, responding && { opacity: 0.7 }]} onPress={() => respond(true)} disabled={responding}>
            <ThemedText style={s.primaryBtnText}>Accept ${invoice.counter_amount}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={s.dangerBtn} onPress={() => respond(false)} disabled={responding}>
            <ThemedText style={s.dangerBtnText}>Reject — Offer Original Price</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ThemedText style={s.note}>
            {invoice?.status === 'ACCEPTED'
              ? 'Invoice accepted — waiting for the customer to pay.'
              : invoice?.status === 'COUNTER_REJECTED'
                ? `You declined their offer — waiting for the customer to accept the original $${invoice.amount}${collected ? '' : ' or cancel'}.`
                : 'Invoice sent — waiting for the customer to respond.'}
          </ThemedText>
          {cancelButton}
        </>
      )}
    </>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerMiddle: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  headerSub: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#9CA3AF' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  goneText: { fontSize: 15, lineHeight: 22, color: '#6B7280', textAlign: 'center', fontFamily: Fonts.poppins },
  goneBtn: { backgroundColor: '#FFCE48', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  goneBtnQuiet: { backgroundColor: '#F3F4F6' },
  goneBtnText: { fontFamily: Fonts.poppinsBold, color: '#111827' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  bannerDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsBold, letterSpacing: 0.5 },
  label: { fontSize: 11, lineHeight: 17, fontFamily: Fonts.poppinsBold, color: '#9CA3AF', letterSpacing: 1, marginBottom: 8 },
  jobTitle: { fontSize: 22, lineHeight: 28, fontFamily: Fonts.poppinsBold, color: '#111827', marginBottom: 8 },
  jobDesc: { fontSize: 14, fontFamily: Fonts.poppins, color: '#6B7280', lineHeight: 22, marginBottom: 12 },
  customerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16,
    padding: 14, marginTop: 8, marginBottom: 20, gap: 10,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  customerName: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827', marginBottom: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280' },
  contactBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tripCard: { backgroundColor: '#F0F9FF', borderRadius: 14, padding: 12, gap: 4, marginBottom: 10 },
  tripStrong: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#0C4A6E' },
  tripText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#0F172A' },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 16, marginBottom: 16,
  },
  navigateBtnText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#fff' },
});
