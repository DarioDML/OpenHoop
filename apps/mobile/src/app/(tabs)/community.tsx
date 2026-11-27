import { Linking, View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { latestShareHref } from '@/ui/daily/shareTarget';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt, issueUrl } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

function PlugBadge({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.goldSoft }} testID="community-plugin-badge">
      <AppText variant="label" color={colors.gold} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

export default function CommunityScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { days, activities } = useAppData();
  const shareHref = latestShareHref(days, activities);

  return (
    <Screen
      tint="community"
      withTabBar
      testID="community"
      header={
        <>
          <TopBar title={t('tabs.community')} back={false} />
          <View style={{ gap: spacing.md }}>
            <Icon name="community" color={colors.gold} size={40} />
            <AppText variant="h1" accessibilityRole="header">
              {t('community.teamsTitle')}
            </AppText>
            <AppText variant="lead" soft>
              {t('community.intro')}
            </AppText>
          </View>
        </>
      }>
      <ListGroup>
        <ListRow
          testID="community-share"
          icon={tile(colors, 'share')}
          title={t('community.shareActivity')}
          subtitle={shareHref === null ? t('community.noActivity') : t('community.shareActivityBody')}
          href={shareHref ?? undefined}
        />
        <ListRow testID="community-report" icon={tile(colors, 'file')} title={t('community.shareReport')} subtitle={t('community.reportBody')} href="/plan/weekly-report" />
        <ListRow
          testID="community-self-host"
          icon={tile(colors, 'plug', 'gold')}
          title={t('community.selfHost')}
          subtitle={t('community.selfHostBody')}
          right={<PlugBadge label={t('community.plugin')} />}
          onPress={() => void Linking.openURL(issueUrl('community'))}
        />
      </ListGroup>

      <Card style={{ gap: 4, backgroundColor: colors.surfaceAlt, flexDirection: 'row' }}>
        <View style={{ paddingTop: 4 }}>
          <Icon name="lock" color={colors.textMuted} size={14} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{t('community.ownTitle')}</AppText>
          <AppText variant="label" muted>
            {t('community.ownBody')}
          </AppText>
        </View>
      </Card>
      <NotBuilt issue="community" />
    </Screen>
  );
}
