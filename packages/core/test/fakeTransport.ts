import {
  GATT,
  commandClass,
  encodeBiometric,
  encodeCommandResponse,
  encodeDataRangeBody,
  encodeHelloBody,
  encodeMetadata,
  parseFirmware,
} from '@openhoop/protocol';
import type { BondResult, Clock, DiscoveredDevice, GattService, Transport } from '../src/index';

export class VirtualClock implements Clock {
  private t: number;
  private timers: { due: number; id: number; fn: () => void }[] = [];
  private nextId = 0;
  private running = false;

  constructor(
    startMs = 1_800_000_000_000,
    private readonly manual = false,
  ) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  schedule(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.push({ due: this.t + ms, id, fn });
    this.kick();
    return () => {
      this.timers = this.timers.filter((timer) => timer.id !== id);
    };
  }

  pendingTimers(): number {
    return this.timers.length;
  }

  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.due - b.due || a.id - b.id);
      const timer = this.timers[0];
      if (timer === undefined || timer.due > target) break;
      this.timers.shift();
      this.t = Math.max(this.t, timer.due);
      timer.fn();
    }
    this.t = target;
  }

  private kick(): void {
    if (this.manual || this.running) return;
    this.running = true;
    void this.loop();
  }

  private async loop(): Promise<void> {
    for (;;) {
      for (let i = 0; i < 25; i++) await new Promise<void>((resolve) => setImmediate(resolve));
      this.timers.sort((a, b) => a.due - b.due || a.id - b.id);
      const timer = this.timers.shift();
      if (timer === undefined) break;
      this.t = Math.max(this.t, timer.due);
      timer.fn();
    }
    this.running = false;
  }
}

export interface Outgoing {
  frame: Uint8Array;
  command: number;
  sequence: number;
  args: Uint8Array;
}

export type Emit = (characteristic: string, frame: Uint8Array) => void;

export interface WireEntry {
  dir: 'out' | 'in';
  service: string;
  characteristic: string;
  data: Uint8Array;
}

export class FakeTransport implements Transport {
  readonly writes: Outgoing[] = [];
  readonly wire: WireEntry[] = [];
  readonly reads = new Map<string, Uint8Array | Error>();
  handler: (out: Outgoing, emit: Emit) => void = () => undefined;
  onWrite: ((out: Outgoing) => void) | null = null;
  private readonly subscribers = new Map<string, (data: Uint8Array) => void>();
  private readonly disconnectCallbacks = new Set<() => void>();
  private connected = true;

  async scan(_timeoutMs: number): Promise<DiscoveredDevice[]> {
    return [{ id: 'fake', name: 'WHOOP fake', rssi: -40 }];
  }

  async connect(_id: string): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.dropLink();
  }

  async services(): Promise<GattService[]> {
    return [];
  }

  async read(service: string, characteristic: string): Promise<Uint8Array> {
    const value = this.reads.get(`${service}/${characteristic}`);
    if (value === undefined) throw new Error('characteristic not readable');
    if (value instanceof Error) throw value;
    return value;
  }

  async write(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('not connected');
    this.wire.push({ dir: 'out', service, characteristic, data });
    const out: Outgoing = { frame: data, sequence: data[9] ?? -1, command: data[10] ?? -1, args: data.slice(11) };
    this.writes.push(out);
    this.onWrite?.(out);
    queueMicrotask(() => this.handler(out, (c, f) => this.notify(c, f)));
  }

  async subscribe(_service: string, characteristic: string, onData: (data: Uint8Array) => void): Promise<() => Promise<void>> {
    this.subscribers.set(characteristic, onData);
    return async () => {
      this.subscribers.delete(characteristic);
    };
  }

  async bond(): Promise<BondResult> {
    return 'already-bonded';
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }

  notify(characteristic: string, data: Uint8Array): void {
    if (!this.connected) return;
    this.wire.push({ dir: 'in', service: GATT.service, characteristic, data });
    this.subscribers.get(characteristic)?.(data);
  }

  dropLink(): void {
    if (!this.connected) return;
    this.connected = false;
    for (const callback of [...this.disconnectCallbacks]) callback();
  }

  commandsSent(): number[] {
    return this.writes.map((w) => w.command);
  }

  classesSent(): string[] {
    return this.writes.map((w) => commandClass(w.command));
  }
}

