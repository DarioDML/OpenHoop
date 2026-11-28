import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { featureEnabled } from '@/net/features';
import { useStrava } from '@/strava/context';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { PageHero } from '@/ui/manage/PageHero';
import { tile } from '@/ui/manage/tiles';
import { NotBuilt } from '@/ui/NotBuilt';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';
import { stravaStatus } from '@/ui/strava/status';

type Explained = 'plugin' | 'teams' | null;

export default function ConnectProviderScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData } = useAppData();
  const { state } = useStrava();
  const [explained, setExplained] = useState<Explained>(null);
  const none = <Chip label={t('appSettings.provider.none')} small />;
  const status = stravaStatus(state, featureEnabled(userData.network, 'strava'));

  const header = (
    <>
      <TopBar title={t('appSettings.provider.title')} />
      <PageHero icon="plug" iconColor={colors.text} title={t('appSettings.provider.partnerTitle')} body={t('appSettings.provider.heroBody')} layout="stack" testID="provider-hero" />
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="connect-provider">
      <ListGroup>
        <ListRow icon={tile(colors, 'drop', 'positive')} title={t('appSettings.provider.labs')} subtitle={t('appSettings.provider.labsBody')} right={none} chevron={false} testID="provider-labs" />
        <ListRow icon={tile(colors, 'user', 'plain')} title={t('appSettings.provider.clinician')} subtitle={t('appSettings.provider.clinicianBody')} right={none} chevron={false} testID="provider-clinician" />
        <ListRow icon={tile(colors, 'journal', 'plain')} title={t('appSettings.provider.records')} subtitle={t('appSettings.provider.recordsBody')} right={none} chevron={false} testID="provider-records" />
        <ListRow
          icon={tile(colors, 'community', 'gold')}
          title={t('appSettings.provider.teams')}
          subtitle={t('appSettings.provider.teamsBody')}
          right={<Chip label={t('appSettings.provider.plugin')} tone="warning" small />}
          onPress={() => setExplained('teams')}
          testID="provider-teams"
        />
      </ListGroup>
      <Button label={t('appSettings.provider.addPlugin')} icon="plus" variant="soft" onPress={() => setExplained('plugin')} testID="provider-add-plugin" />
      <AppText variant="label" muted>
        {t('appSettings.provider.consent')}
      </AppText>

      <Card>
        <AppText variant="label" muted>
          {t('appSettings.provider.partnerBody')}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow
          icon={tile(colors, 'load', 'warning')}
          title={t('appSettings.integrations.strava')}
          subtitle={t('strava.integrationsBody')}
          right={<Chip small label={t(`strava.status.${status}`)} tone={status === 'connected' ? 'positive' : status === 'reconnect' ? 'warning' : 'neutral'} />}
          href="/settings/strava"
          testID="provider-strava"
        />
      </ListGroup>

      <Sheet visible={explained !== null} onClose={() => setExplained(null)} title={t('appSettings.provider.pluginTitle')} testID="provider-sheet">
        <View>
          {explained === 'teams' ? (
            <NotBuilt issue="community" body={t('appSettings.provider.teamsNotBuilt')} testID="provider-teams-not-built" />
          ) : (
            <NotBuilt issue="integrations" body={t('appSettings.provider.pluginBody')} testID="provider-plugin-not-built" />
          )}
        </View>
      </Sheet>
    </Screen>
  );
}
