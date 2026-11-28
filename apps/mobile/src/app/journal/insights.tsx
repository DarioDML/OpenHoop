import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { MetricKey } from '@/data/derived';
import { MIN_DAYS_PER_SIDE } from '@/data/healthDerived';
import { rankBehaviourImpacts, type BehaviourImpact, type UnderLogged } from '@/data/journalImpacts';
import { sortNotesNewestFirst } from '@/data/journalNotes';
import { findQuestion, trackedQuestions } from '@/data/journalQuestions';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber, formatSigned } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { JournalNoteCard } from '@/ui/health/JournalNoteCard';
import { CapHeader } from '@/ui/ListGroup';
import { Num } from '@/ui/Num';
import { Section } from '@/ui/Section';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';

type InsightMetric = Extract<MetricKey, 'readiness' | 'sleepScore' | 'hrv'>;

interface Target {
  key: InsightMetric;
  tabKey: TranslationKey;
  nameKey: TranslationKey;
  decimals: number;
}

const TARGETS: readonly Target[] = [
  { key: 'readiness', tabKey: 'score.readiness', nameKey: 'journal.insights.metric.readiness', decimals: 0 },
  { key: 'sleepScore', tabKey: 'journal.insights.tab.sleep', nameKey: 'journal.insights.metric.sleepScore', decimals: 0 },
  { key: 'hrv', tabKey: 'metric.hrv', nameKey: 'journal.insights.metric.hrv', decimals: 0 },
];

const RECENT_NOTES = 3;
const BAR_HEIGHT = 12;

function EffectBar({ effect, maxAbs, testID }: { effect: number; maxAbs: number; testID: string }) {
  const { colors } = useTheme();
  const share = maxAbs <= 0 ? 0 : Math.min(1, Math.abs(effect) / maxAbs);
  const width = `${Math.max(2, share * 50)}%` as const;
  const color = effect >= 0 ? colors.positive : colors.warning;
  return (
    <View testID={testID} style={{ height: BAR_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width,
          borderRadius: radius.pill,
          backgroundColor: color,
          ...(effect >= 0 ? { left: '50%' } : { right: '50%' }),
        }}
      />
    </View>
  );
}

