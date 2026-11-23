import { SkillAssessmentRow } from '@/components/skill-assessment-row';
import { Fonts } from '@/constants/theme';
import {
  AssessableSkill, SkillEligibility, TestButtonState, filterSkills,
} from '@/services/skillAssessment';
import { Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/scaled-text';

// How many rows are drawn at first, and per "Show more". Drawing every row
// at once (hundreds, for a provider with many skills) froze the Verification
// tab for seconds — nobody scrolls 385 skills; they search for one.
const PAGE = 30;
// Below this many skills a search box is just clutter.
const SEARCH_FROM = 8;

interface Props {
  skills: AssessableSkill[];
  eligibility: Record<string, SkillEligibility>;
  onAction: (skill: AssessableSkill, state: TestButtonState, eligibility?: SkillEligibility) => void;
  onRemove: (skillId: string) => void;
  /** Told when the list leaves its top (true) and comes back to it (false).
   * The page's pull-to-refresh is off meanwhile: on Android it only looks at
   * the page, so a swipe down to scroll this list back up refreshed the page. */
  onScrolledChange?: (scrolled: boolean) => void;
}

// Verification → Skill Assessments: search, and the rows drawn a page at a time.
export function SkillAssessmentList({ skills, eligibility, onAction, onRemove, onScrolledChange }: Props) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const matches = useMemo(() => filterSkills(skills, query), [skills, query]);
  useEffect(() => { setShown(PAGE); }, [query]);

  // Said only when it changes, and "at the top" once the list is gone — the
  // page's refresh must never stay off after it.
  const scrolled = useRef(false);
  const report = useCallback((next: boolean) => {
    if (scrolled.current === next) return;
    scrolled.current = next;
    onScrolledChange?.(next);
  }, [onScrolledChange]);
  useEffect(() => () => { if (scrolled.current) onScrolledChange?.(false); }, [onScrolledChange]);
  const listShown = skills.length > 0 && matches.length > 0;
  useEffect(() => { if (!listShown) report(false); }, [listShown, report]);

  if (skills.length === 0) {
    return <Text style={s.empty}>No skills added yet. Tap “Add” to get started.</Text>;
  }

  const visible = matches.slice(0, shown);
  const remaining = matches.length - visible.length;

  return (
    <View>
      {skills.length >= SEARCH_FROM && (
        <View style={s.search}>
          <Search size={15} color="#9CA3AF" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${skills.length} skills`}
            placeholderTextColor="#9CA3AF"
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={15} color="#6B7280" /></TouchableOpacity>
          )}
        </View>
      )}

      {matches.length === 0 ? (
        <Text style={s.empty}>No skills match “{query.trim()}”.</Text>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={s.list}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          scrollEventThrottle={16}
          onScroll={(e) => report(e.nativeEvent.contentOffset.y > 0)}
          contentContainerStyle={s.listContent}
        >
          {visible.map(skill => (
            <SkillAssessmentRow
              key={skill.skill_id}
              skill={skill}
              eligibility={eligibility[skill.skill_id]}
              onAction={onAction}
              onRemove={onRemove}
            />
          ))}
          {remaining > 0 && (
            <TouchableOpacity style={s.more} onPress={() => setShown(n => n + PAGE)}>
              <Text style={s.moreText}>Show {Math.min(PAGE, remaining)} more · {remaining} left</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  empty: { color: '#6B7280', fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, textAlign: 'center', paddingVertical: 16 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 14, paddingHorizontal: 12,
    backgroundColor: '#F3F4F6', marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', paddingVertical: 0 },
  list: { maxHeight: 320 },
  listContent: { gap: 12 },
  more: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: '#FFF8E7' },
  moreText: { fontSize: 13, fontFamily: Fonts.poppinsSemiBold, color: '#92400E' },
});
