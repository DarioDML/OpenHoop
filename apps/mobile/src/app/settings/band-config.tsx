import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import {
  FLAG_KEYS,
  changeFor,
  configSnapshots,
  describeFields,
  isWritableValue,
  officialProfileSummary,
  parseBandConfig,
  type BandConfigSnapshot,
  type BandConfigState,
  type ConfigChange,
  type FieldRow,
  type WritableValue,
} from '@/data/bandConfig';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatAgo, formatClock, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { ConfirmDangerDialog } from '@/ui/ConfirmDangerDialog';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { ConfigFieldRow, writableText } from '@/ui/manage/ConfigFieldRow';
import { KeyValueRow } from '@/ui/manage/rows';
import { tile } from '@/ui/manage/tiles';
import { NoticeCard } from '@/ui/NoticeCard';
import { Screen } from '@/ui/Screen';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton, TopBar } from '@/ui/TopBar';

type Pending =
  | { kind: 'write'; row: FieldRow; from: WritableValue; to: WritableValue }
  | { kind: 'official'; changes: ConfigChange[] }
  | { kind: 'restore'; change: ConfigChange };

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
        official={row.writable}
      />
    );
  };
  return (
    <>
      {flags.known.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
            <AppText variant="capLarge" muted>
              {t('bandConfig.flagsTitle')}
            </AppText>
            <AppText variant="cap" muted testID="config-flags-count">
              {t('bandConfig.flagsCount', { shown: flags.known.length, total: FLAG_KEYS.length })}
            </AppText>
          </View>
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
  const { t, language } = useT();
  const { colors } = useTheme();
  const { device, readBandConfig, bandActions } = useAppData();
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const unknown = t('band.unknown');
  const state = useMemo(() => parseBandConfig(device.configSnapshot), [device.configSnapshot]);
  const busy = reading || writing || device.connection === 'syncing' || device.connection === 'connecting';
  const nowS = Math.floor(Date.now() / 1000);
  const summary = state.status === 'ok' ? officialProfileSummary(state.snapshot) : null;
  const snapshots = state.status === 'ok' ? configSnapshots(state.snapshot) : [];

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
  const restore = (row: FieldRow): Promise<void> => guarded(() => bandActions.restoreConfig(row.kind, row.entry.key));
  const writeOfficial = (changes: readonly ConfigChange[]): Promise<void> =>
    guarded(async () => {
      for (const change of changes) {
        if (!(await bandActions.restoreConfig(change.kind, change.key))) return false;
      }
      return true;
    });

  const confirmWord = t('bandConfig.write.word');
  const onOff = (kind: ConfigChange['kind'], value: WritableValue): string => (kind === 'flag' ? t(value === '1' ? 'bandConfig.on' : 'bandConfig.off') : value);
  const dialog = (() => {
    if (pending === null) return { title: '', body: '' };
    if (pending.kind === 'write') {
      return {
        title: t('bandConfig.write.dialogTitle'),
        body: t('bandConfig.write.dialogBody', {
          key: pending.row.entry.key,
          from: writableText(t, pending.row, pending.from),
          to: writableText(t, pending.row, pending.to),
          word: confirmWord,
        }),
      };
    }
    if (pending.kind === 'official') {
      return { title: t('bandConfig.writeOfficialTitle'), body: t('bandConfig.writeOfficialBody', { keys: pending.changes.map((change) => change.key).join(', '), word: confirmWord }) };
    }
    return {
      title: t('bandConfig.restoreOneTitle', { key: pending.change.key }),
      body: t('bandConfig.restoreOneBody', { key: pending.change.key, value: onOff(pending.change.kind, pending.change.original), word: confirmWord }),
    };
  })();
  const confirm = (): void => {
    const target = pending;
    setPending(null);
    if (target === null) return;
    if (target.kind === 'write') void guarded(() => bandActions.writeConfig(target.row.kind, target.row.entry.key, target.to));
    else if (target.kind === 'official') void writeOfficial(target.changes);
    else void guarded(() => bandActions.restoreConfig(target.change.kind, target.change.key));
  };
  const snapshotTime = (at: number): string => {
    const tz = deviceTzOffsetS(new Date(at * 1000));
    return `${formatShortDay(unixToIsoDate(at, tz), language)} ${formatClock(at, tz)}`;
  };
  const share = (): void => {
    if (device.configSnapshot !== null) void Share.share({ title: t('bandConfig.title'), message: device.configSnapshot });
  };

  const header = (
    <>
      <TopBar
        title={t('bandConfig.title')}
        right={device.configSnapshot === null ? undefined : <IconButton icon="import" label={t('bandConfig.share')} onPress={share} color={colors.text} testID="config-share" />}
      />
      <View style={{ gap: spacing.sm }} testID="config-hero">
        <AppText variant="capLarge" soft>
          {t('bandConfig.eyebrow', { model: device.model ?? unknown, firmware: device.firmware ?? unknown })}
        </AppText>
        <AppText variant="h1" accessibilityRole="header" testID="config-summary">
          {summary === null ? t('bandConfig.summaryNotRead') : t('bandConfig.summary', { matching: summary.matching, total: summary.total })}
        </AppText>
        {summary === null ? null : (
          <AppText variant="label" soft>
            {t('bandConfig.officialExplained')}
          </AppText>
        )}
      </View>
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="band-config">
      <NoticeCard />
      <ListGroup>
        <KeyValueRow label={t('band.model')} value={device.model ?? unknown} />
        <KeyValueRow label={t('band.firmware')} value={device.firmware ?? unknown} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
        {state.status === 'ok' || state.status === 'empty' ? (
          <KeyValueRow label={t('bandConfig.readAt')} value={formatAgo(t, nowS, state.snapshot.readAt)} testID="config-read-at" />
        ) : null}
      </ListGroup>
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

      {state.status === 'ok' ? (
        <Snapshot
          snapshot={state.snapshot}
          onChange={(row, to) => setPending({ kind: 'write', row, from: to === '1' ? '2' : '1', to })}
          onRestore={(row) => void restore(row)}
          disabled={busy}
        />
      ) : (
        <StateCard state={state} />
      )}

      <Card testID="config-write-note" style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: colors.infoSoft }}>
        <Icon name="sync" color={colors.info} size={16} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong" color={colors.info}>
            {t('bandConfig.write.title')}
          </AppText>
          <AppText variant="body" soft>
            {t('bandConfig.write.body')}
          </AppText>
        </View>
      </Card>

      {summary !== null ? (
        <>
          <Button
            label={t('bandConfig.writeOfficial')}
            variant="soft"
            disabled={busy || summary.differs.length === 0}
            onPress={() => setPending({ kind: 'official', changes: summary.differs })}
            testID="write-official"
          />
          {summary.differs.length === 0 ? (
            <AppText variant="caption" muted testID="write-official-none">
              {t('bandConfig.writeOfficialNone')}
            </AppText>
          ) : null}
        </>
      ) : null}

      {snapshots.length > 0 ? (
        <>
          <CapHeader title={t('bandConfig.snapshots')} />
          <ListGroup>
            {snapshots.map((entry) => {
              const change = entry.change;
              return change === null ? (
                <ListRow
                  key={entry.id}
                  icon={tile(colors, 'lock', 'positive')}
                  title={snapshotTime(entry.at)}
                  subtitle={t('bandConfig.snapshotRead')}
                  chevron={false}
                  testID="snapshot-read"
                />
              ) : (
                <ListRow
                  key={entry.id}
                  icon={tile(colors, 'sync', 'plain')}
                  title={snapshotTime(entry.at)}
                  subtitle={`${t('bandConfig.snapshotBefore', { key: change.key })} · ${t('bandConfig.snapshotBeforeHint', { key: change.key })}`}
                  onPress={busy ? undefined : () => setPending({ kind: 'restore', change })}
                  testID={`snapshot-${change.key}`}
                />
              );
            })}
          </ListGroup>
        </>
      ) : null}

      <LevelNote level="D" text={t('device.flags.levelD')} />

      <ConfirmDangerDialog
        visible={pending !== null}
        commandName={confirmWord}
        title={dialog.title}
        body={dialog.body}
        inputLabel={t('bandConfig.write.inputLabel')}
        confirmLabel={t('bandConfig.write.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </Screen>
  );
}
