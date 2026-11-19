import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Camera, CheckCircle } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { showDialog } from '@/components/alert-host';
import { ArrivalPanel } from '@/components/arrival-panel';
import { PickupAtStore } from '@/components/pickup-at-store';
import { PickupFromPerson } from '@/components/pickup-from-person';
import { ThemedText } from '@/components/themed-text';
import { VehicleIcon } from '@/components/vehicles/vehicle-icon';
import { useGoodsHoldHeld } from '@/hooks/use-goods-hold';
import type { RoomJob } from '@/hooks/use-service-room-job';
import { SkoFyApi } from '@/services/api';
import { currentPosition } from '@/services/live-position';
import { shrinkPhoto } from '@/services/photo';
import { goodsAmountError, isBuyForMe, parseGoodsAmount } from '@/services/pickupDelivery';
import { roomStyles as s } from './styles';

// Pickup & Delivery, before it's collected. The customer isn't at the pickup
// (a store, or someone handing it over), so instead of their code a photo of
// what was collected, taken there, confirms it. From a person, the item is
// checked first; buying for the customer, the receipt total is entered too.

export function PickupStep({ job, detail, onArrived, onCollected, onRefused, onCustomerAbsent }: {
  job: RoomJob;
  detail: any;
  onArrived: () => void;
  /** Collected: the job as the server has it now (it moves on to the trip). */
  onCollected: (detail: any) => void;
  onRefused: () => void;
  onCustomerAbsent: (message?: string) => void;
}) {
  const buying = isBuyForMe(detail);
  const fromPerson = detail?.pickup_source === 'PERSON';
  // A business's job: who paid the store is who's paid back.
  const businessShop = buying && !!job.businessName;
  // A trip priced up front, not booked and paid yet: nothing's collected until it is.
  const tripUnpaid = detail?.shape?.pricing_unit === 'TRIP' && !['HELD', 'PAID'].includes(detail?.payment_status);
  const goodsHeld = useGoodsHoldHeld(job.id, buying && job.status === 'ACCEPTED' && !detail?.pickup_confirmed_at);

  const [photo, setPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [goodsText, setGoodsText] = useState('');
  const [paidWith, setPaidWith] = useState<'OWN' | 'COMPANY' | null>(null);
  const [checked, setChecked] = useState(false);
  // Which wording of the person checks was shown (kept word for word with the job).
  const [checksVersion, setChecksVersion] = useState<string | undefined>(undefined);
  // Bumped when the server says that wording changed: the card remounts unticked.
  const [checksRound, setChecksRound] = useState(0);
  // Another job starts clean.
  useEffect(() => { setChecked(false); setPhoto(null); setGoodsText(''); setPaidWith(null); }, [job.id]);

  const goodsError = buying ? goodsAmountError(goodsText, detail?.purchase_limit) : null;
  const blocked = tripUnpaid || !photo || confirming || (buying && (!goodsHeld || !!goodsError)) || (fromPerson && !checked);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showDialog('Camera Permission Required', 'Please allow camera access in your device settings to confirm pickup.', undefined, { type: 'warning' });
      return;
    }
    // Full quality from the camera; shrunk once, here (services/photo.ts).
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) {
      setPreparing(true);
      try {
        setPhoto(await shrinkPhoto(result.assets[0]));
      } finally {
        setPreparing(false);
      }
    }
  };

  const confirm = async () => {
    if (!photo) return;
    if (buying && (goodsError || !goodsHeld)) {
      showDialog('Not Yet', goodsError ?? "The customer hasn't put the shopping money on hold yet.", undefined, { type: 'warning' });
      return;
    }
    if (fromPerson && !checked) {
      showDialog('Check the Item First', 'Tick the three checks — or tap "Can\'t take it".', undefined, { type: 'warning' });
      return;
    }
    if (businessShop && !paidWith) {
      showDialog('How Did You Pay?', "Choose your own money or the business's card — it's paid back to whoever paid.", undefined, { type: 'warning' });
      return;
    }
    const coords = await currentPosition();
    if (!coords) {
      showDialog('Location Required', 'Turn on location to confirm pickup.', undefined, { type: 'error' });
      return;
    }
    const collected = (next: any) => {
      setPhoto(null); setGoodsText(''); setPaidWith(null); setChecked(false);
      onCollected(next);
    };
    setConfirming(true);
    try {
      await SkoFyApi.jobs.confirmPickup(
        job.id, photo.uri, photo.mimeType, coords.latitude, coords.longitude,
        buying ? parseGoodsAmount(goodsText) : undefined,
        fromPerson && checked,
        fromPerson ? checksVersion : undefined,
        businessShop ? paidWith ?? undefined : undefined,
      );
    } catch (err: any) {
      // A photo upload on a weak signal can time out after the server saved
      // it (or a retry meets "already confirmed"): the server says whether
      // it's collected — never "Could not confirm" for a pickup that was.
      // Not asked when the refusal is final (too far, new wording).
      const final = err?.error_code === 'NOT_AT_LOCATION' || err?.error_code === 'DECLARATION_CHANGED';
      const now = final ? null : await SkoFyApi.jobs.get(job.id).catch(() => null);
      if (now?.pickup_confirmed_at) {
        collected(now);
      } else if (err?.error_code === 'NOT_AT_LOCATION') {
        showDialog('Too Far From Pickup Location', err.message ?? 'You need to be at the pickup location.', undefined, { type: 'warning' });
      } else if (err?.error_code === 'DECLARATION_CHANGED') {
        setChecked(false);
        setChecksRound((n) => n + 1);
        showDialog('Check the Item Again', err.message ?? 'The checks have been updated — tick them again.', undefined, { type: 'warning' });
      } else {
        showDialog('Could Not Confirm Pickup', err?.message ?? 'Please try again.', undefined, { type: 'error' });
      }
      setConfirming(false);
      return;
    }
    // Confirmed. Reading it back can fail on a weak signal — no failure of the
    // pickup: the photo is cleared (so it can't be sent twice) and the room's
    // own watch brings the next step.
    const next = await SkoFyApi.jobs.get(job.id).catch(() => null);
    if (next) collected(next);
    else setPhoto(null);
    setConfirming(false);
  };

  return (
    <View>
      {/* A car-trunk or van load: the vehicle the customer was told is coming. */}
      {detail?.vehicle && !detail?.arrived_at && (
        <View style={s.vehicleNote}>
          <VehicleIcon type={detail.vehicle.vehicle_type} size={16} color="#1D4ED8" />
          <ThemedText style={s.vehicleNoteText}>
            Come in your {detail.vehicle.description}
            {detail.vehicle.plate ? ` (${detail.vehicle.plate})` : ''} — the customer was told it’s the one coming.
          </ThemedText>
        </View>
      )}
      {/* "I'm here" tells the customer, and starts the waiting clock when waiting was agreed. */}
      <ArrivalPanel
        jobId={job.id}
        arrivedAt={detail?.arrived_at}
        customerExpected={false}
        wait={detail?.trip_wait}
        getCoords={currentPosition}
        onArrived={onArrived}
        onCustomerAbsent={onCustomerAbsent}
        onError={(title, message) => showDialog(title, message, undefined, { type: 'error' })}
      />
      {fromPerson ? (
        <PickupFromPerson
          key={`${job.id}-${checksRound}`}
          jobId={job.id}
          item={detail?.pickup_item}
          value={detail?.item_value}
          details={detail?.pickup_details}
          onCheckedChange={(isChecked, version) => { setChecked(isChecked); setChecksVersion(version); }}
          getCoords={currentPosition}
          onRefused={onRefused}
          onError={(title, message) => showDialog(title, message, undefined, { type: 'error' })}
        />
      ) : (
        <PickupAtStore details={detail?.pickup_details} items={detail?.shopping_list} buyForMe={buying} moneyHeld={goodsHeld} />
      )}
      <ThemedText style={s.note}>
        {buying
          ? 'Once you have the items, enter the receipt total and take a photo of the items with the receipt.'
          : fromPerson
            ? "Once you've checked it, take a photo of the item to confirm pickup."
            : "Once you've got everything, take a photo of the order to confirm pickup."}
      </ThemedText>
      {buying && (
        <>
          <TextInput
            style={[s.input, s.inputBig]}
            placeholder={`Paid at the store ($, up to ${Number(detail?.purchase_limit ?? 0).toFixed(2)})`}
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            value={goodsText}
            onChangeText={setGoodsText}
            editable={goodsHeld}
          />
          {!!goodsText && !!goodsError && <ThemedText style={[s.note, s.noteWarn]}>{goodsError}</ThemedText>}
          {businessShop && (
            <View style={s.paidWithRow}>
              {([['OWN', 'My own money'], ['COMPANY', "The business's card"]] as const).map(([key, label]) => (
                <TouchableOpacity key={key} style={[s.paidWithChip, paidWith === key && s.paidWithChipOn]} onPress={() => setPaidWith(key)}>
                  <ThemedText style={[s.paidWithText, paidWith === key && s.paidWithTextOn]}>{label}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {businessShop && paidWith && (
            <ThemedText style={s.note}>
              {paidWith === 'OWN'
                ? 'Paid back to you, with the shopping fee, when the delivery is done.'
                : `Paid back to ${job.businessName}, with the shopping fee.`}
            </ThemedText>
          )}
        </>
      )}
      {photo && <Image source={{ uri: photo.uri }} style={s.photoPreview} contentFit="cover" />}
      <TouchableOpacity style={[s.photoBtn, preparing && { opacity: 0.6 }]} onPress={takePhoto} disabled={preparing || confirming}>
        {preparing ? <ActivityIndicator size="small" color="#111827" /> : <Camera size={18} color="#111827" />}
        <ThemedText style={s.photoBtnText}>{preparing ? 'Preparing photo…' : photo ? 'Retake Photo' : 'Take Photo'}</ThemedText>
      </TouchableOpacity>
      {tripUnpaid && (
        <ThemedText style={[s.note, s.noteWarn]}>Waiting for the customer to book and pay your fare — collect it once they have.</ThemedText>
      )}
      <TouchableOpacity style={[s.primaryBtn, blocked && { opacity: 0.5 }]} onPress={confirm} disabled={blocked}>
        <CheckCircle size={20} color="#fff" />
        <ThemedText style={s.primaryBtnText}>{confirming ? 'Confirming…' : 'Confirm Pickup'}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}
