import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { WordFitText } from '@/ui/AppText';

const mockWindow = { width: 360, height: 780, scale: 3, fontScale: 1.3 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

function size(node: ReturnType<typeof screen.getByTestId>): number {
  const flat = StyleSheet.flatten(node.props.style);
  return typeof flat.fontSize === 'number' ? flat.fontSize : Number.NaN;
}

async function layout(lines: readonly string[]): Promise<void> {
  await fireEvent(screen.getByTestId('label'), 'textLayout', { nativeEvent: { lines: lines.map((text) => ({ text })) } });
}

afterEach(() => {
  Object.assign(mockWindow, { width: 360, height: 780, fontScale: 1.3 });
});

describe('WordFitText', () => {
  it('starts at the size the system text scale asks for', async () => {
    await render(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Log symptoms
      </WordFitText>,
    );
    expect(size(screen.getByTestId('label'))).toBeCloseTo(13 * 1.3, 5);
  });

  it('steps down when a word is split across lines', async () => {
    await render(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Log symptoms
      </WordFitText>,
    );
    await layout(['Log sym', 'ptoms']);
    expect(size(screen.getByTestId('label'))).toBeCloseTo(13 * 1.3 * 0.9, 5);
  });

  it('keeps its size when lines break between words, even without trailing spaces', async () => {
    await render(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Log symptoms
      </WordFitText>,
    );
    await layout(['Log', 'symptoms']);
    expect(size(screen.getByTestId('label'))).toBeCloseTo(13 * 1.3, 5);
  });

  it('never goes below the base size and then wraps instead', async () => {
    await render(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Krachttrainingsschema
      </WordFitText>,
    );
    for (let i = 0; i < 12; i++) await layout(['Krachttrain', 'ingsschema']);
    const label = screen.getByTestId('label');
    expect(size(label)).toBe(13);
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('starts over when the text or the window changes', async () => {
    const view = await render(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Log symptoms
      </WordFitText>,
    );
    await layout(['Log sym', 'ptoms']);
    expect(size(screen.getByTestId('label'))).toBeLessThan(13 * 1.3);
    Object.assign(mockWindow, { width: 780, height: 360 });
    await view.rerender(
      <WordFitText variant="label" numberOfLines={2} testID="label">
        Log symptoms
      </WordFitText>,
    );
    expect(size(screen.getByTestId('label'))).toBeCloseTo(13 * 1.3, 5);
  });

  it('respects a passed cap and a style font size', async () => {
    await render(
      <WordFitText variant="label" maxFontSizeMultiplier={1.1} style={{ fontSize: 10 }} testID="label">
        MG
      </WordFitText>,
    );
    expect(size(screen.getByTestId('label'))).toBeCloseTo(11, 5);
  });
});
