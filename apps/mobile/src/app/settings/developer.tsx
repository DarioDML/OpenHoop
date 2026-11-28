import { ALGO } from '@openhoop/analytics';
import { DAY_RECORD_VERSION, SAMPLE_DECODER_VERSION, SCHEMA_VERSION } from '@openhoop/core/versions';
import Constants from 'expo-constants';
import type { LiveImuSecond, LiveOpticalSecond, StreamKind } from '@openhoop/core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { RECORDING_LIMIT, packetClock, packetLog, type PacketEntry } from '@/ble/packetLog';
import { useAppData, useLive, useRawLive } from '@/data/context';
import type { ChannelRole } from '@/data/opticalChannels';
import type { ImuTail, OpticalChannelTail } from '@/data/rawLive';
import { deleteRawSession, listRawSessions, saveRawSession, saveRawStream, type RawSessionFile } from '@/data/rawSessions';
import { imuCsv, opticalCsv } from '@/data/signalCsv';
import type { DataSource } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { SignalTrace, type TraceSeries } from '@/ui/dev/SignalTrace';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { IconButton } from '@/ui/TopBar';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { KeyValueRow } from '@/ui/manage/rows';
import { sizeParts } from '@/ui/manage/storageFormat';
import { tile } from '@/ui/manage/tiles';
import { Screen } from '@/ui/Screen';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

type Tab = 'packets' | 'streams' | 'versions';

const SHOWN_PACKETS = 40;
const HEX_PREVIEW = 32;

function PacketLine({ entry }: { entry: PacketEntry }) {
  const { colors } = useTheme();
  const mono = { fontFamily: fonts.mono, fontWeight: '400' as const, fontSize: 12, lineHeight: 18 };
  return (
    <AppText variant="caption" style={mono} testID={`packet-${entry.id}`}>
      <AppText variant="caption" color={colors.textFaint} style={mono}>
        {packetClock(entry.at)}{' '}
      </AppText>
      <AppText variant="caption" color={entry.direction === 'rx' ? colors.info : colors.positive} style={mono}>
        {entry.direction.toUpperCase()}{' '}
      </AppText>
      {entry.summary}
      <AppText variant="caption" color={colors.textMuted} style={mono}>
        {' '}
        {entry.hex.length > HEX_PREVIEW ? `${entry.hex.slice(0, HEX_PREVIEW)}…` : entry.hex}
      </AppText>
    </AppText>
  );
}

function PacketsTab() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { sync, exportData } = useAppData();
  const log = useSyncExternalStore(packetLog.subscribe, packetLog.getState, packetLog.getState);
  const [sessions, setSessions] = useState<RawSessionFile[]>([]);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(() => {
    try {
      setSessions(listRawSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => packetLog.watch(), []);
  useEffect(refresh, [refresh]);
  useEffect(
    () => () => {
      const recorded = packetLog.stopRecording();
      if (recorded !== null) void saveRawSession(new Date(recorded.startedAt), recorded.entries).catch(() => undefined);
    },
    [],
  );

  const toggleRecording = async (): Promise<void> => {
    if (log.recording === null) {
      setFailed(false);
      packetLog.startRecording();
      return;
    }
    const recorded = packetLog.stopRecording();
    if (recorded === null) return;
    try {
      await saveRawSession(new Date(recorded.startedAt), recorded.entries);
    } catch {
      setFailed(true);
    }
    refresh();
  };

  const shown = log.entries.slice(-SHOWN_PACKETS);
  return (
    <>
      <View testID="packet-log" style={{ backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 4, minHeight: 120 }}>
        {shown.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <AppText variant="label" muted testID="packet-log-empty">
              {t('dev.packetsEmpty')}
            </AppText>
            <Button label={t('dev.syncForPackets')} variant="soft" compact onPress={() => void sync()} style={{ alignSelf: 'flex-start' }} testID="packet-sync" />
          </View>
        ) : (
          shown.map((entry) => <PacketLine key={entry.id} entry={entry} />)
        )}
      </View>
      <AppText variant="caption" muted>
        {t('dev.packetsNote')}
      </AppText>
      <Button
        label={log.recording === null ? t('dev.record') : t('dev.recordStop', { count: log.recording.count })}
        icon={log.recording === null ? 'import' : 'stop'}
        variant="soft"
        onPress={() => void toggleRecording()}
        testID="record-raw"
      />
      <AppText variant="caption" muted>
        {t('dev.recordBody')}
      </AppText>
      {log.recording?.full === true ? (
        <AppText variant="caption" color={colors.warning} testID="record-full">
          {t('dev.recordFull', { limit: RECORDING_LIMIT })}
        </AppText>
      ) : null}
      {log.recording === null ? null : (
        <AppText variant="caption" muted testID="record-leave">
          {t('dev.recordLeave')}
        </AppText>
      )}
      {failed ? (
        <AppText variant="caption" color={colors.negative} testID="record-failed">
          {t('dev.recordFailed')}
        </AppText>
      ) : null}
      {sessions.length > 0 ? (
        <>
          <CapHeader title={t('dev.sessions')} action={t('dev.exportSessions')} onAction={() => void exportData('sessions')} />
          <AppText variant="caption" muted>
            {t('dev.exportSessionsNote')}
          </AppText>
          <ListGroup>
            {sessions.map((session) => {
              const size = sizeParts(session.bytes, language);
              return (
                <ListRow
                  key={session.name}
                  title={session.name}
                  subtitle={t('dev.sessionSize', { size: size.value, unit: size.unit })}
                  chevron={false}
                  right={
                    <IconButton
                      icon="trash"
                      label={t('dev.sessionDelete', { name: session.name })}
                      onPress={() => {
                        deleteRawSession(session.name);
                        refresh();
                      }}
                    />
                  }
                  testID={`session-${session.name}`}
                />
              );
            })}
          </ListGroup>
        </>
      ) : null}
    </>
  );
}

function StreamRow({ title, body, right, testID }: { title: string; body: string; right: ReactNode; testID: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.md }} testID={testID}>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="body" style={{ fontWeight: '500' }}>
          {title}
        </AppText>
        <AppText variant="label" muted>
          {body}
        </AppText>
      </View>
      {right}
    </View>
  );
}

