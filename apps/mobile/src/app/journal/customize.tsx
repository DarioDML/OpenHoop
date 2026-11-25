import { useAppData } from '@/data/context';
import { DEFAULT_JOURNAL_QUESTIONS, JOURNAL_QUESTIONS } from '@/data/journalQuestions';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { ListGroup, ListRow } from '@/ui/ListGroup';

export default function JournalCustomizeScreen() {
  const { t } = useT();
  const { userData, updateUserData } = useAppData();
  const selected = userData.journalQuestions ?? [...DEFAULT_JOURNAL_QUESTIONS];

  const toggle = (id: string, on: boolean): void => {
    const next = on ? [...selected, id] : selected.filter((existing) => existing !== id);
    void updateUserData({ journalQuestions: JOURNAL_QUESTIONS.map((q) => q.id).filter((qid) => next.includes(qid)) });
  };

  return (
    <HealthPage
      title={t('journal.customize.title')}
      testID="journal-customize-screen"
      hero={
        <AppText variant="lead" muted>
          {t('journal.customize.intro')}
        </AppText>
      }>
      <ListGroup>
        {JOURNAL_QUESTIONS.map((question) => (
          <ListRow
            key={question.id}
            testID={`customize-${question.id}`}
            title={t(question.labelKey)}
            chevron={false}
            right={<Toggle value={selected.includes(question.id)} onChange={(on) => toggle(question.id, on)} label={t(question.labelKey)} testID={`customize-toggle-${question.id}`} />}
          />
        ))}
      </ListGroup>
      <Button
        label={t('journal.customize.reset')}
        variant="tertiary"
        onPress={() => void updateUserData({ journalQuestions: null })}
        testID="customize-reset"
      />
    </HealthPage>
  );
}
