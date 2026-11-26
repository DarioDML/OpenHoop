import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  changeFor,
  describeFields,
  isWritableValue,
  parseBandConfig,
  type BandConfigSnapshot,
  type BandConfigState,
  type ConfigKind,
  type FieldRow,
  type WritableValue,
} from '@/data/bandConfig';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { CapHeader } from '@/ui/ListGroup';
import { ConfirmDangerDialog } from '@/ui/ConfirmDangerDialog';
import { ConfigFieldRow, writableText } from '@/ui/manage/ConfigFieldRow';
import { KeyValueRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { spacing } from '@/ui/theme';

interface PendingWrite {
  row: FieldRow;
  from: WritableValue;
  to: WritableValue;
}

interface SnapshotProps {
  snapshot: BandConfigSnapshot;
  onChange: (row: FieldRow, to: WritableValue) => void;
  onRestore: (row: FieldRow) => void;
  disabled: boolean;
}

function Snapshot({ snapshot, onChange, onRestore, disabled }: SnapshotProps) {
  const { t } = useT();
  const flags = describeFields('flag', snapshot.flags);
  const config = describeFields('config', snapshot.config);
  const other = [...flags.unknown, ...config.unknown];
  const known = (row: FieldRow) => {
    const original = changeFor(snapshot, row.kind, row.entry.key)?.original ?? null;
    const current = row.entry.valueText;
    const change = isWritableValue(current) ? () => onChange(row, current === '1' ? '2' : '1') : undefined;
    return (
      <ConfigFieldRow
        key={`${row.kind}-${row.entry.key}`}
        row={row}
        original={original}
        onChange={change}
        onRestore={() => onRestore(row)}
        disabled={disabled}
      />
    );
  };
  return (
    <>
      {flags.known.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.flagsTitle')} />
          <Card testID="config-flags" style={{ gap: 0 }}>
            {flags.known.map(known)}
          </Card>
        </>
      ) : null}
      {config.known.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.configTitle')} />
          <Card testID="config-device" style={{ gap: 0 }}>
            {config.known.map(known)}
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
  const { device, readBandConfig, bandActions } = useAppData();
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const unknown = t('band.unknown');
  const state = useMemo(() => parseBandConfig(device.configSnapshot), [device.configSnapshot]);
  const busy = reading || writing || device.connection === 'syncing' || device.connection === 'connecting';
  const nowS = Math.floor(Date.now() / 1000);

  const read = async (): Promise<void> => {
    setReading(true);
    try {
      await readBandConfig();
    } finally {
      setReading(false);
    }
  };

  const guarded = async (task: () => Promise<boolean>): Promise<void> => {
    setWriting(true);
    try {
      await task();
    } finally {
      setWriting(false);
    }
  };
  const write = (kind: ConfigKind, key: string, to: WritableValue): Promise<void> => guarded(() => bandActions.writeConfig(kind, key, to));
  const restore = (row: FieldRow): Promise<void> => guarded(() => bandActions.restoreConfig(row.kind, row.entry.key));

  const confirmWord = t('bandConfig.write.word');

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
      <Card testID="config-write-note" style={{ gap: 6 }}>
        <AppText variant="bodyStrong">{t('bandConfig.write.title')}</AppText>
        <AppText variant="label" muted>
          {t('bandConfig.write.body')}
        </AppText>
      </Card>
      {state.status === 'ok' ? (
        <Snapshot
          snapshot={state.snapshot}
          onChange={(row, to) => setPending({ row, from: to === '1' ? '2' : '1', to })}
          onRestore={(row) => void restore(row)}
          disabled={busy}
        />
      ) : (
        <StateCard state={state} />
      )}
      <ConfirmDangerDialog
        visible={pending !== null}
        commandName={confirmWord}
        title={t('bandConfig.write.dialogTitle')}
        body={
          pending === null
            ? ''
            : t('bandConfig.write.dialogBody', {
                key: pending.row.entry.key,
                from: writableText(t, pending.row, pending.from),
                to: writableText(t, pending.row, pending.to),
                word: confirmWord,
              })
        }
        inputLabel={t('bandConfig.write.inputLabel')}
        confirmLabel={t('bandConfig.write.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target !== null) void write(target.row.kind, target.row.entry.key, target.to);
        }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <ParityBadge level="D" />
        <AppText variant="label" muted style={{ flex: 1 }}>
          {t('device.flags.levelD')}
        </AppText>
      </View>
    </SettingsPage>
  );
}