export default function JournalInsightsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, userData, journalNotes } = useAppData();
  const [metric, setMetric] = useState<InsightMetric>('readiness');
  const target = TARGETS.find((item) => item.key === metric) ?? TARGETS[0];
  const questions = useMemo(() => trackedQuestions(userData.journalQuestions, userData.journal), [userData.journalQuestions, userData.journal]);
  const impacts = useMemo(() => rankBehaviourImpacts(days, userData.journal, questions, metric), [days, userData.journal, questions, metric]);
  const recentNotes = sortNotesNewestFirst(journalNotes).slice(0, RECENT_NOTES);
  const answeredAny = Object.values(userData.journal).some((answers) => Object.keys(answers).length > 0);
  const maxAbs = Math.max(0, ...impacts.ranked.map((item) => Math.abs(item.effectPct)));
  const decimals = target?.decimals ?? 0;

  const nameOf = (questionId: string): string => {
    const question = findQuestion(questionId);
    return question === undefined ? questionId : t(question.nameKey);
  };

  const rankedRow = (item: BehaviourImpact, index: number) => {
    const name = nameOf(item.questionId);
    const effect = `${formatSigned(item.effectPct, 0, language)}%`;
    const confidence = t(`readinessImpacts.confidence.${item.confidence}`);
    return (
      <View
        key={item.questionId}
        testID={`insight-${item.questionId}`}
        accessible
        accessibilityLabel={t('journal.insights.rowA11y', { name, value: effect, metric: target ? t(target.nameKey) : '', count: item.nWith, confidence })}
        style={[{ gap: spacing.sm, paddingVertical: spacing.md }, index < impacts.ranked.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="body" style={{ flex: 1, minWidth: 0 }}>
            {name}
          </AppText>
          <Num size={22} color={item.effectPct >= 0 ? colors.positive : colors.warning} testID={`insight-${item.questionId}-effect`}>
            {effect}
          </Num>
        </View>
        <EffectBar effect={item.effectPct} maxAbs={maxAbs} testID={`insight-${item.questionId}-bar`} />
        <AppText variant="caption" muted>
          {t('readinessImpacts.logged', { count: item.nWith, confidence })}
        </AppText>
        <AppText variant="caption" muted numeric>
          {`${t('journal.insights.compare', { withAvg: formatNumber(item.withAvg, decimals, language), withoutAvg: formatNumber(item.withoutAvg, decimals, language) })} · ${t('journal.insights.counts', { nWith: item.nWith, nWithout: item.nWithout })}`}
        </AppText>
      </View>
    );
  };

  const needsRow = (item: UnderLogged, index: number, total: number) => (
    <View
      key={item.questionId}
      testID={`insight-needs-${item.questionId}`}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }, index < total - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <AppText variant="body" style={{ fontWeight: '500' }}>
          {nameOf(item.questionId)}
        </AppText>
        <AppText variant="label" muted>
          {t(item.side === 'with' ? 'journal.insights.needsWith' : 'journal.insights.needsWithout', { have: item.have, need: item.need })}
        </AppText>
      </View>
      <View style={{ width: 80, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3 }}>
        <View style={{ width: `${Math.min(100, (item.have / Math.max(1, item.need)) * 100)}%`, height: 6, borderRadius: radius.pill, backgroundColor: colors.purple }} />
      </View>
    </View>
  );

  return (
    <HealthPage
      title={t('journal.insights.title')}
      tint="coach"
      testID="journal-insights-screen"
      hero={
        <Segmented<InsightMetric>
          options={TARGETS.map((item) => ({ value: item.key, label: t(item.tabKey), testID: `insights-tab-${item.key}` }))}
          value={metric}
          onChange={setMetric}
          testID="insights-metric"
        />
      }>
      <AppText variant="body" muted>
        {t('journal.insights.introMetric', { metric: target ? t(target.nameKey) : '' })}
      </AppText>
      {!answeredAny ? (
        <StateCard icon="journal" tone="neutral" title={t('journal.trends.emptyTitle')} body={t('journal.insights.empty')} testID="insights-empty" />
      ) : (
        <>
          {impacts.ranked.length > 0 ? (
            <Card style={{ paddingVertical: spacing.xs, gap: 0 }} testID="insights-ranked">
              {impacts.ranked.map(rankedRow)}
            </Card>
          ) : (
            <AppText variant="body" muted testID="insights-none-ranked">
              {t('journal.insights.needsMore', { min: MIN_DAYS_PER_SIDE })}
            </AppText>
          )}
          {impacts.needsMore.length > 0 ? (
            <>
              <CapHeader title={t('journal.insights.needsTitle')} />
              <Card style={{ paddingVertical: spacing.xs, gap: 0 }} testID="insights-needs">
                {impacts.needsMore.map((item, index) => needsRow(item, index, impacts.needsMore.length))}
              </Card>
              <AppText variant="caption" muted>
                {t('journal.insights.needsMore', { min: MIN_DAYS_PER_SIDE })}
              </AppText>
            </>
          ) : null}
        </>
      )}
      <AppText variant="label" muted>
        {`${t('journal.insights.method')} ${t('journal.insights.footnote')}`}
      </AppText>
      <Section title={t('journal.insights.notesTitle')}>
        {recentNotes.length === 0 ? (
          <AppText variant="body" muted testID="insights-notes-empty">
            {t('journal.insights.notesEmpty')}
          </AppText>
        ) : (
          recentNotes.map((note) => <JournalNoteCard key={note.id} note={note} />)
        )}
        <Button label={t('journal.insights.notesAll')} variant="secondary" onPress={() => router.push('/journal/log')} testID="insights-notes-all" />
      </Section>
    </HealthPage>
  );
}
