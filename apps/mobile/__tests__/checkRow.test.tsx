import { fireEvent, render, screen } from '@testing-library/react-native';

import { CheckRow } from '@/ui/controls';

import { withAppData } from './support/appData';

describe('CheckRow', () => {
  it('announces an unchecked row as a checkbox and checks it on press', async () => {
    const onChange = jest.fn();
    await render(withAppData(<CheckRow label="Tue 24 Nov" subtitle="Slept 7 h 12 m" badge="Most useful" checked={false} onChange={onChange} testID="row" />));
    const row = screen.getByRole('checkbox');
    expect(row).not.toBeChecked();
    expect(screen.getByText('Tue 24 Nov')).toBeTruthy();
    expect(screen.getByText('Slept 7 h 12 m')).toBeTruthy();
    expect(screen.getByText('Most useful')).toBeTruthy();
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows a checked row as checked and unchecks it on press', async () => {
    const onChange = jest.fn();
    await render(withAppData(<CheckRow label="Select all" checked onChange={onChange} testID="all" />));
    expect(screen.getByTestId('all')).toBeChecked();
    await fireEvent.press(screen.getByTestId('all'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
