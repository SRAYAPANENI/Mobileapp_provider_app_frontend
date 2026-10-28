import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { router } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  HelpCircle,
  MessageCircle,
  Search
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, TouchableOpacity, View, RefreshControl } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { TextInput } from '@/components/scaled-text';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';

const FAQS = [
  {
    id: '1',
    question: 'How do I accept a job?',
    answer: 'Browse nearby job requests on your Home tab and tap Apply. If the customer hires you, it moves to your Active jobs — head to the Service Room to start the on-site inspection when you arrive.',
  },
  {
    id: '2',
    question: 'What is the platform fee?',
    answer: "Dodorez takes 10% of the first $500 of a job and 4% of the rest — never more than $119 a job; once you've paid $249 in a month, just 2% until the month ends. No lead fees. The rest goes to your connected bank account once the job is complete.",
  },
  {
    id: '3',
    question: 'How do I update my skills?',
    answer: 'Go to your Profile tab and tap "Add Skill" to take a short skill test — passing it adds a verified badge that helps you get matched to more jobs. You can also add "Skill Proof" photos or videos for extra credibility.',
  },
  {
    id: '4',
    question: 'When do I get paid?',
    answer: 'As soon as the job is marked complete and any invoice is settled, your payout is transferred to your connected Stripe account.',
  },
];

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HelpSupportScreen() {
  const bottomInset = useBottomInset();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const loadTickets = React.useCallback(() => {
    return SkoFyApi.supportTickets.list()
      .then((data: any) => setTickets(Array.isArray(data) ? data : []))
      .catch((err: unknown) => console.warn('Failed to load support tickets:', err));
  }, []);

  useEffect(() => {
    loadTickets().finally(() => setLoadingTickets(false));
  }, [loadTickets]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadTickets().finally(() => setRefreshing(false));
  }, [loadTickets]);

  return (
    <ThemedView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Help & Support</ThemedText>
        <Headphones size={24} color="#111827" />
      </View>

      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerStyle={padBottom(styles.scrollContent, bottomInset)}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#FFCE48']}
            tintColor="#FFCE48"
          />
        }
      >
        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for help..."
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/support-chat')}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <MessageCircle size={24} color="#3B82F6" />
            </View>
            <ThemedText style={styles.actionTitle}>Chat with Us</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Recent Tickets */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Provider Support Tickets</ThemedText>
        </View>
        {loadingTickets && <ActivityIndicator color={themeColors.textPrimary} style={{ marginBottom: 16 }} />}
        {!loadingTickets && tickets.length === 0 && (
          <ThemedText style={styles.emptyText}>No support tickets yet.</ThemedText>
        )}
        {tickets.map((ticket) => {
          const resolved = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
          return (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              onPress={() => router.push({ pathname: '/support-chat', params: { ticketId: ticket.id } })}
            >
              <View style={styles.ticketInfo}>
                <ThemedText style={styles.ticketSubject}>{ticket.subject}</ThemedText>
                <ThemedText style={styles.ticketMeta}>Ticket #{ticket.id.slice(0, 8)} • {formatDate(ticket.created_at)}</ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: resolved ? '#ECFDF5' : '#FFFBEB' }]}>
                <ThemedText style={[styles.statusText, { color: resolved ? '#10B981' : '#F59E0B' }]}>
                  {statusLabel(ticket.status)}
                </ThemedText>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* FAQ */}
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Frequently Asked Questions</ThemedText>
        </View>
        {FAQS.map((faq) => {
          const expanded = expandedFaqId === faq.id;
          return (
            <TouchableOpacity
              key={faq.id}
              style={styles.faqItem}
              onPress={() => setExpandedFaqId(expanded ? null : faq.id)}
              activeOpacity={0.75}
            >
              <View style={styles.faqRow}>
                <HelpCircle size={18} color="#6B7280" />
                <ThemedText style={styles.faqText}>{faq.question}</ThemedText>
                <ChevronRight
                  size={18}
                  color="#D1D5DB"
                  style={[styles.faqChevron, expanded && styles.faqChevronExpanded]}
                />
              </View>
              {expanded && <ThemedText style={styles.faqAnswer}>{faq.answer}</ThemedText>}
            </TouchableOpacity>
          );
        })}
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.surface },
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: 20,
      paddingBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.card,
      borderBottomWidth: 1,
      borderBottomColor: t.borderSubtle,
    },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.inputFilled, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, lineHeight: 25, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    scrollContent: { padding: 20, paddingBottom: 40 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 16, height: 50, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: t.borderSubtle },
    searchInput: { flex: 1, marginLeft: 12, fontSize: 15, lineHeight: 19, fontFamily: Fonts.poppins, color: t.textPrimary },
    quickActions: { flexDirection: 'row', gap: 16, marginBottom: 32 },
    actionCard: { flex: 1, backgroundColor: t.card, padding: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    iconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    actionTitle: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: t.textPrimary },
    sectionHeader: { marginBottom: 16, marginTop: 8 },
    sectionTitle: { fontSize: 16, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    ticketCard: { backgroundColor: t.card, padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: t.borderSubtle },
    ticketInfo: { flex: 1 },
    ticketSubject: { fontSize: 15, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: t.textPrimary, marginBottom: 4 },
    ticketMeta: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: t.textMuted },
    emptyText: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textMuted, marginBottom: 16 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold },
    faqItem: { backgroundColor: t.card, padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: t.borderSubtle },
    faqRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    faqText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppins, color: t.textSecondary, flex: 1 },
    faqChevron: { marginLeft: 'auto', transform: [{ rotate: '0deg' }] },
    faqChevronExpanded: { transform: [{ rotate: '90deg' }] },
    faqAnswer: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: t.textSecondary, marginTop: 10, paddingLeft: 30 },
  });
}
