import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button, Segmented } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { DONATION_AMOUNTS_USD, donationUrl, REPO_URL, type DonationFrequency } from '@/ui/manage/links';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { spacing, useTheme } from '@/ui/theme';

const DEFAULT_AMOUNT_USD = 5;

export default function SupportScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const [amount, setAmount] = useState<number | null>(DEFAULT_AMOUNT_USD);
  const [frequency, setFrequency] = useState<DonationFrequency>('one-time');

  const donateLabel =
    amount === null
      ? t('aboutx.support.donateOther')
      : t(frequency === 'monthly' ? 'aboutx.support.donateMonthly' : 'aboutx.support.donateOnce', { amount });

  return (
    <SettingsPage title={t('aboutx.support')} tint="neutral" testID="support">
      <Card style={{ gap: spacing.sm }}>
        <Icon name="gift" color={colors.gold} size={32} />
        <AppText variant="h1">{t('aboutx.support.free')}</AppText>
        <AppText variant="body" muted>
          {t('aboutx.support.freeBody')}
        </AppText>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {DONATION_AMOUNTS_USD.map((value) => (
          <Pill
            key={value}
            label={t('aboutx.support.amount', { amount: value })}
            selected={amount === value}
            onPress={() => setAmount(value)}
            testID={`donate-amount-${value}`}
          />
        ))}
        <Pill label={t('aboutx.support.other')} selected={amount === null} onPress={() => setAmount(null)} testID="donate-amount-other" />
      </View>
      <Segmented
        options={[
          { value: 'one-time', label: t('aboutx.support.oneTime') },
          { value: 'monthly', label: t('aboutx.support.monthly') },
        ]}
        value={frequency}
        onChange={setFrequency}
        testID="donate-frequency"
      />
      <Button label={donateLabel} icon="gift" onPress={() => void Linking.openURL(donationUrl(frequency, amount))} testID="support-donate" />
      <AppText variant="caption" muted>
        {t('aboutx.support.donateNote')}
      </AppText>

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
