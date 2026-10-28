import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { SkoFyApi } from '@/services/api';
import { CheckCircle2, Circle, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, SectionList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

/** A skill from the catalogue, with the profession and category it belongs to. */
export interface PickedSkill {
  id: string;
  name: string;
  profession: string;
  /** One of the catalogue's groups — "Pets", "Cleaning"… */
  category?: string | null;
}

// Loaded once per app session: the catalogue is the same for every screen.
let catalogue: Promise<PickedSkill[]> | null = null;
function loadCatalogue(): Promise<PickedSkill[]> {
  if (!catalogue) {
    catalogue = SkoFyApi.skills.list()
      .then((list: any) => (Array.isArray(list) ? list : []).map((s: any) => ({ id: s.id, name: s.name, profession: s.profession, category: s.category ?? null })))
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
// provider can offer a mix (handyman + lawn care + tutoring), as many as
// they like. A tap only selects; the screen saves the choice (Register on
// Create Account, Profile on Done) — never one server call per tap.
//
// Searching is by skill, not by profession: results are one list, best
// matches first, each with its profession as a small note. The chips are the
// catalogue's categories (Pets, Cleaning… — not its 300+ professions), and
// narrow to those with a match.
export function SkillPicker({
  visible, onClose, onDone, isPicked, onPick, isLocked, note, busy = false,
  excludeProfessions = [], title = 'What can you do?',
}: {
  visible: boolean;
  /** ✕ or Back. */
  onClose: () => void;
  /** Done; defaults to onClose. */
  onDone?: () => void;
  isPicked: (skill: PickedSkill) => boolean;
  onPick: (skill: PickedSkill) => void;
  /** Skills that can't be tapped (Profile: ones they already have). */
  isLocked?: (skill: PickedSkill) => boolean;
  /** Shown at the bottom, e.g. "4 selected". */
  note?: string;
  busy?: boolean;
  excludeProfessions?: string[];
  title?: string;
}) {
  const theme = Colors[useColorScheme() ?? 'light'];
  const bottomInset = useBottomInset();
  const [all, setAll] = useState<PickedSkill[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || all) return;
    setFailed(false);
    loadCatalogue().then(setAll).catch(() => setFailed(true));
  }, [visible, all]);

  const usable = useMemo(() => (all ?? []).filter((s) => !excludeProfessions.includes(s.profession)), [all, excludeProfessions]);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Skills matching the search, best first: name starts with it, then name
  // contains it, then only the profession does.
  const matches = useMemo(() => {
    if (!searching) return usable;
    const rank = (s: PickedSkill) => {
      const name = s.name.toLowerCase();
      if (name.startsWith(q) || name.includes(` ${q}`)) return 0;
      if (name.includes(q)) return 1;
      return s.profession.toLowerCase().includes(q) ? 2 : 3;
    };
    return usable.map((s) => ({ s, r: rank(s) })).filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name)).map((x) => x.s);
  }, [usable, q, searching]);

  const categoryOf = (s: PickedSkill) => s.category || 'Other';
  // The chips follow the search: only categories with a match, most matches first.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of matches) counts.set(categoryOf(s), (counts.get(categoryOf(s)) ?? 0) + 1);
    return [...counts].sort((a, b) => (searching ? b[1] - a[1] : 0) || a[0].localeCompare(b[0])).map(([c]) => c);
  }, [matches, searching]);
  // A chip picked before the search changed may have no match now: show all.
  const activeCategory = category && categories.includes(category) ? category : null;

  const sections = useMemo(() => {
    const shown = activeCategory ? matches.filter((s) => categoryOf(s) === activeCategory) : matches;
    // Searching: one plain list, best first. Browsing: grouped by profession.
    if (searching) return shown.length ? [{ title: '', data: shown }] : [];
    return byProfession(shown).sort((a, b) => a.profession.localeCompare(b.profession))
      .map((g) => ({ title: g.profession, data: g.skills }));
  }, [matches, activeCategory, searching]);

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

          {/* flexGrow 0: a horizontal ScrollView in a column otherwise takes
              the sheet's spare height and stretches every chip into a tall pill.
              key: a new set of chips (the search narrowed them) starts a fresh
              row at the left — Android keeps the old scroll position, which on
              a now-shorter row is past its end, so the chips looked gone. */}
          <ScrollView key={categories.join('|')} horizontal showsHorizontalScrollIndicator={false} style={s.chipBar} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {[null, ...categories].map((c) => {
              const on = activeCategory === c;
              return (
                <TouchableOpacity key={c ?? 'all'} onPress={() => setCategory(c)} style={[s.chip, on && s.chipOn]}>
                  <ThemedText style={[s.chipText, on && s.chipTextOn]}>{c ?? 'All'}</ThemedText>
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
              renderSectionHeader={({ section }) => (section.title ? <ThemedText style={s.sectionHead}>{section.title}</ThemedText> : null)}
              renderItem={({ item }) => {
                const picked = isPicked(item);
                const disabled = busy || !!isLocked?.(item);
                return (
                  <TouchableOpacity onPress={() => onPick(item)} disabled={disabled}
                    style={[s.row, picked && s.rowOn, disabled && !picked && { opacity: 0.45 }]}>
                    <View style={s.rowBody}>
                      <ThemedText style={[s.rowText, picked && { fontFamily: Fonts.poppinsSemiBold }]}>{item.name}</ThemedText>
                      {/* In a plain list the section header is gone: say where it's from. */}
                      {searching && <ThemedText style={s.rowNote}>{item.profession}</ThemedText>}
                    </View>
                    {picked ? <CheckCircle2 size={20} color={theme.brand} /> : <Circle size={20} color={theme.icon} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={s.footer}>
            {!!note && <ThemedText style={s.muted}>{note}</ThemedText>}
            <TouchableOpacity onPress={onDone ?? onClose} disabled={busy} style={[s.done, busy && { opacity: 0.7 }]}>
              {busy ? <ActivityIndicator color="#111" /> : <ThemedText style={s.doneText}>Done</ThemedText>}
            </TouchableOpacity>
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
  chipBar: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: (t as any).inputBorder ?? '#E5E7EB' },
  chipOn: { backgroundColor: t.text, borderColor: t.text },
  chipText: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: t.text },
  chipTextOn: { color: t.background },
  list: { flex: 1, paddingHorizontal: 20 },
  sectionHead: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: t.icon, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: t.brand + '1F' },
  rowBody: { flex: 1, marginRight: 12 },
  rowText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppins },
  rowNote: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: t.icon },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: t.icon },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: t.brand },
  retryText: { fontFamily: Fonts.poppinsBold, color: '#111' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  done: { flex: 1, maxWidth: 200, marginLeft: 'auto', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: t.brand },
  doneText: { fontFamily: Fonts.poppinsBold, fontSize: 16, color: '#111' },
});
