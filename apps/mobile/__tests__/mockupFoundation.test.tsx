import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { parseUnits } from '@/data/settingsCodec';
import { formatNumber } from '@/lib/format';
import {
  formatDistance,
  formatHeight,
  formatPace,
  formatTemperature,
  formatTemperatureDelta,
  formatWeight,
  heightToCm,
  weightToKg,
} from '@/lib/units';
import { CoachAsk } from '@/ui/CoachAsk';
import { RadioRow } from '@/ui/controls';
import { ChartLegend, DualLineChart } from '@/ui/DualLineChart';
import { LevelNote } from '@/ui/LevelNote';
import { SheetScreen } from '@/ui/SheetScreen';
import { ActionTile, MetricLinkTile } from '@/ui/Tiles';
import { ValueBars } from '@/ui/ValueBars';

import { withAppData } from './support/appData';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
});

describe('units', () => {
  it('reads only imperial as imperial and falls back to metric', () => {
    expect(parseUnits('imperial')).toBe('imperial');
    expect(parseUnits('metric')).toBe('metric');
    expect(parseUnits(null)).toBe('metric');
    expect(parseUnits('stones')).toBe('metric');
  });

  it('formats weight, height and distance in both systems', () => {
    expect(formatWeight(78, 'metric', 'nl')).toEqual({ value: '78,0', unit: 'kg' });
    expect(formatWeight(78, 'imperial', 'en')).toEqual({ value: '172.0', unit: 'lb' });
    expect(formatHeight(180, 'metric', 'en')).toEqual({ value: '180', unit: 'cm' });
    expect(formatHeight(180, 'imperial', 'en')).toEqual({ value: '5′ 11″', unit: '' });
    expect(formatDistance(5000, 'metric', 'en')).toEqual({ value: '5.00', unit: 'km' });
    expect(formatDistance(1609.344, 'imperial', 'en', 1)).toEqual({ value: '1.0', unit: 'mi' });
  });

  it('formats pace per kilometre or per mile', () => {
    expect(formatPace(300, 'metric')).toEqual({ value: '5:00', unit: '/km' });
    expect(formatPace(300, 'imperial')).toEqual({ value: '8:03', unit: '/mi' });
  });

  it('converts temperatures and temperature changes', () => {
    expect(formatTemperature(37, 'imperial', 'en')).toEqual({ value: '98.6', unit: '°F' });
    expect(formatTemperatureDelta(-0.4, 'metric', 'en')).toEqual({ value: '−0.4', unit: '°C' });
    expect(formatTemperatureDelta(0.5, 'imperial', 'en')).toEqual({ value: '+0.9', unit: '°F' });
    expect(formatTemperatureDelta(-0.04, 'metric', 'en')).toEqual({ value: '0.0', unit: '°C' });
  });

  it('never shows a negative zero', () => {
    expect(formatNumber(-0.04, 1, 'en')).toBe('0.0');
    expect(formatNumber(-0.04, 1, 'nl')).toBe('0,0');
    expect(formatNumber(-0, 0, 'en')).toBe('0');
    expect(formatNumber(-0.06, 1, 'en')).toBe('-0.1');
    expect(formatNumber(0.04, 1, 'en')).toBe('0.0');
  });

  it('converts typed values back to metric for storage', () => {
    expect(weightToKg(172, 'imperial')).toBeCloseTo(78.02, 2);
    expect(weightToKg(78, 'metric')).toBe(78);
    expect(heightToCm(70, 'imperial')).toBeCloseTo(177.8, 1);
  });
});

describe('ValueBars', () => {
  it('writes each value above its bar and marks the highlighted day', async () => {
    await render(
      withAppData(
        <ValueBars
          testID="bars"
          highlight={2}
          bars={[
            { key: 'mo', value: 71, label: 'Mo' },
            { key: 'tu', value: null, label: 'Tu' },
            { key: 'we', value: 62, label: 'We', display: '62%' },
          ]}
        />,
      ),
    );
    expect(screen.getByText('71')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByTestId('bars-tu').props.accessibilityLabel).toBe('Tu: –');
    expect(screen.getByTestId('bars-we').props.accessibilityLabel).toBe('We: 62%');
  });

  it('scales bars to the largest value or the given maximum and tells zero from missing', async () => {
    const bars = [
      { key: 'a', value: 10, label: 'A' },
      { key: 'b', value: 5, label: 'B' },
      { key: 'c', value: 0, label: 'C' },
      { key: 'd', value: null, label: 'D' },
    ];
    const height = (id: string): number => {
      const style = screen.getByTestId(id).props.style as { height: number };
      return style.height;
    };
    const view = await render(withAppData(<ValueBars testID="v" height={80} bars={bars} showValues={false} fill />));
    expect(height('v.bar.a')).toBe(80);
    expect(height('v.bar.b')).toBe(40);
    expect(height('v.bar.c')).toBe(2);
    expect(screen.queryByTestId('v.bar.d')).toBeNull();
    expect(screen.getByTestId('v.missing.d')).toHaveTextContent('–');
    expect(screen.queryByTestId('v.missing.c')).toBeNull();
    await view.rerender(withAppData(<ValueBars testID="v" height={80} max={20} bars={bars} />));
    expect(height('v.bar.a')).toBe(40);
    expect(height('v.bar.b')).toBe(20);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByTestId('v.missing.d')).toBeNull();
    expect(screen.getByText('–')).toBeTruthy();
  });
});

