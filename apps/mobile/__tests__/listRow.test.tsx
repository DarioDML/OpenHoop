import { render, screen, within } from '@testing-library/react-native';

import { Chip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListGroup';

const mockWindow = { width: 412, height: 915, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

function row() {
  return <ListRow testID="row" title="Lab test booking" subtitle="Order blood tests" chip={<Chip label="No provider yet" small testID="row-chip" />} chevron={false} />;
}

describe('ListRow chip', () => {
  afterEach(() => {
    Object.assign(mockWindow, { width: 412, height: 915, fontScale: 1 });
  });

  it('keeps the chip beside the label on a roomy screen', async () => {
    await render(row());
    expect(screen.getByTestId('row-chip')).toBeTruthy();
    expect(within(screen.getByTestId('row-text')).queryByTestId('row-chip')).toBeNull();
  });

  it('moves the chip under the label on a 360dp phone at 1.3 text size', async () => {
    Object.assign(mockWindow, { width: 360, height: 780, fontScale: 1.3 });
    await render(row());
    expect(within(screen.getByTestId('row-text')).getByTestId('row-chip')).toBeTruthy();
  });
});
