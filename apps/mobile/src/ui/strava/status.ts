import type { TranslationKey } from '@/i18n';
import type { StravaErrorKind } from '@/strava/api';
import type { StravaState } from '@/strava/controller';

export function stravaErrorKey(error: StravaErrorKind): TranslationKey {
  return `strava.error.${error}`;
}

export type StravaStatus = 'none' | 'setup' | 'connected' | 'reconnect';

export function stravaStatus(state: Pick<StravaState, 'hasClient' | 'connection'>, networkOn: boolean): StravaStatus {
  if (state.connection === 'reconnect') return 'reconnect';
  if (state.connection === 'connected') return networkOn ? 'connected' : 'none';
  return state.hasClient ? 'setup' : 'none';
}
