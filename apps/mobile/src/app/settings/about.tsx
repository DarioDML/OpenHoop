import Constants from 'expo-constants';
import { Linking, Platform, View } from 'react-native';

import type { ParityLevel } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { REPO_URL } from '@/ui/manage/links';
import { MonoLine } from '@/ui/manage/PageHero';
import { tile } from '@/ui/manage/tiles';
import { ParityBadge } from '@/ui/ParityBadge';
import { Ring } from '@/ui/Ring';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const LEVELS: ReadonlyArray<ParityLevel> = ['A', 'B', 'C', 'D'];

function AppMark() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Ring fraction={0.88} color={colors.accent} size={60} strokeWidth={9} trackColor={colors.surfaceAlt} />
      <View style={{ position: 'absolute', top: 15, left: 45, width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.positive }} />
    </View>
  );
}

export default function AboutScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const version = Constants.expoConfig?.version ?? '0';
  const build = (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode) ?? null;

  const header = (
    <>
      <TopBar title={t('settings.about')} />
      <View style={{ alignItems: 'center', gap: spacing.md }} testID="about-hero">
        <AppMark />
        <AppText variant="h1" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          OpenHoop
        </AppText>
        <MonoLine text={build === null ? t('about.version', { version }) : t('aboutx.versionBuild', { version, build })} testID="about-version" />
        <AppText variant="label" muted style={{ textAlign: 'center' }}>
          {t('about.local')}
        </AppText>
      </View>
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="about">
      <ListGroup>
        <ListRow
          title={t('aboutx.licenceTitle')}
          subtitle={t('aboutx.licenceBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/blob/master/LICENSE`)}
          testID="about-licence"
        />
        <ListRow icon={tile(colors, 'code', 'plain')} title={t('aboutx.source')} subtitle={REPO_URL} onPress={() => void Linking.openURL(REPO_URL)} testID="about-source" />
        <ListRow
          title={t('aboutx.contributors')}
          subtitle={t('aboutx.contributorsBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/graphs/contributors`)}
          testID="about-contributors"
        />
        <ListRow
          title={t('aboutx.thirdParty')}
          subtitle={t('aboutx.thirdPartyBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/blob/master/THIRD_PARTY_NOTICES.md`)}
          testID="about-third-party"
        />
      </ListGroup>

      <Card style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surfaceAlt }}>
        <Icon name="info" color={colors.textSoft} size={16} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{t('aboutx.notAffiliated')}</AppText>
          <AppText variant="body" soft>
            {t('aboutx.affiliationBody')}
          </AppText>
        </View>
      </Card>
      <Card tone="warning" style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong">{t('aboutx.notMedical')}</AppText>
        <AppText variant="body">{t('about.disclaimer')}</AppText>
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
        <ListRow icon={tile(colors, 'help', 'info')} title={t('terms.title')} subtitle={t('terms.aboutBody')} href="/settings/terms" testID="about-terms" />
        <ListRow icon={tile(colors, 'code', 'purple')} title={t('dev.title')} href="/settings/developer" testID="about-developer" />
      </ListGroup>
    </Screen>
  );
}
