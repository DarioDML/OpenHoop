import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { StateCard, type StateTone } from '@/ui/StateCard';
import type { IconName } from '@/ui/Icon';
import { spacing } from '@/ui/theme';

interface Example {
  id: string;
  icon: IconName;
  tone: StateTone;
  title: TranslationKey;
  body: TranslationKey;
  params?: Record<string, number>;
  action?: { label: TranslationKey; route: Href };
}

const EXAMPLES: readonly Example[] = [
  { id: 'notConnected', icon: 'bluetooth', tone: 'warning', title: 'states.notConnected.title', body: 'states.notConnected.body', action: { label: 'band.pair', route: '/onboarding/pair' } },
  { id: 'syncing', icon: 'sync', tone: 'info', title: 'states.syncing.title', body: 'states.syncing.body' },
  { id: 'lowBattery', icon: 'battery', tone: 'warning', title: 'states.lowBattery.title', body: 'states.lowBattery.body', params: { percent: 12 } },
  { id: 'charging', icon: 'plug', tone: 'positive', title: 'states.charging.title', body: 'states.charging.body' },
  { id: 'calibrating', icon: 'moon', tone: 'purple', title: 'states.calibrating.title', body: 'states.calibrating.body', params: { count: 2 } },
  { id: 'noData', icon: 'calendar', tone: 'neutral', title: 'states.noData.title', body: 'states.noData.body', action: { label: 'states.noData.action', route: '/' } },
  { id: 'needsMg', icon: 'lock', tone: 'pink', title: 'states.needsMg.title', body: 'states.needsMg.body' },
  { id: 'offline', icon: 'offline', tone: 'info', title: 'states.offline.title', body: 'states.offline.body' },
  { id: 'dataAtRisk', icon: 'alert', tone: 'negative', title: 'states.dataAtRisk.title', body: 'states.dataAtRisk.body', params: { days: 7 }, action: { label: 'band.sync', route: '/settings/device' } },
  { id: 'firstDay', icon: 'moon', tone: 'purple', title: 'states.firstDay.title', body: 'states.firstDay.body' },
];

export default function StatesGalleryScreen() {
  const { t } = useT();

  return (
    <SettingsPage title={t('states.gallery.title')} tint="neutral" testID="states-gallery">
      <AppText variant="label" muted>
        {t('states.gallery.intro')}
      </AppText>
      {EXAMPLES.map((example) => {
        const action = example.action;
        return (
          <View key={example.id} style={{ gap: spacing.sm }}>
            <Chip label={t('states.gallery.example')} small />
            <StateCard
              testID={`state-example-${example.id}`}
              icon={example.icon}
              tone={example.tone}
              title={t(example.title, example.params)}
              body={t(example.body, example.params)}
              actionLabel={action ? t(action.label) : undefined}
              onAction={action ? () => router.push(action.route) : undefined}
            />
          </View>
        );
      })}
    </SettingsPage>
  );
}