export function reply(out: Outgoing, result = 1, body?: Uint8Array): Uint8Array {
  return encodeCommandResponse({
    sequence: out.sequence,
    command: out.command,
    originSequence: out.sequence,
    result,
    ...(body === undefined ? {} : { body }),
  });
}

export function helloBody(opts: { unixS: number; firmware?: string; batteryPercent?: number }): Uint8Array {
  const firmware = parseFirmware(opts.firmware ?? '50.38.1.0');
  if (firmware === null) throw new Error('bad firmware');
  return encodeHelloBody({ batteryPercent: opts.batteryPercent ?? 77.5, unixS: opts.unixS, firmware });
}

export function rangeBody(opts: { writePage: number; trimPage: number; totalPages?: number; newestUnix?: number }): Uint8Array {
  return encodeDataRangeBody({
    readPage: opts.trimPage,
    writePage: opts.writePage,
    trimPage: opts.trimPage,
    writeWrap: 0,
    totalPages: opts.totalPages ?? 131_072,
    newestUnix: opts.newestUnix ?? 1_800_000_000,
  });
}

export function batteryBody(percent: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, percent, true);
  return out;
}

export interface BandScript {
  clock: VirtualClock;
  firmware?: string;
  helloUnixS?: number;
  pagesBehind?: number;
  chunks?: Uint8Array[][];
  complete?: Uint8Array;
  onCommand?: (out: Outgoing, emit: Emit) => boolean;
}

export function scriptBand(transport: FakeTransport, script: BandScript): { served: () => number } {
  let next = 0;
  const serveNext = (emit: Emit): void => {
    const chunk = script.chunks?.[next];
    if (chunk === undefined) {
      if (script.complete !== undefined) emit(GATT.dataFromStrap, script.complete);
      return;
    }
    for (const frame of chunk) emit(GATT.dataFromStrap, frame);
  };
  transport.handler = (out, emit) => {
    if (script.onCommand?.(out, emit) === true) return;
    switch (out.command) {
      case 145:
        emit(
          GATT.cmdFromStrap,
          reply(
            out,
            1,
            helloBody({
              unixS: script.helloUnixS ?? Math.floor(script.clock.now() / 1000),
              ...(script.firmware === undefined ? {} : { firmware: script.firmware }),
            }),
          ),
        );
        return;
      case 34: {
        const behind = script.pagesBehind ?? 40;
        emit(GATT.cmdFromStrap, reply(out, 2));
        emit(GATT.cmdFromStrap, reply(out, 1, rangeBody({ writePage: 1_000 + behind, trimPage: 1_000 })));
        return;
      }
      case 26:
        emit(GATT.cmdFromStrap, reply(out, 1, batteryBody(64)));
        return;
      case 22:
        emit(GATT.cmdFromStrap, reply(out, 1));
        serveNext(emit);
        return;
      case 23:
        next += 1;
        serveNext(emit);
        return;
      default:
        emit(GATT.cmdFromStrap, reply(out, 1));
    }
  };
  return { served: () => next };
}

export function token(n: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setUint32(0, 1_000 + n, true);
  return out;
}

export function biometricChunk(n: number, opts: { firstT: number; count: number; firstIndex?: number }): Uint8Array[] {
  const frames: Uint8Array[] = [encodeMetadata({ meta: 'HISTORY_START', unixS: opts.firstT })];
  for (let k = 0; k < opts.count; k++) {
    frames.push(
      encodeBiometric({
        recordIndex: (opts.firstIndex ?? n * 1_000) + k,
        unixS: opts.firstT + k,
        heartRate: 60 + (k % 5),
        rrMs: [900, 910],
        stepCounter: k,
        bandState: 'SLEEP',
      }),
    );
  }
  frames.push(encodeMetadata({ meta: 'HISTORY_END', unixS: opts.firstT + opts.count, endToken: token(n) }));
  return frames;
}

export function historyComplete(unixS: number): Uint8Array {
  return encodeMetadata({ meta: 'HISTORY_COMPLETE', unixS });
}
