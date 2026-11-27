import { Appearance } from 'react-native';

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

let current: ThemePreference = 'system';
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

function applyToNativeViews(preference: ThemePreference): void {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  } catch {
    // the app's own views still follow the preference through useTheme
  }
}

export function setThemePreference(next: ThemePreference): void {
  if (next === current) return;
  current = next;
  applyToNativeViews(next);
  for (const listener of [...listeners]) listener();
}

export function isDarkScheme(preference: ThemePreference, system: string | null | undefined): boolean {
  return preference === 'system' ? system !== 'light' : preference === 'dark';
}
