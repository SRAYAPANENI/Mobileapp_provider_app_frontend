import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { IF_UNAVAILABLE_LABELS, PickupDetails, ShoppingItem } from '@/services/pickupDelivery';
import { CheckSquare, Phone, Square, Store } from 'lucide-react-native';
import React, { useState } from 'react';
import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  details: PickupDetails | null | undefined;
  items: ShoppingItem[] | null | undefined;
  buyForMe: boolean;
  /** Buy it for me: has the customer put the shopping money on hold? */
  moneyHeld: boolean;
}

const DETAIL_LABELS: [keyof PickupDetails, string][] = [
  ['order_name', 'Name on the order'],
  ['order_number', 'Order number'],
  ['pickup_code', 'Store pickup code'],
];

// What to collect at the store: the order details the customer gave
// (already paid), or their shopping list with a tick-off checklist.
export function PickupAtStore({ details, items, buyForMe, moneyHeld }: Props) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const list = items ?? [];
  const rows = DETAIL_LABELS.filter(([k]) => details?.[k]);
  if (!buyForMe && rows.length === 0 && !details?.store_contact) return null;

  const toggle = (i: number) => setTicked(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Store size={16} color="#111827" />
        <Text style={s.title}>At the store</Text>
      </View>

      {rows.map(([k, label]) => (
        <View key={k} style={s.detailRow}>
          <Text style={s.detailLabel}>{label}</Text>
          <Text style={[s.detailValue, k === 'pickup_code' && s.code]} selectable>{details![k]}</Text>
        </View>
      ))}
      {!!details?.store_contact && (
        <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${details.store_contact}`)}>
          <Phone size={14} color="#2563EB" />
          <Text style={s.callText}>Call the store · {details.store_contact}</Text>
        </TouchableOpacity>
      )}

      {buyForMe && (
        <>
          {!moneyHeld && (
            <Text style={s.wait}>
              Wait for the customer to hold the shopping money before you buy anything — you'll see it here.
            </Text>
          )}
          {moneyHeld && <Text style={s.held}>Shopping money held ✓ Keep your receipt.</Text>}
          {list.map((item, i) => (
            <TouchableOpacity key={i} style={s.item} onPress={() => toggle(i)}>
              {ticked.has(i) ? <CheckSquare size={18} color="#10B981" /> : <Square size={18} color="#9CA3AF" />}
              <View style={{ flex: 1 }}>
                <Text style={[s.itemName, ticked.has(i) && s.itemDone]}>
                  {item.quantity > 1 ? `${item.quantity} × ` : ''}{item.name}
                </Text>
                <Text style={s.itemHint}>If it's out: {IF_UNAVAILABLE_LABELS[item.if_unavailable] ?? IF_UNAVAILABLE_LABELS.CALL}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  detailLabel: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  detailValue: { flexShrink: 1, textAlign: 'right', fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  code: { fontSize: 16, lineHeight: 22, letterSpacing: 2 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  callText: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  wait: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 8 },
  held: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#047857' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  itemName: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  itemDone: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  itemHint: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
});