type TraceColor = 'positive' | 'warning' | 'textMuted' | 'negative' | 'purple' | 'info';

const CHANNEL_COLOR: Readonly<Record<ChannelRole, TraceColor>> = {
  pulse: 'positive',
  wear: 'warning',
  dark: 'textMuted',
  spo2Red: 'negative',
  spo2Ir: 'purple',
  unknown: 'info',
};

function clock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ChannelTrace({ channel }: { channel: OpticalChannelTail }) {
  const { t } = useT();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const color = colors[CHANNEL_COLOR[channel.role]];
  const name = t(`dev.channel.${channel.role}`);
  return (
    <View style={{ gap: 6, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }} testID={`channel-${channel.block}${channel.slot}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('explain.whatIs', { name })} accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={{ minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText variant="label" style={{ fontWeight: '500', flexShrink: 1 }}>
            {name}
          </AppText>
          <Icon name="info" color={colors.textFaint} size={14} />
        </Pressable>
      </View>
      <AppText variant="caption" color={colors.textMuted} style={{ fontFamily: fonts.mono }}>
        {channel.drive === 0 ? t('dev.channel.detailOff', { detector: channel.detector }) : t('dev.channel.detail', { led: channel.source, detector: channel.detector, drive: channel.drive })}
      </AppText>
      {open ? (
        <AppText variant="caption" muted testID={`channel-why-${channel.block}${channel.slot}`}>
          {t(`dev.channel.why.${channel.role}`)}
        </AppText>
      ) : null}
      <SignalTrace series={[{ values: channel.samples, color }]} label={name} />
    </View>
  );
}

function AxisLegend() {
  const { colors } = useTheme();
  const items: [string, string][] = [
    ['x', colors.info],
    ['y', colors.warning],
    ['z', colors.levelC],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      {items.map(([axis, color]) => (
        <View key={axis} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: color }} />
          <AppText variant="caption" muted>
            {axis}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function MotionTraces({ tail }: { tail: ImuTail }) {
  const { t } = useT();
  const { colors } = useTheme();
  const block = (title: string, unit: string, series: TraceSeries[], testID: string) => (
    <View style={{ gap: 6, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="label" style={{ fontWeight: '500', flex: 1 }}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ fontFamily: fonts.mono }}>
          {unit}
        </AppText>
      </View>
      <SignalTrace series={series} height={72} label={title} testID={testID} />
      <AxisLegend />
    </View>
  );
  return (
    <>
      {block(t('dev.imu.accel'), t('dev.imu.accelUnit'), [{ values: tail.ax, color: colors.info }, { values: tail.ay, color: colors.warning }, { values: tail.az, color: colors.levelC }], 'imu-accel-trace')}
      {block(t('dev.imu.gyro'), t('dev.imu.gyroUnit'), [{ values: tail.gx, color: colors.info }, { values: tail.gy, color: colors.warning }, { values: tail.gz, color: colors.levelC }], 'imu-gyro-trace')}
    </>
  );
}

interface StreamRecording {
  at: Date;
  imuLast: LiveImuSecond | null;
  opticalLast: LiveOpticalSecond | null;
}

function after<T>(buffer: readonly T[], last: T | null): readonly T[] {
  if (last === null) return buffer;
  const index = buffer.indexOf(last);
  return index < 0 ? buffer : buffer.slice(index + 1);
}

async function saveRecording(recording: StreamRecording, imu: readonly LiveImuSecond[], optical: readonly LiveOpticalSecond[]): Promise<void> {
  const imuPart = after(imu, recording.imuLast);
  const opticalPart = after(optical, recording.opticalLast);
  if (imuPart.length > 0) await saveRawStream('imu', recording.at, imuCsv(imuPart));
  if (opticalPart.length > 0) await saveRawStream('ppg', recording.at, opticalCsv(opticalPart));
}

function StreamsTab() {
  const { t } = useT();
  const { colors } = useTheme();
  const { startLive, stopLive, rawStreams } = useAppData();
  const live = useLive();
  const raw = useRawLive();
  const [busy, setBusy] = useState(false);
  const [rawBusy, setRawBusy] = useState(false);
  const [recording, setRecording] = useState<StreamRecording | null>(null);
  const [recordFailed, setRecordFailed] = useState(false);
  const developer = raw.owners.developer;
  const recordingRef = useRef<StreamRecording | null>(null);
  recordingRef.current = recording;

  useEffect(
    () => () => {
      const open = recordingRef.current;
      if (open !== null) void saveRecording(open, rawStreams.imuSeconds(), rawStreams.opticalSeconds()).catch(() => undefined);
      void rawStreams.stop('developer');
    },
    [rawStreams],
  );

  const toggleLive = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      await (on ? startLive() : stopLive());
    } finally {
      setBusy(false);
    }
  };
  const toggleRaw = async (kind: StreamKind, on: boolean): Promise<void> => {
    setRawBusy(true);
    try {
      await (on ? rawStreams.start('developer', [kind]) : rawStreams.stop('developer', [kind]));
    } finally {
      setRawBusy(false);
    }
  };
  const toggleRecording = async (): Promise<void> => {
    if (recording === null) {
      setRecordFailed(false);
      setRecording({ at: new Date(), imuLast: rawStreams.imuSeconds().at(-1) ?? null, opticalLast: rawStreams.opticalSeconds().at(-1) ?? null });
      return;
    }
    setRecording(null);
    try {
      await saveRecording(recording, rawStreams.imuSeconds(), rawStreams.opticalSeconds());
    } catch {
      setRecordFailed(true);
    }
  };

  const rateLine = (state: { rateHz: number | null; seconds: number } | null, idle: string): string =>
    state === null ? idle : state.rateHz === null ? t('dev.stream.measuring', { seconds: state.seconds }) : t('dev.stream.running', { rate: state.rateHz, seconds: state.seconds });
  const opticalOn = developer.includes('optical');
  const imuOn = developer.includes('imu');
  const elapsed = Math.max(opticalOn ? (raw.optical?.seconds ?? 0) : 0, imuOn ? (raw.imu?.seconds ?? 0) : 0);

  return (
    <>
      <CapHeader title={t('dev.liveStreams')} />
      {developer.length > 0 ? (
        <AppText variant="caption" muted testID="streams-elapsed">
          {t('dev.stream.elapsed', { elapsed: clock(elapsed) })}
        </AppText>
      ) : null}
      <ListGroup>
        <StreamRow
          testID="stream-hr"
          title={t('dev.stream.hr')}
          body={t('dev.stream.hrBody')}
          right={<Toggle label={t('dev.stream.hr')} value={live.active} disabled={busy} onChange={(on) => void toggleLive(on)} testID="stream-hr-toggle" />}
        />
        <StreamRow
          testID="stream-ppg"
          title={t('dev.stream.ppg')}
          body={opticalOn ? rateLine(raw.optical, t('dev.stream.starting')) : t('dev.stream.ppgBody')}
          right={<Toggle label={t('dev.stream.ppg')} value={opticalOn} disabled={rawBusy} onChange={(on) => void toggleRaw('optical', on)} testID="stream-ppg-toggle" />}
        />
        {opticalOn && raw.optical !== null ? (
          <View style={{ paddingBottom: spacing.sm }}>
            {raw.optical.channels.map((channel) => (
              <ChannelTrace key={`${channel.block}${channel.slot}`} channel={channel} />
            ))}
            <AppText variant="caption" color={colors.textFaint} style={{ paddingTop: spacing.sm }}>
              {t('dev.channel.note')}
            </AppText>
          </View>
        ) : null}
        <StreamRow
          testID="stream-imu"
          title={t('dev.stream.imu')}
          body={imuOn ? rateLine(raw.imu, t('dev.stream.starting')) : t('dev.stream.imuBody')}
          right={<Toggle label={t('dev.stream.imu')} value={imuOn} disabled={rawBusy} onChange={(on) => void toggleRaw('imu', on)} testID="stream-imu-toggle" />}
        />
        {imuOn && raw.imu !== null ? <MotionTraces tail={raw.imu.tail} /> : null}
        <StreamRow testID="stream-temp" title={t('dev.stream.temp')} body={t('dev.stream.tempBody')} right={<Chip label={t('dev.stream.always')} small />} />
      </ListGroup>
      <Button
        label={recording === null ? t('dev.recordStreams') : t('dev.recordStreamsStop')}
        icon={recording === null ? 'import' : 'stop'}
        variant="soft"
        disabled={developer.length === 0 && recording === null}
        onPress={() => void toggleRecording()}
        testID="record-streams"
      />
      <AppText variant="caption" muted>
        {t('dev.recordStreamsBody')}
      </AppText>
      {recordFailed ? (
        <AppText variant="caption" color={colors.negative} testID="record-streams-failed">
          {t('dev.recordStreamsFailed')}
        </AppText>
      ) : null}
      <LevelNote level="D" text={t('dev.streamsLevel')} testID="streams-level" />
    </>
  );
}

function VersionsTab() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const unknown = t('band.unknown');
  const mono = { fontFamily: fonts.mono, fontWeight: '400' as const };
  const versionRow = (label: string, value: string, testID: string) => (
    <View key={testID} testID={testID} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 52 }}>
      <AppText variant="body" style={{ flexShrink: 1 }}>
        {label}
      </AppText>
      <AppText variant="label" color={colors.textMuted} style={mono}>
        {value}
      </AppText>
    </View>
  );
  return (
    <>
      <CapHeader title={t('dev.algorithms')} />
      <ListGroup>{Object.entries(ALGO).map(([key, id]) => versionRow(key, id, `algo-${key}`))}</ListGroup>
      <CapHeader title={t('dev.formats')} />
      <ListGroup>
        {versionRow(t('dev.version.decoder'), `v${SAMPLE_DECODER_VERSION}`, 'version-decoder')}
        {versionRow(t('dev.version.dayRecord'), `v${DAY_RECORD_VERSION}`, 'version-day-record')}
        {versionRow(t('dev.version.schema'), `v${SCHEMA_VERSION}`, 'version-schema')}
        {versionRow(t('dev.version.app'), Constants.expoConfig?.version ?? unknown, 'version-app')}
        {versionRow(t('dev.version.firmware'), device.firmware ?? unknown, 'version-firmware')}
        {versionRow(t('dev.version.signal'), device.band?.boot.signalProcessingVersion ?? unknown, 'version-signal')}
      </ListGroup>
    </>
  );
}

export default function DeveloperScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { settings, updateSettings, device, days } = useAppData();
  const [tab, setTab] = useState<Tab>('packets');

  const header = (
    <>
      <TopBar title={t('dev.title')} />
      <Segmented<Tab>
        testID="developer-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'packets', label: t('dev.tab.packets') },
          { value: 'streams', label: t('dev.tab.streams') },
          { value: 'versions', label: t('dev.tab.versions') },
        ]}
      />
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="developer">
      {tab === 'packets' ? <PacketsTab /> : tab === 'streams' ? <StreamsTab /> : <VersionsTab />}

      <CapHeader title={t('dev.tools')} />
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">{t('dev.intro')}</AppText>
        <AppText variant="label" muted>
          {t('dev.introBody')}
        </AppText>
      </Card>
      <ListGroup>
        <ListRow icon={tile(colors, 'code', 'positive')} title={t('settings.selftest')} subtitle={t('dev.selftestBody')} href="/settings/selftest" testID="selftest-link" />
        <ListRow icon={tile(colors, 'layers', 'purple')} title={t('dev.states')} subtitle={t('dev.statesBody')} href="/settings/states" testID="states-link" />
      </ListGroup>

      <CapHeader title={t('settings.dataSource')} />
      <Segmented<DataSource>
        value={settings.dataSource}
        onChange={(dataSource) => void updateSettings({ dataSource })}
        options={[
          { value: 'demo', label: t('settings.source.demo') },
          { value: 'band', label: t('settings.source.band') },
        ]}
      />

      <CapHeader title={t('dev.state')} />
      <ListGroup>
        <KeyValueRow label={t('band.connection')} value={t(`connection.${device.connection}`)} />
        <KeyValueRow label={t('band.lock')} value={t(`lock.${device.lockState}`)} />
        <KeyValueRow label={t('dev.days')} value={String(days.length)} />
      </ListGroup>
    </Screen>
  );
}
