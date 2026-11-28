import { classifyRecentStages, groupNights, isAsleepSample, sleepPeriods, withoutAwakeTails } from '@openhoop/analytics';
import type { Sample } from '@openhoop/analytics';
import { samplesFromRows } from './pipeline';
import type { Store } from './store/types';

export const NIGHT_LOOKBACK_S = 16 * 3600;
export const ONGOING_GAP_S = 20 * 60;
export const AWAKE_WINDOW_S = 10 * 60;
const AWAKE_MIN_SAMPLES = 300;
const AWAKE_MAX_ASLEEP_SHARE = 0.2;
const RECENT_EPOCHS = 4;

export interface RecentWake {
  t: number;
  wake: number;
  light: number;
}

export interface NightNow {
  onset: number | null;
  asleepS: number | null;
  recent: RecentWake[] | null;
  awake: boolean;
}

export function awakeNow(samples: readonly Sample[], nowS: number): boolean {
  const recent = samples.filter((s) => s.t > nowS - AWAKE_WINDOW_S && s.t <= nowS);
  if (recent.length < AWAKE_MIN_SAMPLES) return false;
  const asleep = recent.filter((s) => isAsleepSample(s)).length;
  return asleep / recent.length <= AWAKE_MAX_ASLEEP_SHARE;
}

// The band keeps flagging SLEEP while its wearer lies awake in bed, so an awake stretch at the end of the night counts.
export function nightNow(samples: Sample[], nowS: number): NightNow {
  const flagged = groupNights(sleepPeriods(samples)).at(-1);
  if (flagged === undefined || flagged.offset < nowS - ONGOING_GAP_S) return { onset: null, asleepS: null, recent: null, awake: awakeNow(samples, nowS) };
  const night = groupNights(withoutAwakeTails(flagged.periods, samples)).at(-1);
  const awakeInBed = night === undefined || flagged.offset - night.offset >= AWAKE_WINDOW_S;
  const awake = awakeInBed || awakeNow(samples, nowS);
  if (night === undefined) return { onset: null, asleepS: null, recent: null, awake };
  const stages = classifyRecentStages(samples, night.onset, nowS, RECENT_EPOCHS);
  const recent = stages.ok ? stages.value.map((e) => ({ t: e.t, wake: e.probabilities[0], light: e.probabilities[1] })) : null;
  return { onset: night.onset, asleepS: night.asleepS, recent, awake };
}

export async function readNightNow(store: Store, deviceId: number, nowS: number): Promise<NightNow> {
  const rows = await store.samplesBetween(deviceId, nowS - NIGHT_LOOKBACK_S, nowS + 1);
  return nightNow(samplesFromRows(rows), nowS);
}
