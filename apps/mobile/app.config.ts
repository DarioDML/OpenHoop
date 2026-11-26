import type { ConfigContext, ExpoConfig } from 'expo/config';

const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

export function buildNumberFor(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`app.json version "${version}" must be major.minor.patch`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if (minor > 999 || patch > 999) throw new Error(`app.json version "${version}": minor and patch must stay below 1000`);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (code > MAX_ANDROID_VERSION_CODE) throw new Error(`app.json version "${version}" exceeds Android's versionCode limit`);
  return code;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, slug, version } = config;
  if (!name || !slug || !version) throw new Error('app.json must set expo.name, expo.slug and expo.version');
  const buildNumber = buildNumberFor(version);
  return {
    ...config,
    name,
    slug,
    version,
    android: { ...config.android, versionCode: buildNumber },
    ios: { ...config.ios, buildNumber: String(buildNumber) },
  };
};
