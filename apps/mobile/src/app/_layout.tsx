import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { LiveProvider } from '@/data/LiveProvider';
import { useT } from '@/i18n/useT';
import { useTheme } from '@/ui/theme';

function RootStack() {
  const { colors, dark } = useTheme();
  const { t } = useT();
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
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pairing" options={{ title: t('screen.pairing') }} />
        <Stack.Screen name="readiness" options={{ title: t('screen.readiness') }} />
        <Stack.Screen name="settings" options={{ title: t('screen.settings') }} />
        <Stack.Screen name="selftest" options={{ title: t('screen.selftest') }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <LiveProvider>
      <RootStack />
    </LiveProvider>
  );
}