describe('DualLineChart', () => {
  it('puts each line on its own scale and breaks a line at missing days', async () => {
    await render(
      withAppData(
        <DualLineChart
          testID="dual"
          height={120}
          accessibilityLabel="chart"
          labels={['Mo', 'Tu', 'We']}
          primary={{ data: [21, 0, 10.5], max: 21, color: 'blue', dots: true }}
          secondary={{ data: [100, null, 50], max: 100, color: 'yellow', dots: true }}
        />,
      ),
    );
    expect(screen.queryByTestId('dual.dot.primary.0')).toBeNull();
    await fireEvent(screen.getByLabelText('chart'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 310, height: 120 } } });
    const dot = (id: string): { cx: number; cy: number } => screen.getByTestId(id).props as { cx: number; cy: number };
    expect(dot('dual.dot.primary.0')).toMatchObject({ cx: 5, cy: 5 });
    expect(dot('dual.dot.primary.1')).toMatchObject({ cx: 155, cy: 115 });
    expect(dot('dual.dot.primary.2')).toMatchObject({ cx: 305, cy: 60 });
    expect(dot('dual.dot.secondary.0')).toMatchObject({ cy: 5 });
    expect(dot('dual.dot.secondary.2')).toMatchObject({ cy: 60 });
    expect(screen.queryByTestId('dual.dot.secondary.1')).toBeNull();
    expect(screen.getByTestId('dual.line.primary.0')).toBeTruthy();
    expect(screen.queryByTestId('dual.line.primary.1')).toBeNull();
    expect(screen.getByTestId('dual.line.secondary.1')).toBeTruthy();
    expect(screen.getByText('Tu')).toBeTruthy();
  });

  it('shows only the first and last label when there are more than seven', async () => {
    const labels = Array.from({ length: 30 }, (_, i) => `d${i}`);
    const data = labels.map((_, i) => i % 21);
    await render(
      withAppData(
        <>
          <DualLineChart testID="long" accessibilityLabel="long" labels={labels} primary={{ data, max: 21, color: 'blue', dots: true }} secondary={{ data, max: 100, color: 'yellow' }} />
          <ChartLegend items={[{ label: 'Load', color: 'blue' }]} />
        </>,
      ),
    );
    await fireEvent(screen.getByLabelText('long'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    expect(screen.getByText('d0')).toBeTruthy();
    expect(screen.getByText('d29')).toBeTruthy();
    expect(screen.queryByText('d1')).toBeNull();
    expect(screen.queryByTestId('long.dot.primary.0')).toBeNull();
    expect(screen.getByText('Load')).toBeTruthy();
  });
});

describe('LevelNote', () => {
  it('shows the level badge with its explanation', async () => {
    await render(withAppData(<LevelNote level="B" text="Fitted model, gap measured." testID="note" />));
    expect(screen.getByText('Fitted model, gap measured.')).toBeTruthy();
    expect(screen.getByLabelText(/Level B/)).toBeTruthy();
  });
});

describe('CoachAsk', () => {
  it('opens the coach with the question filled in', async () => {
    await render(withAppData(<CoachAsk question="Why was my consistency only sufficient?" testID="ask" />));
    await fireEvent.press(screen.getByTestId('ask'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { ask: 'Why was my consistency only sufficient?' } });
  });
});

describe('SheetScreen', () => {
  it('closes from the backdrop and from the close button', async () => {
    await render(
      withAppData(
        <SheetScreen title="Quick actions" testID="sheet">
          <Text>Body</Text>
        </SheetScreen>,
      ),
    );
    expect(screen.getByText('Quick actions')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});

describe('RadioRow', () => {
  it('reports its selected state and calls back on press', async () => {
    const onSelect = jest.fn();
    await render(withAppData(<RadioRow label="Peak performance" subtitle="100% of need" selected={false} onSelect={onSelect} testID="radio" />));
    const row = screen.getByTestId('radio');
    expect(row.props.accessibilityState).toEqual({ selected: false, disabled: false });
    await fireEvent.press(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Tiles', () => {
  it('navigates from an action tile', async () => {
    await render(withAppData(<ActionTile icon="plus" iconColor="#3FB0FF" label="Add activity" href="/activity/add" testID="tile" />));
    await fireEvent.press(screen.getByTestId('tile'));
    expect(mockPush).toHaveBeenCalledWith('/activity/add');
  });

  it('shows a metric tile value with its caption, or a dash when there is none', async () => {
    await render(
      withAppData(
        <>
          <MetricLinkTile icon="health" iconColor="#19E6A0" iconBackground="#0F3F3C" label="Vitals" value="5/5" caption="Within range" testID="vitals" />
          <MetricLinkTile icon="health" iconColor="#19E6A0" iconBackground="#0F3F3C" label="Labs" value={null} testID="labs" />
        </>,
      ),
    );
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByTestId('vitals').props.accessibilityLabel).toBe('Vitals, 5/5, Within range');
    expect(screen.getByText('–')).toBeTruthy();
  });
});
