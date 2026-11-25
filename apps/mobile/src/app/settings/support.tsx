import { Linking } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { REPO_URL } from '@/ui/manage/links';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { useTheme } from '@/ui/theme';


export default function SupportScreen() {
  const { t } = useT();
  const { colors } = useTheme();

  return (
    <SettingsPage title={t('aboutx.support')} tint="neutral" testID="support">
      <Card style={{ gap: 6 }}>
        <AppText variant="cardTitle">{t('aboutx.support.free')}</AppText>
        <AppText variant="body" muted>
          {t('aboutx.support.freeBody')}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow
          icon={tile(colors, 'code', 'positive')}
          title={t('aboutx.support.contribute')}
          subtitle={t('aboutx.support.contributeBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/issues`)}
          testID="support-issues"
        />
        <ListRow
          icon={tile(colors, 'link', 'info')}
          title={t('aboutx.source')}
          subtitle={REPO_URL}
          onPress={() => void Linking.openURL(REPO_URL)}
          testID="support-repo"
        />
      </ListGroup>
    </SettingsPage>
  );
}
