import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import { darkColors } from '@/ui/theme';

import { AppController } from './controller';
import { AppDataContext } from './context';

interface Props {
  children: ReactNode;
}

export function LiveProvider({ children }: Props) {
  const controller = useMemo(() => new AppController(), []);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    void controller.start();
  }, [controller]);

  const value = useMemo(() => controller.appData(), [controller, snapshot]);

  if (!snapshot.ready) return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
