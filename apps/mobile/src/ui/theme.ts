import { useSyncExternalStore } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

import { getThemePreference, isDarkScheme, subscribeThemePreference } from '@/lib/themePreference';

export interface ColorTokens {
  background: string;
  backgroundTop: string;
  sheet: string;
  surface: string;
  surfaceAlt: string;
  surface3: string;
  ringTrack: string;
  border: string;
  borderStrong: string;
  text: string;
  textSoft: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryOn: string;
  accent: string;
  accentOn: string;
  accentSoft: string;
  link: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  purple: string;
  purpleSoft: string;
  pink: string;
  pinkSoft: string;
  gold: string;
  goldSoft: string;
  levelC: string;
  grid: string;
  ecg: string;
  ecgPaper: string;
  metric: {
    sleep: string;
    load: string;
    loadBright: string;
    readinessHigh: string;
    readinessMid: string;
    readinessLow: string;
    optimal: string;
    streak: string;
  };
  coach: { from: string; to: string; surface: string };
  tint: Record<Tint, string>;
  stage: { awake: string; light: string; deep: string; rem: string };
  zones: [string, string, string, string, string];
}

export type Tint = 'home' | 'sleep' | 'load' | 'health' | 'community' | 'coach' | 'neutral' | 'recovery' | 'recoveryHigh' | 'recoveryLow' | 'heart' | 'cycle';

export const darkColors: ColorTokens = {
  background: '#0D1114',
  backgroundTop: '#2A353C',
  sheet: '#101417',
  surface: '#1E2428',
  surfaceAlt: '#283036',
  surface3: '#333C43',
  ringTrack: '#2C363D',
  border: '#FFFFFF14',
  borderStrong: '#FFFFFF1F',
  text: '#FFFFFF',
  textSoft: '#D6DCE0',
  textMuted: '#A9B3BA',
  textFaint: '#6C777F',
  primary: '#FFFFFF',
  primaryOn: '#0D1114',
  accent: '#3FB0FF',
  accentOn: '#0D1114',
  accentSoft: '#18324A',
  link: '#3FB0FF',
  positive: '#00F0A0',
  positiveSoft: '#123A2E',
  negative: '#FF7A7E',
  negativeSoft: '#3A1F24',
  warning: '#FFA51F',
  warningSoft: '#3A2E1A',
  info: '#5AB4FF',
  infoSoft: '#18324A',
  purple: '#A897FF',
  purpleSoft: '#2E2650',
  pink: '#F0A6F3',
  pinkSoft: '#3A2B47',
  gold: '#F5C451',
  goldSoft: '#3A341C',
  levelC: '#CFC7FF',
  grid: '#FFFFFF14',
  ecg: '#FF6B8B',
  ecgPaper: '#1A1418',
  metric: {
    sleep: '#7FA6C2',
    load: '#0A93E8',
    loadBright: '#3FB0FF',
    readinessHigh: '#16EC06',
    readinessMid: '#FFD60A',
    readinessLow: '#FF2D46',
    optimal: '#00F0A0',
    streak: '#FFB347',
  },
  coach: { from: '#7B5CFF', to: '#3FA9FF', surface: '#22233A' },
  tint: {
    home: '#1B2A33',
    sleep: '#2E2650',
    load: '#0F2E4D',
    health: '#0F3F3C',
    community: '#2B2A20',
    coach: '#22233A',
    neutral: '#2A353C',
    recovery: '#3F4337',
    recoveryHigh: '#283F33',
    recoveryLow: '#3F3239',
    heart: '#3A2B47',
    cycle: '#3A2238',
  },
  stage: { awake: '#D9DDE0', light: '#B8A9F5', deep: '#F28BCB', rem: '#9A5CF0' },
  zones: ['#5AB4FF', '#2FD3BF', '#16EC06', '#FFB347', '#FF2D46'],
};

