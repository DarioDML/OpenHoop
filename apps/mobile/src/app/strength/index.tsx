import type { PlannedExercise, StrengthSession } from '@openhoop/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { activeSession, exercisesUsed, finishedSessions, sessionTotals, sessionsThisWeek, templateMinutes, type SessionLoad } from '@/data/strength';
import { PRESET_IDS, presetTemplates, type PresetId } from '@/data/strengthPresets';
import { useT } from '@/i18n/useT';
import { StatRow, StatTile } from '@/ui/activity/parts';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { StrengthPage, loadText, todayIso, useStrengthLabels } from '@/ui/strength/parts';
import { useSessionLoads } from '@/ui/strength/useSessionLoads';
import { IconButton } from '@/ui/TopBar';
import { radius, spacing, useTheme } from '@/ui/theme';

const RECENT = 5;
const SAVED = 3;

type PresetNotice = { kind: 'added'; names: string[]; existing: string[] } | { kind: 'existing'; names: string[] } | { kind: 'failed' } | null;

export default function StrengthHomeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { strength, strengthActions, exportData } = useAppData();
  const labels = useStrengthLabels();
  const [showAll, setShowAll] = useState(false);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [notice, setNotice] = useState<PresetNotice>(null);
  const [adding, setAdding] = useState<PresetId | null>(null);
  const busy = useRef(false);

  const active = activeSession(strength.sessions);
  const finished = finishedSessions(strength.sessions).reverse();
  const recent = showAll ? finished : finished.slice(0, RECENT);
  const loads = useSessionLoads(recent);
  const used = exercisesUsed(strength.sessions);
  const saved = showAllSaved ? strength.templates : strength.templates.slice(0, SAVED);

  const begin = async (templateId: number | null, name: string, exercises: PlannedExercise[]): Promise<void> => {
    const id = await strengthActions.startSession(templateId, name, exercises);
    if (id !== null) router.push('/strength/live');
  };

  const addPreset = async (preset: PresetId): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setAdding(preset);
    setNotice(null);
    try {
      const plan = presetTemplates(
        preset,
        (id) => t(`strength.preset.template.${id}`),
        labels.libraryName,
        strength.templates.map((template) => template.name),
      );
      const names: string[] = [];
      for (const input of plan.create) {
        if ((await strengthActions.saveTemplate(null, input)) !== null) names.push(input.name);
      }
      if (names.length < plan.create.length) setNotice({ kind: 'failed' });
      else if (names.length === 0) setNotice({ kind: 'existing', names: plan.existing });
      else setNotice({ kind: 'added', names, existing: plan.existing });
    } finally {
      busy.current = false;
      setAdding(null);
    }
  };

  const recentMeta = (session: StrengthSession, load: SessionLoad | undefined): string => {
    const totals = sessionTotals(session.sets);
    const base = t('strength.home.recentMeta', { day: labels.day(session.day), sets: totals.sets, volume: labels.volumeText(totals.volumeKg) });
    return load === undefined ? base : `${base} · ${loadText(t, load, labels.num)}`;
  };

  return (
    <StrengthPage title={t('strength.home.title')} testID="strength-home">
      {active !== null ? (
        <Card tone="accent" testID="strength-active">
          <AppText variant="cardTitle">{t('strength.home.resume')}</AppText>
          <AppText variant="body" muted>
            {t('strength.home.resumeBody', { name: active.name })}
          </AppText>
          <Button label={t('strength.home.resumeAction')} icon="play" onPress={() => router.push('/strength/live')} testID="strength-resume" />
        </Card>
      ) : null}

      <Pressable
        testID="strength-coach-card"
        accessibilityRole="button"
        accessibilityLabel={`${t('strength.home.coachTitle')}. ${t('strength.home.coachBody')}`}
        onPress={() => router.push({ pathname: '/strength/builder', params: { coach: '1' } })}
        style={({ pressed }) => ({
          backgroundColor: colors.coach.surface,
          borderRadius: radius.md,
          padding: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          opacity: pressed ? 0.85 : 1,
        })}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkle" color={colors.text} size={22} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="cardTitle">{t('strength.home.coachTitle')}</AppText>
          <AppText variant="label" muted>
            {t('strength.home.coachBody')}
          </AppText>
        </View>
      </Pressable>

      <CapHeader
        title={t('strength.home.saved')}
        action={!showAllSaved && strength.templates.length > SAVED ? t('strength.home.seeAll') : undefined}
        onAction={() => setShowAllSaved(true)}
      />
      {strength.templates.length === 0 ? (
        <AppText variant="body" muted testID="strength-templates-empty">
          {t('strength.home.templatesEmpty')}
        </AppText>
      ) : (
        <ListGroup>
          {saved.map((template) => {
            const minutes = templateMinutes(template.id, strength.sessions);
            const count = t('strength.home.templateMeta', { count: template.items.length });
            return (
              <ListRow
                key={template.id}
                testID={`template-edit-${template.id}`}
                title={template.name}
                subtitle={minutes === null ? count : `${count} · ${t('strength.home.templateMinutes', { minutes })}`}
                icon={{ icon: 'dumbbell', color: colors.metric.loadBright, background: colors.tint.load }}
                onPress={() => router.push({ pathname: '/strength/builder', params: { id: String(template.id) } })}
                chevron={false}
                right={
                  active === null ? (
                    <IconButton icon="play" label={t('strength.home.startNamed', { name: template.name })} color={colors.text} size={20} onPress={() => void begin(template.id, template.name, template.items)} testID={`template-start-${template.id}`} />
                  ) : null
                }
              />
            );
          })}
        </ListGroup>
      )}

      <CapHeader title={t('strength.home.templates')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {PRESET_IDS.map((preset) => (
          <Pressable
            key={preset}
            testID={`preset-${preset}`}
            accessibilityRole="button"
            accessibilityLabel={`${t(`strength.preset.${preset}`)}. ${t('strength.preset.hint')}`}
            accessibilityState={{ disabled: adding !== null }}
            disabled={adding !== null}
            onPress={() => void addPreset(preset)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              justifyContent: 'center',
              opacity: adding === preset || pressed ? 0.6 : 1,
            })}>
            <AppText variant="body">{t(`strength.preset.${preset}`)}</AppText>
          </Pressable>
        ))}
      </View>
      <AppText
        variant="caption"
        color={notice?.kind === 'failed' ? colors.negative : colors.textMuted}
        testID="strength-preset-notice"
        accessibilityLiveRegion="polite">
        {notice === null
          ? t('strength.preset.hint')
          : notice.kind === 'added'
            ? [t('strength.preset.added', { names: notice.names.join(', ') }), notice.existing.length > 0 ? t('strength.preset.alreadySaved', { names: notice.existing.join(', ') }) : null]
                .filter((part): part is string => part !== null)
                .join(' ')
            : notice.kind === 'existing'
              ? t('strength.preset.existing', { names: notice.names.join(', ') })
              : t('strength.preset.failed')}
      </AppText>

      <CapHeader title={t('strength.home.recent')} action={!showAll && finished.length > RECENT ? t('strength.home.seeAll') : undefined} onAction={() => setShowAll(true)} />
      {recent.length === 0 ? (
        <AppText variant="body" muted testID="strength-recent-empty">
          {t('strength.home.recentEmpty')}
        </AppText>
      ) : (
        <ListGroup>
          {recent.map((session) => (
            <ListRow
              key={session.id}
              testID={`session-${session.id}`}
              title={session.name}
              subtitle={recentMeta(session, loads.get(session.id))}
              icon={{ icon: 'check', color: colors.positive, background: colors.positiveSoft }}
              href={{ pathname: '/strength/summary', params: { id: String(session.id) } }}
            />
          ))}
        </ListGroup>
      )}
      {!showAll && finished.length > RECENT ? (
        <Button label={t('strength.home.showAll', { count: finished.length })} variant="tertiary" onPress={() => setShowAll(true)} testID="strength-show-all" />
      ) : null}

      <Button label={t('strength.home.newWorkout')} icon="plus" onPress={() => router.push('/strength/builder')} testID="strength-new-template" />
      {active === null ? (
        <Button label={t('strength.home.startEmpty')} variant="secondary" icon="play" onPress={() => void begin(null, t('strength.session.defaultName'), [])} testID="strength-start-empty" />
      ) : null}

      <StatRow>
        <StatTile label={t('strength.home.sessionsWeek')} value={`${sessionsThisWeek(strength.sessions, todayIso())}`} testID="strength-week-count" />
      </StatRow>

      <CapHeader title={t('strength.home.exercises')} />
      {used.length === 0 ? (
        <AppText variant="body" muted testID="strength-exercises-empty">
          {t('strength.home.exercisesEmpty')}
        </AppText>
      ) : (
        <ListGroup>
          {used.map((exercise) => (
            <ListRow
              key={exercise.key}
              testID={`exercise-${exercise.key}`}
              title={labels.nameOf(exercise.key, exercise.name)}
              subtitle={labels.muscleName(exercise.muscle)}
              href={{ pathname: '/strength/exercise', params: { key: exercise.key } }}
            />
          ))}
        </ListGroup>
      )}

      <Button label={t('strength.home.trends')} variant="secondary" icon="trends" onPress={() => router.push('/strength/trends')} testID="strength-trends-link" />
      <Button label={t('strength.home.export')} variant="tertiary" icon="share" onPress={() => void exportData()} testID="strength-export" />
      <AppText variant="caption" muted>
        {t('strength.home.exportHint')}
      </AppText>
      <AppText variant="caption" muted>
        {t('strength.home.intro')}
      </AppText>
    </StrengthPage>
  );
}
