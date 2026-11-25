import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { Icon } from '@/ui/Icon';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

export default function CommunityScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <Screen header={<TopBar title={t('tabs.community')} back={false} />} tint="community" withTabBar testID="community">
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.positiveSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="community" color={colors.positive} size={22} />
          </View>
          <AppText variant="cardTitle" style={{ flex: 1 }}>
            {t('community.teamsTitle')}
          </AppText>
        </View>
        <AppText variant="body" muted>
          {t('community.teamsBody')}
        </AppText>
      </Card>

      <ListGroup>
        <ListRow icon={tile(colors, 'share', 'info')} title={t('community.shareActivity')} subtitle={t('community.shareActivityBody')} chevron={false} />
        <ListRow icon={tile(colors, 'report', 'purple')} title={t('community.shareReport')} subtitle={t('community.shareReportBody')} chevron={false} />
        <ListRow icon={tile(colors, 'plug', 'positive')} title={t('community.selfHost')} subtitle={t('community.selfHostBody')} chevron={false} />
      </ListGroup>

      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('community.ownTitle')}</AppText>
        <AppText variant="label" muted>
          {t('community.ownBody')}
        </AppText>
      </Card>
      <NotBuilt issue="community" />
    </Screen>
  );
}
