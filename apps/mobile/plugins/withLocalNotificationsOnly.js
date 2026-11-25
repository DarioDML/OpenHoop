const { withAndroidManifest } = require('expo/config-plugins');

const REMOVED_COMPONENTS = {
  service: [
    'expo.modules.notifications.service.ExpoFirebaseMessagingService',
    'com.google.firebase.messaging.FirebaseMessagingService',
    'com.google.firebase.components.ComponentDiscoveryService',
    'com.google.android.datatransport.runtime.backends.TransportBackendDiscovery',
    'com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService',
  ],
  receiver: [
    'com.google.firebase.iid.FirebaseInstanceIdReceiver',
    'com.google.android.datatransport.runtime.scheduling.jobscheduling.AlarmManagerSchedulerBroadcastReceiver',
  ],
  provider: ['com.google.firebase.provider.FirebaseInitProvider'],
};

const PROVIDER_AUTHORITIES = {
  'com.google.firebase.provider.FirebaseInitProvider': '${applicationId}.firebaseinitprovider',
};

function removeMarker(kind, name) {
  const attributes = { 'android:name': name, 'tools:node': 'remove' };
  if (kind === 'provider' && PROVIDER_AUTHORITIES[name]) attributes['android:authorities'] = PROVIDER_AUTHORITIES[name];
  return { $: attributes };
}

function applyLocalOnly(manifest) {
  manifest.manifest.$ = { ...manifest.manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('withLocalNotificationsOnly: AndroidManifest.xml has no <application>');
  for (const [kind, names] of Object.entries(REMOVED_COMPONENTS)) {
    const existing = application[kind] ?? [];
    const present = new Set(existing.map((entry) => entry.$?.['android:name']));
    application[kind] = [...existing, ...names.filter((name) => !present.has(name)).map((name) => removeMarker(kind, name))];
  }
  return manifest;
}

module.exports = function withLocalNotificationsOnly(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = applyLocalOnly(modConfig.modResults);
    return modConfig;
  });
};

module.exports.applyLocalOnly = applyLocalOnly;
