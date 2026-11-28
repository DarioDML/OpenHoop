import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { chartBucketS } from '@/data/activities';
import { useAppData } from '@/data/context';
import { caloriesForActivity } from '@/data/energyDerived';
import { HIDDEN_ZONE_M, usesPace } from '@/data/route';
import { SaveImageError, saveSnapshotImage, ShareUnavailableError, shareSnapshotImage, type CardHandle } from '@/data/shareImage';
import {
  availableFields,
  buildSnapshot,
  DEFAULT_SELECTION,
  snapshotFileName,
  toggleField,
  type SnapshotField,
  type SnapshotFormat,
  type SnapshotSelection,
  type SnapshotStyle,
} from '@/data/shareSnapshot';
import type { HeartRatePoint } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { unixToIsoDate } from '@/lib/dates';
import { formatShortDistance, useUnits } from '@/lib/units';
import { currentNetworkPrefs } from '@/net';
import { featureEnabled, strictestPrefs } from '@/net/features';
import { useResolvedEntry, type ResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen } from '@/ui/activity/parts';
import { ShareCard } from '@/ui/activity/ShareCard';
import { useActivityRoute } from '@/ui/activity/useActivityRoute';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { ListGroup } from '@/ui/ListGroup';
import { ToggleRow } from '@/ui/manage/rows';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { ToggleChip } from '@/ui/ToggleChip';
import { TopBar } from '@/ui/TopBar';

const FIELD_LABELS: Record<Exclude<SnapshotField, 'pace'>, TranslationKey> = {
  route: 'route.title',
  load: 'activity.live.load',
  hrChart: 'activity.share.field.hrChart',
  name: 'activity.share.field.name',
  date: 'activity.share.field.date',
  duration: 'activity.details.duration',
  heartRate: 'activity.share.field.heartRate',
  zones: 'activity.share.field.zones',
  calories: 'calories.title',
};

export default function ShareActivityScreen() {
  const { t } = useT();
  const resolved = useResolvedEntry();
  if (resolved === null) return <NoDataScreen title={t('activity.share.title')} notFound />;
  return <ShareBody resolved={resolved} key={resolved.entry.key} />;
}

