import { useState } from 'react';
import { View } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { MEMORY_NOTES, MEMORY_NOTE_LENGTH } from '@/coach/controller';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { ErrorCard } from '@/ui/coach/parts';
import { Button, Field, Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { spacing } from '@/ui/theme';

type AddState = 'idle' | 'invalid' | 'full';

function validNote(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.length <= MEMORY_NOTE_LENGTH;
}

export default function CoachMemoryScreen() {
  const { t } = useT();
  const { userData, updateUserData } = useAppData();
  const { state, controller } = useCoach();
  const [draft, setDraft] = useState('');
  const [addState, setAddState] = useState<AddState>('idle');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const memoryOn = userData.coach.memory;
  const full = state.memory.length >= MEMORY_NOTES;

  const add = async (): Promise<void> => {
    if (full) {
      setAddState('full');
      return;
    }
    if (!validNote(draft)) {
      setAddState('invalid');
      return;
    }
    if (await controller.addMemory(draft)) {
      setDraft('');
      setAddState('idle');
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (editing === null || !validNote(editing.text)) return;
    if (await controller.updateMemory(editing.id, editing.text)) setEditing(null);
  };

  return (
    <HealthPage
      title={t('coach.memory.title')}
      tint="coach"
      testID="coach-memory"
      hero={
        <AppText variant="lead" muted>
          {t('coach.memory.body')}
        </AppText>
      }>
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong">{t('coach.memory.toggle')}</AppText>
          <AppText variant="label" muted>
            {memoryOn ? t('coach.memory.toggleBody') : t('coach.memory.offNote')}
          </AppText>
        </View>
        <Toggle
          label={t('coach.memory.toggle')}
          value={memoryOn}
          onChange={(value) => void updateUserData({ coach: { ...userData.coach, memory: value } })}
          testID="coach-memory-toggle"
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Field
          label={t('coach.memory.addLabel')}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setAddState('idle');
          }}
          maxLength={MEMORY_NOTE_LENGTH + 20}
          error={addState !== 'idle'}
          hint={
            addState === 'invalid'
              ? t('coach.memory.invalid', { max: MEMORY_NOTE_LENGTH })
              : addState === 'full'
                ? t('coach.memory.full', { max: MEMORY_NOTES })
                : undefined
          }
          testID="coach-memory-input"
        />
        <Button label={t('coach.memory.add')} variant="secondary" onPress={() => void add()} testID="coach-memory-add" />
      </Card>

      {state.memory.length === 0 ? (
        <AppText variant="body" muted testID="coach-memory-empty">
          {t('coach.memory.empty')}
        </AppText>
      ) : (
        state.memory.map((note) =>
          editing?.id === note.id ? (
            <Card key={note.id} style={{ gap: spacing.md }} testID={`coach-memory-edit-${note.id}`}>
              <Field
                label={t('coach.memory.editLabel')}
                value={editing.text}
                onChangeText={(text) => setEditing({ id: note.id, text })}
                error={!validNote(editing.text)}
                hint={validNote(editing.text) ? undefined : t('coach.memory.invalid', { max: MEMORY_NOTE_LENGTH })}
                testID="coach-memory-edit-input"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('common.save')} variant="secondary" onPress={() => void saveEdit()} style={{ flex: 1 }} testID="coach-memory-edit-save" />
                <Button label={t('common.cancel')} variant="tertiary" onPress={() => setEditing(null)} />
              </View>
            </Card>
          ) : (
            <Card key={note.id} style={{ gap: spacing.sm }} testID={`coach-memory-note-${note.id}`}>
              <AppText variant="body">{note.text}</AppText>
              <Chip label={note.source === 'coach' ? t('coach.memory.fromCoach') : t('coach.memory.fromYou')} tone={note.source === 'coach' ? 'purple' : 'neutral'} small />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('common.edit')} variant="tertiary" onPress={() => setEditing({ id: note.id, text: note.text })} testID={`coach-memory-edit-button-${note.id}`} />
                <Button
                  label={t('common.delete')}
                  variant="tertiary"
                  accessibilityLabel={t('coach.memory.deleteNote')}
                  onPress={() => void controller.deleteMemory(note.id)}
                  testID={`coach-memory-delete-${note.id}`}
                />
              </View>
            </Card>
          ),
        )
      )}
    </HealthPage>
  );
}
