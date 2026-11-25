import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { formatWeekday } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { caloriesForActivity } from '@/data/energyDerived';
import { useT } from '@/i18n/useT';
import { unixToIsoDate } from '@/lib/dates';
import { formatClock, formatDuration, formatNumber, formatShortDay } from '@/lib/format';
import { entryTitle, kindLabel, UndoBar, useResolvedEntry } from '@/ui/activity/entries';
import { NoDataScreen, StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { IconButton, TopBar } from '@/ui/TopBar';
import { displayedZones, ZoneBar } from '@/ui/ZoneBar';

export default function ActivityDetailsScreen() {
  const { deleteActivity, pendingDelete, userData, profile } = useAppData();
  const { t, language, reason } = useT();
  const resolved = useResolvedEntry();
  const [deleting, setDeleting] = useState(false);
  const hadEntry = useRef(false);
  if (resolved !== null) hadEntry.current = true;
  const gone = resolved === null && pendingDelete === null && hadEntry.current;

  useEffect(() => {
    if (gone && router.canGoBack()) router.back();
  }, [gone]);

  if (resolved === null) {
    return pendingDelete !== null ? (
      <Screen tint="load" testID="activity-deleted" header={<TopBar title={t('activity.details.title')} />}>
        <UndoBar />
      </Screen>
    ) : (
      <NoDataScreen title={t('activity.details.title')} notFound />
    );
  }

  const { entry, workout, tzOffsetS, query } = resolved;
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const day = unixToIsoDate(entry.start, tzOffsetS);
  const m = entry.metrics;
  const calories = entry.hasLoad ? caloriesForActivity(m.activeMinutes, entry.start, userData, profile) : null;

  const remove = async (): Promise<void> => {
    setDeleting(true);
    const ok = await deleteActivity(entry.id !== null ? { kind: 'activity', id: entry.id } : { kind: 'detected', workout: workout ?? { start: entry.start, end: entry.end, zoneSeconds: m.zoneSeconds, avgHr: m.avgHr ?? 0, maxHr: m.maxHr ?? 0, source: 'auto', label: entry.label } });
    setDeleting(false);
    if (ok && router.canGoBack()) router.back();
  };

  return (
    <Screen
      tint="load"
      testID="activity-details"
      header={
        <>
          <TopBar
            title={t('activity.details.title')}
            right={<IconButton icon="share" label={t('activity.share.title')} onPress={() => router.push({ pathname: '/activity/share', params: query })} />}
          />
          <AppText variant="h1">{entryTitle(t, entry)}</AppText>
          <AppText variant="label" soft numeric>
            {formatWeekday(day, language, 'long')} {formatShortDay(day, language)} · {formatClock(entry.start, tzOffsetS)}–{formatClock(entry.end, tzOffsetS)}
          </AppText>
          <Chip tone={entry.kind === 'detected' ? 'info' : 'neutral'} label={kindLabel(t, entry.kind)} />
        </>
      }>
      <StatRow>
        <StatTile label={t('activity.details.duration')} value={formatDuration(t, m.activeS)} testID="detail-duration" />
        {entry.hasLoad ? (
          <StatTile label={t('activity.live.load')} value={m.load === null ? reason(m.loadReason) : fmt(m.load, 1)} testID="detail-load" />
        ) : null}
        <StatTile label={t('loadx.hr.avg')} value={m.avgHr === null ? '–' : fmt(m.avgHr)} unit={m.avgHr === null ? undefined : t('unit.bpm')} testID="detail-avg" />
        <StatTile label={t('loadx.hr.max')} value={m.maxHr === null ? '–' : fmt(m.maxHr)} unit={m.maxHr === null ? undefined : t('unit.bpm')} testID="detail-max" />
      </StatRow>
      {calories !== null ? (
        <Card testID="detail-calories" style={{ gap: 4 }}>
          <AppText variant="capSmall" muted>
            {t('calories.title')} · {t('calories.estimate')}
          </AppText>
          <AppText variant="bodyStrong" testID="detail-calories-value">
            {calories.estimate === null ? reason(calories.reason) : `${fmt(calories.estimate.totalKcal)} ${t('calories.unit')}`}
          </AppText>
          {calories.reason === 'no-profile' ? (
            <AppText variant="label" muted>
              {t('calories.needsProfile')}
            </AppText>
          ) : null}
          <ParityBadge level={PARITY.calories} />
        </Card>
      ) : null}
      {entry.hasLoad && m.load === null ? (
        <Card tone="outline">
          <AppText variant="label" muted testID="detail-no-load">
            {t(m.loadReason === 'low-coverage' ? 'activity.details.lowCoverage' : 'activity.details.noHr')}
          </AppText>
        </Card>
      ) : null}
      <Section title={t('load.zones')} hint={t('load.zonesTotal', { time: formatDuration(t, displayedZones(m.zoneSeconds).reduce((a, b) => a + b, 0)) })}>
        <Card>
          <ZoneBar zoneSeconds={m.zoneSeconds} />
        </Card>
      </Section>
      {entry.note !== null ? (
        <Card>
          <AppText variant="capSmall" muted>
            {t('activity.form.note')}
          </AppText>
          <AppText variant="body" testID="detail-note">
            {entry.note}
          </AppText>
        </Card>
      ) : null}
      <Card tone="outline" style={{ gap: 4 }}>
        <ParityBadge level={entry.kind === 'detected' ? PARITY.workouts : PARITY.load} long />
        <AppText variant="label" muted>
          {t('activity.details.dayLoad')}
        </AppText>
      </Card>
      <Card tone="outline">
        <AppText variant="label" muted>
          {t('activity.details.noMap')}
        </AppText>
      </Card>
      <Button label={t('activity.details.edit')} variant="secondary" onPress={() => router.push({ pathname: '/activity/edit', params: query })} testID="detail-edit" />
      <Button label={t('activity.delete')} variant="danger" disabled={deleting} onPress={() => void remove()} testID="detail-delete" />
    </Screen>
  );
}
