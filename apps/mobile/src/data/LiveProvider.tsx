import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, View } from 'react-native';

import { darkColors } from '@/ui/theme';

import { AppController } from './controller';
import { AppDataContext } from './context';
import { expoNotifier } from './notifier';

interface Props {
  children: ReactNode;
}

export function LiveProvider({ children }: Props) {
  const controller = useMemo(() => new AppController(), []);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    void controller.start();
  }, [controller]);

  useEffect(() => {
    const refresh = (): void => {
      void controller.refreshNotifications();
      void controller.refreshWidgets();
    };
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const stopReceived = expoNotifier.onReceived(refresh);
    return () => {
      appState.remove();
      stopReceived();
    };
  }, [controller]);

  const value = useMemo(() => controller.appData(), [controller, snapshot]);

  if (!snapshot.ready) return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
