import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { FeePreview, SkoFyApi } from '@/services/api';
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * What a provider takes home from a price, worked out by the server the same
 * way as at payout (Fair Cap). It leads with the usual figure — a price set now
 * is mostly paid out later, often in another month — and adds this month's
 * when it's better (past the month's cap, or on a fixed plan). Shown under
 * the price being typed; waits for typing to pause.
 */
export function YouKeep({ amount }: { amount: string }) {
  const [shown, setShown] = useState<FeePreview | null>(null);
  useEffect(() => {
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) {
      setShown(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      SkoFyApi.provider.previewFee(value)
        .then((p) => { if (live) setShown(p); })
        .catch(() => { if (live) setShown(null); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [amount]);
  if (!shown) return null;
  // An older server sends only this month's figure.
  const usualFee = shown.standard_fee ?? shown.fee;
  const usualKeep = shown.standard_keep ?? shown.you_keep;
  return (
    <ThemedText style={st.line}>
      You keep {usd(usualKeep)} of {usd(shown.amount)} · Dodorez fee {usd(usualFee)}
      {shown.fee < usualFee ? ` · ${usd(shown.you_keep)} if paid out this month` : ''}
    </ThemedText>
  );
}

const st = StyleSheet.create({
  line: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppinsMedium, color: '#047857', marginTop: 2 },
});
