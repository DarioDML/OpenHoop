import { router, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Page } from '@/ui/daily/bits';
import { Icon, type IconName } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Entry {
  id: string;
  label: TranslationKey;
  icon: IconName;
  href: string;
}

const ENTRIES: ReadonlyArray<Entry> = [
  { id: 'start', label: 'home.startActivity', icon: 'play', href: '/activity/start' },
  { id: 'add', label: 'home.addActivity', icon: 'plus', href: '/activity/add' },
  { id: 'strength', label: 'home.action.strength', icon: 'dumbbell', href: '/strength' },
  { id: 'journal', label: 'home.action.journal', icon: 'journal', href: '/journal' },
  { id: 'planner', label: 'home.action.planner', icon: 'moon', href: '/sleep/planner' },
  { id: 'logSleep', label: 'home.action.logSleep', icon: 'edit', href: '/sleep/edit' },
  { id: 'breathing', label: 'home.action.breathing', icon: 'wind', href: '/health/breathing' },
  { id: 'ecg', label: 'home.action.ecg', icon: 'pulse', href: '/health/ecg' },
  { id: 'symptoms', label: 'home.action.symptoms', icon: 'alert', href: '/health/symptoms' },
  { id: 'labs', label: 'home.action.labs', icon: 'report', href: '/health/labs-upload' },
];

export default function ActionCenterScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const nowS = Math.floor(Date.now() / 1000);
  const parts: string[] = [];
  if (device.batteryPercent !== null) parts.push(t('home.battery', { percent: device.batteryPercent }));
  parts.push(device.lastSyncAt === null ? t('home.neverSynced') : t('home.syncedShort', { ago: formatAgo(t, nowS, device.lastSyncAt) }));

  return (
    <Page title={t('a11y.actionCenter')} close testID="action-center">
      <Stack.Screen options={{ presentation: 'modal' }} />
      <AppText variant="capLarge" muted>
        {t('home.quickActions')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {ENTRIES.map((entry) => (
          <Pressable
            key={entry.id}
            testID={`action-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(entry.label)}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => ({
              flexBasis: '47%',
              flexGrow: 1,
              minHeight: 88,
              padding: spacing.lg,
              gap: spacing.sm,
              justifyContent: 'center',
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Icon name={entry.icon} color={colors.accent} size={22} />
            <AppText variant="bodyStrong">{t(entry.label)}</AppText>
          </Pressable>
        ))}
      </View>
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {parts.join(' · ')}
      </AppText>
    </Page>
  );
}
