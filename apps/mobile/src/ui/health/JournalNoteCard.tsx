import type { JournalNote } from '@openhoop/core';
import type { ReactNode } from 'react';

import { findQuestion } from '@/data/journalQuestions';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { spacing } from '@/ui/theme';

interface Props {
  note: JournalNote;
  showDay?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
}

export function JournalNoteCard({ note, showDay = true, onPress, accessibilityLabel, children }: Props) {
  const { t } = useT();
  const labels = note.tags.map((tag) => findQuestion(tag)).flatMap((question) => (question ? [t(question.labelKey)] : []));
  return (
    <Card testID={`journal-note-${note.id}`} onPress={onPress} accessibilityLabel={accessibilityLabel} style={{ gap: spacing.sm }}>
      {showDay ? (
        <AppText variant="label" muted numeric>
          {note.day}
        </AppText>
      ) : null}
      <AppText variant="body" testID={`journal-note-${note.id}-text`}>
        {note.body}
      </AppText>
      {labels.length > 0 ? (
        <AppText variant="caption" muted testID={`journal-note-${note.id}-tags`}>
          {labels.join(' · ')}
        </AppText>
      ) : null}
      {children}
    </Card>
  );
}
