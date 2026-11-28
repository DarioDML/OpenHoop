const KNOWN_APPS: ReadonlyMap<string, string> = new Map(Object.entries({
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.withings.wiscale2': 'Withings',
  'com.renpho.health': 'Renpho',
  'com.qingniu.renpho': 'Renpho',
  'com.eufylife.smarthome': 'eufyLife',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.mi.health': 'Mi Fitness',
  'com.ouraring.oura': 'Oura',
  'com.polar.polarflow': 'Polar Flow',
  'com.strava': 'Strava',
  'com.myfitnesspal.android': 'MyFitnessPal',
}));

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const GENERIC = new Set(['com', 'org', 'net', 'io', 'app', 'apps', 'android', 'mobile', 'health', 'fitness', 'main', 'client', 'phone']);
const MAX_LENGTH = 60;

export function appNameForPackage(origin: string): string | null {
  const trimmed = origin.trim();
  if (trimmed === '') return null;
  const known = KNOWN_APPS.get(trimmed);
  if (known !== undefined) return known;
  if (!PACKAGE.test(trimmed) || trimmed.length > 255) return trimmed.slice(0, MAX_LENGTH);
  const word = trimmed
    .split('.')
    .slice(1)
    .find((part) => !GENERIC.has(part.toLowerCase()) && /[A-Za-z]/.test(part));
  if (word === undefined) return trimmed.slice(0, MAX_LENGTH);
  const spaced = word.replace(/_/g, ' ');
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`.slice(0, MAX_LENGTH);
}

export function appNameList(origins: ReadonlyArray<string | null>): string[] {
  return [...new Set(origins.map((origin) => (origin === null ? null : appNameForPackage(origin))).filter((name): name is string => name !== null))];
}
