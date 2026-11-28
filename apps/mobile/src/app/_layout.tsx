import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, type Theme } from 'expo-router';
import type { ComponentProps } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { CoachProvider } from '@/coach/CoachProvider';
import { LiveProvider } from '@/data/LiveProvider';
import { expoNotifier } from '@/data/notifier';
import { StravaProvider } from '@/strava/StravaProvider';
import { ExplainProvider } from '@/ui/explain/ExplainProvider';
import { useAppFonts } from '@/ui/fonts';
import { useTheme } from '@/ui/theme';

type ScreenOptions = NonNullable<ComponentProps<typeof Stack.Screen>['options']>;

const SHEET_ROUTES = ['action-center', 'home/date-picker', 'settings/safety-lock'] as const;

const SHEET_OPTIONS: ScreenOptions = {
  presentation: 'transparentModal',
  animation: 'slide_from_bottom',
  contentStyle: { backgroundColor: 'transparent' },
};

function RootStack() {
  const { colors, dark } = useTheme();
  useEffect(() => expoNotifier.onOpened(() => router.push('/home/notifications')), []);
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, presentation: 'card', contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        {SHEET_ROUTES.map((name) => (
          <Stack.Screen key={name} name={name} options={SHEET_OPTIONS} />
        ))}
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const { colors } = useTheme();
  return (
    <LiveProvider>
      {fontsReady ? (
        <CoachProvider>
          <StravaProvider>
            <ExplainProvider>
              <RootStack />
            </ExplainProvider>
          </StravaProvider>
        </CoachProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background }} />
      )}
    </LiveProvider>
  );
}
