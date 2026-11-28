import type { Transport } from '@openhoop/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import DeveloperScreen from '@/app/settings/developer';
import { PACKET_LOG_CAPACITY, PacketLog, RECORDING_LIMIT, describeCommandFrame, describePacket, loggedTransport, packetLog } from '@/ble/packetLog';
import { listRawSessions, rawSessionCsv, rawSessionName, saveRawSession, saveRawStream } from '@/data/rawSessions';

import { fixtureRawStreams, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/data/rawSessions', () => ({
  ...jest.requireActual<object>('@/data/rawSessions'),
  saveRawSession: jest.fn(async () => ({ name: 'raw-session-20261125-120000.csv', bytes: 10 })),
  saveRawStream: jest.fn(async () => ({ name: 'raw-imu-20261125-120000.csv', bytes: 10 })),
  listRawSessions: jest.fn(() => []),
  deleteRawSession: jest.fn(),
}));

const COMMAND_FRAME = Uint8Array.from([0xaa, 0, 0, 0, 0, 0, 0, 0, 35, 7, 3, 1]);

describe('packet log', () => {
  it('keeps nothing while nobody watches, then a bounded ring while watched', () => {
    const log = new PacketLog();
    log.record('rx', 'ignored', Uint8Array.of(1));
    expect(log.getState().entries).toEqual([]);
    const stop = log.watch();
    for (let i = 0; i < PACKET_LOG_CAPACITY + 5; i += 1) log.record('rx', `p${i}`, Uint8Array.of(i % 256), 1_000 + i);
    expect(log.getState().entries).toHaveLength(PACKET_LOG_CAPACITY);
    expect(log.getState().entries[0]?.summary).toBe('p5');
    stop();
    expect(log.getState().entries).toEqual([]);
    expect(log.getState().watching).toBe(false);
  });

  it('records a session even after the screen closes and returns every packet once', () => {
    const log = new PacketLog();
    const stop = log.watch();
    log.startRecording(500);
    log.record('tx', 'CMD A', Uint8Array.of(1, 2), 600);
    stop();
    log.record('rx', 'ACK A', Uint8Array.of(3), 700);
    expect(log.getState().recording).toEqual({ startedAt: 500, count: 2, full: false });
    const recorded = log.stopRecording();
    expect(recorded?.startedAt).toBe(500);
    expect(recorded?.entries.map((entry) => [entry.direction, entry.summary, entry.hex])).toEqual([
      ['tx', 'CMD A', '0102'],
      ['rx', 'ACK A', '03'],
    ]);
    expect(log.stopRecording()).toBeNull();
    log.record('rx', 'late', Uint8Array.of(1));
    expect(log.getState().entries).toEqual([]);
  });

  it('marks a recording as full at the limit and keeps the packets it holds', () => {
    const log = new PacketLog();
    log.startRecording(1);
    for (let i = 0; i < RECORDING_LIMIT + 3; i += 1) log.record('rx', 'p', Uint8Array.of(1), i);
    expect(log.getState().recording).toMatchObject({ count: RECORDING_LIMIT, full: true });
    expect(log.stopRecording()?.entries).toHaveLength(RECORDING_LIMIT);
  });

  it('describes command frames and decoded packets', () => {
    expect(describeCommandFrame(COMMAND_FRAME)).toMatch(/^CMD .+ seq=7$/);
    expect(describeCommandFrame(Uint8Array.of(1, 2))).toBe('write');
    expect(describePacket({ kind: 'realtimeHr', unixS: 1, heartRate: 66, rrMs: [904, 912] })).toBe('HR hr=66 rr=[904,912]');
    expect(describePacket({ kind: 'unknown', packetType: 99 })).toBe('type 99');
  });

  it('logs writes and other notifications through a transport wrapper', async () => {
    const log = new PacketLog();
    const stop = log.watch();
    let deliver: (data: Uint8Array) => void = () => undefined;
    const inner: Transport = {
      scan: async () => [],
      connect: async () => undefined,
      disconnect: async () => undefined,
      services: async () => [],
      read: async () => new Uint8Array(0),
      write: jest.fn(async () => undefined),
      subscribe: async (_service, _characteristic, onData) => {
        deliver = onData;
        return async () => undefined;
      },
      bond: async () => 'unsupported',
      onDisconnect: () => () => undefined,
    };
    const wrapped = loggedTransport(inner, log);
    await wrapped.write('svc', 'chr', COMMAND_FRAME);
    expect(inner.write).toHaveBeenCalledWith('svc', 'chr', COMMAND_FRAME);
    const received: Uint8Array[] = [];
    await wrapped.subscribe('0000180d-0000-1000-8000-00805f9b34fb', '00002a37-0000-1000-8000-00805f9b34fb', (data) => received.push(data));
    deliver(Uint8Array.of(0, 66));
    expect(received).toHaveLength(1);
    expect(log.getState().entries.map((entry) => entry.direction)).toEqual(['tx', 'rx']);
    stop();
  });

  it('writes a raw session as CSV with a dated name', () => {
    expect(rawSessionName(new Date(2026, 10, 25, 7, 55, 2))).toBe('raw-session-20261125-075502.csv');
    const csv = rawSessionCsv([{ id: 1, at: 5, direction: 'rx', summary: 'LOG a,b', hex: '0a', length: 1 }]);
    expect(csv).toBe('at_ms,direction,length,summary,hex\r\n5,rx,1,"LOG a,b",0a\r\n');
  });
});

