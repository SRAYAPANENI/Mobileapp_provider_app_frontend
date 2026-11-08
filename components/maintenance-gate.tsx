import AnimatedBrandMark from '@/components/animated-brand-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TokenStore } from '@/services/api';
import { useActiveJobs } from '@/services/queries/jobs';
import { useAppConfig } from '@/services/queries/app-config';
import { Wrench } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

// Set from the admin portal (app_configs.maintenance_*) — same unmount-the-
// whole-tree approach as AppLockGate, and for the same reason: any open
// native Modal would still show through a mere overlay anyway.
//
// A session with a job already under way (useActiveJobs — the same list
// Home polls) is let through rather than stranded mid-job; maintenance only
// blocks launch and login for everyone else. Logged-out entirely is always
// blocked while on.
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);

  const { data: config } = useAppConfig();
  // Resolved once up front and passed as useActiveJobs' `enabled` — without
  // it, this gate (mounted before any login happens) would fire GET
  // /jobs/active with no token on every cold start, 401, and trip the app's
  // global "Signed Out" handler (services/api.ts endSession) for someone
  // who was never logged in to begin with.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => { TokenStore.getAccessToken().then((t) => setLoggedIn(!!t)); }, []);
  const { data: activeJobs } = useActiveJobs<{ id: string }>(false, loggedIn === true);

  const hasActiveWork = loggedIn === true && (activeJobs?.length ?? 0) > 0;
  const blocked = !!config?.maintenance.enabled && !hasActiveWork;

  if (blocked) {
    return (
      <ThemedView style={styles.container}>
        <AnimatedBrandMark size={56} nameSize={32} />
        <Wrench size={28} color={themeColors.textSecondary} style={styles.icon} />
        <ThemedText style={styles.title}>We&apos;ll be right back</ThemedText>
        <ThemedText style={styles.subtitle}>
          {config?.maintenance.message || "We're making some improvements. Back soon!"}
        </ThemedText>
        {config?.maintenance.until && (
          <ThemedText style={styles.until}>
            Expected back {new Date(config.maintenance.until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        )}
      </ThemedView>
    );
  }

  return <>{children}</>;
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    icon: { marginTop: 24 },
    title: { fontFamily: Fonts.poppinsBold, fontSize: 22, color: t.textPrimary, marginTop: 12 },
    subtitle: { fontFamily: Fonts.poppins, fontSize: 14, color: t.textSecondary, textAlign: 'center', marginTop: 8 },
    until: { fontFamily: Fonts.poppinsSemiBold, fontSize: 13, color: t.textSecondary, textAlign: 'center', marginTop: 16 },
  });
}
