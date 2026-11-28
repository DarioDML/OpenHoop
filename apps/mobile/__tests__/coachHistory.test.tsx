import type { CoachConversation } from '@openhoop/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { conversationWhen, groupConversations } from '@/coach/history';

import { makeController, memoryRepo, withCoach } from './support/coach';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import CoachHistoryScreen from '@/app/coach/history';

const WED_NOON = Date.UTC(2026, 10, 25, 12) / 1000;
const DAY = 86_400;

function conversation(id: number, updatedAt: number): CoachConversation {
  return { id, title: `Chat ${id}`, createdAt: updatedAt, updatedAt, messageCount: 2 };
}

describe('conversation grouping', () => {
  it('splits this week from earlier, counting from Monday', () => {
    const list = [conversation(1, WED_NOON), conversation(2, WED_NOON - 2 * DAY), conversation(3, WED_NOON - 3 * DAY), conversation(4, WED_NOON - 20 * DAY)];
    const groups = groupConversations(list, WED_NOON, 0);
    expect(groups.thisWeek.map((c) => c.id)).toEqual([1, 2]);
    expect(groups.earlier.map((c) => c.id)).toEqual([3, 4]);
  });

  it('names the day as today, yesterday, a weekday or a date', () => {
    expect(conversationWhen(WED_NOON, WED_NOON, 0)).toEqual({ kind: 'today' });
    expect(conversationWhen(WED_NOON - DAY, WED_NOON, 0)).toEqual({ kind: 'yesterday' });
    expect(conversationWhen(WED_NOON - 2 * DAY, WED_NOON, 0)).toEqual({ kind: 'weekday', day: '2026-11-23' });
    expect(conversationWhen(WED_NOON - 3 * DAY, WED_NOON, 0)).toEqual({ kind: 'date', day: '2026-11-22' });
  });

  it('uses the local day, not UTC', () => {
    const lateSunday = Date.UTC(2026, 10, 22, 23, 30) / 1000;
    expect(groupConversations([conversation(1, lateSunday)], WED_NOON, 3600).thisWeek).toHaveLength(1);
    expect(groupConversations([conversation(1, lateSunday)], WED_NOON, 0).earlier).toHaveLength(1);
  });
});

describe('history screen', () => {
  it('groups conversations under This week and Earlier with a chevron and starts a new one from the header', async () => {
    const repo = memoryRepo();
    const now = Math.floor(Date.now() / 1000);
    await repo.appendExchange(null, 'Recent chat', [{ role: 'user', text: 'a', chips: '[]' }], now);
    await repo.appendExchange(null, 'Old chat', [{ role: 'user', text: 'b', chips: '[]' }], now - 40 * DAY);
    const { controller } = makeController({ repo });
    await controller.load();
    await render(withCoach(<CoachHistoryScreen />, controller));
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('Today · 1 message')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('coach-history-new'));
    expect(router.push).toHaveBeenCalledWith('/coach');
    expect(controller.getState().activeId).toBeNull();
  });
});
