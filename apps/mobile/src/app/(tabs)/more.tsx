import Constants from 'expo-constants';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { initialOf } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { Screen } from '@/ui/Screen';
import { radius, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function MoreScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, device } = useAppData();
  const initial = initialOf(userData.name);
  const version = Constants.expoConfig?.version ?? '0';
  const model = device.model === null ? null : t('more.deviceModel', { model: device.model });
  const deviceParts = [model, device.batteryPercent === null ? null : `${device.batteryPercent}${t('unit.percent')}`].filter(
    (part): part is string => part !== null,
  );
  const avatar = (
    <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
      {initial ? <AppText variant="bodyStrong">{initial}</AppText> : <Icon name="user" color={colors.textMuted} size={20} />}
    </View>
  );

  return (
    <Screen header={<TopBar title={t('tabs.more')} back={false} />} tint="neutral" withTabBar testID="more">
      <ListGroup>
        <ListRow leading={avatar} title={userData.name ?? t('more.noName')} subtitle={t('more.profileBody')} href="/profile" testID="more-profile" />
      </ListGroup>

      <CapHeader title={t('more.tools')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'journal', 'purple')} title={t('more.journal')} href="/journal" />
        <ListRow icon={tile(colors, 'alarm', 'purple')} title={t('more.sleepPlanner')} href="/sleep/planner" />
        <ListRow icon={tile(colors, 'dumbbell', 'load')} title={t('more.strength')} href="/strength" />
        <ListRow icon={tile(colors, 'report', 'plain')} title={t('more.reports')} href="/plan/weekly-report" />
      </ListGroup>

      <CapHeader title={t('more.settings')} />
      <ListGroup>
        <ListRow
          icon={tile(colors, 'band', 'plain')}
          title={t('more.device')}
          subtitle={deviceParts.length > 0 ? deviceParts.join(' · ') : undefined}
          href="/settings/device"
          testID="more-device"
        />
        <ListRow icon={tile(colors, 'settings', 'plain')} title={t('appSettings.title')} href="/settings/app" testID="more-app" />
        <ListRow icon={tile(colors, 'link', 'plain')} title={t('appSettings.integrations')} href="/settings/integrations" testID="more-integrations" />
        <ListRow icon={tile(colors, 'lock', 'positive')} title={t('privacy.title')} subtitle={t('more.localOnly')} href="/settings/privacy" testID="more-privacy" />
        <ListRow icon={tile(colors, 'target', 'info')} title={t('more.accuracy')} subtitle={t('more.accuracyBody')} href="/settings/accuracy" testID="more-accuracy" />
      </ListGroup>

      <CapHeader title={t('more.about')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'info', 'plain')} title={t('more.help')} subtitle={t('more.helpBody')} href="/settings/terms" testID="more-help" />
        <ListRow icon={tile(colors, 'code', 'plain')} title={t('settings.about')} subtitle={t('more.aboutBody', { version })} href="/settings/about" testID="more-about" />
        <ListRow icon={tile(colors, 'gift', 'gold')} title={t('aboutx.support')} href="/settings/support" testID="more-support" />
      </ListGroup>
    </Screen>
  );
}
