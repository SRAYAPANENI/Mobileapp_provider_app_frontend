import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  AssessableSkill, SkillEligibility, TestButtonState, shortWait, skillLevel, testButtonState,
} from '@/services/skillAssessment';
import { CheckCircle2, Hourglass, IdCard, Trash2 } from 'lucide-react-native';
import React, { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  skill: AssessableSkill;
  eligibility?: SkillEligibility;
  /** Stable callbacks — the row re-renders only when its own skill or status changes. */
  onAction: (skill: AssessableSkill, state: TestButtonState, eligibility?: SkillEligibility) => void;
  onRemove: (skillId: string) => void;
}

// One skill in Verification → Skill Assessments: name, level, and its test
// button. Draws only; what the button does is decided by the screen.
function SkillAssessmentRowView({ skill, eligibility, onAction, onRemove }: Props) {
  const styles = stylesFor(useColorScheme() ?? 'light');
  const state = testButtonState(skill, eligibility);
  const level = skillLevel(skill.skill_o_meter);
  const done = state === 'maxed' || state === 'verified_locked' || state === 'no_test';

  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <View style={styles.info}>
          <ThemedText style={styles.name}>{skill.name}</ThemedText>
          <ThemedText style={styles.profession}>{skill.profession}</ThemedText>
          <View style={styles.badgeRow}>
            <View style={[styles.levelBadge, { backgroundColor: level.bg, borderColor: level.border }]}>
              <ThemedText style={[styles.levelText, { color: level.color }]}>{level.label}</ThemedText>
            </View>
            <ThemedText style={styles.points}>⭐ {skill.is_verified ? '+50 Points' : 'Level Up Available'}</ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onAction(skill, state, eligibility)}
            disabled={state === 'maxed'}
            style={[styles.button, done && styles.buttonDone, (state === 'locked' || state === 'review' || state === 'id_needed') && styles.buttonLocked]}
          >
            {state === 'maxed' || state === 'verified_locked' || state === 'no_test' ? (
              <View style={styles.doneLabel}>
                <CheckCircle2 size={12} color="#fff" />
                <ThemedText style={[styles.buttonText, styles.buttonTextLight]}>
                  {state === 'maxed' ? 'Max Level' : 'Verified'}
                </ThemedText>
              </View>
            ) : state === 'id_needed' ? (
              <View style={styles.doneLabel}>
                <IdCard size={12} color="#9CA3AF" />
                <ThemedText style={[styles.buttonText, styles.buttonTextMuted]}>Verify ID</ThemedText>
              </View>
            ) : state === 'review' ? (
              <View style={styles.doneLabel}>
                <Hourglass size={12} color="#9CA3AF" />
                <ThemedText style={[styles.buttonText, styles.buttonTextMuted]}>In review</ThemedText>
              </View>
            ) : state === 'locked' ? (
              <ThemedText style={[styles.buttonText, styles.buttonTextMuted]}>
                {eligibility?.retry_after_minutes ? `Wait ${shortWait(eligibility.retry_after_minutes)}` : 'Locked'}
              </ThemedText>
            ) : (
              <ThemedText style={styles.buttonText}>
                {state === 'resume' ? 'Resume Test' : state === 'upgrade' ? 'Upgrade Test' : 'Take Test'}
              </ThemedText>
            )}
          </TouchableOpacity>
          {(state === 'no_test' || state === 'id_needed') && (
            <ThemedText style={styles.hint}>No test needed</ThemedText>
          )}
          {state === 'verified_locked' && eligibility?.reason === 'needs_more_jobs' && (
            <ThemedText style={styles.hint}>
              {eligibility.jobs_required - eligibility.jobs_completed} more job(s) to upgrade
            </ThemedText>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={() => onRemove(skill.skill_id)} style={styles.remove} hitSlop={8}>
        <Trash2 size={16} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );
}

export const SkillAssessmentRow = memo(SkillAssessmentRowView);

// Styles depend only on the colour scheme: built once per scheme and shared
// by every row (not once per row, per render).
const cache: Partial<Record<'light' | 'dark', ReturnType<typeof makeStyles>>> = {};
function stylesFor(scheme: 'light' | 'dark') {
  return (cache[scheme] ??= makeStyles(Colors[scheme]));
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    row: {
      backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 16, borderRadius: 24, borderWidth: 1, borderColor: t.borderSubtle,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    },
    body: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    info: { flex: 1 },
    name: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    profession: { fontSize: 11, lineHeight: 17, color: '#9CA3AF', fontFamily: Fonts.poppins },
    badgeRow: { flexDirection: 'row', marginTop: 4, gap: 6 },
    levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 0.5 },
    levelText: { fontSize: 8, lineHeight: 14, fontFamily: Fonts.poppinsBold, textTransform: 'uppercase', letterSpacing: 0.5 },
    points: { fontSize: 11, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: t.textMuted },
    actions: { alignItems: 'flex-end' },
    button: {
      backgroundColor: '#FFCE48', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14,
      shadowColor: '#FFCE48', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    buttonDone: { backgroundColor: '#10B981', shadowColor: '#10B981' },
    buttonLocked: { backgroundColor: '#F3F4F6', shadowOpacity: 0, shadowColor: 'transparent', elevation: 0 },
    doneLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    buttonText: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#000' },
    buttonTextLight: { color: '#fff' },
    buttonTextMuted: { color: '#9CA3AF' },
    hint: { fontSize: 10, lineHeight: 16, color: '#6B7280', marginTop: 4, fontFamily: Fonts.poppins, textAlign: 'right', maxWidth: 110 },
    remove: {
      marginLeft: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEF2F2',
      justifyContent: 'center', alignItems: 'center',
    },
  });
}
