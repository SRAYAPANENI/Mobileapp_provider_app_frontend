import { Badge, Button, C, Tone, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { Vehicle, VehicleDocument, VehicleDocumentKind } from '@/services/api';
import { showDate } from '@/services/usDate';
import { Image } from 'expo-image';
import { AlertTriangle, FileText, ShieldCheck } from 'lucide-react-native';
import { VehicleIcon } from './vehicle-icon';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const STATUS: Record<Vehicle['status'], { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: 'Being checked', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Not approved', tone: 'bad' },
};
const DOC_STATUS: Record<VehicleDocument['status'], { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: 'Being checked', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Not accepted', tone: 'bad' },
  EXPIRED: { label: 'Ended', tone: 'neutral' },
};
const SIZE_WORDS = { LARGE: 'car-trunk', BULKY: 'van-size' } as const;
const DOC_WORDS: Record<VehicleDocumentKind, string> = { REGISTRATION: 'Registration', INSURANCE: 'Insurance' };

interface Props {
  vehicle: Vehicle;
  insuranceRequired: boolean;
  busy: boolean;
  onAddDocument: (kind: VehicleDocumentKind) => void;
  onRemove: () => void;
}

/** The latest of each kind: what the provider needs to see (older ones are history). */
function latest(docs: VehicleDocument[]): VehicleDocument[] {
  const seen = new Set<string>();
  return docs.filter((d) => (seen.has(d.kind) ? false : (seen.add(d.kind), true)));
}

// One vehicle: what it is, its plate, whether it counts and — if not — what's
// missing, then its papers with their end dates and what to do about them.
export function VehicleCard({ vehicle: v, insuranceRequired, busy, onAddDocument, onRemove }: Props) {
  const status = STATUS[v.status];
  const docs = latest(v.documents);
  const registration = docs.find((d) => d.kind === 'REGISTRATION');
  const insurance = docs.find((d) => d.kind === 'INSURANCE');
  // A renewal is due when the latest one ends soon, has ended, or was turned down.
  const due = (d?: VehicleDocument) => !d || d.ends_soon || d.status === 'EXPIRED' || d.status === 'REJECTED';
  const renewRegistration = !!registration && due(registration);
  return (
    <View style={u.card}>
      <View style={s.head}>
        {v.front_photo_url ? (
          <View>
            <Image source={{ uri: v.front_photo_url }} style={s.thumb} contentFit="cover" />
            {/* Its kind at a glance, on the photo's corner. */}
            <View style={s.kind}><VehicleIcon type={v.vehicle_type} size={14} color={C.ink} /></View>
          </View>
        ) : <View style={[s.thumb, s.thumbEmpty]}><VehicleIcon type={v.vehicle_type} size={28} color={C.muted} /></View>}
        <View style={{ flex: 1, gap: 3 }}>
          <ThemedText style={s.name} numberOfLines={2}>{v.description}</ThemedText>
          <ThemedText style={u.muted}>{v.year} · {v.plate} ({v.plate_state})</ThemedText>
          <Badge label={status.label} tone={status.tone}
            icon={v.usable ? <ShieldCheck size={12} color={C.ok} /> : undefined} />
        </View>
      </View>

      {v.usable ? (
        <ThemedText style={[u.body, { color: C.ok }]}>
          {v.carries.map((c) => SIZE_WORDS[c]).join(' and ').replace(/^./, (ch) => ch.toUpperCase())} trips reach you in it.
        </ThemedText>
      ) : v.status === 'REJECTED' ? (
        <View style={s.note}>
          <AlertTriangle size={15} color={C.bad} />
          <ThemedText style={[u.body, { flex: 1, color: C.bad }]}>
            {v.review_note ?? 'It wasn’t approved.'} Remove it and add it again with that fixed.
          </ThemedText>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <ThemedText style={u.label}>Before trips reach you in it:</ThemedText>
          {v.missing.map((m) => <ThemedText key={m} style={u.muted}>• {m}</ThemedText>)}
        </View>
      )}

      <View style={s.docs}>
        {docs.map((d) => (
          <View key={d.id} style={s.doc}>
            <FileText size={16} color={C.muted} />
            <View style={{ flex: 1 }}>
              <ThemedText style={s.docTitle}>{DOC_WORDS[d.kind]}</ThemedText>
              <ThemedText style={[u.muted, d.ends_soon && { color: C.warn }]}>
                {d.status === 'EXPIRED' ? `Ended ${showDate(d.expires_on)}` : `${d.ends_soon ? 'Ends soon — ' : 'Until '}${showDate(d.expires_on)}`}
              </ThemedText>
              {d.status === 'REJECTED' && d.review_note && <ThemedText style={[u.muted, { color: C.bad }]}>{d.review_note}</ThemedText>}
            </View>
            <Badge label={DOC_STATUS[d.status].label} tone={DOC_STATUS[d.status].tone} />
          </View>
        ))}
        {!insurance && (
          <ThemedText style={u.muted}>
            {insuranceRequired ? 'Insurance is needed before trips reach you in it.' : 'Insurance: optional for now — add it to have it on file.'}
          </ThemedText>
        )}
      </View>

      {v.status !== 'REJECTED' && (
        <View style={s.actions}>
          {renewRegistration && (
            <Button small kind="secondary" label="Renew registration" onPress={() => onAddDocument('REGISTRATION')} disabled={busy} />
          )}
          {due(insurance) && (
            <Button small kind="secondary" label={insurance ? 'Renew insurance' : 'Add insurance'} onPress={() => onAddDocument('INSURANCE')} disabled={busy} />
          )}
        </View>
      )}
      <Button small kind="danger" label="Remove vehicle" onPress={onRemove} disabled={busy} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: '#F1F5F9' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  kind: {
    position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand, borderWidth: 2, borderColor: C.card,
  },
  name: { fontSize: 15.5, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: C.badSoft },
  docs: { gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docTitle: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
