import { fireEvent, render, screen } from '@testing-library/react-native';

import { BarChart } from '@/ui/BarChart';
import { flatDomain, hourDomain, niceStep } from '@/ui/chartScale';
import { LineChart } from '@/ui/LineChart';

import { withAppData } from './support/appData';

const tick = (value: number): string => String(value);

describe('chart scale', () => {
  it('picks a round step for a span', () => {
    expect(niceStep(4.2)).toBe(5);
    expect(niceStep(0.26)).toBeCloseTo(0.2, 10);
    expect(niceStep(2.3)).toBe(2);
  });

  it('pads a flat series to a round range around the value', () => {
    expect(flatDomain(84, 0.1)).toEqual({ min: 80, max: 90 });
    expect(flatDomain(46, 1)).toEqual({ min: 44, max: 48 });
    expect(flatDomain(5.2, 0.1)).toEqual({ min: 5, max: 5.4 });
    expect(flatDomain(34.3, 1)).toEqual({ min: 33, max: 36 });
  });

  it('never drops a flat non-negative series below zero', () => {
    const domain = flatDomain(0, 1);
    expect(domain.min).toBe(0);
    expect(domain.max).toBeGreaterThan(0);
  });

  it('rounds bedtimes out to whole hours, at least one hour apart', () => {
    expect(hourDomain([])).toBeNull();
    expect(hourDomain([847])).toEqual({ min: 780, max: 900 });
    expect(hourDomain([600, 600])).toEqual({ min: 540, max: 660 });
    expect(hourDomain([590, 790])).toEqual({ min: 540, max: 840 });
  });
});

describe('LineChart', () => {
  it('labels one value with a round range and one date', async () => {
    await render(withAppData(<LineChart testID="chart" data={[84]} formatTick={tick} emptyLabel="none" startLabel="9/9" endLabel="9/9" minSpan={0.1} />));
    expect(screen.getByText('90')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getAllByText('9/9')).toHaveLength(1);
    expect(screen.getByTestId('chart-x-single')).toBeTruthy();
  });

  it('keeps both dates when the series spans days', async () => {
    await render(withAppData(<LineChart testID="chart" data={[50, 52]} formatTick={tick} emptyLabel="none" startLabel="11/1" endLabel="11/2" />));
    expect(screen.getByText('11/1')).toBeTruthy();
    expect(screen.getByText('11/2')).toBeTruthy();
    expect(screen.queryByTestId('chart-x-single')).toBeNull();
  });

  it('draws a one-sided band up to the edge of the chart', async () => {
    await render(withAppData(<LineChart testID="chart" data={[84]} band={{ low: null, high: 115 }} formatTick={tick} emptyLabel="none" />));
    await fireEvent(screen.getByTestId('chart-plot'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    const rect = screen.getByTestId('chart-band').props as { y: number; height: number };
    expect(rect.y).toBeGreaterThan(8);
    expect(rect.y + rect.height).toBeCloseTo(112, 0);
  });
});

describe('BarChart', () => {
  it('shows a single date once', async () => {
    await render(withAppData(<BarChart data={[3]} formatTick={tick} startLabel="11/28" endLabel="11/28" />));
    expect(screen.getAllByText('11/28')).toHaveLength(1);
  });
});
