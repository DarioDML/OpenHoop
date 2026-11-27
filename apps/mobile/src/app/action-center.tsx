import type { Href } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import type { IconName } from '@/ui/Icon';
import { SheetScreen } from '@/ui/SheetScreen';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';
import { ActionTile } from '@/ui/Tiles';

type Tone = 'accent' | 'text' | 'purple' | 'negative' | 'health' | 'positive';

interface Entry {
  id: string;
  label: TranslationKey;
  icon: IconName;
  tone: Tone;
  href: Href;
}

const PRIMARY: ReadonlyArray<Entry> = [
  { id: 'start', label: 'home.startActivity', icon: 'playCircle', tone: 'accent', href: '/activity/start' },
  { id: 'add', label: 'home.addActivity', icon: 'calendarPlus', tone: 'text', href: '/activity/add' },
];

const SECONDARY: ReadonlyArray<Entry> = [
  { id: 'strength', label: 'home.action.strength', icon: 'dumbbell', tone: 'accent', href: '/strength' },
  { id: 'journal', label: 'home.action.journal', icon: 'journal', tone: 'purple', href: '/journal' },
  { id: 'planner', label: 'home.action.plannerAlarm', icon: 'alarm', tone: 'purple', href: '/sleep/planner' },
  { id: 'ecg', label: 'home.action.ecg', icon: 'pulse', tone: 'negative', href: '/health/ecg' },
  { id: 'symptoms', label: 'home.action.symptoms', icon: 'clipboard', tone: 'health', href: '/health/symptoms' },
  { id: 'labs', label: 'home.action.labs', icon: 'flask', tone: 'health', href: '/health/labs-upload' },
  { id: 'logSleep', label: 'home.action.logSleep', icon: 'edit', tone: 'purple', href: '/sleep/edit' },
  { id: 'breathing', label: 'home.action.breathing', icon: 'wind', tone: 'positive', href: '/health/breathing' },
];

const COLUMNS = 3;

function toneColor(colors: ColorTokens, tone: Tone): string {
  if (tone === 'accent') return colors.accent;
  if (tone === 'purple') return colors.purple;
  if (tone === 'negative') return colors.negative;
  if (tone === 'health') return colors.zones[1];
  if (tone === 'positive') return colors.positive;
  return colors.text;
}

function rows<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function ActionCenterScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const nowS = Math.floor(Date.now() / 1000);
  const connected = device.connection === 'connected' || device.connection === 'syncing';
  const parts: string[] = [];
  if (device.model !== null) parts.push(t('home.ac.band', { model: device.model }));
  if (device.batteryPercent !== null) parts.push(`${device.batteryPercent}%`);
  parts.push(device.lastSyncAt === null ? t('home.ac.neverSynced') : t('home.ac.lastSync', { ago: formatAgo(t, nowS, device.lastSyncAt) }));
  parts.push(t('home.ac.storedLocally'));

  return (
    <SheetScreen title={t('home.quickActions')} testID="action-center">
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {PRIMARY.map((entry) => (
            <ActionTile
              key={entry.id}
              testID={`action-${entry.id}`}
              size="large"
              icon={entry.icon}
              iconColor={toneColor(colors, entry.tone)}
              background={entry.id === 'start' ? colors.tint.load : colors.surfaceAlt}
              label={t(entry.label)}
              href={entry.href}
            />
          ))}
        </View>
        {rows(SECONDARY, COLUMNS).map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
            {row.map((entry) => (
              <ActionTile
                key={entry.id}
                testID={`action-${entry.id}`}
                icon={entry.icon}
                iconColor={toneColor(colors, entry.tone)}
                label={t(entry.label)}
                href={entry.href}
                accessibilityHint={entry.id === 'ecg' ? t('health.mg.badge') : undefined}
                badge={entry.id === 'ecg' ? { label: t('home.ac.mg'), color: colors.pink, background: colors.pinkSoft } : undefined}
              />
            ))}
            {Array.from({ length: COLUMNS - row.length }, (_, i) => (
              <View key={`gap-${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
      <View
        testID="action-center-status"
        accessible
        accessibilityLabel={`${connected ? t('home.ac.connected') : t('home.ac.notConnected')}. ${parts.join(' · ')}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: spacing.md,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceAlt,
        }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? colors.positive : colors.textFaint }} />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {parts.join(' · ')}
        </AppText>
      </View>
    </SheetScreen>
  );
}