describe('Developer screen (M6)', () => {
  it('shows packets live while open and records a raw session to app storage', async () => {
    await render(withAppData(<DeveloperScreen />));
    expect(screen.getByTestId('packet-log-empty')).toBeTruthy();
    await act(async () => packetLog.record('rx', 'HR hr=66 rr=[904]', Uint8Array.of(1, 2)));
    expect(within(screen.getByTestId('packet-log')).getByText(/HR hr=66/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('record-raw'));
    await act(async () => packetLog.record('tx', 'CMD GET_HELLO seq=1', Uint8Array.of(3)));
    expect(screen.getByText('Stop and save (1 packets)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('record-raw'));
    await waitFor(() => expect(saveRawSession).toHaveBeenCalledWith(expect.any(Date), [expect.objectContaining({ summary: 'CMD GET_HELLO seq=1' })]));
  });

  it('stops and saves a running recording when the screen closes', async () => {
    jest.mocked(saveRawSession).mockClear();
    await render(withAppData(<DeveloperScreen />));
    await fireEvent.press(screen.getByTestId('record-raw'));
    expect(screen.getByTestId('record-leave')).toBeTruthy();
    await act(async () => packetLog.record('rx', 'ACK GET_HELLO SUCCESS', Uint8Array.of(9)));
    screen.unmount();
    await waitFor(() => expect(saveRawSession).toHaveBeenCalledWith(expect.any(Date), [expect.objectContaining({ summary: 'ACK GET_HELLO SUCCESS' })]));
    expect(packetLog.getState().recording).toBeNull();
  });

  it('exports only the saved sessions, without the database', async () => {
    jest.mocked(listRawSessions).mockReturnValueOnce([{ name: 'raw-session-20261125-120000.csv', bytes: 10 }]);
    const exportData = jest.fn(async () => undefined);
    await render(withAppData(<DeveloperScreen />, 'en', { exportData }));
    await fireEvent.press(screen.getByText('Export sessions'));
    expect(exportData).toHaveBeenCalledWith('sessions');
  });

  it('switches live heart rate in Streams and offers optical and motion streams', async () => {
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<DeveloperScreen />, 'en', { startLive }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    await fireEvent(screen.getByTestId('stream-hr-toggle'), 'valueChange', true);
    expect(startLive).toHaveBeenCalled();
    expect(screen.queryByText('Not decoded yet')).toBeNull();
    expect(screen.getByTestId('stream-ppg-toggle')).toBeTruthy();
    expect(screen.getByTestId('stream-imu-toggle')).toBeTruthy();
  });

  it('switching the motion row on starts a developer motion stream, and off stops it', async () => {
    const rawStreams = { ...fixtureRawStreams(), start: jest.fn(async () => true), stop: jest.fn(async () => undefined) };
    await render(withAppData(<DeveloperScreen />, 'en', { rawStreams }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    await fireEvent(screen.getByTestId('stream-imu-toggle'), 'valueChange', true);
    expect(rawStreams.start).toHaveBeenCalledWith('developer', ['imu']);
  });

  it('leaving the Streams tab stops the developer streams', async () => {
    const rawStreams = { ...fixtureRawStreams(), stop: jest.fn(async () => undefined) };
    const rawLive = { owners: { developer: ['imu' as const], workout: [] }, imu: null, optical: null };
    const view = await render(withAppData(<DeveloperScreen />, 'en', { rawStreams, rawLive }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Versions' }));
    expect(rawStreams.stop).toHaveBeenCalledWith('developer');
    rawStreams.stop.mockClear();
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    await view.unmount();
    expect(rawStreams.stop).toHaveBeenCalledWith('developer');
  });

  it('a running stream shows its measured rate, traces and likely channel names', async () => {
    const fill = (v: number): number[] => new Array<number>(500).fill(v);
    const rawLive = {
      owners: { developer: ['imu' as const, 'optical' as const], workout: [] },
      imu: { rateHz: 100, seconds: 42, tail: { ax: fill(0), ay: fill(0), az: fill(1), gx: fill(0), gy: fill(0), gz: fill(0) } },
      optical: {
        rateHz: 25,
        seconds: 42,
        channels: [
          { block: 0, slot: 'A' as const, source: 1, detector: 3, drive: 2750, samples: fill(200_000) },
          { block: 3, slot: 'A' as const, source: 2, detector: 3, drive: 0, samples: fill(190) },
          { block: 4, slot: 'A' as const, source: 2, detector: 3, drive: 200, samples: fill(100_000) },
        ],
      },
    };
    await render(withAppData(<DeveloperScreen />, 'en', { rawLive }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    expect(within(screen.getByTestId('stream-imu')).getByText(/100 Hz/)).toBeTruthy();
    expect(within(screen.getByTestId('stream-ppg')).getByText(/25 Hz/)).toBeTruthy();
    expect(screen.getByText('Pulse · likely green')).toBeTruthy();
    expect(screen.getByText('Wear check · likely IR')).toBeTruthy();
    expect(screen.getByText('Dark reference')).toBeTruthy();
    expect(screen.getByTestId('imu-accel-trace')).toBeTruthy();
    expect(screen.getByTestId('imu-gyro-trace')).toBeTruthy();
  });

  it('records the developer streams to CSV files', async () => {
    const second = { t: 1_000, recordIndex: 1, rateHz: 100, accel: [[0], [0], [4096]] as [number[], number[], number[]], gyro: [[0], [0], [0]] as [number[], number[], number[]] };
    let seconds = [second];
    const rawStreams = { ...fixtureRawStreams(), imuSeconds: () => seconds };
    const rawLive = { owners: { developer: ['imu' as const], workout: [] }, imu: null, optical: null };
    await render(withAppData(<DeveloperScreen />, 'en', { rawStreams, rawLive }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Streams' }));
    await fireEvent.press(screen.getByTestId('record-streams'));
    seconds = [second, { ...second, t: 1_001 }];
    await fireEvent.press(screen.getByTestId('record-streams'));
    await waitFor(() => expect(saveRawStream).toHaveBeenCalledTimes(1));
    expect(saveRawStream).toHaveBeenCalledWith('imu', expect.any(Date), expect.stringContaining('1001000,0.0000,0.0000,1.0000'));
    expect(String((saveRawStream as jest.Mock).mock.calls[0]?.[2])).not.toContain('\r\n1000000,');
  });

  it('lists the algorithm versions and keeps the developer tools', async () => {
    await render(withAppData(<DeveloperScreen />));
    await fireEvent.press(screen.getByRole('tab', { name: 'Versions' }));
    expect(within(screen.getByTestId('algo-readiness')).getByText('readiness.rec-rhr@1')).toBeTruthy();
    expect(screen.getByTestId('version-decoder')).toBeTruthy();
    expect(screen.getByTestId('selftest-link')).toBeTruthy();
    expect(screen.getByTestId('states-link')).toBeTruthy();
  });
});
