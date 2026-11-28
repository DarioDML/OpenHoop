import type { CoachConversation } from '@openhoop/core';

import { addDays, weekStart } from '@/data/derived';
import { unixToIsoDate } from '@/lib/dates';

export interface ConversationGroups {
  thisWeek: CoachConversation[];
  earlier: CoachConversation[];
}

export type ConversationWhen = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'weekday'; day: string } | { kind: 'date'; day: string };

export function groupConversations(conversations: readonly CoachConversation[], nowS: number, tzOffsetS: number): ConversationGroups {
  const monday = weekStart(unixToIsoDate(nowS, tzOffsetS));
  const groups: ConversationGroups = { thisWeek: [], earlier: [] };
  for (const conversation of conversations) {
    (unixToIsoDate(conversation.updatedAt, tzOffsetS) >= monday ? groups.thisWeek : groups.earlier).push(conversation);
  }
  return groups;
}

export function conversationWhen(updatedAt: number, nowS: number, tzOffsetS: number): ConversationWhen {
  const today = unixToIsoDate(nowS, tzOffsetS);
  const day = unixToIsoDate(updatedAt, tzOffsetS);
  if (day === today) return { kind: 'today' };
  if (day === addDays(today, -1)) return { kind: 'yesterday' };
  if (day >= weekStart(today) && day < today) return { kind: 'weekday', day };
  return { kind: 'date', day };
}
