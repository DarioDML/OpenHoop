import { Command, GATT, Reassembler, buildCommand, decodeFrame, historyAck } from '@openhoop/protocol';
import type { CommandGrant, DataRange, HelloInfo, Packet } from '@openhoop/protocol';
import type { Transport } from './transport';

export interface Clock {
  now(): number;
  schedule(ms: number, fn: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  schedule: (ms, fn) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};

export type CommandResponse = Extract<Packet, { kind: 'commandResponse' }>;

export const LINK_QUIET_MS = 2_000;
export const LINK_QUIET_MAX_MS = 10_000;

export interface SessionOptions {
  now?: () => number;
  clock?: Clock;
  responseTimeoutMs?: number;
}

export class CommandTimeoutError extends Error {
  constructor(readonly command: number) {
    super(`no response to command ${command}`);
    this.name = 'CommandTimeoutError';
  }
}

export class CommandFailedError extends Error {
  constructor(
    readonly command: number,
    readonly result: number,
    detail?: string,
  ) {
    super(`command ${command} failed with result ${result}${detail === undefined ? '' : `: ${detail}`}`);
    this.name = 'CommandFailedError';
  }
}

export class DisconnectedError extends Error {
  constructor() {
    super('the band disconnected');
    this.name = 'DisconnectedError';
  }
}

interface Pending {
  command: number;
  resolve: (response: CommandResponse) => void;
  reject: (error: Error) => void;
  cancelTimer: () => void;
}

const RESULT_SUCCESS = 1;
const RESULT_PENDING = 2;
const SENTINEL_CLOCKS: readonly number[] = [0, 0xffffffff];
const PACKET_TYPE_OFFSET = 8;
const NOTIFY_CHANNELS = [GATT.cmdFromStrap, GATT.eventsFromStrap, GATT.dataFromStrap] as const;

export class Session {
  readonly clock: Clock;
  private readonly responseTimeoutMs: number;
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly packetListeners = new Set<(packet: Packet, raw: Uint8Array) => void>();
  private readonly disconnectListeners = new Set<() => void>();
  private unsubscribers: (() => Promise<void>)[] = [];
  private removeDisconnectHook: (() => void) | null = null;
  private helloInfo: HelloInfo | null = null;
  private offsetS: number | null = null;
  private disconnected = false;
  private discardedBytes = 0;
  private undecodableFrames = 0;

  constructor(
    private readonly transport: Transport,
    opts: SessionOptions = {},
  ) {
    const base = opts.clock ?? systemClock;
    const now = opts.now;
    this.clock = now === undefined ? base : { now, schedule: (ms, fn) => base.schedule(ms, fn) };
    this.responseTimeoutMs = opts.responseTimeoutMs ?? 5_000;
  }

  get hello(): HelloInfo | null {
    return this.helloInfo;
  }

  get isConnected(): boolean {
    return !this.disconnected;
  }

  async open(): Promise<HelloInfo> {
    this.disconnected = false;
    this.removeDisconnectHook = this.transport.onDisconnect(() => this.handleDisconnect());
    for (const characteristic of NOTIFY_CHANNELS) {
      const reassembler = new Reassembler();
      const unsubscribe = await this.transport.subscribe(GATT.service, characteristic, (data) => {
        let counted = reassembler.discardedBytes;
        reassembler.feedEach(data, (frame) => {
          this.discardedBytes += reassembler.discardedBytes - counted;
          counted = reassembler.discardedBytes;
          this.handleFrame(frame);
        });
        this.discardedBytes += reassembler.discardedBytes - counted;
      });
      this.unsubscribers.push(unsubscribe);
    }
    const response = await this.send(Command.GET_HELLO, Uint8Array.of(1));
    const hello = response.hello;
    if (hello === undefined) throw new CommandFailedError(Command.GET_HELLO, response.result, 'hello body not decodable');
    this.helloInfo = hello;
    this.offsetS = SENTINEL_CLOCKS.includes(hello.unixS) ? null : Math.round(hello.unixS - this.clock.now() / 1000);
    return hello;
  }

  send(command: number, args: Uint8Array = new Uint8Array(0), grant: CommandGrant = {}): Promise<CommandResponse> {
    const sequence = this.peekSequence();
    const frame = buildCommand(command, args, sequence, grant);
    this.sequence = sequence;
    return this.dispatch(command, sequence, frame);
  }

