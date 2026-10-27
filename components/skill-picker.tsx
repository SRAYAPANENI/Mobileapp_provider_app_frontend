import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { SkoFyApi } from '@/services/api';
import { CheckCircle2, Circle, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, SectionList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

/** A skill from the catalogue, with the profession it belongs to. */
export interface PickedSkill {
  id: string;
  name: string;
  profession: string;
}

// Loaded once per app session: the catalogue is the same for every screen.
let catalogue: Promise<PickedSkill[]> | null = null;
function loadCatalogue(): Promise<PickedSkill[]> {
  if (!catalogue) {
    catalogue = SkoFyApi.skills.list()
      .then((list: any) => (Array.isArray(list) ? list : []).map((s: any) => ({ id: s.id, name: s.name, profession: s.profession })))
      .catch((err: unknown) => { catalogue = null; throw err; });
  }
  return catalogue;
}

/** Start loading the catalogue early (e.g. once signed in) so the picker opens ready. */
export function prefetchSkillCatalogue(): void {
  loadCatalogue().catch(() => {});
}

/** The profession a provider is shown as: the one most of their skills are in. */
export function mainProfession(skills: PickedSkill[]): string {
  const counts = new Map<string, number>();
  for (const s of skills) counts.set(s.profession, (counts.get(s.profession) ?? 0) + 1);
  let best = '';
  for (const [p, n] of counts) if (n > (counts.get(best) ?? 0)) best = p;
  return best;
}

/** Skills grouped under their professions, in the order picked. */
export function byProfession(skills: PickedSkill[]): { profession: string; skills: PickedSkill[] }[] {
  const groups = new Map<string, PickedSkill[]>();
  for (const s of skills) groups.set(s.profession, [...(groups.get(s.profession) ?? []), s]);
  return [...groups].map(([profession, list]) => ({ profession, skills: list }));
}

// "What can you do?" — one search over every skill, from any profession, so a
// provider can offer a mix (handyman + lawn care + tutoring). The screen
// decides what a tap means: Register selects, Profile adds at once.
export function SkillPicker({
  visible, onClose, isPicked, onPick, lockPicked = false, canPickMore = true, limitNote, busy = false,
  excludeProfessions = [], title = 'What can you do?',
}: {
  visible: boolean;
  onClose: () => void;
  isPicked: (skill: PickedSkill) => boolean;
  onPick: (skill: PickedSkill) => void;
  /** Picked skills can't be tapped again (Profile: already added). */
  lockPicked?: boolean;
  /** False once a limit is reached: unpicked skills can't be chosen. */
  canPickMore?: boolean;
  /** Shown at the bottom, e.g. "4 of 10 skills". */
  limitNote?: string;
  busy?: boolean;
  excludeProfessions?: string[];
  title?: string;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const bottomInset = useBottomInset();
  const [all, setAll] = useState<PickedSkill[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [profession, setProfession] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || all) return;
    setFailed(false);
    loadCatalogue().then(setAll).catch(() => setFailed(true));
  }, [visible, all]);

  const usable = useMemo(() => (all ?? []).filter((s) => !excludeProfessions.includes(s.profession)), [all, excludeProfessions]);
  const professions = useMemo(() => [...new Set(usable.map((s) => s.profession))].sort(), [usable]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = usable.filter((s) => (!profession || s.profession === profession)
      && (!q || s.name.toLowerCase().includes(q) || s.profession.toLowerCase().includes(q)));
    return byProfession(shown).sort((a, b) => a.profession.localeCompare(b.profession))
      .map((g) => ({ title: g.profession, data: g.skills }));
  }, [usable, query, profession]);

  const s = styles(theme);
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={padBottom([s.sheet], bottomInset)}>
          <View style={s.header}>
            <ThemedText style={s.title}>{title}</ThemedText>
            <TouchableOpacity onPress={onClose} hitSlop={12}><X size={24} color={theme.icon} /></TouchableOpacity>
          </View>

          <View style={s.search}>
            <Search size={18} color={theme.icon} />
            <TextInput
              style={s.searchInput}
              placeholder="Type anything: fan, dog walking, logo…"
              placeholderTextColor={theme.icon}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {!!query && <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}><X size={16} color={theme.icon} /></TouchableOpacity>}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {[null, ...professions].map((p) => {
              const on = profession === p;
              return (
                <TouchableOpacity key={p ?? 'all'} onPress={() => setProfession(p)} style={[s.chip, on && s.chipOn]}>
                  <ThemedText style={[s.chipText, on && s.chipTextOn]}>{p ?? 'All'}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {failed ? (
            <View style={s.center}>
              <ThemedText style={s.muted}>Couldn’t load skills.</ThemedText>
              <TouchableOpacity onPress={() => setAll(null)} style={s.retry}><ThemedText style={s.retryText}>Try again</ThemedText></TouchableOpacity>
            </View>
          ) : !all ? (
            <View style={s.center}><ActivityIndicator color={theme.brand} /></View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id || `${item.profession}:${item.name}`}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              style={s.list}
              ListEmptyComponent={<ThemedText style={[s.muted, { padding: 24, textAlign: 'center' }]}>No skill matches “{query}”.</ThemedText>}
              renderSectionHeader={({ section }) => <ThemedText style={s.sectionHead}>{section.title}</ThemedText>}
              renderItem={({ item }) => {
                const picked = isPicked(item);
                const disabled = busy || (picked && lockPicked) || (!picked && !canPickMore);
                return (
                  <TouchableOpacity onPress={() => onPick(item)} disabled={disabled}
                    style={[s.row, picked && s.rowOn, disabled && !picked && { opacity: 0.45 }]}>
                    <ThemedText style={[s.rowText, picked && { fontFamily: Fonts.poppinsSemiBold }]}>{item.name}</ThemedText>
                    {picked ? <CheckCircle2 size={20} color={theme.brand} /> : <Circle size={20} color={theme.icon} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={s.footer}>
            {!!limitNote && <ThemedText style={s.muted}>{limitNote}</ThemedText>}
            <TouchableOpacity onPress={onClose} style={s.done}><ThemedText style={s.doneText}>Done</ThemedText></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = (t: typeof Colors.light) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, height: '88%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  title: { fontSize: 20, lineHeight: 26, fontFamily: Fonts.poppinsBold },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, paddingHorizontal: 14, height: 48,
    borderRadius: 14, backgroundColor: t.inputBackground, borderWidth: 1, borderColor: (t as any).inputBorder ?? '#E5E7EB' },
  searchInput: { flex: 1, color: t.text, fontFamily: Fonts.poppins, fontSize: 15 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: (t as any).inputBorder ?? '#E5E7EB' },
  chipOn: { backgroundColor: t.text, borderColor: t.text },
  chipText: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: t.text },
  chipTextOn: { color: t.background },
  list: { flex: 1, paddingHorizontal: 20 },
  sectionHead: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: t.icon, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: t.brand + '1F' },
  rowText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppins, flex: 1, marginRight: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: t.icon },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: t.brand },
  retryText: { fontFamily: Fonts.poppinsBold, color: '#111' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  done: { flex: 1, maxWidth: 200, marginLeft: 'auto', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: t.brand },
  doneText: { fontFamily: Fonts.poppinsBold, fontSize: 16, color: '#111' },
});
