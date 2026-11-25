import type { ParityLevel } from '@/data/types';

export const PARITY = {
  heartRate: 'A',
  rr: 'A',
  steps: 'A',
  skinTemp: 'A',
  spo2: 'A',
  hrv: 'B',
  restingHr: 'B',
  respiratoryRate: 'B',
  sleep: 'B',
  sleepNeed: 'B',
  sleepScore: 'B',
  readiness: 'B',
  load: 'B',
  zones: 'B',
  consistency: 'C',
  workouts: 'C',
  calories: 'C',
} as const satisfies Record<string, ParityLevel>;
