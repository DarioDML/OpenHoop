const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'OPENHOOP_KEYSTORE_PATH';

const RELEASE_SIGNING = `
        release {
            def keystorePath = System.getenv('${MARKER}')
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv('OPENHOOP_KEYSTORE_PASSWORD')
                keyAlias System.getenv('OPENHOOP_KEY_ALIAS')
                keyPassword System.getenv('OPENHOOP_KEY_PASSWORD')
            }
        }`;

const DEBUG_SIGNING = /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s{8}\})/;
const RELEASE_BUILD_TYPE = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

/** @param {string} gradle @returns {string} */
function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  if (!DEBUG_SIGNING.test(gradle) || !RELEASE_BUILD_TYPE.test(gradle)) {
    throw new Error('withReleaseSigning: android/app/build.gradle no longer has the expected signing blocks');
  }
  return gradle
    .replace(DEBUG_SIGNING, `$1${RELEASE_SIGNING}`)
    .replace(
      RELEASE_BUILD_TYPE,
      `$1signingConfig System.getenv('${MARKER}') ? signingConfigs.release : (System.getenv('OPENHOOP_UNSIGNED_RELEASE') ? null : signingConfigs.debug)`,
    );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
