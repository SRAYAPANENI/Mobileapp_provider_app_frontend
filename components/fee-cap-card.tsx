import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type Fees = Awaited<ReturnType<typeof SkoFyApi.provider.getFees>>;

// This month's Dodorez fees against the monthly cap — after it, just 2% until
// the month ends (Fair Cap, docs/MONEY_RULES_DESIGN.md §1).
export function FeeCapCard() {
  const [fees, setFees] = useState<Fees | null>(null);

  useEffect(() => {
    SkoFyApi.provider.getFees().then(setFees).catch(() => {});
  }, []);

  if (!fees) return null;
  const { rules } = fees;
  const share = Math.min(1, fees.fees_paid / fees.monthly_cap);

  return (
    <View style={s.card}>
      <Text style={s.label}>Dodorez fees this month</Text>
      {fees.fixed_plan ? (
        <Text style={s.value}>0% — you're on the fixed plan until {fees.fixed_plan.to_month}</Text>
      ) : (
        <>
          <Text style={s.value}>${fees.fees_paid.toFixed(2)} of ${fees.monthly_cap.toFixed(0)}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${share * 100}%` }]} /></View>
          <Text style={s.note}>
            {fees.remaining_before_free > 0
              ? `$${fees.remaining_before_free.toFixed(2)} more and every job is just ${rules.after_cap_percent}% until the month ends.`
              : `You hit the cap — every job is just ${rules.after_cap_percent}% until the month ends.`}
          </Text>
        </>
      )}
      <Text style={s.rules}>
        {rules.first_rate_percent}% of the first ${rules.band.toFixed(0)} of a job, {rules.above_rate_percent}% above that ·
        never more than ${rules.job_cap.toFixed(0)} a job; after ${rules.monthly_cap.toFixed(0)} in a month, just {rules.after_cap_percent}% · no lead fees.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', gap: 6 },
  label: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#065F46' },
  value: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#064E3B' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#D1FAE5', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#059669' },
  note: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#065F46' },
  rules: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#047857' },
});
