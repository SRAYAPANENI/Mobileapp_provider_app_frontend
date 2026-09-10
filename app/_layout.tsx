import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProvider } from '@/context/AppContext';
import { initCallManager, registerFcmToken } from '@/services/callManager';
import { TokenStore, setSessionExpiredHandler } from '@/services/api';
import { NetworkStatusBanner } from '@/components/network-status-banner';
import '@/services/background-location'; // registers background GPS task at startup

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded, error] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  // Tracked via ref (not read directly in the effect below) so the
  // session-expired handler — registered once on mount — always sees the
  // *current* route rather than closing over whatever it was at register time.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  // Hiding this on fontsLoaded alone fires before the actual splash route
  // (app/index.tsx — a fairly heavy animated SVG mesh) has laid out and
  // painted a frame, so the native splash disappears into a blank/white gap
  // and the custom animation is sometimes never seen before it redirects.
  // Hiding on the rendered tree's own onLayout below waits for real content
  // instead; this effect stays only as a safety net for a font *load error*,
  // where there may be nothing else to layout-trigger the hide.
  useEffect(() => {
    if (error) {
      SplashScreen.hideAsync();
    }
  }, [error]);

  const handleRootLayout = () => {
    SplashScreen.hideAsync();
  };

  useEffect(() => {
    initCallManager();
    TokenStore.getAccessToken().then(token => {
      if (token) registerFcmToken();
    });
    setSessionExpiredHandler(() => {
      // A stale leftover token can 401 a background call (e.g. FCM
      // registration on launch) seconds after the user already landed on
      // /login themselves. Redirecting to /login again in that case still
      // triggers a fresh mount of the screen, silently wiping anything
      // they'd already typed — so skip the redirect entirely when we're
      // already there.
      if (pathnameRef.current !== '/login') {
        // Previously a silent, unexplained router.replace() — most jarring
        // when it fires because the user tapped a notification (a call
        // invite, a chat message) and got dumped onto the login screen
        // mid-transition with zero context, looking exactly like a crash.
        // This is the one place that redirect can originate from, so a
        // generic explanation here covers every trigger (a genuinely
        // expired session, or this account's refresh token having been
        // revoked by a newer login elsewhere for the same role).
        Alert.alert('Signed Out', 'Your session has ended. Please log in again.');
        router.replace('/login' as any);
      }
    });
  }, []);

  if (!loaded && !error) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={handleRootLayout}>
      <KeyboardProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AppProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" options={{ animation: 'fade' }} />
              <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="job-details" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="navigate-to-site" options={{ animation: 'slide_from_bottom' }} />
            </Stack>
            <NetworkStatusBanner />
            {/* "auto" follows the device's actual system theme, not our
                locked-light useColorScheme — pinned to dark icons to match. */}
            <StatusBar style="dark" />
          </AppProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </View>
  );
}
