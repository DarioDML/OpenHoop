import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays } from '@/data/derived';
import { activeQuestions } from '@/data/journalQuestions';
import type { JournalAnswer } from '@/data/userData';
import { formatShortDay, todayIso } from '@/lib/format';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/controls';
import { Card } from '@/ui/Card';
import { HealthPage } from '@/ui/health/HealthPage';
import { JournalRow } from '@/ui/health/JournalRow';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/TopBar';
import { spacing, useTheme } from '@/ui/theme';

const WINDOW_DAYS = 14;

type Draft = Record<string, JournalAnswer>;

export default function JournalScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData } = useAppData();
  const today = todayIso(new Date());
  const [offset, setOffset] = useState(0);
  const day = addDays(today, -offset);
  const stored = userData.journal[day];
  const [draft, setDraft] = useState<Draft>(stored ?? {});
  const [saved, setSaved] = useState(false);
  const questions = useMemo(() => activeQuestions(userData.journalQuestions), [userData.journalQuestions]);

  useEffect(() => {
    setDraft(userData.journal[day] ?? {});
    setSaved(false);
  }, [day, userData.journal]);

  const dayLabel = offset === 0 ? t('common.today') : offset === 1 ? t('common.yesterday') : formatShortDay(day, language);
  const answered = questions.filter((q) => draft[q.id] !== undefined).length;

  const save = async (): Promise<void> => {
    await updateUserData({ journal: { ...userData.journal, [day]: draft } });
    setSaved(true);
  };

  return (
    <HealthPage
      title={t('journal.title')}
      testID="journal"
      right={<IconButton icon="trends" label={t('journal.trends.title')} onPress={() => router.push('/journal/trends')} />}
      hero={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            testID="journal-prev"
            accessibilityRole="button"
            accessibilityLabel={t('health.hr.prevDay')}
            disabled={offset >= WINDOW_DAYS}
            onPress={() => setOffset((o) => Math.min(WINDOW_DAYS, o + 1))}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: offset >= WINDOW_DAYS ? 0.3 : 1 }}>
            <Icon name="back" color={colors.text} />
          </Pressable>
          <AppText variant="h2" testID="journal-day">
            {dayLabel}
          </AppText>
          <Pressable
            testID="journal-next"
            accessibilityRole="button"
            accessibilityLabel={t('health.hr.nextDay')}
            disabled={offset === 0}
            onPress={() => setOffset((o) => Math.max(0, o - 1))}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: offset === 0 ? 0.3 : 1 }}>
            <Icon name="chevronRight" color={colors.text} />
          </Pressable>
        </View>
      }
      footer={<Button label={saved ? t('common.saved') : t('journal.save')} onPress={() => void save()} disabled={answered === 0} testID="journal-save" />}>
      <Card onPress={() => router.push('/journal/log')} accessibilityLabel={t('journal.voice')} testID="journal-voice">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="mic" color={colors.textMuted} size={20} />
          <AppText variant="body" muted style={{ flex: 1 }}>
            {t('journal.voice')}
          </AppText>
        </View>
      </Card>
      {questions.map((question) => (
        <JournalRow
          key={question.id}
          question={question}
          answer={draft[question.id]}
          onChange={(value) => {
            setSaved(false);
            setDraft((current) => ({ ...current, [question.id]: value }));
          }}
        />
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Button label={t('journal.customizeLink')} variant="tertiary" onPress={() => router.push('/journal/customize')} testID="journal-customize" />
        <Button label={t('journal.insights.title')} variant="tertiary" onPress={() => router.push('/journal/insights')} testID="journal-insights" />
      </View>
    </HealthPage>
  );
}
