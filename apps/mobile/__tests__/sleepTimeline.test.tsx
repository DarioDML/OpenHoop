import { fireEvent, render, screen } from '@testing-library/react-native';

import { SleepTimeline } from '@/ui/SleepTimeline';

import { FIXTURE_NOW, withAppData } from './support/appData';

const ONSET = Date.UTC(2026, 10, 28, 0, 17) / 1000;
const ASLEEP_S = 8 * 3600 + 51 * 60;

describe('SleepTimeline', () => {
  it('shades the whole sleep window when the time in bed runs on after the wake-up', async () => {
    const period = { onset: ONSET, offset: ONSET + ASLEEP_S - 1, asleepS: ASLEEP_S, inBedS: 10 * 3600 + 20 * 60, nap: false, source: 'detected' as const, editId: null };
    await render(withAppData(<SleepTimeline periods={[period]} tzOffsetS={3600} />, 'en', {}, FIXTURE_NOW.getTime() / 1000));
    await fireEvent(screen.getByTestId('sleep-timeline'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 40 } } });
    const outer = Number(screen.getByTestId('sleep-timeline-bed-0').props.width);
    const inner = Number(screen.getByTestId('sleep-timeline-asleep-0').props.width);
    expect(outer).toBeGreaterThan(0);
    expect(inner).toBeCloseTo(outer, 5);
  });
});
