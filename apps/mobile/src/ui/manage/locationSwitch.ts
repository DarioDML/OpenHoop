import { getForegroundPermissionsAsync, requestForegroundPermissionsAsync } from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

export type LocationAccess = 'granted' | 'askable' | 'blocked';

export function locationAccess(granted: boolean, canAskAgain: boolean): LocationAccess {
  if (granted) return 'granted';
  return canAskAgain ? 'askable' : 'blocked';
}

export interface LocationSwitch {
  granted: boolean;
  blocked: boolean;
  busy: boolean;
  toggle(next: boolean): void;
  openSettings(): void;
}

export function useLocationSwitch(): LocationSwitch {
  const [access, setAccess] = useState<LocationAccess>('askable');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    Promise.resolve()
      .then(() => getForegroundPermissionsAsync())
      .then((response) => {
        if (mounted.current) setAccess(locationAccess(response.granted, response.canAskAgain));
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  const openSettings = (): void => {
    void Linking.openSettings();
  };

  return {
    granted: access === 'granted',
    blocked: access === 'blocked',
    busy,
    toggle: (next) => {
      if (!next || access === 'blocked') {
        openSettings();
        return;
      }
      setBusy(true);
      Promise.resolve()
        .then(() => requestForegroundPermissionsAsync())
        .then((response) => {
          if (mounted.current) setAccess(locationAccess(response.granted, response.canAskAgain));
        })
        .catch(() => undefined)
        .finally(() => {
          if (mounted.current) setBusy(false);
        });
    },
    openSettings,
  };
}
