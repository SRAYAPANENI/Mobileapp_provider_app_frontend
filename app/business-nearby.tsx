import { Badge, Button, C, Monogram, Section, u } from '@/components/business/ui';
import { RecordLine, TradeChips, TrustBadges, milesAway } from '@/components/business/business-record';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { NearbyBusiness, SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Building2, ChevronLeft, ChevronRight, MapPinOff, Radar } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

// Businesses near you (docs/BUSINESS_DISCOVERY_DESIGN.md): the other
// direction from an owner's invite. Every approved business within range
// shows up, not only ones hiring — "Actively looking" is a badge an owner
// set themselves, never a filter on who can be asked. Each shows its record
// (jobs done, rating, team size, kinds of work, insurance); tapping one opens
// its page (app/business-profile.tsx), where you ask to join.
// Said in miles (US launch); the server takes kilometres.
const WIDE_RADIUS_MI = 30;
const WIDE_RADIUS_KM = WIDE_RADIUS_MI * 1.609344;

const openBusiness = (b: NearbyBusiness) => router.push({ pathname: '/business-profile', params: { id: b.id } } as any);

export default function BusinessNearbyScreen() {
  const bottomInset = useBottomInset();
  const [list, setList] = useState<NearbyBusiness[] | null>(null);
  const [radius, setRadius] = useState<number | undefined>(undefined);
  const [noLocation, setNoLocation] = useState(false);

  const load = useCallback((withRadius?: number) => {
    return SkoFyApi.business.nearby(withRadius)
      .then((rows) => { setList(rows); setNoLocation(false); })
      .catch((err: any) => {
        setList([]);
        setNoLocation(/location/i.test(err?.message ?? ''));
      });
  }, []);
  // Each time it's shown: back from a business's page after asking, its card says so.
  useFocusEffect(useCallback(() => { load(radius); }, [load, radius]));
  const refreshControl = usePullRefresh(() => load(radius));

  const searchWider = () => setRadius(WIDE_RADIUS_KM);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Businesses near you</ThemedText>
          <ThemedText style={u.muted}>See their record, then ask to join — they decide</ThemedText>
        </View>
      </View>

      {list === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(b) => b.id}
          contentContainerStyle={padBottom([s.body, { paddingBottom: 40 }], bottomInset)}
          refreshControl={refreshControl}
          ListEmptyComponent={
            <Section>
              <View style={s.empty}>
                {noLocation ? <MapPinOff size={28} color={C.faint} /> : <Building2 size={28} color={C.faint} />}
                <ThemedText style={[u.body, { textAlign: 'center' }]}>
                  {noLocation
                    ? 'Turn on location so we can find businesses near you.'
                    : radius === WIDE_RADIUS_KM
                    ? 'No approved businesses yet, even further out.'
                    : 'No approved businesses within your usual radius yet.'}
                </ThemedText>
                {!noLocation && radius !== WIDE_RADIUS_KM && (
                  <Button small kind="secondary" label={`Search within ${WIDE_RADIUS_MI} mi`} onPress={searchWider} />
                )}
              </View>
            </Section>
          }
          renderItem={({ item }) => <BusinessCard business={item} />}
        />
      )}
    </ThemedView>
  );
}

function BusinessCard({ business }: { business: NearbyBusiness }) {
  const away = milesAway(business.distance_km);
  return (
    <TouchableOpacity style={[u.card, s.card]} activeOpacity={0.85} onPress={() => openBusiness(business)}
      accessibilityRole="button" accessibilityLabel={`${business.name}. Open its page`}>
      <View style={s.head}>
        {business.logo_url
          ? <Image source={{ uri: business.logo_url }} style={s.logo} contentFit="cover" />
          : <Monogram name={business.name} size={44} />}
        <View style={{ flex: 1, gap: 3 }}>
          <ThemedText style={s.name} numberOfLines={1}>{business.name}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {!!away && <ThemedText style={u.muted}>{away}</ThemedText>}
            {business.open_to_join_requests && <Badge icon={<Radar size={11} color={C.brandInk} />} label="Actively looking" tone="brand" />}
          </View>
        </View>
        <ChevronRight size={18} color={C.faint} />
      </View>

      <RecordLine business={business} />
      <TradeChips trades={business.trades} />
      <TrustBadges business={business} />

      {business.my_status === 'ACTIVE' ? (
        <Badge label="You're on their team" tone="ok" />
      ) : business.my_status === 'INVITED' ? (
        <ThemedText style={u.muted}>
          {business.my_requested_by === 'MEMBER' ? 'Your request is waiting for an answer' : 'They invited you — open Business to answer'}
        </ThemedText>
      ) : (
        <Button kind="secondary" label="View business" onPress={() => openBusiness(business)} />
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 20, lineHeight: 27, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 12 },
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F1F5F9' },
  name: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 12 },
});
