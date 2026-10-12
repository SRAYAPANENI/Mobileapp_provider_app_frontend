import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { markRatingSkipped, markRatingSubmitted } from '@/services/ratingReminders';
import { Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const DIMENSIONS = ['behaviour', 'negotiation', 'payment', 'environment'] as const;
type Dimension = typeof DIMENSIONS[number];
const EMPTY: Record<Dimension, number> = { behaviour: 0, negotiation: 0, payment: 0, environment: 0 };

/**
 * The provider's rating of a customer for one finished job (completed or
 * disputed). One sheet for every place that asks — the job chat and the
 * Jobs tab's history — so they can't drift apart. Skipping or submitting is
 * recorded for the session so no other screen asks again straight away.
 */
export function CustomerRatingSheet({
  jobId,
  customerName,
  onClose,
}: {
  /** The job to rate; null hides the sheet. */
  jobId: string | null;
  customerName?: string;
  onClose: (submitted: boolean) => void;
}) {
  const [ratings, setRatings] = useState(EMPTY);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // A fresh form for each job.
  useEffect(() => {
    setRatings(EMPTY);
    setComment('');
  }, [jobId]);

  const skip = () => {
    if (jobId) markRatingSkipped(jobId);
    onClose(false);
  };

  const submit = async () => {
    if (!jobId || submitting) return;
    if (Object.values(ratings).some(v => v === 0)) {
      Alert.alert('Incomplete', 'Please rate all dimensions before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await SkoFyApi.jobs.submitCustomerReview(jobId, {
        behaviour_rating: ratings.behaviour,
        negotiation_rating: ratings.negotiation,
        payment_rating: ratings.payment,
        environment_rating: ratings.environment,
        comment: comment.trim() || undefined,
      });
      markRatingSubmitted(jobId);
      onClose(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to submit rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={!!jobId} transparent animationType="fade" onRequestClose={skip}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{customerName ? `Rate ${customerName}` : 'Rate this customer'}</Text>
          <Text style={styles.subtitle}>How did the job go?</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
            {DIMENSIONS.map((dim) => (
              <View key={dim} style={styles.row}>
                <Text style={styles.dimLabel}>{dim.charAt(0).toUpperCase() + dim.slice(1)}</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRatings(r => ({ ...r, [dim]: star }))}
                      style={styles.starBtn}
                      accessibilityLabel={`${dim} ${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Star size={28} color={ratings[dim] >= star ? '#FFCE48' : '#D1D5DB'} fill={ratings[dim] >= star ? '#FFCE48' : 'transparent'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment (optional)"
              placeholderTextColor="#9CA3AF"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={skip} disabled={submitting}>
              <Text style={styles.skipText}>Maybe later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} disabled={submitting} onPress={submit}>
              <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Rating'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, alignItems: 'center', maxHeight: '85%',
  },
  title: { fontSize: 20, fontFamily: Fonts.poppinsBold, color: '#111827', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: Fonts.poppins, color: '#6B7280', marginBottom: 20 },
  row: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dimLabel: { fontSize: 14, fontFamily: Fonts.poppinsMedium, color: '#374151', width: 110 },
  starsRow: { flexDirection: 'row', gap: 4 },
  starBtn: { padding: 2 },
  commentInput: {
    width: '100%', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827',
    minHeight: 72, textAlignVertical: 'top', marginBottom: 20,
  },
  actions: { flexDirection: 'row', gap: 12, width: '100%' },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  skipText: { fontSize: 15, fontFamily: Fonts.poppinsMedium, color: '#6B7280' },
  submitBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFCE48', alignItems: 'center' },
  submitText: { fontSize: 15, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
