import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ACTIVITY_TYPES, parseActivityType, type ActivityType } from '@/data/activityDerived';
import { useAppData, useLive } from '@/data/context';
import { loadTargetBuzzAt } from '@/data/liveSession';
import { gpsByDefault } from '@/data/route';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { ActivityGlyph } from '@/ui/activity/ActivityGlyph';
import { bandLink, type BandLink } from '@/ui/activity/bandLink';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip, Pill, type ChipTone } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { ListGroup } from '@/ui/ListGroup';
import { ToggleRow } from '@/ui/manage/rows';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const LINK_LABEL: Record<Exclude<BandLink['kind'], 'live'>, TranslationKey> = {
  connected: 'activity.start.band.connected',
  connecting: 'activity.start.band.connecting',
  syncing: 'activity.start.band.syncing',
  disconnected: 'activity.start.band.disconnected',
  unpaired: 'activity.start.band.unpaired',
};

export default function StartActivityScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, device, bandActions, startLive, stopLive, notice } = useAppData();
  const live = useLive();
  const params = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<ActivityType>(() => parseActivityType(params.type));
  const [picking, setPicking] = useState(false);
  const [gpsChoice, setGpsChoice] = useState<boolean | null>(null);
  const [buzz, setBuzz] = useState(true);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastFailed, setBroadcastFailed] = useState(false);
  const preview = useRef(false);
  const handedOff = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const stopRef = useRef(stopLive);
  stopRef.current = stopLive;

  const gps = gpsChoice ?? gpsByDefault(type);
  const target = loadTargetBuzzAt(days);
  const buzzOn = buzz && target !== null;
  const paired = device.name !== null;
  const canPreview = paired && device.connection === 'connected';
  const link = bandLink(device, live);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);

  useEffect(() => {
    if (!canPreview || preview.current || liveRef.current.active) return;
    preview.current = true;
    void startLive();
  }, [canPreview, startLive]);

  useEffect(
    () => () => {
      if (preview.current && !handedOff.current) void stopRef.current();
    },
    [],
  );

  const connect = (): void => {
    preview.current = true;
    void startLive();
  };

  const setBroadcast = async (on: boolean): Promise<void> => {
    setBroadcastBusy(true);
    setBroadcastFailed(false);
    try {
      const restart = liveRef.current.active && preview.current;
      if (restart) await stopLive();
      const ok = await bandActions.setHeartRateBroadcast(on);
      if (!ok) setBroadcastFailed(true);
      if (restart) await startLive();
    } finally {
      setBroadcastBusy(false);
    }
  };

  const begin = (): void => {
    handedOff.current = preview.current;
    const next: Record<string, string> = { type, start: '1' };
    if (buzzOn) next.buzz = '1';
    if (handedOff.current) next.live = '1';
    router.replace({ pathname: gps ? '/activity/gps' : '/activity/live', params: next });
  };

  const choose = (option: ActivityType): void => {
    setType(option);
    setPicking(false);
  };

  const linkChip: { label: string; tone: ChipTone } =
    link.kind === 'live'
      ? { label: link.bpm === null ? t('activity.start.band.liveWaiting') : t('activity.start.band.live', { bpm: fmt(link.bpm) }), tone: 'positive' }
      : { label: t(LINK_LABEL[link.kind]), tone: link.kind === 'connected' ? 'info' : 'neutral' };

  return (
    <Screen
      tint="load"
      testID="start-activity"
      header={
        <>
          <Stack.Screen options={{ presentation: 'modal' }} />
          <TopBar title={t('activity.start.title')} close back={false} />
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <ActivityGlyph type={type} size={96} />
            <AppText variant="title" testID="start-type">
              {t(`activity.type.${type}`)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('activity.start.changeA11y')}
              accessibilityState={{ expanded: picking }}
              onPress={() => setPicking((open) => !open)}
              hitSlop={8}
              testID="start-change"
              style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText variant="cap" color={colors.link}>
                {t('activity.start.change')}
              </AppText>
            </Pressable>
          </View>
        </>
      }>
      {picking ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="start-picker">
          {ACTIVITY_TYPES.map((option) => (
            <Pill key={option} label={t(`activity.type.${option}`)} selected={option === type} onPress={() => choose(option)} testID={`start-type-${option}`} />
          ))}
        </View>
      ) : null}

      <ListGroup>
        <ToggleRow
          title={t('activity.start.gps.title')}
          subtitle={t('activity.start.gps.body')}
          value={gps}
          onChange={setGpsChoice}
          testID="start-gps"
        />
        <ToggleRow
          title={t('activity.start.broadcast.title')}
          subtitle={paired ? t('activity.start.broadcast.body') : t('activity.start.broadcast.noBand')}
          value={device.hrBroadcast?.on ?? false}
          onChange={(on) => void setBroadcast(on)}
          disabled={!paired || broadcastBusy || device.connection === 'syncing'}
          testID="start-broadcast"
        />
        <ToggleRow
          title={t('activity.start.buzz.title')}
          subtitle={target === null ? t('activity.start.buzz.noTarget') : t('activity.start.buzz.body', { value: fmt(target, 1) })}
          value={buzzOn}
          onChange={setBuzz}
          disabled={target === null}
          testID="start-buzz"
        />
      </ListGroup>
      {gps ? (
        <AppText variant="caption" muted testID="start-gps-note">
          {t('route.live.permissionBody')}
        </AppText>
      ) : null}
      {buzzOn ? (
        <AppText variant="caption" muted testID="start-buzz-note">
          {t('activity.start.buzz.when')}
        </AppText>
      ) : null}
      {broadcastFailed ? (
        <AppText variant="label" color={colors.negative} testID="start-broadcast-failed">
          {notice === null ? t('activity.start.broadcast.failed') : t(notice.key, notice.params)}
        </AppText>
      ) : null}

      <Card testID="start-band" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="body" style={{ flexShrink: 1 }}>
            {t('activity.start.band.title')}
          </AppText>
          <Chip tone={linkChip.tone} label={linkChip.tone === 'positive' ? `● ${linkChip.label}` : linkChip.label} testID="start-band-status" />
        </View>
        {link.kind === 'disconnected' ? (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" muted>
              {t('activity.start.band.disconnectedHint')}
            </AppText>
            <Button label={t('activity.start.band.connect')} variant="tertiary" onPress={connect} testID="start-band-connect" />
          </View>
        ) : null}
      </Card>

      <Button label={t('activity.start.begin')} icon="play" onPress={begin} testID="start-begin" />

      <Card>
        <AppText variant="cardTitle">{t('activity.start.hr.title')}</AppText>
        <AppText variant="body" muted>
          {t('activity.start.hr.body')}
        </AppText>
      </Card>
      <Card tone="outline">
        <AppText variant="label" muted>
          {t('activity.start.saved')}
        </AppText>
      </Card>
    </Screen>
  );
}
