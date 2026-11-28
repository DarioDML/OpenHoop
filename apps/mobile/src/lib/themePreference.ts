import { getItem, setItem } from 'expo-secure-store';
import { Appearance } from 'react-native';

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_ITEM = 'openhoop.theme';

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === raw) ?? 'system';
}

function readStored(): ThemePreference {
  try {
    return parseThemePreference(getItem(THEME_ITEM));
  } catch {
    return 'system';
  }
}

function applyToNativeViews(preference: ThemePreference): void {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  } catch {
    // the app's own views still follow the preference through useTheme
  }
}

let current: ThemePreference = readStored();
if (current !== 'system') applyToNativeViews(current);
const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  return current;
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function remember(preference: ThemePreference): void {
  try {
    setItem(THEME_ITEM, preference);
  } catch {
    // the database copy in user data is applied again at the next start
  }
}

export function setThemePreference(next: ThemePreference): void {
  if (next === current) return;
  current = next;
  remember(next);
  applyToNativeViews(next);
  for (const listener of [...listeners]) listener();
}

export function isDarkScheme(preference: ThemePreference, system: string | null | undefined): boolean {
  return preference === 'system' ? system !== 'light' : preference === 'dark';
}
