import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { spacing } from '@/ui/theme';

type Busy = 'test' | 'find' | 'stop' | 'hr-on' | 'hr-off' | null;

const FIND_BUZZ_MS = 6_000;

export function BandActionsCard() {
  const { t } = useT();
  const { device, bandActions } = useAppData();
  const [busy, setBusy] = useState<Busy>(null);
  const [findActive, setFindActive] = useState(false);
  const blocked = busy !== null || device.connection === 'syncing' || device.connection === 'connecting';
  const nowS = Math.floor(Date.now() / 1000);

  useEffect(() => {
    if (!findActive) return;
    const timer = setTimeout(() => setFindActive(false), FIND_BUZZ_MS);
    return () => clearTimeout(timer);
  }, [findActive]);

  const run = async (label: Exclude<Busy, null>, task: () => Promise<boolean>): Promise<boolean> => {
    setBusy(label);
    try {
      return await task();
    } finally {
      setBusy(null);
    }
  };

  const find = async (): Promise<void> => {
    if (await run('find', () => bandActions.buzz('find'))) setFindActive(true);
  };
  const stop = async (): Promise<void> => {
    if (await run('stop', () => bandActions.stopBuzz())) setFindActive(false);
  };

  const hr = device.hrBroadcast;
  const hrStatus =
    hr === null
      ? t('device.actions.hrUnknown')
      : t('device.actions.hrLastSet', { state: t(hr.on ? 'bandConfig.on' : 'bandConfig.off'), ago: formatAgo(t, nowS, hr.at) });

  return (
    <Card testID="band-actions" style={{ gap: spacing.md }}>
      <View style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('device.actions.buzzTitle')}</AppText>
        <AppText variant="label" muted>
          {t('device.actions.buzzBody')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label={t('device.actions.test')} variant="secondary" onPress={() => void run('test', () => bandActions.buzz('test'))} disabled={blocked} testID="buzz-test" />
        <Button label={t('device.actions.find')} variant="secondary" onPress={() => void find()} disabled={blocked} testID="buzz-find" />
        {findActive ? <Button label={t('device.actions.stop')} variant="tertiary" onPress={() => void stop()} disabled={busy !== null} testID="buzz-stop" /> : null}
      </View>
      <View style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('device.actions.hrTitle')}</AppText>
        <AppText variant="label" muted>
          {t('device.actions.hrBody')}
        </AppText>
        <AppText variant="label" testID="hr-broadcast-status">
          {hrStatus}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label={t('device.actions.hrOn')} variant="secondary" onPress={() => void run('hr-on', () => bandActions.setHeartRateBroadcast(true))} disabled={blocked} testID="hr-on" />
        <Button label={t('device.actions.hrOff')} variant="secondary" onPress={() => void run('hr-off', () => bandActions.setHeartRateBroadcast(false))} disabled={blocked} testID="hr-off" />
      </View>
    </Card>
  );
}
