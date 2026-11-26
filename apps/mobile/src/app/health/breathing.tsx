import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useLive } from '@/data/context';
import { BREATH_PATTERNS, breathPositionAt, type BreathPatternId, type BreathPhase } from '@/data/healthDerived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Segmented } from '@/ui/controls';
import { Card } from '@/ui/Card';
import { HealthPage } from '@/ui/health/HealthPage';
import { Num } from '@/ui/Num';
import { spacing, useTheme } from '@/ui/theme';

const PHASE_LABEL: Record<BreathPhase, TranslationKey> = {
  inhale: 'health.breathing.inhale',
  holdIn: 'health.breathing.hold',
  exhale: 'health.breathing.exhale',
  holdOut: 'health.breathing.hold',
};

const PATTERN_LABEL: Record<BreathPatternId, TranslationKey> = {
  calm: 'health.breathing.pattern.calm',
  box: 'health.breathing.pattern.box',
  relax: 'health.breathing.pattern.relax',
};

const TICK_MS = 200;
const MIN_SCALE = 0.55;

function targetScale(phase: BreathPhase): number | null {
  if (phase === 'inhale') return 1;
  if (phase === 'exhale') return MIN_SCALE;
  return null;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const DURATIONS = ['1', '3', '5'] as const;
type DurationKey = (typeof DURATIONS)[number];

export default function BreathingScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const live = useLive();
  const [patternId, setPatternId] = useState<BreathPatternId>('calm');
  const [minutes, setMinutes] = useState<DurationKey>('3');
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;

  const pattern = BREATH_PATTERNS.find((p) => p.id === patternId) ?? BREATH_PATTERNS[0];
  const totalS = Number(minutes) * 60;
  const position = pattern ? breathPositionAt(pattern, elapsed) : null;
  const phase = running && position ? position.phase : null;
  const phaseSeconds = position?.phaseSeconds ?? 0;

  const stop = useCallback(
    (done: boolean) => {
      setRunning(false);
      setFinished(done);
      setElapsed(0);
      scale.stopAnimation();
      Animated.timing(scale, { toValue: MIN_SCALE, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    },
    [scale],
  );

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

  useEffect(() => {
    if (phase === null) return;
    const to = targetScale(phase);
    if (to === null) return;
    scale.stopAnimation();
    Animated.timing(scale, { toValue: to, duration: phaseSeconds * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start();
  }, [phase, phaseSeconds, scale]);

  const start = (): void => {
    startedAt.current = Date.now();
    setElapsed(0);
    setFinished(false);
    setRunning(true);
  };

  const patternText = pattern
    ? pattern.steps.map((step) => `${t(PHASE_LABEL[step.phase])} ${step.seconds}`).join(' · ')
    : '';

  return (
    <HealthPage title={t('health.breathing.title')} testID="health-breathing" tint="recovery">
      <Card style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }}>
        <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: 240,
              height: 240,
              borderRadius: 120,
              backgroundColor: colors.accentSoft,
              borderWidth: 2,
              borderColor: colors.accent,
              transform: [{ scale }],
            }}
          />
          <AppText variant="h2" testID="breath-phase" accessibilityLiveRegion="polite">
            {running && position ? t(PHASE_LABEL[position.phase]) : finished ? t('health.breathing.done') : t('health.breathing.ready')}
          </AppText>
          {running && position ? (
            <Num size={32} testID="breath-count">
              {Math.ceil(position.secondsLeft)}
            </Num>
          ) : null}
        </View>
        <AppText variant="label" muted style={{ textAlign: 'center' }}>
          {patternText}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.xl }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <AppText variant="capSmall" muted>
              {t('health.breathing.timeLeft')}
            </AppText>
            <Num size={32} testID="breath-left">
              {clock(running ? totalS - elapsed : totalS)}
            </Num>
          </View>
          {live.heartRate !== null ? (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <AppText variant="capSmall" muted>
                {t('metric.heartRate')}
              </AppText>
              <Num size={32} unit={t('unit.bpm')} testID="breath-hr">
                {live.heartRate}
              </Num>
            </View>
          ) : null}
        </View>
      </Card>

      {running ? (
        <Button label={t('health.breathing.end')} variant="secondary" onPress={() => stop(false)} testID="breath-stop" />
      ) : (
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
