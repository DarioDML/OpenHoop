import appJson from '../app.json';
import { buildNumberFor } from '../app.config';
import packageJson from '../package.json';
import { applyReleaseSigning } from '../plugins/withReleaseSigning';

const GENERATED_GRADLE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('buildNumberFor', () => {
  it('orders versions so every release installs over the previous one', () => {
    expect(buildNumberFor('0.1.0')).toBe(1000);
    expect(buildNumberFor('0.1.1')).toBeGreaterThan(buildNumberFor('0.1.0'));
    expect(buildNumberFor('0.2.0')).toBeGreaterThan(buildNumberFor('0.1.999'));
    expect(buildNumberFor('1.0.0')).toBeGreaterThan(buildNumberFor('0.999.999'));
    expect(buildNumberFor('2.13.7')).toBe(2_013_007);
  });

  it('rejects versions that are not plain major.minor.patch', () => {
    expect(() => buildNumberFor('1.0')).toThrow();
    expect(() => buildNumberFor('1.0.0-beta.1')).toThrow();
    expect(() => buildNumberFor('1.1000.0')).toThrow();
    expect(() => buildNumberFor('2101.0.0')).toThrow();
  });
});

describe('applyReleaseSigning', () => {
  const gradle = applyReleaseSigning(GENERATED_GRADLE);

  it('signs with the release key when a keystore path is given', () => {
    expect(gradle).toContain("System.getenv('OPENHOOP_KEYSTORE_PATH')");
    expect(gradle).toMatch(/release \{\s*def keystorePath/);
  });

  it('leaves the release APK unsigned when asked, so the key never enters the build job', () => {
    expect(gradle).toContain("System.getenv('OPENHOOP_UNSIGNED_RELEASE') ? null : signingConfigs.debug");
  });

  it('is idempotent', () => {
    expect(applyReleaseSigning(gradle)).toBe(gradle);
  });
});

type PluginEntry = string | [string, Record<string, unknown>];

function pluginOptions(name: string): Record<string, unknown> | undefined {
  const entry = (appJson.expo.plugins as PluginEntry[]).find((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name);
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('dictation permissions', () => {
  it('declares the microphone through the speech plugin with honest permission texts', () => {
    const options = pluginOptions('expo-speech-recognition');
    expect(options).toBeDefined();
    for (const text of [options?.microphonePermission, options?.speechRecognitionPermission]) {
      expect(typeof text).toBe('string');
      expect(text).toContain('not saved or sent');
    }
  });

  it('does not block the microphone that dictation needs, and keeps the other blocks', () => {
    const blocked = appJson.expo.android.blockedPermissions;
    expect(blocked).not.toContain('android.permission.RECORD_AUDIO');
    expect(pluginOptions('expo-image-picker')?.microphonePermission).not.toBe(false);
    expect(blocked).toEqual(expect.arrayContaining(['android.permission.ACCESS_NETWORK_STATE', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']));
  });

  it('adds no permission to the explicit list beyond Health Connect access', () => {
    expect(appJson.expo.android.permissions.every((permission) => permission.startsWith('android.permission.health.'))).toBe(true);
  });

  it('pins the speech library to an exact version', () => {
    expect(packageJson.dependencies['expo-speech-recognition']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
