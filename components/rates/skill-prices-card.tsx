import { YouKeep } from '@/components/you-keep';
import { ThemedText } from '@/components/themed-text';
import { useDraft } from '@/hooks/use-draft';
import { ProviderRate, WaitRules } from '@/services/api';
import { MySkill, PriceChange, useSaveSkillPrices } from '@/services/queries/provider';
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { Notify, TRIP_EXTRAS, Unit, priceText, rs, tripExample, unitsFor } from './shared';

type Prices = Partial<Record<Unit, string>>;
const asPrices = (rates: ProviderRate[]): Prices =>
  Object.fromEntries(rates.map((r) => [r.unit, String(r.amount)])) as Prices;
const signature = (p: Prices) => Object.entries(p).sort().map(([u, v]) => `${u}=${v}`).join('|');
/** The same prices, whatever was typed: "25.0" is 25, and an empty box is no price. */
const samePrices = (a: Prices, b: Prices, units: { unit: Unit }[]) => units.every(({ unit }) => {
  const x = (a[unit] ?? '').trim();
  const y = (b[unit] ?? '').trim();
  return x === y || (x !== '' && y !== '' && Number(x) === Number(y));
});
const PER: Record<Unit, string> = { HOUR: 'hour', VISIT: 'visit', DAY: 'day', NIGHT: 'night', WEEK: 'week', MONTH: 'month',
  TRIP_BASE: 'trip', TRIP_MILE: 'mile', TRIP_BOX: 'box', TRIP_TRUNK: 'car trunk', TRIP_VAN: 'van', TRIP_WAIT: 'min' };
/** How a price on file reads: "$6 base", "$1.5/mile", "$40/night". */
const onFileLabel = (unit: Unit, amount: string) => (unit === 'TRIP_BASE' ? `$${amount} base`
  : unit === 'TRIP_WAIT' ? `waiting $${amount}/min`
  : TRIP_EXTRAS.includes(unit) ? `${PER[unit]} +$${amount}` : `$${amount}/${PER[unit]}`);

interface Props {
  sk: MySkill;
  /** This skill's prices on file. */
  rates: ProviderRate[];
  /** The usual hourly rate — what an empty "Per hour" uses. */
  hourlyHint: string;
  /** Waiting's rules as the server sets them, for the waiting box's hint. */
  waitRules?: WaitRules;
  notify: Notify;
  /** Open to edit; closed it's one line with the prices on file. */
  expanded: boolean;
  onToggle: (skillId: string) => void;
  /** Unsaved drafts by skill, kept by the screen: a list row scrolled far
   * away (or hidden by the search) is dropped, and comes back with them. */
  drafts: Record<string, Prices>;
}

/** One skill's price boxes: its own drafts and save, so typing here redraws
 * only this card (docs/APP_DATA_ARCHITECTURE.md §3). Closed until tapped: a
 * provider with every skill had thousands of boxes drawn at once. */
