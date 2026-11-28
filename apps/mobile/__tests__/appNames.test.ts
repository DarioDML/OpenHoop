import { appNameForPackage } from '@/lib/appNames';

describe('appNameForPackage', () => {
  it('maps known Health Connect packages to app names', () => {
    expect(appNameForPackage('com.renpho.health')).toBe('Renpho');
    expect(appNameForPackage('com.sec.android.app.shealth')).toBe('Samsung Health');
    expect(appNameForPackage('com.google.android.apps.fitness')).toBe('Google Fit');
  });

  it('falls back to the vendor part of an unknown package', () => {
    expect(appNameForPackage('com.yunmai.scale')).toBe('Yunmai');
    expect(appNameForPackage('nl.example_scale.android')).toBe('Example scale');
  });

  it('keeps names that are not packages, trimmed and capped', () => {
    expect(appNameForPackage('Withings')).toBe('Withings');
    expect(appNameForPackage(' My scale ')).toBe('My scale');
    expect(appNameForPackage('x'.repeat(100))).toHaveLength(60);
    expect(appNameForPackage('com.android.health')).toBe('com.android.health');
  });
});
