import { getItem, setItem } from 'expo-secure-store';

import { THEME_ITEM, getThemePreference, parseThemePreference, setThemePreference } from '@/lib/themePreference';

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => 'light'),
  setItem: jest.fn(),
}));

describe('theme preference at startup', () => {
  it('starts from the choice remembered outside the database, before any data loads', () => {
    expect(getItem).toHaveBeenCalledWith(THEME_ITEM);
    expect(getThemePreference()).toBe('light');
  });

  it('remembers a new choice for the next start', () => {
    setThemePreference('dark');
    expect(setItem).toHaveBeenCalledWith(THEME_ITEM, 'dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('falls back to the system theme for anything it does not know', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
  });
});
