import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Chip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListGroup';
import { SHEET_MAX_HEIGHT, SHEET_TALL_HEIGHT } from '@/ui/SheetScreen';
import { ACTION_LABEL_LINES } from '@/ui/Tiles';

import { withAppData } from './support/appData';

const mockWindow = { width: 412, height: 915, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

import ActionCenterScreen from '@/app/action-center';
import DatePickerScreen from '@/app/home/date-picker';
import AccuracyScreen from '@/app/settings/accuracy';
import SafetyLockScreen from '@/app/settings/safety-lock';
import LoadScreen from '@/app/load/index';
import WelcomeScreen from '@/app/onboarding/index';
import ConnectProviderScreen from '@/app/settings/connect-provider';
import VitalsScreen from '@/app/health/vitals';

type Rendered = ReturnType<typeof screen.toJSON>;

function testIdsInOrder(node: Rendered): string[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap((child) => testIdsInOrder(child));
  const own = typeof node.props.testID === 'string' ? [node.props.testID] : [];
  const children = (node.children ?? []).flatMap((child) => (typeof child === 'string' ? [] : testIdsInOrder(child)));
  return [...own, ...children];
}

function s24(): void {
  Object.assign(mockWindow, { width: 360, height: 780, fontScale: 1.3 });
}

function row() {
  return <ListRow testID="row" title="Lab test booking" subtitle="Order blood tests" chip={<Chip label="No provider yet" small testID="row-chip" />} chevron={false} />;
}

afterEach(() => {
  Object.assign(mockWindow, { width: 412, height: 915, fontScale: 1 });
});

describe('ListRow chip', () => {
  it('keeps the chip beside the label on a roomy screen', async () => {
    await render(row());
    expect(screen.getByTestId('row-chip')).toBeTruthy();
    expect(within(screen.getByTestId('row-text')).queryByTestId('row-chip')).toBeNull();
  });

  it('moves the chip under the label on a 360dp phone at 1.3 text size', async () => {
    s24();
    await render(row());
    expect(within(screen.getByTestId('row-text')).getByTestId('row-chip')).toBeTruthy();
  });
});

describe('screens at S24 size', () => {
  it('puts the provider status under each provider name', async () => {
    s24();
    await render(withAppData(<ConnectProviderScreen />));
    expect(within(screen.getByTestId('provider-labs-text')).getByText('No provider yet')).toBeTruthy();
  });

  it('puts the accuracy status under the metric name', async () => {
    s24();
    await render(withAppData(<AccuracyScreen />));
    expect(within(screen.getByTestId('accuracy-result-readiness-text')).getByTestId('accuracy-result-readiness-status')).toBeTruthy();
  });

  it('keeps the status beside the metric name on a roomy screen', async () => {
    await render(withAppData(<AccuracyScreen />));
    expect(within(screen.getByTestId('accuracy-result-readiness-text')).queryByTestId('accuracy-result-readiness-status')).toBeNull();
  });

  it('uses short vitals tile labels', async () => {
    s24();
    await render(withAppData(<VitalsScreen />));
    expect(within(screen.getByTestId('vital-rhr')).getByText('Resting HR')).toBeTruthy();
    expect(within(screen.getByTestId('vital-resp')).getByText('Breathing')).toBeTruthy();
  });

  it('keeps the whole unit beside the value and the level badge on its own row', async () => {
    s24();
    await render(withAppData(<VitalsScreen />));
    const unit = screen.getByTestId('vital-resp-unit');
    expect(unit).toHaveTextContent('/min');
    expect(unit).toHaveStyle({ flexShrink: 0 });
    expect(within(screen.getByTestId('vital-resp-status')).getByText('B')).toBeTruthy();
  });
});

describe('bottom sheets at S24 size', () => {
  it('keeps the Today button pinned under the calendar', async () => {
    s24();
    await render(withAppData(<DatePickerScreen />));
    expect(within(screen.getByTestId('date-picker-footer')).getByTestId('picker-today')).toBeTruthy();
    expect(screen.getByTestId('date-picker-sheet')).toHaveStyle({ maxHeight: SHEET_TALL_HEIGHT });
  });

  it('draws the action center as a sheet with tile labels of up to three lines', async () => {
    s24();
    await render(withAppData(<ActionCenterScreen />));
    expect(screen.getByTestId('action-center-sheet')).toHaveStyle({ maxHeight: SHEET_MAX_HEIGHT });
    const label = screen.getByTestId('action-symptoms-label');
    expect(label.props.numberOfLines).toBe(ACTION_LABEL_LINES);
    expect(screen.getByTestId('action-planner-label')).toHaveTextContent('Sleep planner & alarm');
    expect(label.props.allowFontScaling).toBe(false);
    expect(label).toHaveStyle({ fontSize: 13 * 1.3 });
  });

  it('draws the safety lock as a sheet with the caveat above its pinned buttons', async () => {
    s24();
    await render(withAppData(<SafetyLockScreen />));
    expect(screen.getByTestId('safety-lock-sheet')).toBeTruthy();
    const ids = testIdsInOrder(screen.toJSON());
    expect(ids.indexOf('safety-nothing-sent')).toBeGreaterThan(-1);
    expect(ids.indexOf('safety-nothing-sent')).toBeLessThan(ids.indexOf('danger-confirm'));
    expect(within(screen.getByTestId('safety-lock-footer')).getByTestId('danger-confirm')).toBeTruthy();
    expect(within(screen.getByTestId('safety-lock-footer')).getByTestId('safety-cancel')).toBeTruthy();
  });
});

describe('small labels at S24 size', () => {
  it('stacks Start activity and Buzz at target so neither label is cut', async () => {
    s24();
    await render(withAppData(<LoadScreen />));
    expect(screen.getByTestId('load-ready-actions')).toHaveStyle({ flexDirection: 'column' });
    expect(screen.getByTestId('load-buzz-label').props.numberOfLines).toBe(2);
  });

  it('keeps them side by side on a roomy screen', async () => {
    await render(withAppData(<LoadScreen />));
    expect(screen.getByTestId('load-ready-actions')).toHaveStyle({ flexDirection: 'row' });
  });
});

describe('welcome at S24 size', () => {
  it('shows both chips and lets the ring take only the space that is left', async () => {
    s24();
    await render(withAppData(<WelcomeScreen />));
    expect(screen.getByTestId('welcome-chip-bands')).toHaveTextContent('Works with 5.0 and MG');
    expect(screen.getByTestId('welcome-chip-open')).toBeTruthy();
    const ring = (): number => Number(StyleSheet.flatten(screen.getByTestId('welcome-ring', { includeHiddenElements: true }).props.style).height);
    expect(ring()).toBe(172);
    await fireEvent(screen.getByTestId('screen-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 520 } } });
    await fireEvent(screen.getByTestId('screen-scroll'), 'contentSizeChange', 360, 600);
    expect(ring()).toBe(91);
    await fireEvent(screen.getByTestId('welcome-space'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 328, height: 12 } } });
    expect(ring()).toBe(91);
    await fireEvent(screen.getByTestId('welcome-space'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 328, height: 40 } } });
    expect(ring()).toBe(145);
    await fireEvent(screen.getByTestId('screen-scroll'), 'contentSizeChange', 360, 2000);
    expect(ring()).toBe(64);
  });

  it('keeps the chips under the rings and the rings at most 220 dp', async () => {
    await render(withAppData(<WelcomeScreen />));
    const ids = testIdsInOrder(screen.toJSON());
    expect(ids.indexOf('welcome-chips')).toBeGreaterThan(ids.indexOf('welcome-ring'));
    await fireEvent(screen.getByTestId('welcome-space'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 400 } } });
    expect(StyleSheet.flatten(screen.getByTestId('welcome-ring', { includeHiddenElements: true }).props.style).height).toBe(220);
  });
});

describe('ListRow value at S24 size', () => {
  it('puts the value on the title line so the description gets the full width', async () => {
    s24();
    await render(<ListRow testID="goal" title="Weight goal" subtitle="Optional. Colours the change and draws a line on the chart." value="Not set" onPress={() => undefined} />);
    expect(within(screen.getByTestId('goal-text')).getByTestId('goal-value')).toHaveTextContent('Not set');
  });

  it('keeps the value at the right edge on a roomy screen', async () => {
    await render(<ListRow testID="goal" title="Weight goal" subtitle="Optional." value="Not set" onPress={() => undefined} />);
    expect(within(screen.getByTestId('goal-text')).queryByTestId('goal-value')).toBeNull();
  });
});
