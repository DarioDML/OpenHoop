import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { stepperStacks } from '@/ui/plan/TargetStepper';

import { withAppData } from './support/appData';

const mockWindow = { width: 360, height: 780, scale: 3, fontScale: 1.3 };

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

import PlanSetupScreen from '@/app/plan/setup';

function phone(fontScale: number, width = 360): void {
  Object.assign(mockWindow, { width, height: 780, fontScale });
}

function direction(testID: string): unknown {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style).flexDirection;
}

describe('plan targets on a 360 dp phone', () => {
  afterEach(() => phone(1.3));

  it('stacks the stepper below its title at any text size up to a wide screen', () => {
    expect(stepperStacks(360 / 1.3)).toBe(true);
    expect(stepperStacks(360)).toBe(true);
    expect(stepperStacks(412)).toBe(true);
    expect(stepperStacks(600)).toBe(false);
  });

  it.each([1, 1.3])('puts the strength stepper on its own row at font scale %s', async (fontScale) => {
    phone(fontScale);
    await render(withAppData(<PlanSetupScreen />));
    expect(direction('plan-strength-layout')).toBe('column');
    expect(direction('plan-load-days-layout')).toBe('column');
  });

  it('keeps title and stepper side by side on a tablet', async () => {
    phone(1, 800);
    await render(withAppData(<PlanSetupScreen />));
    expect(direction('plan-strength-layout')).toBe('row');
  });
});
