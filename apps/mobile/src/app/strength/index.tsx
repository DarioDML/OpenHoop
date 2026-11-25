import type { PlannedExercise, StrengthSession } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { activeSession, exercisesUsed, finishedSessions, sessionTotals, sessionsThisWeek } from '@/data/strength';
import { useT } from '@/i18n/useT';
import { formatShortDay } from '@/lib/format';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Section } from '@/ui/Section';
import { StrengthPage, todayIso, useStrengthLabels } from '@/ui/strength/parts';
import { spacing, useTheme } from '@/ui/theme';

const RECENT = 5;

export default function StrengthHomeScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { strength, strengthActions, exportData } = useAppData();
  const labels = useStrengthLabels();
  const [showAll, setShowAll] = useState(false);

  const active = activeSession(strength.sessions);
  const finished = finishedSessions(strength.sessions).reverse();
  const recent = showAll ? finished : finished.slice(0, RECENT);
  const used = exercisesUsed(strength.sessions);

  const begin = async (templateId: number | null, name: string, exercises: PlannedExercise[]): Promise<void> => {
    const id = await strengthActions.startSession(templateId, name, exercises);
    if (id !== null) router.push('/strength/live');
  };

  const sessionTitle = (session: StrengthSession): string => session.name;

  return (
    <StrengthPage title={t('strength.home.title')} intro={t('strength.home.intro')} testID="strength-home">
      {active !== null ? (
        <Card tone="accent" testID="strength-active">
          <AppText variant="cardTitle">{t('strength.home.resume')}</AppText>
          <AppText variant="body" muted>
            {t('strength.home.resumeBody', { name: active.name })}
          </AppText>
          <Button label={t('strength.home.resumeAction')} icon="play" onPress={() => router.push('/strength/live')} testID="strength-resume" />
        </Card>
      ) : (
        <Button
          label={t('strength.home.startEmpty')}
          icon="play"
          onPress={() => void begin(null, t('strength.session.defaultName'), [])}
          testID="strength-start-empty"
        />
      )}

      <StatRow>
        <StatTile label={t('strength.home.sessionsWeek')} value={`${sessionsThisWeek(strength.sessions, todayIso())}`} testID="strength-week-count" />
      </StatRow>

      <Section title={t('strength.home.templates')}>
        {strength.templates.length === 0 ? (
          <AppText variant="body" muted testID="strength-templates-empty">
            {t('strength.home.templatesEmpty')}
          </AppText>
        ) : (
          strength.templates.map((template) => (
            <Card key={template.id} testID={`template-${template.id}`}>
              <AppText variant="bodyStrong">{template.name}</AppText>
              <AppText variant="label" muted>
                {t('strength.home.templateMeta', { count: template.items.length })}
              </AppText>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                <Button
                  label={t('strength.home.edit')}
                  variant="tertiary"
                  onPress={() => router.push({ pathname: '/strength/builder', params: { id: String(template.id) } })}
                  testID={`template-edit-${template.id}`}
                />
                <Button
                  label={t('strength.home.start')}
                  variant="secondary"
                  disabled={active !== null}
                  onPress={() => void begin(template.id, template.name, template.items)}
                  testID={`template-start-${template.id}`}
                />
              </View>
            </Card>
          ))
        )}
        <Button label={t('strength.home.newTemplate')} variant="secondary" icon="plus" onPress={() => router.push('/strength/builder')} testID="strength-new-template" />
      </Section>

      <Section title={t('strength.home.recent')}>
        {recent.length === 0 ? (
          <AppText variant="body" muted testID="strength-recent-empty">
            {t('strength.home.recentEmpty')}
          </AppText>
        ) : (
          recent.map((session) => {
            const totals = sessionTotals(session.sets);
            return (
              <Card
                key={session.id}
                href={{ pathname: '/strength/summary', params: { id: String(session.id) } }}
                accessibilityLabel={sessionTitle(session)}
                testID={`session-${session.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong">{sessionTitle(session)}</AppText>
                  <AppText variant="label" muted numeric>
                    {formatShortDay(session.day, language)} · {t('strength.home.sessionMeta', { sets: totals.sets, volume: labels.kg(totals.volumeKg) })}
                  </AppText>
                </View>
                <Icon name="chevronRight" color={colors.textMuted} size={18} />
              </Card>
            );
          })
        )}
        {!showAll && finished.length > RECENT ? (
          <Button label={t('strength.home.showAll', { count: finished.length })} variant="secondary" onPress={() => setShowAll(true)} testID="strength-show-all" />
        ) : null}
      </Section>

      <Section title={t('strength.home.exercises')}>
        {used.length === 0 ? (
          <AppText variant="body" muted testID="strength-exercises-empty">
            {t('strength.home.exercisesEmpty')}
          </AppText>
        ) : (
          used.map((exercise) => (
            <Card
              key={exercise.key}
              href={{ pathname: '/strength/exercise', params: { key: exercise.key } }}
              accessibilityLabel={labels.nameOf(exercise.key, exercise.name)}
              testID={`exercise-${exercise.key}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{labels.nameOf(exercise.key, exercise.name)}</AppText>
                <AppText variant="caption" muted>
                  {labels.muscleName(exercise.muscle)}
                </AppText>
              </View>
              <Icon name="chevronRight" color={colors.textMuted} size={18} />
            </Card>
          ))
        )}
      </Section>

      <Button label={t('strength.home.trends')} variant="secondary" icon="trends" onPress={() => router.push('/strength/trends')} testID="strength-trends-link" />
      <Button label={t('strength.home.export')} variant="tertiary" icon="share" onPress={() => void exportData()} testID="strength-export" />
      <AppText variant="caption" muted>
        {t('strength.home.exportHint')}
      </AppText>
    </StrengthPage>
  );
}
