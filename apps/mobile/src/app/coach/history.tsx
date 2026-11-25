import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { ErrorCard } from '@/ui/coach/parts';
import { Field } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { useTheme } from '@/ui/theme';

export default function CoachHistoryScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { state, controller } = useCoach();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle === '' ? state.conversations : state.conversations.filter((c) => c.title.toLocaleLowerCase().includes(needle));
  const tz = deviceTzOffsetS(new Date());

  const confirmDelete = (id: number): void => {
    Alert.alert(t('coach.history.deleteTitle'), t('coach.history.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void controller.deleteConversation(id) },
    ]);
  };

  return (
    <HealthPage
      title={t('coach.history.title')}
      tint="coach"
      testID="coach-history"
      hero={
        <AppText variant="lead" muted>
          {t('coach.history.body')}
        </AppText>
      }>
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      {state.conversations.length > 0 ? (
        <Field label={t('coach.history.search')} value={query} onChangeText={setQuery} autoCorrect={false} testID="coach-history-search" />
      ) : null}
      {state.conversations.length === 0 ? (
        <AppText variant="body" muted testID="coach-history-empty">
          {t('coach.history.empty')}
        </AppText>
      ) : shown.length === 0 ? (
        <AppText variant="body" muted testID="coach-history-no-match">
          {t('coach.history.noMatch')}
        </AppText>
      ) : (
        <ListGroup>
          {shown.map((conversation) => (
            <ListRow
              key={conversation.id}
              title={conversation.title}
              subtitle={t('coach.history.meta', {
                count: conversation.messageCount,
                date: formatShortDay(unixToIsoDate(conversation.updatedAt, tz), language),
              })}
              onPress={() => {
                void controller.open(conversation.id);
                router.push('/coach');
              }}
              chevron={false}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('coach.history.delete')}
                  hitSlop={10}
                  onPress={() => confirmDelete(conversation.id)}
                  testID={`coach-history-delete-${conversation.id}`}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" color={colors.negative} size={18} />
                </Pressable>
              }
              testID={`coach-history-${conversation.id}`}
            />
          ))}
        </ListGroup>
      )}
    </HealthPage>
  );
}
