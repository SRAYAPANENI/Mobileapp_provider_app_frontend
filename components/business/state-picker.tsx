import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useUsStates } from '@/services/queries/business';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { TextInput } from '@/components/scaled-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, u } from './ui';

import { Popup, PopupCard } from '@/components/popup';
interface Props {
  /** The two-letter code chosen, or '' for none yet. */
  value: string;
  onChange: (code: string) => void;
  /** The list's heading — what the state is for. */
  title?: string;
  /** Required and not chosen yet, after the form was sent: outlined in red. */
  invalid?: boolean;
}

/** A US state, chosen from the list the server checks against
 * (GET /businesses/us-states) — searchable by name or code. */
export function StatePicker({ value, onChange, title = 'State registered in', invalid }: Props) {
  const insets = useSafeAreaInsets();
  const states = useUsStates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const chosen = states.data?.find((s) => s.code === value);
  // "texas", "Tex", "TX", " new  york", "N.Y." — letters only, any case.
  // Names starting with what's typed come first ("new" → New Hampshire,
  // New Jersey… before Rhode Island's "Providence Plantations").
  const shown = useMemo(() => {
    const letters = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
    const q = letters(query);
    const all = states.data ?? [];
    if (!q) return all;
    const hits = all.filter((st) => letters(st.name).includes(q) || st.code.toLowerCase() === q);
    const starts = (st: (typeof all)[number]) => (st.code.toLowerCase() === q || letters(st.name).startsWith(q) ? 0 : 1);
    return [...hits].sort((a, b) => starts(a) - starts(b));
  }, [states.data, query]);

  const pick = (code: string) => {
    Keyboard.dismiss();
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <TouchableOpacity style={[u.input, s.field, invalid && u.inputBad]} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <ThemedText style={[s.value, !value && { color: C.faint }]} numberOfLines={1}>
          {chosen ? `${chosen.name} (${chosen.code})` : value || 'Choose a state'}
        </ThemedText>
        <ChevronDown size={18} color={C.muted} />
      </TouchableOpacity>

      <Popup closeOn="outside" visible={open} transparent animationType="slide" onClose={() => setOpen(false)}
        statusBarTranslucent navigationBarTranslucent>
        {/* The sheet rides above the keyboard: typing "texas" left the
            list — Texas in it — behind the keyboard. The same as the app's
            other sheets with a search or text box (report-issue-modal). */}
        <KeyboardAvoidingView style={s.backdrop} behavior="padding" automaticOffset>
        <PopupCard style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.header}>
            <ThemedText style={s.title}>{title}</ThemedText>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}><X size={22} color={C.ink} /></TouchableOpacity>
          </View>
          <View style={s.search}>
            <Search size={16} color={C.muted} />
            <TextInput
              style={s.searchInput} value={query} onChangeText={setQuery} placeholder="Search states"
              placeholderTextColor={C.faint} autoCorrect={false}
            />
          </View>
          {states.isPending ? <ActivityIndicator style={{ marginVertical: 24 }} color={C.ink} />
            : states.isError ? (
              <TouchableOpacity onPress={() => states.refetch()} style={{ padding: 20 }}>
                <ThemedText style={u.muted}>{"Couldn't load the states. Tap to try again."}</ThemedText>
              </TouchableOpacity>
            ) : (
              <FlatList
                data={shown}
                keyExtractor={(st) => st.code}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={15}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.row} onPress={() => pick(item.code)}>
                    <ThemedText style={s.rowText}>{item.name}</ThemedText>
                    <ThemedText style={u.muted}>{item.code}</ThemedText>
                    {item.code === value && <Check size={16} color={C.ok} strokeWidth={3} />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<ThemedText style={[u.muted, { padding: 20 }]}>No state matches “{query.trim()}”.</ThemedText>}
              />
            )}
        </PopupCard>
        </KeyboardAvoidingView>
      </Popup>
    </>
  );
}

const s = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flex: 1, fontSize: 14.5, fontFamily: Fonts.poppins, color: C.ink },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.4)' },
  // A steady height (not shrinking to fit as the list filters); with the
  // keyboard up it's a share of the space left above it.
  sheet: { height: '75%', backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  title: { fontSize: 17, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: C.ink },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#DDE1E7', backgroundColor: '#FBFCFD',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: Fonts.poppins, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  rowText: { flex: 1, fontSize: 14.5, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
