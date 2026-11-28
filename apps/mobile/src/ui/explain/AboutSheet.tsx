import { router, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS } from '@/data/derived';
import type { MissingExplanation } from '@/data/explainMissing';
import { buildingProgress } from '@/data/progress';
import { TERMS, termFull, type TermId } from '@/data/terms';
import { countKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { useLayout } from '@/ui/layout';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { Sheet } from '@/ui/Sheet';
import { spacing } from '@/ui/theme';

import type { ExplainTarget } from './ExplainProvider';
import { ProgressDots } from './ProgressDots';
import { missingStatus } from './whyText';

interface Props {
  target: ExplainTarget;
  missing: MissingExplanation | null;
  onClose: () => void;
}

const RANGE_TERMS: readonly TermId[] = ['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp'];

export function AboutSheet({ target, missing, onClose }: Props): ReactElement {
  const { t, language } = useT();
  const { narrow } = useLayout();
  const { days } = useAppData();
  const spec = TERMS[target.term];
  const { shown } = target;
  const rangeProgress = RANGE_TERMS.includes(target.term) ? buildingProgress('normalRange', days, target.index) : null;
  const last = target.index === days.length - 1;
  const label = spec.window === 'night' ? t('explain.yourNight') : last ? t('explain.today') : t('explain.thatDay');

  const go = (href: Href): void => {
    onClose();
    router.push(href);
  };

  return (
    <Sheet visible onClose={onClose} title={t(spec.name)} subtitle={t(termFull(target.term))} testID="about-sheet">
      <AppText variant="lead" soft>
        {t(spec.body)}
      </AppText>
      {shown === null ? null : (
        <Card style={{ gap: spacing.sm }} testID="about-shown">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
            <AppText variant="capSmall" muted>
              {label}
            </AppText>
            {shown.value !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 }}>
                <Num size={34}>{shown.value}</Num>
                {shown.unit === null ? null : (
                  <AppText variant="body" muted>
                    {shown.unit}
                  </AppText>
                )}
              </View>
            ) : null}
          </View>
          {shown.value === null && missing !== null ? <AppText variant="bodyStrong">{missingStatus(t, language, missing, 'sheet')}</AppText> : null}
          {rangeProgress === null ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
              <AppText variant="label" muted style={{ flexShrink: 1 }}>
                {t(countKey(MIN_BASELINE_NIGHTS, 'explain.rangeAfterOne', 'explain.rangeAfter'), { count: MIN_BASELINE_NIGHTS })}
              </AppText>
              <ProgressDots progress={rangeProgress} />
            </View>
          )}
        </Card>
      )}
      {spec.lists === null ? null : (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {spec.lists.map((list) => (
            <Card key={list.title} style={{ flex: 1, gap: spacing.sm }}>
              <AppText variant="capSmall" muted>
                {t(list.title)}
              </AppText>
              <AppText variant="body" soft>
                {t(list.items)}
              </AppText>
            </Card>
          ))}
        </View>
      )}
      <Card tone="outline" style={{ flexDirection: narrow ? 'column' : 'row', alignItems: 'flex-start', gap: spacing.md }} testID="about-level">
        {spec.level === null ? null : <ParityBadge level={spec.level} long />}
        <AppText variant="label" muted style={{ flex: narrow ? undefined : 1 }}>
          {t(spec.method)}
        </AppText>
      </Card>
      <Pressable accessibilityRole="link" onPress={() => go({ pathname: '/coach', params: { term: target.term } })} testID="about-coach" style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText variant="cap" muted>
          {t('explain.askCoach')}
        </AppText>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => go('/settings/terms')} testID="about-all-terms" style={{ minHeight: 44, justifyContent: 'center' }}>
        <AppText variant="cap" muted>
          {t('explain.allTerms')}
        </AppText>
      </Pressable>
    </Sheet>
  );
}
