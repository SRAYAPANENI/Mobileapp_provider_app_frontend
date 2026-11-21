import { ThemedText } from '@/components/themed-text';
import { NearbyBusiness, WorkHours } from '@/services/api';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Consent } from './business-invites';
import { Button, C, u } from './ui';
import { defaultHours, inMyZone, WorkHoursEditor } from './work-hours';

interface Props {
  business: Pick<NearbyBusiness, 'name' | 'notice' | 'needs_check' | 'check_disclosure'>;
  busy: boolean;
  onCancel: () => void;
  onSend: (hours: WorkHours, agreed: boolean, authorized: boolean) => void;
}

// Asking to join: the hours you'd want, and — because their Accept puts you
// on the team straight away — the location notice and, without a clear
// background check, its authorisation, read and agreed now, as with an
// invite (business-invites.tsx; the server refuses a request without them).
export function JoinRequestForm({ business, busy, onCancel, onSend }: Props) {
  const [hours, setHours] = useState<WorkHours>(inMyZone(defaultHours()));
  const [agreed, setAgreed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const ready = agreed && (!business.needs_check || authorized);

  return (
    <View style={{ gap: 10 }}>
      <ThemedText style={u.label}>Hours you’d want with {business.name}</ThemedText>
      <WorkHoursEditor value={hours} onChange={setHours} />
      {business.needs_check && (
        <ThemedText style={u.body}>Dodorez runs a background check if they accept you — at no cost to you.</ThemedText>
      )}
      <Consent icon={<MapPin size={16} color={C.warn} />} title="Your location" text={business.notice}
        checked={agreed} onToggle={() => setAgreed((a) => !a)} label="I've read this and agree" />
      {business.needs_check && business.check_disclosure && (
        <Consent icon={<ShieldCheck size={16} color={C.warn} />} title="Background check" text={business.check_disclosure}
          checked={authorized} onToggle={() => setAuthorized((a) => !a)} label="I authorise Dodorez to get this background check" />
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button label="Send request" busy={busy} disabled={!ready} onPress={() => onSend(hours, agreed, authorized)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
