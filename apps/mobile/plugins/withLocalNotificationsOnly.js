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

const BADGE_PERMISSIONS = [
  'com.android.launcher.permission.READ_SETTINGS',
  'com.android.launcher.permission.WRITE_SETTINGS',
  'com.android.launcher.permission.INSTALL_SHORTCUT',
  'com.android.launcher.permission.UNINSTALL_SHORTCUT',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'android.permission.READ_APP_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

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
  const permissions = manifest.manifest['uses-permission'] ?? [];
  const declared = new Set(permissions.map((entry) => entry.$?.['android:name']));
  manifest.manifest['uses-permission'] = [
    ...permissions,
    ...BADGE_PERMISSIONS.filter((name) => !declared.has(name)).map((name) => ({ $: { 'android:name': name, 'tools:node': 'remove' } })),
  ];
  return manifest;
}

module.exports = function withLocalNotificationsOnly(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = applyLocalOnly(modConfig.modResults);
    return modConfig;
  });
};

module.exports.applyLocalOnly = applyLocalOnly;
