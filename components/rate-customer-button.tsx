import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

/** "Rate customer" on a finished job the provider hasn't rated yet — the
 * Jobs tab's history and the profile's Job History both show it. */
export function RateCustomerButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} activeOpacity={0.85}>
      <Star size={14} color="#111827" fill="#111827" />
      <Text style={s.text}>Rate customer</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: '#FFCE48',
  },
  text: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
});
