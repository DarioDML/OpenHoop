import { useState } from 'react';
import { Linking } from 'react-native';

import { useAppData } from '@/data/context';

export interface NotificationSwitch {
  enabled: boolean;
  blocked: boolean;
  busy: boolean;
  toggle(next: boolean): void;
  openSettings(): void;
}

export function useNotificationSwitch(): NotificationSwitch {
  const { userData, notificationPermission, setNotificationsEnabled } = useAppData();
  const [busy, setBusy] = useState(false);
  const enabled = userData.notifications.enabled && notificationPermission === 'granted';
  return {
    enabled,
    blocked: notificationPermission === 'denied',
    busy,
    toggle: (next) => {
      setBusy(true);
      void setNotificationsEnabled(next).finally(() => setBusy(false));
    },
    openSettings: () => void Linking.openSettings(),
  };
}