function ShareBody({ resolved }: { resolved: ResolvedEntry }) {
  const { userData, profile, heartRateBetween } = useAppData();
  const { t, language } = useT();
  const { dark, colors } = useTheme();
  const units = useUnits();
  const { entry, tzOffsetS } = resolved;
  const cardRef = useRef<CardHandle>(null);
  const route = useActivityRoute(entry.id);
  const [heart, setHeart] = useState<HeartRatePoint[]>([]);
  const [selection, setSelection] = useState<SnapshotSelection>(DEFAULT_SELECTION);
  const [cardStyle, setCardStyle] = useState<SnapshotStyle>(dark ? 'dark' : 'light');
  const [format, setFormat] = useState<SnapshotFormat>('story');
  const [hideEnds, setHideEnds] = useState(userData.hideRouteEnds);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [saved, setSaved] = useState(false);
  const bucketS = chartBucketS(entry.end - entry.start);

  useEffect(() => {
    let alive = true;
    heartRateBetween(entry.start, entry.end, bucketS).then(
      (points) => {
        if (alive) setHeart(points);
      },
      () => {
        if (alive) setHeart([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [entry.start, entry.end, bucketS, heartRateBetween]);

  const calories = entry.hasLoad ? caloriesForActivity(entry.metrics.activeMinutes, entry.start, userData, profile) : null;
  const day = unixToIsoDate(entry.start, tzOffsetS);
  const kcal = calories?.estimate?.totalKcal ?? null;
  const { view, fields } = useMemo(() => {
    const input = { entry, day, kcal, route: route ?? [], heartRate: heart };
    return { view: buildSnapshot(input, selection, { privacyRadiusM: hideEnds ? HIDDEN_ZONE_M : 0 }), fields: availableFields(input) };
  }, [entry, day, kcal, route, heart, selection, hideEnds]);
  const title = entry.type !== null ? t(`activity.type.${entry.type}`) : t('workout.default');
  const network = strictestPrefs(userData.network, currentNetworkPrefs());
  const mapsOn = featureEnabled(network, 'maps');
  const radius = formatShortDistance(HIDDEN_ZONE_M, units, language);
  const labelOf = (field: SnapshotField): string => (field === 'pace' ? t(usesPace(entry.type ?? 'other') ? 'route.pace' : 'route.speed') : t(FIELD_LABELS[field]));

  const share = async (): Promise<void> => {
    setBusy('share');
    setError(null);
    setSaved(false);
    try {
      await shareSnapshotImage(cardRef);
    } catch (failure) {
      setError(failure instanceof ShareUnavailableError ? 'error.shareUnavailable' : 'activity.share.error');
    } finally {
      setBusy(null);
    }
  };

  const save = async (): Promise<void> => {
    setBusy('save');
    setError(null);
    setSaved(false);
    try {
      const outcome = await saveSnapshotImage(cardRef, snapshotFileName(entry.type, day, format, Date.now()), Platform.OS === 'ios' ? 'ios' : 'android');
      if (outcome.kind === 'saved') setSaved(true);
    } catch (failure) {
      setError(failure instanceof SaveImageError ? 'activity.share.saveError' : 'activity.share.error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      tint="load"
      testID="share-activity"
      header={
        <>
          <TopBar title={t('activity.share.title')} />
          <Segmented
            testID="share-format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'story', label: t('activity.share.format.story') },
              { value: 'square', label: t('activity.share.format.square') },
              { value: 'transparent', label: t('activity.share.format.transparent') },
            ]}
          />
        </>
      }>
      <AppText variant="label" muted>
        {t('activity.share.intro')}
      </AppText>
      <View style={{ alignItems: 'center' }}>
        <ShareCard ref={cardRef} view={view} style={cardStyle} format={format} title={title} network={mapsOn ? network : null} />
      </View>
      {format === 'transparent' ? (
        <AppText variant="caption" muted testID="share-transparent-note">
          {t('activity.share.transparentNote')}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityLabel={t('activity.share.fields')}>
        {fields.map((field) => (
          <ToggleChip key={field} label={labelOf(field)} value={selection[field]} onChange={(on) => setSelection((current) => toggleField(current, field, on))} testID={`share-toggle-${field}`} />
        ))}
      </View>
      {fields.includes('name') ? (
        <AppText variant="caption" muted testID="share-name-hint">
          {t('activity.share.nameHint')}
        </AppText>
      ) : null}
      {view.routeHiddenAway ? (
        <AppText variant="caption" muted testID="share-route-hidden">
          {t('activity.share.routeHiddenAway', { distance: `${radius.value} ${radius.unit}` })}
        </AppText>
      ) : null}
      {view.route !== null && !mapsOn && format !== 'transparent' ? (
        <AppText variant="caption" muted testID="share-map-off">
          {t('activity.share.mapOff')}
        </AppText>
      ) : null}

      {fields.includes('route') ? (
        <ListGroup>
          <ToggleRow
            title={t('activity.share.hideEnds')}
            subtitle={t('activity.share.hideEndsBody', { distance: `${radius.value} ${radius.unit}` })}
            value={hideEnds}
            onChange={setHideEnds}
            testID="share-hide-ends"
          />
        </ListGroup>
      ) : null}

      <Segmented
        testID="share-style"
        value={cardStyle}
        onChange={setCardStyle}
        options={[
          { value: 'light', label: t('activity.share.style.light') },
          { value: 'dark', label: t('activity.share.style.dark') },
        ]}
      />
      <Card tone="outline" style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('activity.share.privacyRoute')}
        </AppText>
      </Card>
      {error !== null ? (
        <AppText variant="body" color={colors.negative} testID="share-error" accessibilityLiveRegion="polite">
          {t(error)}
        </AppText>
      ) : null}
      {saved ? (
        <AppText variant="body" color={colors.positive} testID="share-saved" accessibilityLiveRegion="polite">
          {t('activity.share.saved')}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button
          label={busy === 'save' ? t('activity.share.sharing') : t('activity.share.save')}
          icon="download"
          variant="secondary"
          onPress={() => void save()}
          disabled={busy !== null}
          style={{ flex: 1 }}
          testID="share-save"
        />
        <Button
          label={busy === 'share' ? t('activity.share.sharing') : t('activity.share.title')}
          icon="share"
          accessibilityLabel={t('activity.share.action')}
          onPress={() => void share()}
          disabled={busy !== null}
          style={{ flex: 1 }}
          testID="share-button"
        />
      </View>
    </Screen>
  );
}
