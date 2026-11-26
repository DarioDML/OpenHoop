import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '@/ui/Screen';

function withInsets(bottom: number) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom } }}>
      <Screen>
        <Text>body</Text>
      </Screen>
    </SafeAreaProvider>
  );
}

describe('Screen system bar backdrops', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it('covers the Android 3-button navigation bar', async () => {
    Platform.OS = 'android';
    await render(withInsets(48));
    expect(screen.getByTestId('nav-bar-scrim')).toBeTruthy();
  });

  it('leaves gesture navigation and the iPhone home indicator uncovered', async () => {
    Platform.OS = 'android';
    await render(withInsets(16));
    expect(screen.queryByTestId('nav-bar-scrim')).toBeNull();
    Platform.OS = 'ios';
    await render(withInsets(34));
    expect(screen.queryByTestId('nav-bar-scrim')).toBeNull();
  });

  it('shows the status bar backdrop only after scrolling', async () => {
    Platform.OS = 'android';
    await render(withInsets(48));
    expect(screen.queryByTestId('status-bar-scrim')).toBeNull();
    await act(async () => {
      fireEvent.scroll(screen.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { x: 0, y: 40 } } });
    });
    expect(screen.getByTestId('status-bar-scrim')).toBeTruthy();
  });
});
