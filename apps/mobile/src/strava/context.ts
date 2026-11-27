import { createContext, useContext } from 'react';

import type { StravaController, StravaState } from './controller';

export interface StravaContextValue {
  state: StravaState;
  controller: StravaController;
}

export const StravaContext = createContext<StravaContextValue | null>(null);

export function useStrava(): StravaContextValue {
  const value = useContext(StravaContext);
  if (!value) throw new Error('useStrava must be used inside a StravaContext provider');
  return value;
}
