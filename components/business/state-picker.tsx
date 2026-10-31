import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useUsStates } from '@/services/queries/business';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, u } from './ui';

interface Props {
  /** The two-letter code chosen, or '' for none yet. */
  value: string;
  onChange: (code: string) => void;
}

/** A US state, chosen from the list the server checks against
 * (GET /businesses/us-states) — searchable by name or code. */
export function StatePicker({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const states = useUsStates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const chosen = states.data?.find((s) => s.code === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = states.data ?? [];
    return q ? all.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q) : all;
  }, [states.data, query]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <TouchableOpacity style={[u.input, s.field]} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <ThemedText style={[s.value, !value && { color: C.faint }]} numberOfLines={1}>
          {chosen ? `${chosen.name} (${chosen.code})` : value || 'Choose a state'}
        </ThemedText>
        <ChevronDown size={18} color={C.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.header}>
            <ThemedText style={s.title}>State registered in</ThemedText>
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
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flex: 1, fontSize: 14.5, fontFamily: Fonts.poppins, color: C.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: { maxHeight: '75%', backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16 },
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
