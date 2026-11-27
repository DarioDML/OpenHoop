import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Field, Segmented } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { openInAppBrowser } from '@/ui/manage/inAppBrowser';
import { DONATION_AMOUNTS_USD, donationUrl, parseDonationAmount, REPO_URL, type DonationFrequency } from '@/ui/manage/links';
import { tile } from '@/ui/manage/tiles';
import { Screen } from '@/ui/Screen';
import { radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type AmountChoice = (typeof DONATION_AMOUNTS_USD)[number] | 'other';

interface AmountPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

function AmountPill({ label, selected, onPress, testID }: AmountPillProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 48,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: selected ? colors.gold : colors.borderStrong,
        backgroundColor: selected ? colors.surface : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}>
      {selected ? <Icon name="check" color={colors.gold} size={16} strokeWidth={2} /> : null}
      <AppText variant="bodyStrong" color={selected ? colors.text : colors.textMuted} style={{ fontSize: 17 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function SupportScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const [choice, setChoice] = useState<AmountChoice>(5);
  const [customText, setCustomText] = useState('');
  const [frequency, setFrequency] = useState<DonationFrequency>('one-time');
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  const amount = choice === 'other' ? parseDonationAmount(customText) : choice;
  const customInvalid = choice === 'other' && customText.trim() !== '' && amount === null;
  const customHint = t(customInvalid ? 'aboutx.support.customAmountError' : 'aboutx.support.customAmountHint');
  const donateLabel =
    amount === null
      ? t('aboutx.support.donateOther')
      : t(frequency === 'monthly' ? 'aboutx.support.donateMonthly' : 'aboutx.support.donateOnce', { amount });

  const donate = async () => {
    if (amount === null || opening) return;
    setOpening(true);
    setOpenFailed(false);
    const opened = await openInAppBrowser(donationUrl(frequency, amount), colors);
    setOpenFailed(!opened);
    setOpening(false);
  };

  const header = (
    <>
      <TopBar title={t('aboutx.support')} />
      <View style={{ gap: spacing.md }} testID="support-hero">
        <Icon name="gift" color={colors.gold} size={44} />
        <AppText variant="h1" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          {t('aboutx.support.free')}
        </AppText>
        <AppText variant="lead" soft>
          {t('aboutx.support.freeBody')}
        </AppText>
      </View>
    </>
  );

  return (
    <Screen header={header} tint="community" testID="support">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {DONATION_AMOUNTS_USD.map((value) => (
          <AmountPill
            key={value}
            label={t('aboutx.support.amount', { amount: value })}
            selected={choice === value}
            onPress={() => setChoice(value)}
            testID={`donate-amount-${value}`}
          />
        ))}
        <AmountPill label={t('aboutx.support.other')} selected={choice === 'other'} onPress={() => setChoice('other')} testID="donate-amount-other" />
      </View>
      {choice === 'other' ? (
        <Field
          label={t('aboutx.support.customAmount')}
          hint={customHint}
          accessibilityHint={customHint}
          error={customInvalid}
          suffix="USD"
          value={customText}
          onChangeText={setCustomText}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={5}
          autoFocus
          testID="donate-custom-amount"
        />
      ) : null}
      <Segmented
        options={[
          { value: 'one-time', label: t('aboutx.support.oneTime') },
          { value: 'monthly', label: t('aboutx.support.monthly') },
        ]}
        value={frequency}
        onChange={setFrequency}
        testID="donate-frequency"
      />
      <Button label={donateLabel} icon="gift" disabled={amount === null || opening} onPress={() => void donate()} testID="support-donate" />
      {openFailed ? (
        <AppText variant="caption" color={colors.negative} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="support-open-failed">
          {t('aboutx.support.openFailed')}
        </AppText>
      ) : null}
      <AppText variant="caption" muted>
        {t('aboutx.support.donateNote')}
      </AppText>

      <ListGroup>
        <ListRow
          icon={tile(colors, 'export', 'gold')}
          title={t('aboutx.donateData.row')}
          subtitle={t('aboutx.donateData.rowBody')}
          href="/settings/donate-data"
          testID="support-donate-data"
        />
        <ListRow
          icon={tile(colors, 'code', 'plain')}
          title={t('aboutx.support.contribute')}
          subtitle={t('aboutx.support.contributeBody')}
          onPress={() => void Linking.openURL(`${REPO_URL}/issues`)}
          testID="support-issues"
        />
        <ListRow
          icon={tile(colors, 'link', 'plain')}
          title={t('aboutx.source')}
          subtitle={REPO_URL}
          onPress={() => void Linking.openURL(REPO_URL)}
          testID="support-repo"
        />
      </ListGroup>
    </Screen>
  );
}
