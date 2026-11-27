import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, View } from 'react-native';

import { darkColors } from '@/ui/theme';

import { appController } from './controller';
import { AppDataContext, LiveDataContext } from './context';
import { expoNotifier } from './notifier';

interface Props {
  children: ReactNode;
}

export function LiveProvider({ children }: Props) {
  const controller = useMemo(() => appController(), []);
  const value = useSyncExternalStore(controller.subscribe, controller.getAppData);

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

  if (!value.ready) return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
  return (
    <LiveDataContext.Provider value={controller}>
      <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
    </LiveDataContext.Provider>
  );
}
