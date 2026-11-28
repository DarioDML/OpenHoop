import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { formatElapsed, loadTargetBand, parseActivityType } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { rangeStatus } from '@/data/derived';
import { caloriesForActivity } from '@/data/energyDerived';
import { aimAt } from '@/data/loadDerived';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { BuzzChip, LiveControls, LiveStatus, ZoneStrip } from '@/ui/activity/LiveParts';
import { ProgressBar } from '@/ui/activity/parts';
import { nowSeconds, useLiveRecording } from '@/ui/activity/useLiveRecording';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Ring } from '@/ui/Ring';
import { Screen } from '@/ui/Screen';
import { ScoreRing } from '@/ui/ScoreRing';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

const ZONE_KEYS = ['zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5'] as const;
const HR_RING = 236;

export default function LiveActivityScreen() {
  const { days, notice, userData, profile } = useAppData();
  const { t, language, reason } = useT();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string; start?: string; live?: string }>();
  const type = parseActivityType(params.type);
  const { session, save, running, send, begin, finish, ref, heartRate, hud, now } = useLiveRecording(type, { adoptLive: params.live === '1' });
  const beginRef = useRef(begin);
  beginRef.current = begin;
  const autoStarted = useRef(false);

  useEffect(() => {
    if (params.start !== '1' || autoStarted.current) return;
    autoStarted.current = true;
    void beginRef.current();
  }, [params.start]);

  const zone = hud.zone;
  const zoneColor = zone !== null && zone > 0 ? colors.zones[zone - 1] : undefined;
  const band = loadTargetBand(days);
  const calories = caloriesForActivity(hud.activeMinutes, session.startedAt ?? now, userData, profile);
  const fmt = (v: number, d = 0): string => formatNumber(v, d, language);
  const noHr = t('activity.live.noHrYet');

  const footer =
    session.phase === 'ready' ? (
      <Button label={t('activity.live.start')} icon="play" onPress={() => void begin()} testID="live-begin" />
    ) : running ? (
      <LiveControls
        phase={session.phase}
        onPause={() => send({ kind: 'pause', at: nowSeconds() })}
        onResume={() => send({ kind: 'resume', at: nowSeconds() })}
        onStop={() => void finish()}
        testIDPrefix="live"
      />
    ) : save.kind === 'saved' ? (
      <Button label={t('activity.live.view')} onPress={() => router.replace({ pathname: '/activity/details', params: { id: String(save.id) } })} testID="live-view" />
    ) : null;

  const zoneText =
    running && heartRate === null ? t('activity.live.waiting') : zone !== null && zone > 0 ? t(ZONE_KEYS[zone - 1] ?? 'activity.live.noZone') : t('activity.live.noZone');

  return (
    <Screen tint={session.phase === 'running' ? 'recoveryHigh' : 'load'} testID="live-activity" gap={spacing.xl} footer={footer}>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <TopBar
        close
        back={false}
        center={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="cap" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {t(`activity.type.${type}`)}
            </AppText>
            <LiveStatus phase={session.phase} testID="live-status" />
          </View>
        }
        right={
          <Num size={28} testID="live-elapsed" accessibilityLabel={`${session.phase === 'paused' ? t('activity.live.paused') : t('activity.live.elapsed')} ${formatElapsed(hud.activeS)}`}>
            {formatElapsed(hud.activeS)}
          </Num>
        }
      />

      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Ring fraction={heartRate === null || ref.max <= 0 ? null : heartRate / ref.max} color={zoneColor ?? colors.textMuted} size={HR_RING} strokeWidth={12} testID="live-hr-ring">
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Icon name="heart" color={colors.metric.readinessLow} fill={colors.metric.readinessLow} size={28} />
            <Num size={96} color={zoneColor} testID="live-hr" accessibilityLabel={heartRate === null ? noHr : `${fmt(heartRate)} ${t('unit.bpm')}`}>
              {heartRate !== null ? fmt(heartRate) : '–'}
            </Num>
            <AppText variant="cap" muted>
              {t('unit.bpm')}
            </AppText>
          </View>
        </Ring>
        <AppText variant="cap" testID="live-zone" color={zoneColor} muted={zone === null || zone === 0}>
          {zoneText}
        </AppText>
      </View>

      <View style={{ gap: spacing.sm }}>
        <ZoneStrip zone={heartRate === null ? null : zone} testID="live-zones" />
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>
          {ref.zoneFloors ? t('profile.zones.liveCustom', { floors: ref.zoneFloors.map((f) => fmt(f)).join(' · ') }) : t('activity.live.maxHr', { rest: fmt(ref.rest), value: fmt(ref.max) })}
        </AppText>
      </View>

      {session.phase !== 'ready' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: spacing.lg }}>
          <View testID="live-load">
            <ScoreRing
              label={t('activity.live.load')}
              sublabel={t('activity.live.load')}
              value={hud.load}
              reason={hud.loadReason}
              max={21}
              decimals={1}
              level={PARITY.load}
              size={130}
              strokeWidth={9}
              numberSize={44}
              sublabelSize={10}
              color={colors.metric.load}
              showLabel={false}
            />
          </View>
          <View style={{ gap: spacing.md, flexShrink: 1 }}>
            <HudStat label={t('calories.title')} value={calories.estimate === null ? reason(calories.reason) : fmt(calories.estimate.totalKcal)} unit={calories.estimate === null ? undefined : t('calories.unit')} testID="live-calories" />
            <HudStat label={t('loadx.hr.avg')} value={hud.avgHr === null ? noHr : fmt(hud.avgHr)} unit={hud.avgHr === null ? undefined : t('unit.bpm')} testID="live-avg" />
            <HudStat label={t('loadx.hr.max')} value={hud.maxHr === null ? noHr : fmt(hud.maxHr)} unit={hud.maxHr === null ? undefined : t('unit.bpm')} testID="live-max" />
          </View>
        </View>
      ) : null}

      <Card testID="live-target">
        <AppText variant="cardTitle">{t('activity.live.target.title')}</AppText>
        {band === null ? (
          <>
            <Chip tone="warning" label={t('range.calibrating')} />
            <AppText variant="label" muted>
              {t('activity.live.target.noBand')}
            </AppText>
          </>
        ) : hud.projectedDayLoad === null ? (
          <AppText variant="label" muted testID="live-target-none">
            {t('activity.live.target.noDay', { low: fmt(band.low, 1), high: fmt(band.high, 1) })}
          </AppText>
        ) : (
          <>
            <Num size={40} color={colors.metric.loadBright} testID="live-target-value">
              {fmt(hud.projectedDayLoad, 1)}
            </Num>
            <ProgressBar fraction={band.high > 0 ? hud.projectedDayLoad / band.high : 0} color={colors.metric.loadBright} label={t('activity.live.target.title')} />
            {(() => {
              const status = rangeStatus(hud.projectedDayLoad, band);
              return status ? <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`range.${status}`, { low: fmt(band.low, 1), high: fmt(band.high, 1) })} /> : null;
            })()}
            <AppText variant="caption" muted>
              {t('activity.live.target.body')}
            </AppText>
          </>
        )}
        <BuzzChip prefs={userData.loadBuzz} aim={aimAt(days, days.length - 1)} todayKey={unixToIsoDate(now, deviceTzOffsetS(new Date(now * 1000)))} testID="live-buzz" />
        <ParityBadge level={PARITY.load} />
      </Card>

      {save.kind === 'saving' ? (
        <AppText variant="label" muted testID="live-saving">
          {t('activity.live.saving')}
        </AppText>
      ) : save.kind === 'saved' ? (
        <Card tone="outline" testID="live-saved">
          <AppText variant="label" muted>
            {t('activity.live.saved')}
          </AppText>
        </Card>
      ) : save.kind === 'short' ? (
        <Card tone="outline" testID="live-short">
          <AppText variant="label" muted>
            {t('activity.live.tooShort')}
          </AppText>
        </Card>
      ) : save.kind === 'failed' ? (
        <AppText variant="label" color={colors.negative} testID="live-failed">
          {notice === null ? t('activity.form.failed') : t(notice.key, notice.params)}
        </AppText>
      ) : null}
    </Screen>
  );
}

function HudStat({ label, value, unit, testID }: { label: string; value: string; unit?: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }} testID={testID}>
      <AppText variant="capSmall" muted>
        {label}
      </AppText>
      {unit === undefined ? (
        <AppText variant="label" muted>
          {value}
        </AppText>
      ) : (
        <Num size={40} unit={unit} unitSize={16} unitColor={colors.textMuted}>
          {value}
        </Num>
      )}
    </View>
  );
}
