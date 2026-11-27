import { router } from 'expo-router';

import { useAppData, useSyncProgress } from '@/data/context';
import { useT } from '@/i18n/useT';
import { StateCard } from '@/ui/StateCard';

import { daysSinceSync, pickDeviceState, type DeviceStateId } from './deviceState';

export function DeviceStateCard() {
  const { device, days, sync } = useAppData();
  const syncProgress = useSyncProgress();
  const { t } = useT();
  const nowS = Math.floor(Date.now() / 1000);
  const state: DeviceStateId | null = pickDeviceState({ device, days, syncProgress, nowS });
  if (state === null) return null;

  switch (state) {
    case 'syncing':
      return (
        <StateCard
          testID="device-state-syncing"
          icon="sync"
          tone="info"
          title={t('states.syncing.title')}
          body={syncProgress && syncProgress.percent !== null ? t('sync.bannerPercent', { percent: syncProgress.percent }) : t('states.syncing.body')}
        />
      );
    case 'dataAtRisk':
      return (
        <StateCard
          testID="device-state-dataAtRisk"
          icon="alert"
          tone="negative"
          title={t('states.dataAtRisk.title')}
          body={t('states.dataAtRisk.body', { days: daysSinceSync(device, nowS) ?? 0 })}
          actionLabel={t('band.sync')}
          onAction={() => void sync()}
        />
      );
    case 'notConnected':
      return (
        <StateCard
          testID="device-state-notConnected"
          icon="bluetooth"
          tone="warning"
          title={t('states.notConnected.title')}
          body={t('states.notConnected.body')}
          actionLabel={t('band.pair')}
          onAction={() => router.push('/onboarding/pair')}
        />
      );
    case 'waitingForData':
      return (
        <StateCard
          testID="device-state-waitingForData"
          icon="moon"
          tone="purple"
          title={t('states.waitingForData.title')}
          body={t('states.waitingForData.body')}
          actionLabel={t('band.sync')}
          onAction={() => void sync()}
        />
      );
    case 'lowBattery':
      return (
        <StateCard
          testID="device-state-lowBattery"
          icon="battery"
          tone="warning"
          title={t('states.lowBattery.title')}
          body={t('states.lowBattery.body', { percent: device.batteryPercent ?? 0 })}
        />
      );
    case 'charging':
      return <StateCard testID="device-state-charging" icon="plug" tone="positive" title={t('states.charging.title')} body={t('states.charging.body')} />;
    case 'firstDay':
      return <StateCard testID="device-state-firstDay" icon="moon" tone="purple" title={t('states.firstDay.title')} body={t('states.firstDay.body')} />;
  }
}
