import { isStravaCallback } from '@/strava/redirect';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return isStravaCallback(path) ? '/strava-callback' : path;
  } catch {
    return '/';
  }
}
