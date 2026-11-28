import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button, Segmented } from '@/ui/controls';

import { withAppData } from './support/appData';

const OPTIONS = [
  { value: 'male', label: 'Male', testID: 'opt-male' },
  { value: 'female', label: 'Female', testID: 'opt-female' },
  { value: 'other', label: 'Other', testID: 'opt-other' },
  { value: 'none', label: 'Rather not say', testID: 'opt-none' },
] as const;

type Choice = (typeof OPTIONS)[number]['value'];

describe('Segmented columns', () => {
  it('lays four options out as a two-column grid when asked', async () => {
    await render(withAppData(<Segmented<Choice> testID="seg" value="none" onChange={() => undefined} wrap columns={2} options={OPTIONS} />));
    expect(StyleSheet.flatten(screen.getByTestId('seg').props.style)).toMatchObject({ flexWrap: 'wrap' });
    expect(StyleSheet.flatten(screen.getByTestId('opt-none').props.style)).toMatchObject({ flexBasis: '46%', flexGrow: 1 });
  });

  it('keeps one row when no columns are given or they would not wrap', async () => {
    await render(
      withAppData(
        <>
          <Segmented<Choice> testID="row" value="male" onChange={() => undefined} options={OPTIONS} />
          <Segmented<Choice> testID="wide" value="male" onChange={() => undefined} columns={4} options={OPTIONS.map((o) => ({ ...o, testID: `wide-${o.value}` }))} />
        </>,
      ),
    );
    expect(StyleSheet.flatten(screen.getByTestId('row').props.style)).toMatchObject({ flexWrap: 'nowrap' });
    expect(StyleSheet.flatten(screen.getByTestId('opt-male').props.style)).toMatchObject({ flex: 1 });
    expect(StyleSheet.flatten(screen.getByTestId('wide-male').props.style)).toMatchObject({ flex: 1 });
  });
});

describe('Button label', () => {
  it('lets a long label wrap inside the button instead of overflowing it', async () => {
    await render(withAppData(<Button label="Open privacy settings" onPress={() => undefined} testID="btn" />));
    expect(StyleSheet.flatten(screen.getByText('Open privacy settings').props.style)).toMatchObject({ flexShrink: 1, textAlign: 'center' });
    expect(StyleSheet.flatten(screen.getByTestId('btn').props.style)).toMatchObject({ minHeight: 56 });
  });
});
