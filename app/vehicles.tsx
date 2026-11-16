import { useAppAlert } from '@/components/app-alert';
import { Badge, Button, C, Row, Section, Tone, u } from '@/components/business/ui';
import { NoInternetState } from '@/components/no-internet-state';
import { useOfflinePage } from '@/components/offline-gate';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VehicleCard } from '@/components/vehicles/vehicle-card';
import { VehicleDocumentForm } from '@/components/vehicles/vehicle-document-form';
import { VehicleForm } from '@/components/vehicles/vehicle-form';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { Vehicle, VehicleDocumentKind, VehicleRoom } from '@/services/api';
import { useAddVehicle, useAddVehicleDocument, useMyVehicles, useRemoveVehicle } from '@/services/queries/vehicles';
import { router } from 'expo-router';
import { ChevronLeft, Plus, Truck } from 'lucide-react-native';
import { VehicleIcon } from '@/components/vehicles/vehicle-icon';
import React, { useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const ROOM_TONE: Record<VehicleRoom['LARGE']['status'], { label: string; tone: Tone }> = {
  READY: { label: 'Reaches you', tone: 'ok' },
  PENDING: { label: 'Being checked', tone: 'warn' },
  NONE: { label: 'Needs a vehicle', tone: 'neutral' },
};

// My vehicles (docs/VEHICLES_DESIGN.md): car-trunk and van-size Pickup &
// Delivery trips reach a provider only with a vehicle Dodorez has checked —
// its photos, plate and registration. Bags and boxes need none.
export default function VehiclesScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const mine = useMyVehicles();
  const add = useAddVehicle();
  const addDocument = useAddVehicleDocument();
  const remove = useRemoveVehicle();
  const [adding, setAdding] = useState(false);
  const [paper, setPaper] = useState<{ vehicle: Vehicle; kind: VehicleDocumentKind } | null>(null);
  const offline = useOfflinePage(!!mine.data, () => { void mine.refetch(); });
  const refreshControl = usePullRefresh(() => mine.refetch());
  const data = mine.data;
  const busy = add.isPending || addDocument.isPending || remove.isPending;
  const full = !!data && data.vehicles.length >= data.max_vehicles;

  const confirmRemove = (v: Vehicle) => appAlert.show('warning', 'Remove this vehicle?',
    v.status === 'APPROVED'
      ? `${v.description} stops counting for new trips. Trips already booked with it keep it.`
      : `${v.description} and its photos are deleted.`, [
      { text: 'Keep it', variant: 'secondary', cancel: true },
      {
        text: 'Remove', variant: 'destructive', onPress: () => remove.mutate(v.id, {
          onError: (err: any) => appAlert.show('error', 'Not removed', err?.message ?? 'Please try again.'),
        }),
      },
    ]);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>My vehicles</ThemedText>
      </View>

      {offline ? (
        <NoInternetState onRetry={() => { void mine.refetch(); }} />
      ) : mine.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : !data ? (
        <View style={s.body}>
          <ThemedText style={u.body}>Couldn't load your vehicles.</ThemedText>
          <Button kind="secondary" label="Try again" onPress={() => { void mine.refetch(); }} />
        </View>
      ) : (
        <KeyboardAwareScrollView refreshControl={refreshControl} bottomOffset={24}
          contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)}>
          <View style={s.intro}>
            <View style={s.introIcon}><Truck size={28} color={C.brandInk} /></View>
            <ThemedText style={[u.body, { textAlign: 'center' }]}>
              Items that fill a car trunk or need a van only go to providers whose vehicle we've checked.
              Bags and boxes need no vehicle.
            </ThemedText>
          </View>

          <Section title="What reaches you">
            {(['LARGE', 'BULKY'] as const).map((size, i) => {
              const room = data.room[size];
              const tone = ROOM_TONE[room.status];
              return (
                <Row key={size} last={i === 1} tone={tone.tone}
                  icon={<VehicleIcon type={size === 'LARGE' ? 'CAR' : 'CARGO_VAN'} size={18} color={C.body} />}
                  title={size === 'LARGE' ? 'Car-trunk loads' : 'Van-size loads'}
                  detail={room.vehicle ? `In ${room.vehicle}` : `Needs ${room.needs}`}
                  right={<Badge label={tone.label} tone={tone.tone} />} />
              );
            })}
          </Section>

          {adding ? (
            <Section title="Add a vehicle">
              <VehicleForm onCancel={() => setAdding(false)} onSubmit={async (vehicle) => {
                try {
                  await add.mutateAsync(vehicle);
                  setAdding(false);
                  appAlert.show('success', 'Sent for checking', "We'll let you know when it's approved — usually within a day.");
                } catch (err: any) {
                  appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
                }
              }} />
            </Section>
          ) : (
            <Button label={data.vehicles.length ? 'Add another vehicle' : 'Add your vehicle'} icon={<Plus size={18} color={C.ink} />}
              onPress={() => { setPaper(null); setAdding(true); }} disabled={full || busy} />
          )}
          {full && !adding && <ThemedText style={u.muted}>Up to {data.max_vehicles} vehicles — remove one to add another.</ThemedText>}

          {paper && (
            <Section title={paper.kind === 'INSURANCE' ? 'Insurance' : 'New registration'}>
              <ThemedText style={u.muted}>For {paper.vehicle.description}.</ThemedText>
              <VehicleDocumentForm key={`${paper.vehicle.id}-${paper.kind}`} kind={paper.kind} onCancel={() => setPaper(null)}
                onError={(message) => appAlert.show('warning', 'Almost there', message)}
                onSubmit={async (doc) => {
                  try {
                    await addDocument.mutateAsync({ vehicleId: paper.vehicle.id, doc });
                    setPaper(null);
                    appAlert.show('success', 'Uploaded', "We'll check it — the one on file keeps counting until it ends.");
                  } catch (err: any) {
                    appAlert.show('error', 'Not uploaded', err?.message ?? 'Please try again.');
                  }
                }} />
            </Section>
          )}

          {data.vehicles.length > 0 && (
            <View style={{ gap: 12 }}>
              <ThemedText style={u.sectionTitle}>Your vehicles</ThemedText>
              {data.vehicles.map((v) => (
                <VehicleCard key={v.id} vehicle={v} insuranceRequired={data.insurance_required} busy={busy}
                  onAddDocument={(kind) => { setAdding(false); setPaper({ vehicle: v, kind }); }}
                  onRemove={() => confirmRemove(v)} />
              ))}
            </View>
          )}
        </KeyboardAwareScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 22, lineHeight: 30, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 18 },
  intro: { alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  introIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
});
