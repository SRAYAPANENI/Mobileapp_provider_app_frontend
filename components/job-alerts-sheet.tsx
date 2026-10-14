import { Fonts } from '@/constants/theme';
import { Check, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MySkill } from './skill-filter-bar';

interface Props {
  visible: boolean;
  mySkills: MySkill[];
  /** Currently chosen skill ids; [] = all skills. */
  chosen: string[];
  onClose: () => void;
  onSave: (skillIds: string[]) => Promise<void>;
}

// Which skills the provider gets "New job" alerts for. Jobs for the other
// skills still show in their feed — only the notification is skipped.
export function JobAlertsSheet({ visible, mySkills, chosen, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const verified = mySkills.filter(s => s.is_verified);
  const [allSkills, setAllSkills] = useState(chosen.length === 0);
  const [picked, setPicked] = useState<Set<string>>(new Set(chosen));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAllSkills(chosen.length === 0);
    setPicked(new Set(chosen));
  }, [visible]);

  const toggle = (id: string) => {
    setAllSkills(false);
    setPicked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Choosing every skill one by one is the same as "all".
  const effective = allSkills || picked.size === 0 || picked.size === verified.length ? [] : [...picked];
  const save = async () => {
    setSaving(true);
    try { await onSave(effective); onClose(); } catch { /* onSave told the user */ } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={s.header}>
          <Text style={s.title}>Job alerts</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><X size={22} color="#111827" /></TouchableOpacity>
        </View>
        <Text style={s.lede}>Choose which jobs notify you. Every job you qualify for still shows in All Jobs.</Text>

        <TouchableOpacity style={s.option} onPress={() => { setAllSkills(true); setPicked(new Set()); }}>
          <View style={[s.radio, allSkills && s.radioOn]}>{allSkills && <View style={s.radioDot} />}</View>
          <View style={{ flex: 1 }}>
            <Text style={s.optionTitle}>All my skills</Text>
            <Text style={s.optionHint}>Get notified about every job you qualify for</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={s.option} onPress={() => setAllSkills(false)}>
          <View style={[s.radio, !allSkills && s.radioOn]}>{!allSkills && <View style={s.radioDot} />}</View>
          <View style={{ flex: 1 }}>
            <Text style={s.optionTitle}>Only selected skills</Text>
            <Text style={s.optionHint}>Pick the kinds of work you want right now</Text>
          </View>
        </TouchableOpacity>

        {!allSkills && (
          <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
            {verified.length === 0 ? (
              <Text style={s.optionHint}>Verify a skill in your profile to choose it here.</Text>
            ) : verified.map(skill => {
              const on = picked.has(skill.skill_id);
              return (
                <TouchableOpacity key={skill.skill_id} style={s.skillRow} onPress={() => toggle(skill.skill_id)}>
                  <View style={[s.box, on && s.boxOn]}>{on && <Check size={13} color="#111827" strokeWidth={3} />}</View>
                  <Text style={s.skillName}>{skill.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[s.save, !allSkills && picked.size === 0 && s.saveDisabled]}
          disabled={saving || (!allSkills && picked.size === 0)}
          onPress={save}
        >
          {saving ? <ActivityIndicator color="#111827" /> : (
            <Text style={s.saveText}>
              {allSkills || picked.size === 0 ? 'Save' : `Notify me for ${picked.size} skill${picked.size === 1 ? '' : 's'}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 19, lineHeight: 25, fontFamily: Fonts.poppinsBold, color: '#111827' },
  lede: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', marginTop: 4, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#111827' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#111827' },
  optionTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  optionHint: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  list: { maxHeight: 260, marginTop: 4, marginBottom: 4, paddingLeft: 34 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#FFCE48', borderColor: '#FFCE48' },
  skillName: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827', flexShrink: 1 },
  save: { marginTop: 14, height: 52, borderRadius: 16, backgroundColor: '#FFCE48', alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveText: { fontSize: 15, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
