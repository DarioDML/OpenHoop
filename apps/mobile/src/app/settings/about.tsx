import Constants from 'expo-constants';
import { Linking, View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { REPO_URL } from '@/ui/manage/links';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing, useTheme } from '@/ui/theme';

const LEVELS: ReadonlyArray<ParityLevel> = ['A', 'B', 'C', 'D'];

export default function AboutScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const version = Constants.expoConfig?.version ?? '0';

  return (
    <SettingsPage title={t('settings.about')} tint="neutral" testID="about">
      <Card style={{ gap: spacing.md }}>
        <AppText variant="cardTitle">
          Open<AppText variant="cardTitle" style={{ fontWeight: '500' }}>Hoop</AppText>
        </AppText>
        <AppText variant="bodyStrong">{t('about.version', { version })}</AppText>
        <AppText variant="body">{t('about.local')}</AppText>
      </Card>

      <CapHeader title={t('aboutx.licence')} />
      <ListGroup>
        <ListRow icon={tile(colors, 'code', 'info')} title={t('aboutx.licenceTitle')} subtitle={t('aboutx.licenceBody')} chevron={false} />
        <ListRow
          icon={tile(colors, 'link', 'neutral')}
          title={t('aboutx.source')}
          subtitle={REPO_URL}
          onPress={() => void Linking.openURL(REPO_URL)}
          testID="about-source"
        />
        <ListRow
          icon={tile(colors, 'journal', 'neutral')}
          title={t('aboutx.thirdParty')}
          subtitle={t('aboutx.thirdPartyBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/blob/master/THIRD_PARTY_NOTICES.md`)}
        />
      </ListGroup>

      <Card tone="warning" style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong">{t('aboutx.notMedical')}</AppText>
        <AppText variant="body">{t('about.disclaimer')}</AppText>
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong">{t('aboutx.notAffiliated')}</AppText>
        <AppText variant="body">{t('about.affiliation')}</AppText>
      </Card>

      <CapHeader title={t('about.levels')} />
      <Card style={{ gap: spacing.md }}>
        {LEVELS.map((level) => (
          <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ParityBadge level={level} />
            <AppText variant="body" style={{ flex: 1 }}>
              {t(`level.${level}`)}
            </AppText>
          </View>
        ))}
        <Button label={t('aboutx.accuracyLink')} variant="tertiary" onPress={() => void Linking.openURL(`${REPO_URL}#readme`)} />
      </Card>

      <ListGroup>
        <ListRow icon={tile(colors, 'code', 'purple')} title={t('dev.title')} href="/settings/developer" testID="about-developer" />
      </ListGroup>
    </SettingsPage>
  );
}
