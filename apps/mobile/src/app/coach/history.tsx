import type { CoachConversation } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { useCoach } from '@/coach/CoachContext';
import { conversationWhen, groupConversations } from '@/coach/history';
import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { AppText } from '@/ui/AppText';
import { ErrorCard } from '@/ui/coach/parts';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SearchField } from '@/ui/SearchField';
import { StateCard } from '@/ui/StateCard';
import { useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

function dayText(day: string, language: Language, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { ...options, timeZone: 'UTC' });
}

function whenText(t: TFunction, language: Language, updatedAt: number, nowS: number, tz: number): string {
  const when = conversationWhen(updatedAt, nowS, tz);
  if (when.kind === 'today') return t('common.today');
  if (when.kind === 'yesterday') return t('common.yesterday');
  if (when.kind === 'weekday') return dayText(when.day, language, { weekday: 'short' });
  return dayText(when.day, language, { day: 'numeric', month: 'short' });
}

export default function CoachHistoryScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { state, controller } = useCoach();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle === '' ? state.conversations : state.conversations.filter((c) => c.title.toLocaleLowerCase().includes(needle));
  const now = new Date();
  const nowS = Math.floor(now.getTime() / 1000);
  const tz = deviceTzOffsetS(now);
  const groups = groupConversations(shown, nowS, tz);

  const confirmDelete = (id: number): void => {
    Alert.alert(t('coach.history.deleteTitle'), t('coach.history.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void controller.deleteConversation(id) },
    ]);
  };

  const startNew = (): void => {
    void controller.open(null);
    router.push('/coach');
  };

  const row = (conversation: CoachConversation) => (
    <ListRow
      key={conversation.id}
      title={conversation.title}
      subtitle={
        conversation.messageCount === 1
          ? t('coach.history.rowMetaOne', { when: whenText(t, language, conversation.updatedAt, nowS, tz) })
          : t('coach.history.rowMeta', { when: whenText(t, language, conversation.updatedAt, nowS, tz), count: conversation.messageCount })
      }
      onPress={() => {
        void controller.open(conversation.id);
        router.push('/coach');
      }}
      chevron
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
  );

  return (
    <HealthPage
      title={t('coach.history.screenTitle')}
      tint="coach"
      testID="coach-history"
      right={<IconButton icon="plus" label={t('coach.newConversation')} onPress={startNew} color={colors.text} testID="coach-history-new" />}
      hero={
        state.conversations.length > 0 ? (
          <SearchField value={query} onChangeText={setQuery} label={t('coach.history.search')} placeholder={t('coach.history.searchPlaceholder')} testID="coach-history-search" />
        ) : undefined
      }>
      {state.error === 'storage' ? <ErrorCard message={t('coach.error.storage')} /> : null}
      {state.conversations.length === 0 ? (
        <StateCard
          icon="coach"
          tone="purple"
          title={t('coach.history.empty')}
          body={t('coach.history.emptyBody')}
          actionLabel={t('coach.history.start')}
          onAction={startNew}
          testID="coach-history-empty"
        />
      ) : shown.length === 0 ? (
        <AppText variant="body" muted testID="coach-history-no-match">
          {t('coach.history.noMatch')}
        </AppText>
      ) : (
        <>
          {groups.thisWeek.length > 0 ? <ListGroup title={t('coach.history.thisWeek')}>{groups.thisWeek.map(row)}</ListGroup> : null}
          {groups.earlier.length > 0 ? <ListGroup title={t('coach.history.earlier')}>{groups.earlier.map(row)}</ListGroup> : null}
        </>
      )}
      <AppText variant="label" muted testID="coach-history-note">
        {state.conversations.length > 0 ? `${t('coach.history.body')} ${t('coach.history.deleteHint')}` : t('coach.history.body')}
      </AppText>
    </HealthPage>
  );
}
