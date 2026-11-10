import { useAppAlert } from '@/components/app-alert';
import { Badge, Button, C, Monogram, Section, u } from '@/components/business/ui';
import { defaultHours, inMyZone, WorkHoursEditor } from '@/components/business/work-hours';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { NearbyBusiness, SkoFyApi, WorkHours } from '@/services/api';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Building2, ChevronLeft, MapPinOff, Radar, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

// Businesses near you (docs/BUSINESS_DISCOVERY_DESIGN.md): the other
// direction from an owner's invite. Every approved business within range
// shows up, not only ones hiring — "Actively looking" is a badge an owner
// set themselves, never a filter on who can be asked. Reached from the
// Home banner and the Business screen, for someone with no business tie.
const WIDE_RADIUS_KM = 50;

export default function BusinessNearbyScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [list, setList] = useState<NearbyBusiness[] | null>(null);
  const [radius, setRadius] = useState<number | undefined>(undefined);
  const [noLocation, setNoLocation] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);

  const load = useCallback((withRadius?: number) => {
    return SkoFyApi.business.nearby(withRadius)
      .then((rows) => { setList(rows); setNoLocation(false); })
      .catch((err: any) => {
        setList([]);
        setNoLocation(/location/i.test(err?.message ?? ''));
      });
  }, []);
  useEffect(() => { load(radius); }, [load, radius]);
  const refreshControl = usePullRefresh(() => load(radius));

  const searchWider = () => setRadius(WIDE_RADIUS_KM);

  const requestToJoin = async (business: NearbyBusiness, hours: WorkHours | undefined) => {
    setRequesting(business.id);
    try {
      const { message } = await SkoFyApi.business.requestToJoin(business.id, hours);
      appAlert.show('success', 'Request sent', message);
      load(radius);
    } catch (err: any) {
      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
    } finally {
      setRequesting(null);
    }
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Businesses near you</ThemedText>
          <ThemedText style={u.muted}>Ask to join — they decide, same as any invite</ThemedText>
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
                    ? "No approved businesses yet, even further out."
                    : 'No approved businesses within your usual radius yet.'}
                </ThemedText>
                {!noLocation && radius !== WIDE_RADIUS_KM && (
                  <Button small kind="secondary" label={`Search within ${WIDE_RADIUS_KM} km`} onPress={searchWider} />
                )}
              </View>
            </Section>
          }
          renderItem={({ item }) => (
            <BusinessCard business={item} busy={requesting === item.id} onRequest={(hours) => requestToJoin(item, hours)} />
          )}
        />
      )}
      {appAlert.element}
    </ThemedView>
  );
}

function BusinessCard({ business, busy, onRequest }: {
  business: NearbyBusiness; busy: boolean; onRequest: (hours: WorkHours | undefined) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [hours, setHours] = useState<WorkHours>(inMyZone(defaultHours()));

  return (
    <View style={[u.card, s.card]}>
      <View style={s.head}>
        {business.logo_url
          ? <Image source={{ uri: business.logo_url }} style={s.logo} contentFit="cover" />
          : <Monogram name={business.name} size={44} />}
        <View style={{ flex: 1, gap: 3 }}>
          <ThemedText style={s.name} numberOfLines={1}>{business.name}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <ThemedText style={u.muted}>{business.distance_km} km away</ThemedText>
            <Badge icon={<Users size={11} color={C.muted} />} label={`${business.team_size} on the team`} />
            {business.open_to_join_requests && <Badge icon={<Radar size={11} color={C.brandInk} />} label="Actively looking" tone="brand" />}
          </View>
        </View>
      </View>

      {business.my_status === 'ACTIVE' ? (
        <Badge label="You're on their team" tone="ok" />
      ) : business.my_status === 'INVITED' ? (
        <ThemedText style={u.muted}>
          {business.my_requested_by === 'MEMBER' ? 'Your request is waiting for an answer' : 'They invited you'} — open Business to see it.
        </ThemedText>
      ) : asking ? (
        <View style={{ gap: 10 }}>
          <ThemedText style={u.label}>Hours you'd want with them</ThemedText>
          <WorkHoursEditor value={hours} onChange={setHours} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="secondary" label="Cancel" onPress={() => setAsking(false)} disabled={busy} style={{ flex: 1 }} />
            <Button label="Send request" busy={busy} onPress={() => onRequest(hours)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button kind="secondary" label="Request to join" onPress={() => setAsking(true)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 20, lineHeight: 27, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 12 },
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F1F5F9' },
  name: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 12 },
});
