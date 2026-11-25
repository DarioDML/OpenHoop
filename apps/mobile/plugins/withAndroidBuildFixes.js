const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const INTERNET = '<uses-permission android:name="android.permission.INTERNET"/>';
const MIN_CMAKE = [3, 31];

function addDebugOnlyInternet(platformRoot) {
  const manifestPath = path.join(platformRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) return;
  const xml = fs.readFileSync(manifestPath, 'utf8');
  if (xml.includes('android.permission.INTERNET')) return;
  fs.writeFileSync(manifestPath, xml.replace(/(\s*)<application/, `$1${INTERNET}\n$1<application`));
}

function parseVersion(name) {
  return name.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function atLeast(version, minimum) {
  for (let i = 0; i < minimum.length; i += 1) {
    const v = version[i] ?? 0;
    if (v !== minimum[i]) return v > minimum[i];
  }
  return true;
}

function useLongPathAwareCmake(platformRoot) {
  if (process.platform !== 'win32') return;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) return;
  const cmakeRoot = path.join(sdk, 'cmake');
  if (!fs.existsSync(cmakeRoot)) return;
  const candidates = fs
    .readdirSync(cmakeRoot)
    .filter((name) => atLeast(parseVersion(name), MIN_CMAKE))
    .sort((a, b) => (atLeast(parseVersion(a), parseVersion(b)) ? -1 : 1));
  const chosen = candidates[0];
  if (!chosen) return;
  const propertiesPath = path.join(platformRoot, 'local.properties');
  const existing = fs.existsSync(propertiesPath) ? fs.readFileSync(propertiesPath, 'utf8') : '';
  if (/^cmake\.dir=/m.test(existing)) return;
  const dir = path.join(cmakeRoot, chosen).split(path.sep).join('/');
  fs.writeFileSync(propertiesPath, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}cmake.dir=${dir}\n`);
}

module.exports = function withAndroidBuildFixes(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const root = modConfig.modRequest.platformProjectRoot;
      addDebugOnlyInternet(root);
      useLongPathAwareCmake(root);
      return modConfig;
    },
  ]);
};
