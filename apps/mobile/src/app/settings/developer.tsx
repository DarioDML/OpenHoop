import { ALGO } from '@openhoop/analytics';
import { DAY_RECORD_VERSION, SAMPLE_DECODER_VERSION, SCHEMA_VERSION } from '@openhoop/core/versions';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import { RECORDING_LIMIT, packetClock, packetLog, type PacketEntry } from '@/ble/packetLog';
import { useAppData, useLive } from '@/data/context';
import { deleteRawSession, listRawSessions, saveRawSession, type RawSessionFile } from '@/data/rawSessions';
import type { DataSource } from '@/data/types';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Segmented, Toggle } from '@/ui/controls';
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

function StreamsTab() {
  const { t } = useT();
  const { startLive, stopLive } = useAppData();
  const live = useLive();
  const [busy, setBusy] = useState(false);
  const toggleLive = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      await (on ? startLive() : stopLive());
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <CapHeader title={t('dev.liveStreams')} />
      <ListGroup>
        <StreamRow
          testID="stream-hr"
          title={t('dev.stream.hr')}
          body={t('dev.stream.hrBody')}
          right={<Toggle label={t('dev.stream.hr')} value={live.active} disabled={busy} onChange={(on) => void toggleLive(on)} testID="stream-hr-toggle" />}
        />
        <StreamRow testID="stream-ppg" title={t('dev.stream.ppg')} body={t('dev.stream.ppgBody')} right={<Chip label={t('dev.stream.notDecoded')} tone="pink" small />} />
        <StreamRow testID="stream-imu" title={t('dev.stream.imu')} body={t('dev.stream.imuBody')} right={<Chip label={t('dev.stream.notDecoded')} tone="pink" small />} />
        <StreamRow testID="stream-temp" title={t('dev.stream.temp')} body={t('dev.stream.tempBody')} right={<Chip label={t('dev.stream.always')} small />} />
      </ListGroup>
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
