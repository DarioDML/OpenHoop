import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { initialOf } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function MoreScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, device } = useAppData();
  const initial = initialOf(userData.name);
  const version = Constants.expoConfig?.version ?? '0';
  const deviceParts = [device.model, device.batteryPercent === null ? null : `${device.batteryPercent}${t('unit.percent')}`].filter(
    (part): part is string => part !== null,
  );

  return (
    <Screen header={<TopBar title={t('tabs.more')} back={false} />} tint="neutral" withTabBar testID="more">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('more.profile')}
        onPress={() => router.push('/profile')}
        testID="more-profile"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, minHeight: 72 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          {initial ? <AppText variant="cardTitle">{initial}</AppText> : <Icon name="user" color={colors.textMuted} size={22} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">{userData.name ?? t('more.noName')}</AppText>
          <AppText variant="label" muted>
            {t('more.profileBody')}
          </AppText>
        </View>
        <Icon name="chevronRight" color={colors.textMuted} size={18} />
      </Pressable>

      <CapHeader title={t('more.tools')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'journal', 'purple')} title={t('more.journal')} href="/journal" />
        <ListRow icon={tile(colors, 'moon', 'info')} title={t('more.sleepPlanner')} href="/sleep/planner" />
        <ListRow icon={tile(colors, 'dumbbell', 'warning')} title={t('more.strength')} href="/strength" />
        <ListRow icon={tile(colors, 'report', 'positive')} title={t('more.reports')} href="/plan/weekly-report" />
      </ListGroup>

      <CapHeader title={t('more.settings')} />
      <ListGroup>
        <ListRow
          icon={tile(colors, 'band', 'info')}
          title={t('more.device')}
          value={deviceParts.length > 0 ? deviceParts.join(' · ') : undefined}
          href="/settings/device"
          testID="more-device"
        />
        <ListRow icon={tile(colors, 'settings', 'neutral')} title={t('appSettings.title')} href="/settings/app" testID="more-app" />
        <ListRow icon={tile(colors, 'link', 'purple')} title={t('appSettings.integrations')} href="/settings/integrations" />
        <ListRow icon={tile(colors, 'shield', 'positive')} title={t('privacy.title')} value={t('more.localOnly')} href="/settings/privacy" />
        <ListRow icon={tile(colors, 'target', 'warning')} title={t('aboutx.accuracy.title')} subtitle={t('more.accuracyBody')} href="/settings/accuracy" />
      </ListGroup>

      <CapHeader title={t('more.about')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'info', 'neutral')} title={t('settings.about')} value={t('about.version', { version })} href="/settings/about" testID="more-about" />
        <ListRow icon={tile(colors, 'gift', 'pink')} title={t('aboutx.support')} href="/settings/support" />
      </ListGroup>
    </Screen>
  );
}
