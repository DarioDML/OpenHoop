import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { LiveProvider } from '@/data/LiveProvider';
import { expoNotifier } from '@/data/notifier';
import { useAppFonts } from '@/ui/fonts';
import { darkColors, useTheme } from '@/ui/theme';

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
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
  return (
    <LiveProvider>
      <RootStack />
    </LiveProvider>
  );
}
