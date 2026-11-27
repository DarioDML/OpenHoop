const CALLBACK = /^(?:openhoop:\/\/localhost)?\/?(?:localhost\/)?strava-callback(?:[/?#]|$)/;

export function isStravaCallback(path: string): boolean {
  return CALLBACK.test(path);
}
