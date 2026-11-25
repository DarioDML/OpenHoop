import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { describeFields, parseBandConfig, type BandConfigSnapshot, type BandConfigState } from '@/data/bandConfig';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { CapHeader } from '@/ui/ListGroup';
import { ConfigFieldRow } from '@/ui/manage/ConfigFieldRow';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { NotBuilt } from '@/ui/NotBuilt';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing } from '@/ui/theme';

function Snapshot({ snapshot }: { snapshot: BandConfigSnapshot }) {
  const { t } = useT();
  const flags = describeFields('flag', snapshot.flags);
  const config = describeFields('config', snapshot.config);
  const other = [...flags.unknown, ...config.unknown];
  return (
    <>
      {flags.known.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.flagsTitle')} />
          <Card testID="config-flags" style={{ gap: 0 }}>
            {flags.known.map((row) => (
              <ConfigFieldRow key={row.entry.key} row={row} />
            ))}
          </Card>
        </>
      ) : null}
      {config.known.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.configTitle')} />
          <Card testID="config-device" style={{ gap: 0 }}>
            {config.known.map((row) => (
              <ConfigFieldRow key={row.entry.key} row={row} />
            ))}
          </Card>
        </>
      ) : null}
      {other.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.otherTitle')} />
          <Card testID="config-other" style={{ gap: 0 }}>
            <AppText variant="label" muted>
              {t('bandConfig.otherBody')}
            </AppText>
            {other.map((row) => (
              <ConfigFieldRow key={`${row.kind}-${row.entry.key}`} row={row} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function StateCard({ state }: { state: Exclude<BandConfigState, { status: 'ok' }> }) {
  const { t } = useT();
  return (
    <Card testID={`config-state-${state.status}`} style={{ gap: 6 }}>
      <AppText variant="bodyStrong">{t(`bandConfig.${state.status}.title`)}</AppText>
      <AppText variant="label" muted>
        {t(`bandConfig.${state.status}.body`)}
      </AppText>
    </Card>
  );
}

export default function BandConfigScreen() {
  const { t } = useT();
  const { device, readBandConfig } = useAppData();
  const [reading, setReading] = useState(false);
  const unknown = t('band.unknown');
  const state = useMemo(() => parseBandConfig(device.configSnapshot), [device.configSnapshot]);
  const busy = reading || device.connection === 'syncing' || device.connection === 'connecting';
  const nowS = Math.floor(Date.now() / 1000);

  const read = async (): Promise<void> => {
    setReading(true);
    try {
      await readBandConfig();
    } finally {
      setReading(false);
    }
  };

  return (
    <SettingsPage title={t('device.config')} tint="neutral" notice testID="band-config">
      <Card style={{ gap: spacing.xs }}>
        <KeyValueRow label={t('band.model')} value={device.model ?? unknown} />
        <KeyValueRow label={t('band.firmware')} value={device.firmware ?? unknown} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
        {state.status === 'ok' || state.status === 'empty' ? (
          <KeyValueRow label={t('bandConfig.readAt')} value={formatAgo(t, nowS, state.snapshot.readAt)} testID="config-read-at" />
        ) : null}
      </Card>
      <Card tone="warning" testID="config-unverified-note" style={{ gap: 6 }}>
        {state.status === 'ok' || state.status === 'empty' ? (
          <AppText variant="bodyStrong" testID="config-source">
            {t(state.snapshot.source === 'demo' ? 'bandConfig.source.demo' : 'bandConfig.source.band')}
          </AppText>
        ) : null}
        <AppText variant="label" muted>
          {t('bandConfig.unverifiedNote')}
        </AppText>
      </Card>
      <Button label={reading ? t('bandConfig.reading') : t('bandConfig.read')} onPress={() => void read()} disabled={busy} testID="read-config-button" />
      {state.status === 'ok' ? <Snapshot snapshot={state.snapshot} /> : <StateCard state={state} />}
      <NotBuilt issue="bandConfig" body={t('bandConfig.writeNotBuilt')} />
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <ParityBadge level="D" />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {t('device.flags.levelD')}
        </AppText>
      </View>
    </SettingsPage>
  );
}
