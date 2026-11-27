import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { readinessImpacts } from '@/data/dailyDerived';
import { MIN_DAYS_PER_SIDE } from '@/data/healthDerived';
import { behaviourName, rankBehaviourImpacts } from '@/data/journalImpacts';
import { JOURNAL_QUESTIONS, activeQuestions } from '@/data/journalQuestions';
import { useT } from '@/i18n/useT';
import { formatNumber, formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { CapRow, NoDataPage, Page } from '@/ui/daily/bits';
import { Icon } from '@/ui/Icon';
import { ImpactRow } from '@/ui/readiness/ImpactRow';
import { Sheet } from '@/ui/Sheet';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const MIN_SCALE = 15;

export default function ImpactsScreen() {
  const { days, userData } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const [infoOpen, setInfoOpen] = useState(false);
  if (days.length === 0) return <NoDataPage title={t('readinessImpacts.title')} body={t('empty.body')} />;

  const active = activeQuestions(userData.journalQuestions);
  const activeIds = new Set(active.map((q) => q.id));
  const answered = new Set(Object.values(userData.journal).flatMap((answers) => Object.keys(answers)));
  const questions = JOURNAL_QUESTIONS.filter((q) => activeIds.has(q.id) || answered.has(q.id));
  const behaviours = rankBehaviourImpacts(days, userData.journal, questions);
  const needsMore = behaviours.needsMore;
  const scale = Math.max(MIN_SCALE, ...behaviours.ranked.map((item) => Math.abs(item.effectPct)));
  const nameOf = (questionId: string): string => {
    const question = JOURNAL_QUESTIONS.find((q) => q.id === questionId);
    return question === undefined ? questionId : t(behaviourName(question));
  };
  const impacts = readinessImpacts(days);

  return (
    <Page
      title={t('readinessImpacts.title')}
      tint="recovery"
      testID="impacts"
      right={<IconButton icon="info" label={t('readinessImpacts.info.title')} onPress={() => setInfoOpen(true)} testID="impacts-info" />}>
      <AppText variant="label" muted>
        {t('readinessImpacts.intro')}
      </AppText>

      {answered.size === 0 ? (
        <StateCard
          testID="behaviours-empty"
          icon="journal"
          tone="neutral"
          title={t('readinessImpacts.emptyTitle')}
          body={t('readinessImpacts.emptyBody', { min: MIN_DAYS_PER_SIDE })}
          actionLabel={t('readinessImpacts.emptyAction')}
          onAction={() => router.push('/journal')}
        />
      ) : behaviours.ranked.length > 0 ? (
        <Card testID="card-behaviours" style={{ gap: 0, paddingVertical: spacing.xs }}>
          {behaviours.ranked.map((item, i) => (
            <ImpactRow
              key={item.questionId}
              testID={`behaviour-${item.questionId}`}
              name={nameOf(item.questionId)}
              effectPct={item.effectPct}
              scale={scale}
              logged={item.nWith}
              confidence={item.confidence}
              divider={i < behaviours.ranked.length - 1}
            />
          ))}
        </Card>
      ) : null}

      {answered.size > 0 && needsMore.length > 0 ? (
        <View testID="needs-more" accessibilityRole="summary" style={{ flexDirection: 'row', gap: spacing.md, padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
          <Icon name="journal" size={20} color={colors.textSoft} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="label" soft style={{ fontWeight: '600' }}>
              {t('readinessImpacts.needsTitle')}
            </AppText>
            {needsMore.map((item) => (
              <AppText key={item.questionId} variant="label" soft testID={`needs-${item.questionId}`}>
                {t(item.side === 'with' ? 'readinessImpacts.needsWith' : 'readinessImpacts.needsWithout', { name: nameOf(item.questionId), have: item.have, need: item.need })}
              </AppText>
            ))}
            <AppText variant="label" soft>
              {t('readinessImpacts.needsTail')}
            </AppText>
          </View>
        </View>
      ) : null}

      <CapRow title={t('readinessImpacts.fromData')} />
      <AppText variant="label" muted>
        {t('readinessx.impactsIntro')}
      </AppText>
      {impacts.length === 0 ? (
        <StateCard testID="impacts-empty" icon="trends" tone="neutral" title={t('readinessx.impactsEmptyTitle')} body={t('readinessx.impactsEmptyBody', { days: days.length })} />
      ) : (
        impacts.map((impact) => {
          const sleepBased = impact.id === 'sleep';
          const threshold = formatNumber(impact.threshold, 1, language);
          const diff = Math.round(impact.difference);
          return (
            <Card key={impact.id} testID={`impact-${impact.id}`} style={{ gap: spacing.sm }}>
              <AppText variant="cardTitle">{sleepBased ? t('readinessx.impact.sleepTitle') : t('readinessx.impact.loadTitle')}</AppText>
              <Chip label={t('readinessx.impact.diff', { value: formatSigned(diff, 0, language) })} tone={Math.abs(diff) < 3 ? 'neutral' : diff > 0 ? 'positive' : 'warning'} />
              <AppText variant="body" soft testID={`impact-${impact.id}-text`}>
                {sleepBased
                  ? t('readinessx.impact.sleepBody', { threshold, high: formatNumber(impact.meanHigh, 0, language), low: formatNumber(impact.meanLow, 0, language) })
                  : t('readinessx.impact.loadBody', { threshold, high: formatNumber(impact.meanHigh, 0, language), low: formatNumber(impact.meanLow, 0, language) })}
              </AppText>
              <AppText variant="caption" muted>
                {t('readinessx.impact.sample', { high: impact.nHigh, low: impact.nLow })}
              </AppText>
            </Card>
          );
        })
      )}

      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title={t('readinessImpacts.info.title')} testID="impacts-info-sheet">
        <View style={{ gap: spacing.md }}>
          <AppText variant="body" soft>
            {t('readinessImpacts.info.body')}
          </AppText>
          <AppText variant="body" soft>
            {t('readinessImpacts.info.confidence')}
          </AppText>
          <AppText variant="bodyStrong">{t('readinessx.impactsNoteTitle')}</AppText>
          <AppText variant="body" soft>
            {t('readinessx.impactsNote')}
          </AppText>
        </View>
      </Sheet>
    </Page>
  );
}
