import { Fonts } from '@/constants/theme';
import { Box, HeartPulse, Phone, PawPrint, Utensils } from 'lucide-react-native';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PET_KIND: Record<string, string> = {
  DOG: 'Dog', CAT: 'Cat', BIRD: 'Bird', SMALL_PET: 'Small pet', REPTILE: 'Reptile', FISH: 'Fish', OTHER: 'Animal',
};
const DOG_SIZE: Record<string, string> = {
  SMALL: 'small (under 22 lb)', MEDIUM: 'medium (22–55 lb)', LARGE: 'large (55–100 lb)', GIANT: 'giant (over 100 lb)',
};
const ITEM_SIZE: Record<string, string> = {
  SMALL: 'small — fits a bag', MEDIUM: 'medium — a box', LARGE: 'large — a car trunk', BULKY: 'bulky — needs a van',
};
const ANSWER: Record<string, string> = { YES: 'Yes', NO: 'No', UNSURE: 'Not sure' };

interface Props {
  custody?: string | null;
  /** The job's care sheet (app/domain/care_sheet.py) — without the vet and
   * emergency contact until you're hired. */
  sheet?: Record<string, any> | null;
  /** Free-form facts the AI assistant collected, when there's no sheet. */
  details?: Record<string, string> | null;
}

function Line({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Text style={s.line}><Text style={s.lineLabel}>{label}: </Text>{value}</Text>
  );
}

function Call({ label, contact }: { label: string; contact?: { name?: string; phone?: string } }) {
  if (!contact?.phone && !contact?.name) return null;
  return (
    <View style={s.callRow}>
      <Text style={[s.line, { flex: 1 }]}><Text style={s.lineLabel}>{label}: </Text>{contact.name ?? ''}{contact.name && contact.phone ? ' · ' : ''}{contact.phone ?? ''}</Text>
      {!!contact.phone && (
        <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL(`tel:${contact.phone!.replace(/[^0-9+]/g, '')}`)}>
          <Phone size={14} color="#111827" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// What the customer told you about what they're leaving with you: each pet's
// needs (food, medicines, walks, how they are with others) or the item.
export function CareSheetCard({ custody, sheet, details }: Props) {
  const hasSheet = !!sheet && Object.keys(sheet).length > 0;
  const extra = details && Object.keys(details).length > 0 ? details : null;
  if (!hasSheet && !extra) return null;

  if (hasSheet && custody === 'LIVING_BEING') {
    const pets: any[] = sheet!.pets ?? [];
    const food = sheet!.food ?? {};
    return (
      <View style={s.card}>
        <View style={s.head}><PawPrint size={18} color="#111827" /><Text style={s.title}>{pets.length > 1 ? `${pets.length} pets` : 'The pet'}</Text></View>
        {pets.map((p, i) => (
          <View key={i} style={s.block}>
            <Text style={s.name}>
              {p.name} · {PET_KIND[p.kind] ?? p.kind}{p.breed ? `, ${p.breed}` : ''}
            </Text>
            <Line label="Size" value={p.size ? DOG_SIZE[p.size] : null} />
            <Line label="Age" value={p.age} />
            <Line label="Vaccinations up to date" value={ANSWER[p.vaccinated]} />
            <Line label="Spayed or neutered" value={ANSWER[p.spayed_neutered]} />
            <Line label="Good with dogs" value={ANSWER[p.good_with_dogs]} />
            <Line label="Good with cats" value={ANSWER[p.good_with_cats]} />
            <Line label="Good with children" value={ANSWER[p.good_with_kids]} />
            <Line label="Notes" value={p.notes} />
          </View>
        ))}
        <View style={s.block}>
          <View style={s.head}><Utensils size={15} color="#111827" /><Text style={s.sub}>Food</Text></View>
          <Text style={s.line}>{food.by === 'HOST' ? 'You provide the food.' : 'The owner brings the food.'}</Text>
          <Line label="What" value={food.what} />
          <Line label="When" value={food.schedule} />
        </View>
        {(sheet!.medication || sheet!.walks || sheet!.notes) && (
          <View style={s.block}>
            <View style={s.head}><HeartPulse size={15} color="#111827" /><Text style={s.sub}>Care</Text></View>
            <Line label="Medicines" value={sheet!.medication} />
            <Line label="Walks" value={sheet!.walks} />
            <Line label="Notes" value={sheet!.notes} />
          </View>
        )}
        {sheet!.vet || sheet!.emergency ? (
          <View style={s.block}>
            <Call label="Vet" contact={sheet!.vet} />
            <Call label="If the owner can't be reached" contact={sheet!.emergency} />
          </View>
        ) : (
          <Text style={s.hint}>The vet and an emergency contact, if given, show once you're booked.</Text>
        )}
      </View>
    );
  }

  if (hasSheet && custody === 'ITEM') {
    return (
      <View style={s.card}>
        <View style={s.head}><Box size={18} color="#111827" /><Text style={s.title}>What's left with you</Text></View>
        <Text style={s.name}>{sheet!.count > 1 ? `${sheet!.count} × ` : ''}{sheet!.what}</Text>
        <Line label="Size" value={ITEM_SIZE[sheet!.size]} />
        <Line label="Worth" value={sheet!.value != null ? `$${Number(sheet!.value).toFixed(0)}` : null} />
        {sheet!.fragile && <Text style={[s.line, { fontFamily: Fonts.poppinsBold }]}>Fragile — handle with care.</Text>}
        <Line label="Notes" value={sheet!.notes} />
      </View>
    );
  }

  // No sheet: what the assistant noted, as the customer said it.
  return (
    <View style={s.card}>
      <Text style={s.title}>From the customer</Text>
      {Object.entries(extra ?? {}).map(([k, v]) => <Line key={k} label={k.replace(/_/g, ' ')} value={v} />)}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, padding: 16, borderRadius: 16, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  sub: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  block: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  line: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#374151' },
  lineLabel: { fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#6B7280' },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFCE48' },
});
