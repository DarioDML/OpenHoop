import { useColorScheme } from 'react-native';

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentOn: string;
  accentSoft: string;
  positive: string;
  negative: string;
  warning: string;
  grid: string;
  zones: [string, string, string, string, string];
}

export const darkColors: ColorTokens = {
  background: '#0E1116',
  surface: '#171B22',
  surfaceAlt: '#1F252E',
  border: '#2B323D',
  text: '#ECEEF2',
  textMuted: '#9BA4B1',
  accent: '#5EC8B1',
  accentOn: '#06231D',
  accentSoft: '#173A34',
  positive: '#5EC8B1',
  negative: '#E58E6B',
  warning: '#E4B75C',
  grid: '#2B323D',
  zones: ['#3A4A5C', '#4B7389', '#4FA3A5', '#8BCB9A', '#E4B75C'],
};

export const lightColors: ColorTokens = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#DADEE4',
  text: '#13171D',
  textMuted: '#555F6D',
  accent: '#0B7A66',
  accentOn: '#FFFFFF',
  accentSoft: '#D6EEE8',
  positive: '#0B7A66',
  negative: '#B2512B',
  warning: '#8F6A12',
  grid: '#DADEE4',
  zones: ['#AEB8C4', '#7FA3B8', '#4C9A9C', '#4E9F68', '#B8860B'],
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const typeScale = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  value: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700' },
} as const;

export type TypeVariant = keyof typeof typeScale;

export interface Theme {
  dark: boolean;
  colors: ColorTokens;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const dark = scheme !== 'light';
  return { dark, colors: dark ? darkColors : lightColors };
}