export const lightColors: ColorTokens = {
  background: '#F2F4F6',
  backgroundTop: '#DDE3E8',
  sheet: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EBEEF1',
  surface3: '#DCE1E5',
  ringTrack: '#DCE1E5',
  border: '#0D11141A',
  borderStrong: '#0D111426',
  text: '#0D1114',
  textSoft: '#2A353C',
  textMuted: '#525D66',
  textFaint: '#6E7982',
  primary: '#0D1114',
  primaryOn: '#FFFFFF',
  accent: '#0A6FC0',
  accentOn: '#FFFFFF',
  accentSoft: '#D9E8F7',
  link: '#0A6FC0',
  positive: '#00825A',
  positiveSoft: '#D5F2E6',
  negative: '#C0392B',
  negativeSoft: '#F6DADC',
  warning: '#A35C00',
  warningSoft: '#F7E6CF',
  info: '#1C6FC0',
  infoSoft: '#D9E8F7',
  purple: '#5B45D6',
  purpleSoft: '#E6E1F7',
  pink: '#A3389F',
  pinkSoft: '#F1DDF0',
  gold: '#8A6500',
  goldSoft: '#F3EBD0',
  levelC: '#5B45D6',
  grid: '#0D11141A',
  ecg: '#C8325A',
  ecgPaper: '#FBF0F3',
  metric: {
    sleep: '#3E6E91',
    load: '#0A6FC0',
    loadBright: '#0A6FC0',
    readinessHigh: '#138A0A',
    readinessMid: '#8F7100',
    readinessLow: '#C81E33',
    optimal: '#00825A',
    streak: '#B35F00',
  },
  coach: { from: '#7B5CFF', to: '#3FA9FF', surface: '#E4E4F2' },
  tint: {
    home: '#D6E4EC',
    sleep: '#E3DDF7',
    load: '#D6E6F6',
    health: '#D4EDE9',
    community: '#ECEAD9',
    coach: '#E4E4F2',
    neutral: '#DDE3E8',
    recovery: '#E6E7DC',
    recoveryHigh: '#DCEBDF',
    recoveryLow: '#EEDDE2',
    heart: '#EEDDF0',
    cycle: '#F3DDEA',
  },
  stage: { awake: '#8A9298', light: '#7A66D9', deep: '#C2458F', rem: '#6A2FC0' },
  zones: ['#1C6FC0', '#138F80', '#138A0A', '#B36B00', '#C81E33'],
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  numeric: 'BarlowCondensed_700Bold',
  numericMedium: 'BarlowCondensed_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
} as const;

type Weight = '400' | '500' | '600' | '700';

export function fontForWeight(weight: Weight): string {
  if (weight === '700') return fonts.bold;
  if (weight === '600') return fonts.semibold;
  if (weight === '500') return fonts.medium;
  return fonts.regular;
}

interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: Weight;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
}

export const typeScale = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  lead: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  h2: { fontSize: 28, lineHeight: 34, fontWeight: '600' },
  h1: { fontSize: 30, lineHeight: 35, fontWeight: '600' },
  value: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700' },
  cap: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1.7, textTransform: 'uppercase' },
  capSmall: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase' },
  capLarge: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase' },
  screenTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 2.7, textTransform: 'uppercase' },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typeScale;

export const maxFontScale: Readonly<Record<TypeVariant, number>> = {
  caption: 2,
  label: 2,
  body: 2,
  bodyStrong: 2,
  lead: 2,
  cardTitle: 1.8,
  title: 1.6,
  h2: 1.5,
  h1: 1.5,
  value: 1.4,
  display: 1.3,
  cap: 1.4,
  capSmall: 1.4,
  capLarge: 1.4,
  screenTitle: 1.4,
};

export interface Theme {
  dark: boolean;
  colors: ColorTokens;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference, getThemePreference);
  const dark = isDarkScheme(preference, scheme);
  return { dark, colors: dark ? darkColors : lightColors };
}

export function readinessColor(colors: ColorTokens, value: number | null): string {
  if (value === null) return colors.textMuted;
  if (value >= 67) return colors.metric.readinessHigh;
  if (value >= 34) return colors.metric.readinessMid;
  return colors.metric.readinessLow;
}

export function readinessBand(value: number | null): 'high' | 'medium' | 'low' | null {
  if (value === null) return null;
  if (value >= 67) return 'high';
  if (value >= 34) return 'medium';
  return 'low';
}
