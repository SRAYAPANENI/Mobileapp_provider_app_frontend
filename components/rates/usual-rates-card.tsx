import { YouKeep } from '@/components/you-keep';
import { refreshUsualRate } from '@/components/labour-helper';
import { ThemedText } from '@/components/themed-text';
import { useDraft } from '@/hooks/use-draft';
import { SkoFyApi } from '@/services/api';
import { MIN_VISITING_FEE } from '@/services/fees';
import { useSaveUsualRates } from '@/services/queries/provider';
import { Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { Notify, USUAL, priceText, rs } from './shared';

type Usual = { fee: string; hourly: string };
const asUsual = (profile: any): Usual => ({
  fee: profile?.visiting_fee != null ? String(profile.visiting_fee) : '',
  hourly: profile?.hourly_rate != null ? String(profile.hourly_rate) : '',
});

/** The visiting fee and hourly rate for ordinary visits — saved together. */
export const UsualRatesCard = React.memo(function UsualRatesCard({ profile, notify }: { profile: any; notify: Notify }) {
  const { draft, edit, saved } = useDraft<Usual>(asUsual(profile), (u) => `${u.fee}|${u.hourly}`);
  const [typing, setTyping] = useState<keyof Usual | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const save = useSaveUsualRates();

  const onSave = () => {
    const fee = Number(draft.fee);
    const hourly = Number(draft.hourly);
    if (!draft.fee || !draft.hourly || !(fee > 0) || !(hourly > 0)) {
      notify('error', 'Both prices needed', 'Fill in your visiting fee and hourly rate.');
      return;
    }
    if (fee < MIN_VISITING_FEE) {
      notify('error', 'Visiting fee too low', `The visiting fee is at least $${MIN_VISITING_FEE} — it covers your trip if a customer cancels.`);
      return;
    }
    save.mutate({ fee, hourly }, {
      onSuccess: () => {
        saved();
        refreshUsualRate();
        notify('success', 'Saved', 'Customers now see your visiting fee and hourly rate.');
      },
      onError: (err: any) => notify('error', 'Not saved', err?.message ?? 'Please try again.'),
    });
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const tip = await SkoFyApi.provider.suggestRates();
      edit({ fee: String(tip.visiting_fee), hourly: String(tip.hourly_rate) });
    } catch (err: any) {
      notify('error', 'Could not suggest', err?.message ?? 'Try again in a moment.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <View style={rs.card}>
      <View style={rs.row}>
        <ThemedText style={[rs.cardTitle, { flex: 1 }]}>Your usual rates</ThemedText>
        <TouchableOpacity style={rs.suggest} onPress={suggest} disabled={suggesting}>
          {suggesting ? <ActivityIndicator size="small" color="#111827" /> : <Sparkles size={13} color="#111827" />}
          <ThemedText style={rs.suggestText}>{suggesting ? 'Suggesting…' : 'Suggest for me'}</ThemedText>
        </TouchableOpacity>
      </View>
      <ThemedText style={rs.muted}>For ordinary visits — you go to the customer to fix, clean or help.</ThemedText>
      {USUAL.map(({ field, label, hint }) => (
        <View key={field} style={rs.rateRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={rs.item}>{label}</ThemedText>
            <ThemedText style={rs.hint}>{hint}</ThemedText>
            {typing === field && <YouKeep amount={draft[field]} />}
          </View>
          <View style={rs.money}>
            <ThemedText style={rs.dollar}>$</ThemedText>
            <TextInput
              style={rs.moneyInput}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="#9CA3AF"
              value={draft[field]}
              onChangeText={(t) => edit((u) => ({ ...u, [field]: priceText(t) }))}
              onFocus={() => setTyping(field)}
              onBlur={() => setTyping((f) => (f === field ? null : f))}
            />
          </View>
        </View>
      ))}
      <TouchableOpacity style={rs.primary} onPress={onSave} disabled={save.isPending}>
        {save.isPending ? <ActivityIndicator color="#111827" /> : <ThemedText style={rs.primaryText}>Save</ThemedText>}
      </TouchableOpacity>
    </View>
  );
});
