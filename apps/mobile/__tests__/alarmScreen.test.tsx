import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DEFAULT_ALARM_PLAN, type AlarmPlan } from '@/data/alarm';
import type { AlarmView } from '@/data/types';

import { fixtureAlarmActions, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HapticAlarmScreen from '@/app/sleep/alarm';
import SleepPlannerScreen from '@/app/sleep/planner';

const PLAN: AlarmPlan = { ...DEFAULT_ALARM_PLAN, enabled: true, minutes: 6 * 60 + 45 };

function inHours(hours: number): number {
  return Math.floor(Date.now() / 1000) + hours * 3600;
}

function alarm(patch: Partial<AlarmView>): AlarmView {
  return { plan: DEFAULT_ALARM_PLAN, armed: null, events: [], problem: null, ...patch };
}

describe('Haptic alarm', () => {
  it('saves a new time only after a change', async () => {
    const save = jest.fn(async () => 'on-band' as const);
    await render(withAppData(<HapticAlarmScreen />, 'en', { alarmActions: { ...fixtureAlarmActions(), save } }));
    expect(screen.getByTestId('alarm-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('07:00')).toBeTruthy();
    await fireEvent(screen.getByTestId('alarm-enabled'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('alarm-earlier'));
    await fireEvent.press(screen.getByTestId('alarm-earlier'));
    expect(screen.getByText('06:50')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alarm-hour-earlier'));
    await fireEvent.press(screen.getByTestId('alarm-hour-later'));
    await fireEvent.press(screen.getByTestId('alarm-hour-later'));
    expect(screen.getByText('07:50')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alarm-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...DEFAULT_ALARM_PLAN, enabled: true, minutes: 7 * 60 + 50 }));
  });

  it('says when the alarm is on the band and when it is not yet', async () => {
    const wakeAt = inHours(30);
    await render(withAppData(<HapticAlarmScreen />, 'en', { alarm: alarm({ plan: PLAN, armed: { wakeAt, armedAt: inHours(-1) } }) }));
    expect(screen.getByTestId('alarm-status-text').props.children).toMatch(/^Rings /);
    await render(withAppData(<HapticAlarmScreen />, 'en', { alarm: alarm({ plan: PLAN, armed: { wakeAt: inHours(-2), armedAt: inHours(-20) } }) }));
    expect(screen.getByTestId('alarm-status-text').props.children).toMatch(/^Not on the band yet/);
  });

  it('shows the problem and how the last alarm ended', async () => {
    const rang = inHours(-3);
    await render(
      withAppData(<HapticAlarmScreen />, 'en', {
        alarm: alarm({
          plan: PLAN,
          problem: { key: 'alarm.problem.rejected', params: { status: 'invalid-alarm-time' } },
          events: [
            { t: rang + 20, kind: 'haptics-ended', endedBy: 'double-tap' },
            { t: rang, kind: 'fired', endedBy: null },
          ],
        }),
      }),
    );
    expect(screen.getByTestId('alarm-problem').props.children).toBe('The band refused the alarm (invalid-alarm-time).');
    expect(screen.getByTestId('alarm-last').props.children).toMatch(/stopped with a double tap$/);
  });

  it('does not count a haptics test as an alarm ring', async () => {
    const buzz = inHours(-1);
    await render(
      withAppData(<HapticAlarmScreen />, 'en', {
        alarm: alarm({ plan: PLAN, events: [{ t: buzz + 2, kind: 'haptics-ended', endedBy: 'expired' }, { t: buzz, kind: 'haptics-fired', endedBy: null }] }),
      }),
    );
    expect(screen.queryByTestId('alarm-last')).toBeNull();
  });

  it('tests the alarm buzz and keeps smart wake marked as not built', async () => {
    const ring = jest.fn(async () => true);
    await render(withAppData(<HapticAlarmScreen />, 'en', { alarmActions: { ...fixtureAlarmActions(), ring } }));
    await fireEvent.press(screen.getByTestId('alarm-test'));
    expect(ring).toHaveBeenCalled();
    expect(screen.getByTestId('alarm-smart-not-built')).toBeTruthy();
  });

  it('shows the planned time on the planner card', async () => {
    await render(withAppData(<SleepPlannerScreen />, 'en', { alarm: alarm({ plan: PLAN }) }));
    expect(screen.getByTestId('planner-alarm-time').props.children).toBe('06:45');
    expect(screen.getByTestId('planner-alarm-state').props.children).toBe('Not on the band yet');
  });
});
