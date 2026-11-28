import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useLive } from '@/data/context';
import { BREATH_PATTERNS, breathPositionAt, type BreathPattern, type BreathPatternId, type BreathPhase } from '@/data/healthDerived';
import type { TranslationKey } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Segmented } from '@/ui/controls';
import { BLOB_MIN, BreathBlob } from '@/ui/health/BreathBlob';
import { HealthPage } from '@/ui/health/HealthPage';
import { useLayout } from '@/ui/layout';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

const PHASE_LABEL: Record<BreathPhase, TranslationKey> = {
  inhale: 'health.breathing.inhale',
  holdIn: 'health.breathing.hold',
  exhale: 'health.breathing.exhale',
  holdOut: 'health.breathing.hold',
};

const STEP_LABEL: Record<BreathPhase, TranslationKey> = {
  inhale: 'health.breathing.step.in',
  holdIn: 'health.breathing.step.hold',
  exhale: 'health.breathing.step.out',
  holdOut: 'health.breathing.step.hold',
};

const PATTERN_LABEL: Record<BreathPatternId, TranslationKey> = {
  calm: 'health.breathing.pattern.calm',
  box: 'health.breathing.pattern.box',
  relax: 'health.breathing.pattern.relax',
};

const TICK_MS = 200;

function targetScale(phase: BreathPhase | null): number {
  return phase === 'inhale' || phase === 'holdIn' ? 1 : BLOB_MIN;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function patternLine(pattern: BreathPattern, t: TFunction): string {
  return pattern.steps.map((step) => t(STEP_LABEL[step.phase], { n: step.seconds })).join(' · ');
}

const DURATIONS = ['1', '3', '5'] as const;
type DurationKey = (typeof DURATIONS)[number];

export default function BreathingScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { width, gutter } = useLayout();
  const live = useLive();
  const [patternId, setPatternId] = useState<BreathPatternId>('calm');
  const [minutes, setMinutes] = useState<DurationKey>('3');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const pattern = BREATH_PATTERNS.find((p) => p.id === patternId) ?? BREATH_PATTERNS[0];
  const totalS = Number(minutes) * 60;
  const position = pattern ? breathPositionAt(pattern, elapsed) : null;
  const phase = running && position ? position.phase : null;
  const target = targetScale(phase);
  const blobSize = Math.min(300, width - gutter * 2 - 48);

  const stop = useCallback((done: boolean) => {
    setRunning(false);
    setFinished(done);
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (seconds >= totalS) {
        clearInterval(id);
        stop(true);
      } else {
        setElapsed(seconds);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, totalS, stop]);

  const start = (): void => {
    startedAt.current = Date.now();
    setElapsed(0);
    setFinished(false);
    setRunning(true);
  };

  return (
    <HealthPage
      title={t('health.breathing.title')}
      testID="health-breathing"
      tint="load"
      footer={running ? <Button label={t('health.breathing.end')} variant="secondary" onPress={() => stop(false)} testID="breath-stop" /> : undefined}>
      <View style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.md }}>
        <BreathBlob size={blobSize} target={target} durationMs={phase === null ? 600 : (position?.phaseSeconds ?? 0) * 1000} testID="breath-blob" />
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="h2" testID="breath-phase" accessibilityLiveRegion="polite" style={{ textTransform: 'uppercase', letterSpacing: 2, fontSize: 22 }}>
            {running && position ? t(PHASE_LABEL[position.phase]) : finished ? t('health.breathing.done') : t('health.breathing.ready')}
          </AppText>
          <AppText variant="body" muted style={{ textAlign: 'center' }} testID="breath-steps">
            {pattern ? patternLine(pattern, t) : ''}
          </AppText>
          {running && position ? (
            <Num size={28} color={colors.textSoft} testID="breath-count">
              {Math.ceil(position.secondsLeft)}
            </Num>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xxl, justifyContent: 'center' }}>
          {live.active && live.heartRate !== null ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <AppText variant="capSmall" muted>
                {t('metric.heartRate')}
              </AppText>
              <Num size={40} unit={t('unit.bpm')} unitSize={16} unitColor={colors.textMuted} testID="breath-hr">
                {live.heartRate}
              </Num>
            </View>
          ) : null}
          <View style={{ alignItems: 'center', gap: 2 }}>
            <AppText variant="capSmall" muted>
              {t('health.breathing.timeLeft')}
            </AppText>
            <Num size={40} testID="breath-left">
              {clock(running ? totalS - elapsed : totalS)}
            </Num>
          </View>
        </View>
      </View>

      {running ? null : (
        <>
          <AppText variant="capLarge" muted>
            {t('health.breathing.pattern')}
          </AppText>
          <Segmented
            testID="breath-pattern"
            value={patternId}
            onChange={setPatternId}
            options={BREATH_PATTERNS.map((p) => ({ value: p.id, label: t(PATTERN_LABEL[p.id]) }))}
          />
          <AppText variant="capLarge" muted>
            {t('health.breathing.duration')}
          </AppText>
          <Segmented
            testID="breath-duration"
            value={minutes}
            onChange={setMinutes}
            options={DURATIONS.map((m) => ({ value: m, label: t('format.min', { m }) }))}
          />
          <Button label={t('health.breathing.start')} onPress={start} testID="breath-start" />
        </>
      )}
      <AppText variant="caption" muted>
        {t('health.breathing.note')}
      </AppText>
    </HealthPage>
  );
}
