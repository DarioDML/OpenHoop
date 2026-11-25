import { createContext, useContext } from 'react';

import type { CoachController, CoachState } from './controller';

export interface CoachContextValue {
  state: CoachState;
  controller: CoachController;
}

export const CoachContext = createContext<CoachContextValue | null>(null);

export function useCoach(): CoachContextValue {
  const value = useContext(CoachContext);
  if (!value) throw new Error('useCoach must be used inside a CoachContext provider');
  return value;
}
