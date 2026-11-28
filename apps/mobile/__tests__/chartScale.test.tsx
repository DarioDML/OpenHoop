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

  it('pads a flat series to a round range of about the minimum span', () => {
    expect(flatDomain(46, 10)).toEqual({ min: 40, max: 55 });
    expect(flatDomain(84, 3.36)).toEqual({ min: 82, max: 86 });
    expect(flatDomain(5.2, 0.4)).toEqual({ min: 5, max: 5.4 });
    expect(flatDomain(34.3, 1)).toEqual({ min: 33.5, max: 35 });
    for (const [value, minSpan] of [[46, 10], [84, 3.36], [5.2, 0.4], [34.3, 1], [-0.35, 0.1]] as const) {
      const domain = flatDomain(value, minSpan);
      expect(domain.max - domain.min).toBeGreaterThanOrEqual(minSpan);
      expect(domain.max - domain.min).toBeLessThanOrEqual(minSpan * 3);
      expect(domain.min).toBeLessThanOrEqual(value);
      expect(domain.max).toBeGreaterThanOrEqual(value);
    }
  });

  it('snaps away float noise on step edges', () => {
    expect(flatDomain(-0.35, 0.1)).toEqual({ min: -0.4, max: -0.3 });
  });

  it('keeps the span when a flat non-negative series sits on zero', () => {
    const domain = flatDomain(0, 1);
    expect(domain.min).toBe(0);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(1);
  });

  it('never puts a flat SpO2 series above 100 %', () => {
    for (const value of [100, 98, 99.5]) {
      const domain = flatDomain(value, 3, { max: 100 });
      expect(domain.max).toBeLessThanOrEqual(100);
      expect(domain.max - domain.min).toBeGreaterThanOrEqual(3);
      expect(domain.min).toBeLessThanOrEqual(value);
    }
    expect(flatDomain(98, 3, { max: 100 })).toEqual({ min: 96, max: 100 });
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
    await render(withAppData(<LineChart testID="chart" data={[84]} formatTick={tick} emptyLabel="none" startLabel="9/9" endLabel="9/9" minSpan={3.36} />));
    expect(screen.getByText('86')).toBeTruthy();
    expect(screen.getByText('82')).toBeTruthy();
    expect(screen.getAllByText('9/9')).toHaveLength(1);
    expect(screen.getByTestId('chart-x-single')).toBeTruthy();
  });

  it('clamps the axis of a flat SpO2 series at 100', async () => {
    await render(withAppData(<LineChart testID="chart" data={[100]} minSpan={3} clamp={{ max: 100 }} formatTick={tick} emptyLabel="none" />));
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('96')).toBeTruthy();
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
  it('shows a single date once, centred', async () => {
    await render(withAppData(<BarChart testID="bars" data={[3]} formatTick={tick} startLabel="11/28" endLabel="11/28" />));
    expect(screen.getAllByText('11/28')).toHaveLength(1);
    expect(screen.getByTestId('bars-x-single')).toBeTruthy();
  });
});
