import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { caloriesForActivity } from '@/data/energyDerived';
import { ShareUnavailableError, shareSnapshotImage, type CardHandle } from '@/data/shareImage';
import { availableFields, buildSnapshot, DEFAULT_SELECTION, toggleField, type SnapshotField, type SnapshotSelection, type SnapshotStyle } from '@/data/shareSnapshot';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { unixToIsoDate } from '@/lib/dates';
import { useResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen } from '@/ui/activity/parts';
import { ShareCard } from '@/ui/activity/ShareCard';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const FIELD_LABELS: Record<SnapshotField, TranslationKey> = {
  name: 'activity.share.field.name',
  date: 'activity.share.field.date',
  duration: 'activity.details.duration',
  load: 'activity.live.load',
  heartRate: 'activity.share.field.heartRate',
  zones: 'load.zones',
  calories: 'calories.title',
};

export default function ShareActivityScreen() {
  const { userData, profile } = useAppData();
  const { t } = useT();
  const { dark, colors } = useTheme();
  const resolved = useResolvedEntry();
  const cardRef = useRef<CardHandle>(null);
  const [selection, setSelection] = useState<SnapshotSelection>(DEFAULT_SELECTION);
  const [cardStyle, setCardStyle] = useState<SnapshotStyle>(dark ? 'dark' : 'light');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  if (resolved === null) return <NoDataScreen title={t('activity.share.title')} notFound />;

  const { entry, tzOffsetS } = resolved;
  const calories = entry.hasLoad ? caloriesForActivity(entry.metrics.activeMinutes, entry.start, userData, profile) : null;
  const input = { entry, day: unixToIsoDate(entry.start, tzOffsetS), kcal: calories?.estimate?.totalKcal ?? null };
  const view = buildSnapshot(input, selection);
  const title = entry.type !== null ? t(`activity.type.${entry.type}`) : t('workout.default');

  const share = async (): Promise<void> => {
    setSharing(true);
    setError(null);
    try {
      await shareSnapshotImage(cardRef);
    } catch (failure) {
      setError(failure instanceof ShareUnavailableError ? 'error.shareUnavailable' : 'activity.share.error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen
      tint="load"
      testID="share-activity"
      header={
        <>
          <TopBar title={t('activity.share.title')} back={false} close />
          <AppText variant="lead" soft>
            {t('activity.share.intro')}
          </AppText>
        </>
      }>
      <View style={{ alignItems: 'center' }}>
        <ShareCard ref={cardRef} view={view} style={cardStyle} title={title} />
      </View>
      <Segmented
        testID="share-style"
        value={cardStyle}
        onChange={setCardStyle}
        options={[
          { value: 'light', label: t('activity.share.style.light') },
          { value: 'dark', label: t('activity.share.style.dark') },
        ]}
      />
      <ListGroup title={t('activity.share.fields')}>
        {availableFields(input).map((field) => (
          <ListRow
            key={field}
            title={t(FIELD_LABELS[field])}
            subtitle={field === 'name' ? t('activity.share.nameHint') : undefined}
            right={<Toggle value={selection[field]} onChange={(on) => setSelection((current) => toggleField(current, field, on))} label={t(FIELD_LABELS[field])} testID={`share-toggle-${field}`} />}
          />
        ))}
      </ListGroup>
      <Card tone="outline" style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('activity.share.privacy')}
        </AppText>
      </Card>
      {error !== null ? (
        <AppText variant="body" color={colors.negative} testID="share-error" accessibilityLiveRegion="polite">
          {t(error)}
        </AppText>
      ) : null}
      <Button label={sharing ? t('activity.share.sharing') : t('activity.share.action')} onPress={() => void share()} disabled={sharing} testID="share-button" />
    </Screen>
  );
}
