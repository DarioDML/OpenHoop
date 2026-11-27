import type { Transport } from '@openhoop/core';
import { GATT, commandName, type Packet } from '@openhoop/protocol';

export type PacketDirection = 'rx' | 'tx';

export interface PacketEntry {
  id: number;
  at: number;
  direction: PacketDirection;
  summary: string;
  hex: string;
  length: number;
}

export interface PacketLogState {
  entries: readonly PacketEntry[];
  watching: boolean;
  recording: { startedAt: number; count: number } | null;
}

export const PACKET_LOG_CAPACITY = 200;
export const RECORDING_LIMIT = 20_000;
const COMMAND_PACKET = 35;
const CONSOLE_PREVIEW = 48;
const WHOOP_CHANNELS: ReadonlySet<string> = new Set([GATT.cmdFromStrap, GATT.eventsFromStrap, GATT.dataFromStrap].map((uuid) => uuid.toLowerCase()));

function pad(value: number, width = 2): string {
  return value.toString().padStart(width, '0');
}

export function packetClock(atMs: number): string {
  const date = new Date(atMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function describeCommandFrame(frame: Uint8Array): string {
  if (frame[8] !== COMMAND_PACKET) return 'write';
  return `CMD ${commandName(frame[10] ?? 0)} seq=${frame[9] ?? 0}`;
}

export function describePacket(packet: Packet): string {
  switch (packet.kind) {
    case 'commandResponse':
      return `ACK ${packet.commandName} ${packet.resultName}`;
    case 'realtimeHr':
      return `HR hr=${packet.heartRate} rr=[${packet.rrMs.join(',')}]`;
    case 'event':
      return `EVT ${packet.eventName}`;
    case 'packEvent':
      return `PACK ${packet.eventName}`;
    case 'console':
      return `LOG ${packet.text.slice(0, CONSOLE_PREVIEW)}`;
    case 'metadata':
      return `META ${packet.metaName}`;
    case 'record':
      return `R${packet.packetType} #${packet.recordIndex}`;
    case 'unknown':
      return `type ${packet.packetType}`;
  }
}

export class PacketLog {
  private watchers = 0;
  private nextId = 1;
  private recorded: PacketEntry[] | null = null;
  private state: PacketLogState = { entries: [], watching: false, recording: null };
  private readonly listeners = new Set<() => void>();

  get active(): boolean {
    return this.watchers > 0 || this.recorded !== null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): PacketLogState => this.state;

  private publish(change: Partial<PacketLogState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener();
  }

  watch(): () => void {
    this.watchers += 1;
    if (this.watchers === 1) this.publish({ watching: true });
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.watchers = Math.max(0, this.watchers - 1);
      if (this.watchers === 0) this.publish({ watching: false, entries: this.recorded === null ? [] : this.state.entries });
    };
  }

  record(direction: PacketDirection, summary: string, bytes: Uint8Array, at: number = Date.now()): void {
    if (!this.active) return;
    const entry: PacketEntry = { id: this.nextId, at, direction, summary, hex: toHex(bytes), length: bytes.length };
    this.nextId += 1;
    const entries = [...this.state.entries.slice(-(PACKET_LOG_CAPACITY - 1)), entry];
    const recording = this.state.recording;
    if (this.recorded !== null && recording !== null && this.recorded.length < RECORDING_LIMIT) {
      this.recorded.push(entry);
      this.publish({ entries, recording: { ...recording, count: this.recorded.length } });
      return;
    }
    this.publish({ entries });
  }

  startRecording(at: number = Date.now()): void {
    if (this.recorded !== null) return;
    this.recorded = [];
    this.publish({ recording: { startedAt: at, count: 0 } });
  }

  stopRecording(): { startedAt: number; entries: PacketEntry[] } | null {
    const recorded = this.recorded;
    const recording = this.state.recording;
    this.recorded = null;
    this.publish({ recording: null, entries: this.watchers > 0 ? this.state.entries : [] });
    return recorded === null || recording === null ? null : { startedAt: recording.startedAt, entries: recorded };
  }
}

export const packetLog = new PacketLog();

export function loggedTransport(inner: Transport, log: PacketLog = packetLog): Transport {
  return {
    scan: (timeoutMs) => inner.scan(timeoutMs),
    connect: (id) => inner.connect(id),
    disconnect: () => inner.disconnect(),
    services: () => inner.services(),
    read: (service, characteristic) => inner.read(service, characteristic),
    write: async (service, characteristic, data) => {
      log.record('tx', describeCommandFrame(data), data);
      await inner.write(service, characteristic, data);
    },
    subscribe: (service, characteristic, onData) =>
      inner.subscribe(service, characteristic, (data) => {
        if (!WHOOP_CHANNELS.has(characteristic.toLowerCase())) log.record('rx', `notify ${characteristic.slice(4, 8)}`, data);
        onData(data);
      }),
    bond: () => inner.bond(),
    onDisconnect: (callback) => inner.onDisconnect(callback),
  };
}
