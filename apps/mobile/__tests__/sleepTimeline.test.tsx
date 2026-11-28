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

  it('shows the time in bed before and after the sleep around the sleep bar', async () => {
    const offset = ONSET + ASLEEP_S - 1;
    const period = {
      onset: ONSET,
      offset,
      asleepS: ASLEEP_S,
      inBedS: offset + 89 * 60 - (ONSET - 13 * 60) + 1,
      nap: false,
      source: 'detected' as const,
      editId: null,
      bedOnset: ONSET - 13 * 60,
      bedOffset: offset + 89 * 60,
    };
    await render(withAppData(<SleepTimeline periods={[period]} tzOffsetS={3600} />, 'en', {}, FIXTURE_NOW.getTime() / 1000));
    await fireEvent(screen.getByTestId('sleep-timeline'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 40 } } });
    const bed = screen.getByTestId('sleep-timeline-bed-0').props;
    const asleep = screen.getByTestId('sleep-timeline-asleep-0').props;
    expect(Number(bed.x)).toBeLessThan(Number(asleep.x));
    expect(Number(bed.x) + Number(bed.width)).toBeGreaterThan(Number(asleep.x) + Number(asleep.width));
    expect(screen.getByTestId('sleep-timeline-in-bed-0')).toHaveTextContent('In bed', { exact: false });
    expect(screen.getByTestId('sleep-timeline-in-bed-0')).toHaveTextContent('01:04–11:36', { exact: false });
    expect(screen.getByTestId('sleep-timeline-in-bed-0')).toHaveTextContent('10 h 33 min', { exact: false });
  });
});
