import { createContext, useContext } from 'react';

import type { AppData } from './types';

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside an AppDataContext provider');
  return value;
}
