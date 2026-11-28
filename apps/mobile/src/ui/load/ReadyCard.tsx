import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { loadTargetBand } from '@/data/activityDerived';
import { useAppData } from '@/data/context';
import { rangeStatus } from '@/data/derived';
import { MAX_ESTIMATE_MIN, readyAdvice, type ReadyAdvice } from '@/data/loadDerived';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText, WordFitText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { useLayout } from '@/ui/layout';
import { radius, readinessBand, readinessColor, spacing, useTheme } from '@/ui/theme';

import { useLoadBuzz, type LoadToday } from './useLoadToday';

export function adviceText(t: TFunction, language: Language, advice: ReadyAdvice, today: LoadToday): string {
  const fmt = (v: number): string => formatNumber(v, 1, language);
  switch (advice.kind) {
    case 'calibrating':
      return t('loadScreen.advice.calibrating');
    case 'noLoad':
      return t('loadScreen.advice.noLoad');
    case 'above':
      return t('loadScreen.advice.above');
    case 'within':
      return t('loadScreen.advice.within');
    case 'noEstimate':
      return t('loadScreen.advice.noEstimate', { low: fmt(today.aim?.low ?? 0), high: fmt(today.aim?.high ?? 0) });
    case 'far':
      return t('loadScreen.advice.far', { hours: MAX_ESTIMATE_MIN / 60 });
    case 'below': {
      const hours = MAX_ESTIMATE_MIN / 60;
      const low = advice.minutesLow;
      const high = advice.minutesHigh;
      if (today.readiness === null) {
        if (high === null) return t('loadScreen.advice.belowOpenNoReadiness', { low, hours });
        return low === high ? t('loadScreen.advice.belowOneNoReadiness', { minutes: low }) : t('loadScreen.advice.belowNoReadiness', { low, high });
      }
      const readiness = Math.round(today.readiness);
      if (high === null) return t('loadScreen.advice.belowOpen', { readiness, low, hours });
      return low === high ? t('loadScreen.advice.belowOne', { readiness, minutes: low }) : t('loadScreen.advice.below', { readiness, low, high });
    }
  }
}

function BuzzCheck({ today, stacked }: { today: LoadToday; stacked: boolean }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  const buzz = useLoadBuzz(today);
  const on = buzz.prefs.atTarget;
  return (
    <View style={{ flex: stacked ? undefined : 1, gap: spacing.xs }}>
      <Pressable
        testID="load-buzz"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={t('loadScreen.buzz')}
        onPress={() => buzz.set('target', !on)}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          opacity: pressed ? 0.8 : 1,
        })}>
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: on ? colors.accent : colors.textMuted,
            backgroundColor: on ? colors.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {on ? <Icon name="check" color={colors.accentOn} size={13} strokeWidth={3} /> : null}
        </View>
        <View style={{ flexShrink: 1 }}>
          <WordFitText variant="label" soft numberOfLines={2} testID="load-buzz-label">
            {t('loadScreen.buzz')}
          </WordFitText>
        </View>
      </Pressable>
    </View>
  );
}

function BuzzNote({ today }: { today: LoadToday }): ReactElement | null {
  const buzz = useLoadBuzz(today);
  if (!buzz.prefs.atTarget) return null;
  return (
    <AppText variant="caption" muted testID="load-buzz-note">
      {buzz.availability}
    </AppText>
  );
}

export function ReadyCard({ today }: { today: LoadToday }): ReactElement {
  const { colors } = useTheme();
  const { t, language } = useT();
  const { days } = useAppData();
  const { compact } = useLayout();
  const advice = readyAdvice(today.value, today.aim, today.trainingHr, today.ref);
  const band = readinessBand(today.readiness);
  const title = band === null ? t('loadScreen.ready.today') : band === 'low' ? t('loadScreen.ready.easy') : t('loadScreen.ready.perform');
  const usual = today.targetsHidden ? null : loadTargetBand(days);
  const status = rangeStatus(today.value, usual);
  const fmt = (v: number): string => formatNumber(v, 1, language);

  return (
    <Card testID="load-ready" style={{ gap: 10 }}>
      <AppText variant="capLarge" color={band === null ? colors.textMuted : readinessColor(colors, today.readiness)}>
        {title}
      </AppText>
      <AppText variant="body" soft testID="load-ready-advice">
        {adviceText(t, language, advice, today)}
      </AppText>
      {advice.kind === 'below' || advice.kind === 'far' ? (
        <AppText variant="caption" muted testID="load-ready-basis">
          {t('loadTarget.basis', { hr: Math.round(today.trainingHr) })}
        </AppText>
      ) : null}
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: spacing.sm, marginTop: spacing.xs }} testID="load-ready-actions">
        <Button label={t('home.startActivity')} onPress={() => router.push('/activity/start')} style={{ flex: compact ? undefined : 1, minHeight: 48, paddingHorizontal: spacing.md }} testID="load-start" />
        <BuzzCheck today={today} stacked={compact} />
      </View>
      <BuzzNote today={today} />
      <Pressable
        testID="load-target-card"
        accessibilityRole="link"
        accessibilityLabel={t('loadx.target.title')}
        onPress={() => router.push('/load/target')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="bodyStrong">{t('loadx.target.title')}</AppText>
          {usual ? (
            <>
              <AppText variant="label" muted testID="load-usual-range">
                {t('loadScreen.usual.range', { low: fmt(usual.low), high: fmt(usual.high) })}
              </AppText>
              {status ? <Chip tone={status === 'within' ? 'positive' : 'info'} label={t(`loadScreen.usual.${status}`)} small testID="load-usual-status" /> : null}
            </>
          ) : (
            <Chip label={t('range.calibrating')} tone="warning" small />
          )}
        </View>
        <Icon name="chevronRight" color={colors.textMuted} size={18} />
      </Pressable>
    </Card>
  );
}
