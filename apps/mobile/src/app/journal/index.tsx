import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays } from '@/data/derived';
import { notesForDay } from '@/data/journalNotes';
import { JOURNAL_QUESTIONS, activeQuestions } from '@/data/journalQuestions';
import type { JournalAnswer } from '@/data/userData';
import { formatShortDay, todayIso } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { JournalNoteCard } from '@/ui/health/JournalNoteCard';
import { JournalRow } from '@/ui/health/JournalRow';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { GradientFill } from '@/ui/Screen';
import { IconButton } from '@/ui/TopBar';
import { radius, spacing, useTheme } from '@/ui/theme';

const WINDOW_DAYS = 14;

type Draft = Record<string, JournalAnswer>;
type DayChoice = 'yesterday' | 'today' | 'earlier';

export default function JournalScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData, journalNotes, updateUserData } = useAppData();
  const today = todayIso(new Date());
  const [offset, setOffset] = useState(0);
  const day = addDays(today, -offset);
  const stored = userData.journal[day];
  const [draft, setDraft] = useState<Draft>(stored ?? {});
  const [saved, setSaved] = useState(false);
  const questions = useMemo(() => {
    const active = activeQuestions(userData.journalQuestions);
    const asked = new Set(active.map((q) => q.id));
    return [...active, ...JOURNAL_QUESTIONS.filter((q) => !asked.has(q.id) && stored?.[q.id] !== undefined)];
  }, [userData.journalQuestions, stored]);

  useEffect(() => {
    setDraft(userData.journal[day] ?? {});
    setSaved(false);
  }, [day, userData.journal]);

  const dayLabel = offset === 0 ? t('common.today') : offset === 1 ? t('common.yesterday') : formatShortDay(day, language);
  const choice: DayChoice = offset === 0 ? 'today' : offset === 1 ? 'yesterday' : 'earlier';
  const dayNotes = useMemo(() => notesForDay(journalNotes, day), [journalNotes, day]);
  const openLog = (): void => router.push({ pathname: '/journal/log', params: { day } });
  const answered = questions.filter((q) => draft[q.id] !== undefined).length;

  const save = async (): Promise<void> => {
    await updateUserData({ journal: { ...userData.journal, [day]: draft } });
    setSaved(true);
  };

  const pagerButton = (direction: 'prev' | 'next') => {
    const disabled = direction === 'prev' ? offset >= WINDOW_DAYS : offset === 0;
    return (
      <Pressable
        testID={`journal-${direction}`}
        accessibilityRole="button"
        accessibilityLabel={direction === 'prev' ? t('health.hr.prevDay') : t('health.hr.nextDay')}
        disabled={disabled}
        onPress={() => setOffset((o) => (direction === 'prev' ? Math.min(WINDOW_DAYS, o + 1) : Math.max(0, o - 1)))}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
        <Icon name={direction === 'prev' ? 'back' : 'chevronRight'} color={colors.textMuted} size={18} />
      </Pressable>
    );
  };

  return (
    <HealthPage
      title={t('journal.title')}
      tint="coach"
      testID="journal"
      footer={<Button label={saved ? t('common.saved') : t('journal.save')} onPress={() => void save()} disabled={answered === 0} testID="journal-save" />}
      right={<IconButton icon="edit" label={t('journal.customize.title')} onPress={() => router.push('/journal/customize')} testID="journal-edit" />}
      hero={
        <View style={{ gap: spacing.sm }}>
          <Segmented<DayChoice>
            options={[
              { value: 'yesterday', label: t('common.yesterday'), testID: 'journal-yesterday' },
              { value: 'today', label: t('common.today'), testID: 'journal-today' },
            ]}
            value={choice}
            onChange={(next) => setOffset(next === 'today' ? 0 : 1)}
            testID="journal-day-switch"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            {pagerButton('prev')}
            <AppText variant="label" soft numeric testID="journal-day" style={{ minWidth: 96, textAlign: 'center' }}>
              {dayLabel}
            </AppText>
            {pagerButton('next')}
          </View>
        </View>
      }>
      <Pressable
        testID="journal-voice"
        accessibilityRole="button"
        accessibilityLabel={t('journal.voiceRow')}
        onPress={openLog}
        style={({ pressed }) => ({
          minHeight: 56,
          borderRadius: radius.pill,
          backgroundColor: colors.coach.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingLeft: 18,
          paddingRight: spacing.sm,
          paddingVertical: spacing.sm,
          opacity: pressed ? 0.85 : 1,
        })}>
        <AppText variant="body" muted style={{ flex: 1 }}>
          {t('journal.voiceRow')}
        </AppText>
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <GradientFill id="journal-voice-mic" from={colors.coach.from} to={colors.coach.to} angle="diagonal" />
          <Icon name="mic" color={colors.coach.on} size={20} />
        </View>
      </Pressable>

      {questions.length === 0 ? (
        <Card testID="journal-no-questions">
          <AppText variant="body" muted>
            {t('journal.noQuestions')}
          </AppText>
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs, gap: 0 }} testID="journal-questions">
          {questions.map((question, index) => (
            <JournalRow
              key={question.id}
              question={question}
              answer={draft[question.id]}
              last={index === questions.length - 1}
              onChange={(value) => {
                setSaved(false);
                setDraft((current) => ({ ...current, [question.id]: value }));
              }}
            />
          ))}
        </Card>
      )}
      <Pressable
        testID="journal-customize"
        accessibilityRole="link"
        onPress={() => router.push('/journal/customize')}
        hitSlop={8}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <AppText variant="cap" color={colors.purple}>
          {`${t('journal.customizeLink')} →`}
        </AppText>
      </Pressable>

      <CapHeader title={t('journal.notesTitle')} />
      {dayNotes.map((note) => (
        <JournalNoteCard key={note.id} note={note} showDay={false} onPress={openLog} />
      ))}
      <Card onPress={openLog} accessibilityLabel={t('journal.addNote')} testID="journal-add-note">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="journal" color={colors.textMuted} size={20} />
          <AppText variant="body" muted style={{ flex: 1 }}>
            {t('journal.addNote')}
          </AppText>
        </View>
      </Card>

      <ListGroup>
        <ListRow
          title={t('journal.trends.title')}
          icon={{ icon: 'trends', color: colors.purple, background: colors.purpleSoft }}
          onPress={() => router.push('/journal/trends')}
          testID="journal-trends"
        />
        <ListRow
          title={t('journal.insights.title')}
          icon={{ icon: 'sparkle', color: colors.purple, background: colors.purpleSoft }}
          onPress={() => router.push('/journal/insights')}
          testID="journal-insights"
        />
      </ListGroup>
    </HealthPage>
  );
}
