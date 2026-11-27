import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { ActivityEntry } from '@/data/activities';
import { useAppData } from '@/data/context';
import type { RoutePoint } from '@/data/route';
import type { HeartRatePoint } from '@/data/types';
import { useT } from '@/i18n/useT';
import { formatClock, formatDuration, formatShortDay } from '@/lib/format';
import { unixToIsoDate } from '@/lib/dates';
import { featureEnabled } from '@/net/features';
import { useStrava } from '@/strava/context';
import { HR_BUCKET_S, planUpload, stravaKey, stravaSportType, uploadHeartRate, uploadRoute, type UploadSource } from '@/strava/tcx';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Toggle } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { spacing, useTheme } from '@/ui/theme';

import { stravaErrorKey } from './status';

interface Props {
  entry: ActivityEntry;
  title: string;
  tzOffsetS: number;
}

interface Loaded {
  heartRate: HeartRatePoint[];
  route: RoutePoint[];
}

export function StravaUploadCard({ entry, title, tzOffsetS }: Props) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData, heartRateBetween, routeFor } = useAppData();
  const { state, controller } = useStrava();
  const [open, setOpen] = useState(false);
  const [hideEnds, setHideEnds] = useState(userData.hideRouteEnds);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(false);
  const key = stravaKey(entry);
  const record = state.ledger[key];
  const error = state.uploadErrors[key];
  const uploading = state.uploading === key;
  const networkOn = featureEnabled(userData.network, 'strava');
  const ready = networkOn && state.connection === 'connected';

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoaded(null);
    Promise.all([
      heartRateBetween(entry.start, entry.end, HR_BUCKET_S).catch((): HeartRatePoint[] => []),
      entry.id === null ? Promise.resolve<RoutePoint[]>([]) : routeFor(entry.id).catch((): RoutePoint[] => []),
    ]).then(([heartRate, route]) => {
      if (alive) setLoaded({ heartRate, route });
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, [open, entry.start, entry.end, entry.id, heartRateBetween, routeFor]);

  const source = (data: Loaded): UploadSource => ({
    key,
    type: entry.type,
    name: title,
    startS: entry.start,
    endS: entry.end,
    tzOffsetS,
    heartRate: data.heartRate,
    route: data.route,
    hideEnds,
  });

  const openSheet = (again: boolean): void => {
    setHideEnds(userData.hideRouteEnds);
    setRetry(again);
    setOpen(true);
  };

  const upload = async (): Promise<void> => {
    if (loaded === null) return;
    setOpen(false);
    await controller.upload(source(loaded), retry);
  };

  const day = unixToIsoDate(entry.start, tzOffsetS);
  const plan = loaded === null ? null : planUpload(source(loaded));
  const heartRate = loaded === null ? [] : uploadHeartRate(loaded.heartRate, entry.start, entry.end);
  const fullRoute = loaded === null ? [] : uploadRoute(loaded.route, false);
  const shownRoute = loaded === null ? [] : uploadRoute(loaded.route, hideEnds);

  return (
    <Card style={{ gap: spacing.sm }} testID="strava-upload-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <AppText variant="bodyStrong">{t('strava.title')}</AppText>
        {record?.status === 'done' ? <Chip small tone="positive" label={t('strava.upload.done')} testID="strava-upload-done" /> : null}
        {record?.status === 'duplicate' ? <Chip small tone="info" label={t('strava.upload.duplicate')} testID="strava-upload-duplicate" /> : null}
      </View>
      {error !== undefined ? (
        <AppText variant="label" color={error === 'duplicate' ? colors.textMuted : colors.negative} testID="strava-upload-error">
          {t(stravaErrorKey(error))}
        </AppText>
      ) : null}
      {record?.status === 'processing' ? (
        <>
          <AppText variant="label" muted testID="strava-upload-processing">
            {t('strava.upload.processing')}
          </AppText>
          <Button label={t('strava.upload.check')} variant="secondary" disabled={!ready || state.uploading !== null} onPress={() => void controller.checkUpload(key)} testID="strava-upload-check" />
        </>
      ) : null}
      {uploading ? (
        <AppText variant="label" muted testID="strava-upload-running">
          {t('strava.upload.uploading')}
        </AppText>
      ) : null}
      {record?.status === 'sending' && !uploading ? (
        <>
          {error === undefined ? (
            <AppText variant="label" color={colors.warning} testID="strava-upload-maybe-sent">
              {t('strava.error.maybe-sent')}
            </AppText>
          ) : null}
          <Button label={t('strava.upload.again')} variant="tertiary" disabled={!ready || state.uploading !== null} onPress={() => openSheet(true)} testID="strava-upload-again" />
        </>
      ) : null}
      {record === undefined && !uploading ? (
        ready ? (
          <Button label={t('strava.upload.button')} variant="secondary" disabled={state.uploading !== null} onPress={() => openSheet(false)} testID="strava-upload" />
        ) : (
          <>
            <AppText variant="label" muted>
              {t('strava.upload.connectFirst')}
            </AppText>
            <Button label={t('strava.upload.setUp')} variant="tertiary" onPress={() => router.push('/settings/strava')} testID="strava-upload-setup" />
          </>
        )
      ) : null}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('strava.upload.title')}
        testID="strava-upload-sheet"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button label={t('strava.upload.confirm')} disabled={plan === null} onPress={() => void upload()} testID="strava-upload-confirm" />
            <Button label={t('strava.upload.cancel')} variant="secondary" onPress={() => setOpen(false)} testID="strava-upload-cancel" />
          </View>
        }>
        <AppText variant="body" testID="strava-upload-sends">
          {t('strava.upload.sends', {
            start: `${formatShortDay(day, language)} ${formatClock(entry.start, tzOffsetS)}`,
            duration: formatDuration(t, Math.max(0, entry.end - entry.start)),
            type: stravaSportType(entry.type),
            name: title,
          })}
        </AppText>
        {loaded === null ? null : (
          <>
            <AppText variant="label" muted testID="strava-upload-hr">
              {heartRate.length > 0 ? t('strava.upload.heartRate', { count: heartRate.length }) : t('strava.upload.noHeartRate')}
            </AppText>
            <AppText variant="label" muted testID="strava-upload-route">
              {shownRoute.length > 0 ? t('strava.upload.route', { count: shownRoute.length }) : t('strava.upload.noRoute')}
            </AppText>
            {fullRoute.length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <AppText variant="label" style={{ flex: 1 }}>
                    {t('strava.upload.hideEnds')}
                  </AppText>
                  <Toggle label={t('strava.upload.hideEnds')} value={hideEnds} onChange={setHideEnds} testID="strava-upload-hide" />
                </View>
                {hideEnds ? (
                  <AppText variant="caption" muted testID="strava-upload-hidden">
                    {shownRoute.length > 0 ? t('strava.upload.hidden') : t('strava.upload.hiddenAll')}
                  </AppText>
                ) : null}
              </>
            ) : null}
            {plan?.kind === 'manual' ? (
              <AppText variant="caption" muted testID="strava-upload-manual">
                {t('strava.upload.manual')}
              </AppText>
            ) : null}
            <AppText variant="caption" muted>
              {t('strava.upload.notNoted')}
            </AppText>
          </>
        )}
      </Sheet>
    </Card>
  );
}