  async post(command: number, args: Uint8Array = new Uint8Array(0), grant: CommandGrant = {}): Promise<void> {
    const sequence = this.peekSequence();
    const frame = buildCommand(command, args, sequence, grant);
    this.sequence = sequence;
    await this.writeFrame(frame);
  }

  async acknowledgeHistory(endToken: Uint8Array): Promise<void> {
    const sequence = this.peekSequence();
    const frame = historyAck(endToken, sequence);
    this.sequence = sequence;
    await this.writeFrame(frame);
  }

  async dataRange(): Promise<DataRange> {
    const response = await this.send(Command.GET_DATA_RANGE, Uint8Array.of(0));
    if (response.dataRange === undefined) {
      throw new CommandFailedError(Command.GET_DATA_RANGE, response.result, 'data range body not decodable');
    }
    return response.dataRange;
  }

  async battery(): Promise<number> {
    const response = await this.send(Command.GET_BATTERY_LEVEL);
    if (response.batteryPercent === undefined) {
      throw new CommandFailedError(Command.GET_BATTERY_LEVEL, response.result, 'battery body not decodable');
    }
    return response.batteryPercent;
  }

  clockOffsetS(): number | null {
    return this.offsetS;
  }

  get integrityErrors(): number {
    return this.discardedBytes + this.undecodableFrames;
  }

  onPacket(callback: (packet: Packet, raw: Uint8Array) => void): () => void {
    this.packetListeners.add(callback);
    return () => this.packetListeners.delete(callback);
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectListeners.add(callback);
    return () => this.disconnectListeners.delete(callback);
  }

  async close(): Promise<void> {
    this.removeDisconnectHook?.();
    this.removeDisconnectHook = null;
    this.rejectAll(new DisconnectedError());
    const unsubscribers = this.unsubscribers;
    this.unsubscribers = [];
    for (const unsubscribe of unsubscribers) {
      try {
        await unsubscribe();
      } catch {
        // already gone with the connection
      }
    }
  }

  private peekSequence(): number {
    return (this.sequence + 1) & 0xff;
  }

  private async writeFrame(frame: Uint8Array): Promise<void> {
    if (this.disconnected) throw new DisconnectedError();
    await this.transport.write(GATT.service, GATT.cmdToStrap, frame);
  }

  private dispatch(command: number, sequence: number, frame: Uint8Array): Promise<CommandResponse> {
    if (this.disconnected) return Promise.reject(new DisconnectedError());
    const key = `${command}:${sequence}`;
    return new Promise<CommandResponse>((resolve, reject) => {
      const entry: Pending = { command, resolve, reject, cancelTimer: () => undefined };
      this.pending.set(key, entry);
      this.armTimer(key, entry);
      this.transport.write(GATT.service, GATT.cmdToStrap, frame).catch((error: unknown) => {
        if (this.pending.get(key) !== entry) return;
        this.settle(key, entry);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private armTimer(key: string, entry: Pending): void {
    entry.cancelTimer();
    entry.cancelTimer = this.clock.schedule(this.responseTimeoutMs, () => {
      if (this.pending.get(key) !== entry) return;
      this.pending.delete(key);
      entry.reject(new CommandTimeoutError(entry.command));
    });
  }

  private settle(key: string, entry: Pending): void {
    entry.cancelTimer();
    this.pending.delete(key);
  }

  private handleFrame(raw: Uint8Array): void {
    let packet: Packet;
    try {
      packet = decodeFrame(raw);
    } catch {
      this.undecodableFrames += 1;
      packet = { kind: 'unknown', packetType: raw[PACKET_TYPE_OFFSET] ?? 0 };
    }
    if (packet.kind === 'commandResponse') this.handleResponse(packet);
    for (const listener of [...this.packetListeners]) listener(packet, raw);
  }

  private handleResponse(response: CommandResponse): void {
    const key = `${response.command}:${response.originSequence}`;
    const entry = this.pending.get(key);
    if (entry === undefined) return;
    if (response.result === RESULT_PENDING) {
      this.armTimer(key, entry);
      return;
    }
    this.settle(key, entry);
    if (response.result === RESULT_SUCCESS) entry.resolve(response);
    else entry.reject(new CommandFailedError(response.command, response.result));
  }

  private handleDisconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.rejectAll(new DisconnectedError());
    for (const listener of [...this.disconnectListeners]) listener();
  }

  private rejectAll(error: Error): void {
    const entries = [...this.pending.entries()];
    this.pending.clear();
    for (const [, entry] of entries) {
      entry.cancelTimer();
      entry.reject(error);
    }
  }
}
