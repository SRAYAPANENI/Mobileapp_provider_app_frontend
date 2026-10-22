import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { QuotePreview, SkoFyApi } from '@/services/api';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

const DEPOSIT_CHOICES = [0, 25, 30, 50];

interface Props {
  jobId: string;
  amount: number;
  /** What the parts listed on the quote cost. */
  partsTotal: number;
  depositPercent: number;
  onDepositChange: (percent: number) => void;
}

// A quote before it's sent (docs/MONEY_RULES_DESIGN.md §1–2): the customer's
// visiting fee counts toward it, "You'll keep $X" after Fair Cap's fee on the
// whole job, and how much may be paid when work starts — up to half on a big
// quote, or what the listed parts cost on a smaller one.
export function KeepPreview({ jobId, amount, partsTotal, depositPercent, onDepositChange }: Props) {
  const [preview, setPreview] = useState<QuotePreview | null>(null);

  useEffect(() => {
    if (!(amount > 0)) { setPreview(null); return; }
    let live = true;
    const t = setTimeout(() => {
      SkoFyApi.provider.quotePreview(jobId, amount, partsTotal)
        .then((r) => { if (live) setPreview(r); })
        .catch(() => { if (live) setPreview(null); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [amount, partsTotal, jobId]);

  const maxDeposit = preview?.max_deposit_percent ?? 0;
  useEffect(() => {
    if (preview && depositPercent > maxDeposit) onDepositChange(0);
  }, [preview, maxDeposit, depositPercent, onDepositChange]);

  if (!(amount > 0) || !preview) return null;
  const choices = maxDeposit > 0
    ? [...new Set([...DEPOSIT_CHOICES.filter((pct) => pct <= maxDeposit), maxDeposit])].sort((a, b) => a - b)
    : [];
  return (
    <View style={s.card}>
      <Text style={s.keep}>
        You'll keep ${preview.you_keep.toFixed(2)}
        <Text style={s.fee}>  ·  Dodorez fee ${preview.fee.toFixed(2)}</Text>
      </Text>
      {preview.visit_credit > 0 && (
        <Text style={s.note}>
          The ${preview.visit_credit.toFixed(2)} visiting fee they paid counts toward this — they pay
          ${preview.customer_pays.toFixed(2)} more.
        </Text>
      )}
      {choices.length > 0 && (
        <>
          <Text style={s.label}>
            {amount >= 1000 ? 'Paid when work starts, for materials' : 'Paid when work starts, for the parts listed'}
          </Text>
          <View style={s.row}>
            {choices.map((pct) => (
              <TouchableOpacity key={pct} style={[s.chip, depositPercent === pct && s.chipOn]} onPress={() => onDepositChange(pct)}>
                <Text style={[s.chipText, depositPercent === pct && s.chipTextOn]}>{pct === 0 ? 'None' : `${pct}%`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', gap: 6 },
  keep: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#065F46' },
  fee: { fontSize: 12, fontFamily: Fonts.poppins, color: '#047857' },
  note: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#065F46' },
  label: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  row: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: '#111827', backgroundColor: '#FEF3C7' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280' },
  chipTextOn: { color: '#111827' },
});
