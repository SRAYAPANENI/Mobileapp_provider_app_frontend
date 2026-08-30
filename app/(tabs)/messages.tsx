import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MessageSquare } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function MessagesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 2000);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.innerContainer}>
          <MessageSquare size={64} color={themeColors.brand} />
          <ThemedText style={styles.text}>Messages</ThemedText>
          <ThemedText style={styles.subtext}>Chat with customers regarding your job assignments.</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.surface },
    scrollContent: { flexGrow: 1 },
    innerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      marginTop: 100,
    },
    text: { marginTop: 20, fontSize: 24, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    subtext: { marginTop: 10, textAlign: 'center', color: t.textSecondary, fontFamily: Fonts.poppins },
  });
}
