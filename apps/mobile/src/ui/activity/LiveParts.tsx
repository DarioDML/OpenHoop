import { View } from 'react-native';

import type { LivePhase } from '@/data/liveSession';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';

import { AppText } from '../AppText';
import { Chip, type ChipTone } from '../Chip';
import { Button } from '../controls';
import { spacing, useTheme } from '../theme';
import type { BuzzStatus } from './useLoadTargetBuzz';

const ZONES = [0, 1, 2, 3, 4, 5] as const;

interface ZoneStripProps {
  zone: number | null;
  testID?: string;
}

export function ZoneStrip({ zone, testID }: ZoneStripProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const label = zone === null ? t('activity.live.zoneUnknown') : zone === 0 ? t('activity.live.noZone') : t('activity.live.zoneA11y', { zone });
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {ZONES.map((z) => {
        const active = z === zone;
        const color = z === 0 ? colors.textFaint : (colors.zones[z - 1] ?? colors.textFaint);
        return (
          <View key={z} style={{ flex: active ? 2 : 1, alignItems: 'center', gap: 6 }} testID={active && testID ? `${testID}-active` : undefined}>
            <View style={{ alignSelf: 'stretch', height: active ? 28 : 12, borderRadius: 6, backgroundColor: color, opacity: active ? 1 : 0.45 }} />
            <AppText variant="capSmall" color={active ? colors.text : colors.textMuted}>
              {`Z${z}`}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const STATUS: Record<LivePhase, { key: TranslationKey; tone: ChipTone }> = {
  ready: { key: 'activity.live.status.ready', tone: 'neutral' },
  running: { key: 'activity.live.status.recording', tone: 'positive' },
  paused: { key: 'activity.live.paused', tone: 'warning' },
  stopped: { key: 'activity.live.status.ended', tone: 'neutral' },
};

export function LiveStatus({ phase, testID }: { phase: LivePhase; testID?: string }) {
  const { t } = useT();
  const { key, tone } = STATUS[phase];
  return <Chip tone={tone} label={phase === 'running' ? `● ${t(key)}` : t(key)} testID={testID} />;
}

const BUZZ: Record<Exclude<BuzzStatus, 'off'>, { key: TranslationKey; tone: ChipTone }> = {
  noTarget: { key: 'activity.live.buzz.noTarget', tone: 'neutral' },
  waitingDay: { key: 'activity.live.buzz.waitingDay', tone: 'warning' },
  armed: { key: 'activity.live.buzz.armed', tone: 'info' },
  passed: { key: 'activity.live.buzz.passed', tone: 'neutral' },
  buzzed: { key: 'activity.live.buzz.buzzed', tone: 'positive' },
  failed: { key: 'activity.live.buzz.failed', tone: 'negative' },
};

export function BuzzChip({ status, target, testID }: { status: BuzzStatus; target: number | null; testID?: string }) {
  const { t, language } = useT();
  if (status === 'off') return null;
  const { key, tone } = BUZZ[status];
  return <Chip tone={tone} label={t(key, { value: target === null ? '' : formatNumber(target, 1, language) })} testID={testID} />;
}

interface FooterProps {
  phase: LivePhase;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  testIDPrefix: string;
}

export function LiveControls({ phase, onPause, onResume, onStop, testIDPrefix }: FooterProps) {
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      {phase === 'running' ? (
        <Button label={t('activity.live.pause')} icon="pause" variant="secondary" onPress={onPause} style={{ flex: 1 }} testID={`${testIDPrefix}-pause`} />
      ) : (
        <Button label={t('activity.live.resume')} icon="play" variant="secondary" onPress={onResume} style={{ flex: 1 }} testID={`${testIDPrefix}-resume`} />
      )}
      <Button label={t('activity.live.stop')} icon="stop" onPress={onStop} style={{ flex: 1 }} testID={`${testIDPrefix}-stop`} />
    </View>
  );
}