export const SkillPricesCard = React.memo(function SkillPricesCard({ sk, rates, hourlyHint, notify, expanded, onToggle, drafts, waitRules }: Props) {
  const units = unitsFor(sk);
  const onFile = asPrices(rates);
  const { draft, edit, saved } = useDraft<Prices>(onFile, signature, drafts[sk.skill_id]);
  const unsaved = !samePrices(draft, onFile, units);
  useEffect(() => {
    if (unsaved) drafts[sk.skill_id] = draft;
    else delete drafts[sk.skill_id];
  }, [unsaved, draft, drafts, sk.skill_id]);
  const [typing, setTyping] = useState<Unit | null>(null);
  const save = useSaveSkillPrices();

  const onSave = () => {
    // Checked first, so a bad box stops the save before anything is sent.
    const changes: PriceChange[] = [];
    for (const { unit } of units) {
      const text = (draft[unit] ?? '').trim();
      const savedAmount = onFile[unit] != null ? Number(onFile[unit]) : null;
      if (!text) {
        if (savedAmount != null) changes.push({ unit, amount: null });
        continue;
      }
      const amount = Number(text);
      // A size extra can be $0 — room to carry it, at no extra.
      const lowest = TRIP_EXTRAS.includes(unit) ? 0 : Number.MIN_VALUE;
      if (!Number.isFinite(amount) || amount < lowest) {
        notify('error', 'Not saved', 'Enter a price in dollars, like 25.');
        return;
      }
      if (amount !== savedAmount) changes.push({ unit, amount });
    }
    if (changes.length === 0) {
      saved();
      notify('success', 'Saved', 'Nothing changed.');
      return;
    }
    save.mutate({ skillId: sk.skill_id, changes }, {
      onSuccess: () => {
        saved();
        notify('success', 'Saved', 'Customers now see your prices for this skill.');
      },
      onError: (err: any) => {
        saved();      // some may have gone through: show what's on file
        notify('error', 'Not saved', err?.message ?? 'Please try again.');
      },
    });
  };

  const onFileText = units.filter(({ unit }) => onFile[unit] != null)
    .map(({ unit }) => onFileLabel(unit, onFile[unit]!)).join(units.some((u) => u.unit === 'TRIP_BASE') ? ' + ' : ' · ')
    || (units.some((u) => u.unit === 'HOUR') && hourlyHint ? `Uses your usual $${hourlyHint}/hour` : 'No prices set');

  return (
    <View style={rs.card}>
      <TouchableOpacity style={rs.row} onPress={() => onToggle(sk.skill_id)} hitSlop={8}>
        <View style={{ flex: 1 }}>
          <ThemedText style={rs.cardTitle}>{sk.name}</ThemedText>
          {!expanded && <ThemedText style={rs.hint}>{unsaved ? 'Not saved yet — tap to finish' : onFileText}</ThemedText>}
        </View>
        {expanded ? <ChevronUp size={20} color="#6B7280" /> : <ChevronDown size={20} color="#6B7280" />}
      </TouchableOpacity>
      {expanded && <>
      {units.map(({ unit, label, hint }) => (
        <View key={unit} style={rs.rateRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={rs.item}>{label}</ThemedText>
            <ThemedText style={rs.hint}>{unit === 'TRIP_WAIT' && waitRules
              ? `${waitRules.free_minutes} min free at the pickup and at the drop-off, then up to ${waitRules.max_minutes} min in all. Empty: waiting is free. Typical: $0.30–$0.50`
              : hint}</ThemedText>
            {typing === unit && <YouKeep amount={draft[unit] ?? ''} />}
          </View>
          <View style={rs.money}>
            <ThemedText style={rs.dollar}>$</ThemedText>
            <TextInput
              style={rs.moneyInput}
              keyboardType="decimal-pad"
              // Empty per hour uses the usual hourly rate (set above).
              placeholder={unit === 'HOUR' && hourlyHint ? hourlyHint : '—'}
              placeholderTextColor="#9CA3AF"
              value={draft[unit] ?? ''}
              onChangeText={(t) => edit((p) => ({ ...p, [unit]: priceText(t) }))}
              onFocus={() => setTyping(unit)}
              onBlur={() => setTyping((u) => (u === unit ? null : u))}
            />
          </View>
        </View>
      ))}
      {/* A trip's fare: what a customer would pay, so the two prices read as one. */}
      {units.some((u) => u.unit === 'TRIP_BASE') && (
        <ThemedText style={rs.hint}>
          {tripExample(draft.TRIP_BASE, draft.TRIP_MILE) ?? 'Customers see your exact fare for each trip before they hire you.'}
        </ThemedText>
      )}
      <TouchableOpacity style={rs.primary} onPress={onSave} disabled={save.isPending}>
        {save.isPending ? <ActivityIndicator color="#111827" /> : <ThemedText style={rs.primaryText}>Save prices</ThemedText>}
      </TouchableOpacity>
      </>}
    </View>
  );
}, (a, b) => a.sk === b.sk && a.hourlyHint === b.hourlyHint && a.notify === b.notify
  && a.expanded === b.expanded && a.onToggle === b.onToggle && a.drafts === b.drafts
  && signature(asPrices(a.rates)) === signature(asPrices(b.rates)));
