import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { MyBusinessState } from '@/hooks/use-my-business';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { EmployerBenefitsLine } from './employer-benefits';
import { Badge, C, Monogram, Tone, u } from './ui';

// A slim business line on the home screen (docs/BUSINESS_PROVIDERS_DESIGN.md)
// for an invite, a business still being set up, or a worker on a team. An
// owner or dispatcher of an approved business gets the Myself | Team switch
// instead (WorkspaceSwitch). Someone working alone is told, once, what working
// with an employer offers (EmployerBenefitsLine, dismissible).
export function BusinessHomeCard({ state }: { state: MyBusinessState }) {
  const { data, invites, canDispatch } = state;
  if (!data?.enabled || canDispatch) return null;
  const business = data.business;

  if (!business) {
    if (invites.length === 0) return <EmployerBenefitsLine />;
    return (
      <Line name={invites[0].business_name} title={invites[0].business_name} badge={{ label: 'Invite', tone: 'brand' }}
        detail={invites.length > 1 ? `Invited you to their team · ${invites.length - 1} more` : 'Invited you to their team — tap to answer'} />
    );
  }

  if (business.status !== 'APPROVED') {
    if (data.role !== 'OWNER') return null;
    const inReview = business.status === 'PENDING_REVIEW';
    const toDo = business.missing.filter((m) => !m.startsWith('Approval')).length;
    return (
      <Line name={business.name} title={business.name}
        badge={inReview ? { label: 'In review', tone: 'info' } : business.status === 'REJECTED' ? { label: 'Needs changes', tone: 'bad' } : { label: 'Setting up', tone: 'neutral' }}
        detail={inReview ? 'Usually within 2 business days'
          : toDo ? `${toDo} ${toDo === 1 ? 'step' : 'steps'} left before your team can take jobs` : 'Ready to send for review'} />
    );
  }

  return (
    <Line name={business.name} title={business.name} badge={{ label: data.role === 'DISPATCHER' ? 'Dispatcher' : 'Worker', tone: 'brand' }}
      detail={data.hours?.offer?.from === 'BUSINESS' ? 'New hours offered — tap to answer'
        : data.hours?.for_business_now ? `Working for them now · ${data.hours.agreed_label}`
        : `Working for yourself now · with them ${data.hours?.agreed_label ?? ''}`} />
  );
}

function Line({ name, title, badge, detail }: { name: string; title: string; badge: { label: string; tone: Tone }; detail: string }) {
  return (
    <TouchableOpacity style={s.line} activeOpacity={0.8} onPress={() => router.push('/business' as any)}>
      <Monogram name={name} size={34} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ThemedText style={s.title} numberOfLines={1}>{title}</ThemedText>
          <Badge {...badge} />
        </View>
        <ThemedText style={u.muted} numberOfLines={1}>{detail}</ThemedText>
      </View>
      <ChevronRight size={18} color={C.faint} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  title: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: C.ink },
});
