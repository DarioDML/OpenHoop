import type { BondResult, DiscoveredDevice, GattService, Transport } from '@openhoop/core';
import {
  Command,
  GATT,
  Reassembler,
  commandClass,
  concat,
  encodeCommandResponse,
  encodeDataRangeBody,
  encodeEcgFiltered,
  encodeImu,
  encodeOptical,
  encodeEvent,
  encodeHelloBody,
  encodeMetadata,
  encodeRealtimeHr,
  MAX_HAPTIC_LOOPS,
  parseFirmware,
  toHex,
} from '@openhoop/protocol';
import type { FirmwareVersion } from '@openhoop/protocol';
import { simulateSecond } from './physiology';
import { DEFAULT_PAGES_PER_CHUNK, HistoryRing, PAGE_RECORDS, RING_PAGES, batteryPercentAt } from './ring';

export interface SimOptions {
  seed: number;
  now: () => number;
  historyDays: number;
  firmware?: string;
  model?: '5.0' | 'MG';
  locked?: boolean;
  bondRefused?: boolean;
  clockOffsetS?: number;
  mtu?: number;
  recordsPerChunk?: number;
  liveIntervalMs?: number;
  wireLogCap?: number;
  faults?: {
    disconnectAfterFrames?: number;
    dropAckOnce?: boolean;
    corruptEveryNthFragment?: number;
    /** On the first abort, the last n frames of the aborted chunk stay in flight and arrive just before the next transfer. */
    strayTailFramesAfterAbort?: number;
  };
  ecgUnsupported?: boolean;
  ecgIntervalMs?: number;
  alarmRingMs?: number;
  rawUnsupported?: boolean;
  rawIntervalMs?: number;
}

export interface WireEntry {
  dir: 'in' | 'out';
  hex: string;
}

const FAILURE = 0;
const SUCCESS = 1;
const PENDING = 2;
const UNSUPPORTED = 3;
const COMMAND_PACKET = 35;
const KEY_LENGTH = 32;
const YIELD_EVERY = 128;
const DEFAULT_MTU = 244;
const DEFAULT_LIVE_MS = 1000;
const DEFAULT_ECG_INTERVAL_MS = 400;
const DEFAULT_ALARM_RING_MS = 300;
const ECG_BLOCK = 100;
const SUBSEC_TICKS = 32768;
const DEFAULT_RAW_INTERVAL_MS = 1000;
const IMU_PER_SECOND = 100;
const OPTICAL_PER_SECOND = 25;
const DEFAULT_WIRE_CAP = 5000;
const DEFAULT_FIRMWARE = '50.38.1.0';

const FEATURE_FLAGS: readonly (readonly [string, string])[] = [
  ['enable_r22_packets', '2'],
  ['enable_r22_v2_packets', '2'],
  ['enable_r22_v3_packets', '2'],
  ['enable_r22_v4_packets', '1'],
  ['enable_r22_v5_packets', '2'],
  ['enable_r22_v6_packets', '2'],
  ['enable_r22_v8_packets', '2'],
  ['make_hrfm_visible', '2'],
  ['disable_pip_r26_packets', '2'],
  ['wear_detect_bias', '2'],
  ['hr_ch_switching', '2'],
  ['ir_hw_switching', '2'],
  ['enable_passive_strap_fit_gen5', '1'],
  ['enable_sig11_during_sleep', '2'],
  ['dorset_inhibit_wpt', '2'],
  ['enable_sig12', '2'],
];

const DEVICE_CONFIG: readonly (readonly [string, string])[] = [
  ['sigproc_wear_detect', '1'],
  ['enable_rfid', '2'],
  ['max_collection_backlog', '2'],
  ['cont_collection_mode', '1'],
  ['whoop_live_hr_in_adv_ind_pkt', '2'],
  ['whoop_live_2_hrm_devices', '2'],
  ['enable_raw_data_w_ecg', '2'],
];

type KeyTable = readonly (readonly [string, string])[];
type MutableKeyTable = [string, string][];
type Notify = (data: Uint8Array) => void;
type Timer = ReturnType<typeof setTimeout>;

interface Outgoing {
  uuid: string;
  data: Uint8Array;
  frameEnd: boolean;
  gen: number;
}

interface Pending {
  endAbs: number;
  token: Uint8Array;
}

const NO_GEN = -1;
const HAPTIC_INVALID_LOOPS = 3;
const HAPTIC_PLAYED = 5;
const ALARM_VALID = 1;
const ALARM_PLAYED = 5;
const ALARM_INVALID_TIME = 10;
const ALARM_INVALID_ID = 11;

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function padded(text: string): Uint8Array {
  const out = new Uint8Array(KEY_LENGTH);
  out.set(ascii(text).subarray(0, KEY_LENGTH));
  return out;
}

function readKey(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') setImmediate(resolve);
    else setTimeout(resolve, 0);
  });
}

const ECG_WAVES: readonly (readonly [number, number, number])[] = [
  [0.2, 120, 0.025],
  [0.36, -150, 0.01],
  [0.4, 1200, 0.012],
  [0.44, -300, 0.012],
  [0.65, 260, 0.045],
];

function syntheticEcg(tS: number): number {
  const phase = tS % 1;
  return Math.round(ECG_WAVES.reduce((sum, [at, height, width]) => sum + height * Math.exp(-((phase - at) ** 2) / (2 * width * width)), 0));
}

function notFound(what: string): Error {
  return new Error(`${what} not found`);
}

export class SimBand implements Transport {
  readonly wireLog: WireEntry[] = [];
  writesReceived = 0;
  dangerousReceived = 0;
  forbiddenReceived = 0;
  hapticsPlayed = 0;
  alarmsRun = 0;
  hrProfileOn = true;
  readonly alarms = new Map<number, number>();
  ecgFramesSent = 0;
  ecgWrist: number | null = null;
  ecgFiltered = false;
  ecgRawSave = false;
  imuOn = false;
  opticalOn = false;
  rawFramesSent = 0;
  readonly rawSessionBodies: Uint8Array[] = [];
  readonly flags: MutableKeyTable = FEATURE_FLAGS.map(([key, value]): [string, string] => [key, value]);
  readonly deviceConfig: MutableKeyTable = DEVICE_CONFIG.map(([key, value]): [string, string] => [key, value]);

  private readonly seed: number;
  private readonly now: () => number;
  private readonly locked: boolean;
  private readonly bondRefused: boolean;
  private readonly clockOffsetS: number;
  private readonly mtu: number;
  private readonly chunkPages: number;
  private readonly liveIntervalMs: number;
  private readonly wireLogCap: number;
  private readonly firmwareText: string;
  private readonly firmware: FirmwareVersion;
  private readonly modelName: string;
  private readonly deviceId: string;
  private readonly disconnectAfterFrames: number | undefined;
  private readonly corruptEvery: number | undefined;
  private readonly strayTailFrames: number;
  private strayTail: Outgoing[] = [];
  private strayUsed = false;
  private dropAckPending: boolean;
  private disconnectFired = false;

  private readonly ring: HistoryRing;
  private bonded = false;
  private connected = false;
  private bandSeq = 0;
  private reassembler = new Reassembler();
  private serving = false;
  private pending: Pending | null = null;
  private histGen = 0;
  private realtimeOn = false;
  private cursors = new Map<number, number>();
  private readonly subs = new Map<string, Set<Notify>>();
  private readonly disconnectCallbacks = new Set<() => void>();
  private queue: Outgoing[] = [];
  private pumping = false;
  private liveTimer: Timer | null = null;
  private ecgTimer: Timer | null = null;
  private ecgIndex = 0;
  private readonly ecgUnsupported: boolean;
  private readonly ecgIntervalMs: number;
  private readonly rawUnsupported: boolean;
  private readonly rawIntervalMs: number;
  private rawTimer: Timer | null = null;
  private rawIndex = 0;
  private rawStartS = 0;
  private rawSeconds = 0;
  private imuWarm = false;
  private readonly alarmRingMs: number;
  private dataFrames = 0;
  private fragmentCount = 0;

  constructor(opts: SimOptions) {
    const firmware = parseFirmware(opts.firmware ?? DEFAULT_FIRMWARE);
    if (firmware === null) throw new RangeError(`invalid firmware version ${opts.firmware}`);
    this.firmware = firmware;
    this.firmwareText = opts.firmware ?? DEFAULT_FIRMWARE;
    this.seed = opts.seed;
    this.now = opts.now;
    this.locked = opts.locked === true;
    this.bondRefused = opts.bondRefused === true;
    this.clockOffsetS = opts.clockOffsetS ?? 0;
    this.mtu = opts.mtu ?? DEFAULT_MTU;
    if (this.mtu - 3 < 1) throw new RangeError('mtu too small');
    this.chunkPages =
      opts.recordsPerChunk === undefined
        ? DEFAULT_PAGES_PER_CHUNK
        : Math.max(1, Math.ceil(opts.recordsPerChunk / PAGE_RECORDS));
    this.liveIntervalMs = opts.liveIntervalMs ?? DEFAULT_LIVE_MS;
    this.ecgUnsupported = opts.ecgUnsupported === true;
    this.ecgIntervalMs = opts.ecgIntervalMs ?? DEFAULT_ECG_INTERVAL_MS;
    this.rawUnsupported = opts.rawUnsupported === true;
    this.rawIntervalMs = opts.rawIntervalMs ?? DEFAULT_RAW_INTERVAL_MS;
    this.alarmRingMs = opts.alarmRingMs ?? DEFAULT_ALARM_RING_MS;
    this.wireLogCap = opts.wireLogCap ?? DEFAULT_WIRE_CAP;
    this.modelName = opts.model === 'MG' ? 'WHOOP MG' : 'WHOOP 5.0';
    this.deviceId = `sim:${opts.seed}`;
    this.disconnectAfterFrames = opts.faults?.disconnectAfterFrames;
    this.corruptEvery = opts.faults?.corruptEveryNthFragment;
    this.dropAckPending = opts.faults?.dropAckOnce === true;
    this.strayTailFrames = Math.max(0, Math.floor(opts.faults?.strayTailFramesAfterAbort ?? 0));
    const startS = Math.floor(opts.now()) + this.clockOffsetS - Math.floor(opts.historyDays * 86400) + 1;
    this.ring = new HistoryRing(opts.seed, startS);
  }

  async scan(_timeoutMs: number): Promise<DiscoveredDevice[]> {
    return [{ id: this.deviceId, name: 'WHOOP SIM', rssi: -48 }];
  }

  async connect(id: string): Promise<void> {
    if (id !== this.deviceId) throw notFound(`device ${id}`);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.connected) this.dropLink();
  }

  async services(): Promise<GattService[]> {
    this.requireConnected();
    return [
      {
        uuid: GATT.service,
        characteristics: [
          { uuid: GATT.cmdToStrap, properties: ['write', 'write-without-response'] },
          { uuid: GATT.cmdFromStrap, properties: ['notify'] },
          { uuid: GATT.eventsFromStrap, properties: ['notify'] },
          { uuid: GATT.dataFromStrap, properties: ['notify'] },
        ],
      },
      { uuid: GATT.heartRateService, characteristics: [{ uuid: GATT.heartRateMeasurement, properties: ['notify'] }] },
      {
        uuid: GATT.deviceInformationService,
        characteristics: [
          { uuid: GATT.firmwareRevision, properties: ['read'] },
          { uuid: GATT.serialNumber, properties: ['read'] },
          { uuid: GATT.modelNumber, properties: ['read'] },
        ],
      },
      { uuid: GATT.batteryService, characteristics: [{ uuid: GATT.batteryLevel, properties: ['read', 'notify'] }] },
    ];
  }

  async read(service: string, characteristic: string): Promise<Uint8Array> {
    this.requireConnected();
    const svc = service.toLowerCase();
    const chr = characteristic.toLowerCase();
    if (svc === GATT.deviceInformationService) {
      if (chr === GATT.firmwareRevision) return ascii(this.firmwareText);
      if (chr === GATT.serialNumber) return ascii(`SIM-${this.seed}`);
      if (chr === GATT.modelNumber) return ascii(this.modelName);
    }
    if (svc === GATT.batteryService && chr === GATT.batteryLevel) {
      return Uint8Array.of(batteryPercentAt(this.bandNow()));
    }
    throw notFound(`readable characteristic ${characteristic}`);
  }

  async write(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    this.requireConnected();
    if (service.toLowerCase() !== GATT.service || characteristic.toLowerCase() !== GATT.cmdToStrap) {
      throw notFound(`writable characteristic ${characteristic}`);
    }
    this.requireBond();
    for (const frame of this.reassembler.feed(data)) this.onCommandFrame(frame);
  }

  async subscribe(
    service: string,
    characteristic: string,
    onData: (data: Uint8Array) => void,
  ): Promise<() => Promise<void>> {
    this.requireConnected();
    const svc = service.toLowerCase();
    const chr = characteristic.toLowerCase();
    const custom = svc === GATT.service && [GATT.cmdFromStrap, GATT.eventsFromStrap, GATT.dataFromStrap].includes(chr);
    const standard =
      (svc === GATT.heartRateService && chr === GATT.heartRateMeasurement) ||
      (svc === GATT.batteryService && chr === GATT.batteryLevel);
    if (!custom && !standard) throw notFound(`notifying characteristic ${characteristic}`);
    if (custom) this.requireBond();
    const set = this.subs.get(chr) ?? new Set<Notify>();
    this.subs.set(chr, set);
    const listener: Notify = (d) => onData(d);
    set.add(listener);
    this.refreshLive();
    return async () => {
      set.delete(listener);
      this.refreshLive();
    };
  }

  async bond(): Promise<BondResult> {
    if (this.bondRefused) return 'refused';
    if (this.bonded) return 'already-bonded';
    this.bonded = true;
    return 'bonded';
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => {
      this.disconnectCallbacks.delete(callback);
    };
  }

  private bandNow(): number {
    return Math.floor(this.now()) + this.clockOffsetS;
  }

  private requireConnected(): void {
    if (!this.connected) throw new Error('not connected');
  }

  private requireBond(): void {
    if (!this.bonded) throw new Error('insufficient authentication');
  }

  private log(dir: 'in' | 'out', frame: Uint8Array): void {
    if (this.wireLogCap <= 0) return;
    this.wireLog.push({ dir, hex: toHex(frame) });
    if (this.wireLog.length > this.wireLogCap) this.wireLog.splice(0, this.wireLog.length - this.wireLogCap);
  }

  private enqueueFrame(uuid: string, frame: Uint8Array, gen: number): void {
    this.log('out', frame);
    const size = this.mtu - 3;
    for (let at = 0; at < frame.length; at += size) {
      const end = Math.min(frame.length, at + size);
      this.queue.push({ uuid, data: frame.slice(at, end), frameEnd: end === frame.length, gen });
    }
    this.schedule();
  }

  private enqueueStandard(uuid: string, data: Uint8Array): void {
    this.queue.push({ uuid, data, frameEnd: false, gen: NO_GEN });
    this.schedule();
  }

  private schedule(): void {
    if (this.pumping) return;
    this.pumping = true;
    void this.pump();
  }

  private async pump(): Promise<void> {
    await Promise.resolve();
    let delivered = 0;
    for (;;) {
      const item = this.queue.shift();
      if (item === undefined) break;
      if (!this.connected) continue;
      if (item.gen !== NO_GEN && item.gen !== this.histGen) continue;
      this.deliver(item);
      delivered += 1;
      if (delivered % YIELD_EVERY === 0) await yieldToLoop();
    }
    this.pumping = false;
  }

  private deliver(item: Outgoing): void {
    const listeners = this.subs.get(item.uuid);
    if (listeners === undefined || listeners.size === 0) return;
    const custom = item.uuid !== GATT.heartRateMeasurement && item.uuid !== GATT.batteryLevel;
    let data = item.data;
    if (custom && this.corruptEvery !== undefined && this.corruptEvery > 0) {
      this.fragmentCount += 1;
      if (this.fragmentCount % this.corruptEvery === 0) {
        data = data.slice();
        const at = Math.floor(data.length / 2);
        data[at] = (data[at] ?? 0) ^ 0xff;
      }
    }
    for (const listener of [...listeners]) {
      try {
        listener(data);
      } catch {
        continue;
      }
    }
    if (item.uuid === GATT.dataFromStrap && item.frameEnd) {
      this.dataFrames += 1;
      if (
        !this.disconnectFired &&
        this.disconnectAfterFrames !== undefined &&
        this.dataFrames >= this.disconnectAfterFrames
      ) {
        this.disconnectFired = true;
        this.dropLink();
      }
    }
  }

  private dropLink(): void {
    this.connected = false;
    this.queue = [];
    this.histGen += 1;
    this.serving = false;
    this.pending = null;
    this.strayTail = [];
    this.realtimeOn = false;
    this.stopEcgStream();
    this.cursors = new Map();
    this.reassembler = new Reassembler();
    this.subs.clear();
    this.refreshLive();
    for (const callback of [...this.disconnectCallbacks]) {
      try {
        callback();
      } catch {
        continue;
      }
    }
  }

  private refreshLive(): void {
    const standardHr = (this.subs.get(GATT.heartRateMeasurement)?.size ?? 0) > 0;
    const want = this.connected && ((this.realtimeOn && !this.locked) || standardHr);
    if (want && this.liveTimer === null) {
      this.liveTimer = setTimeout(() => this.liveTick(), this.liveIntervalMs);
    } else if (!want && this.liveTimer !== null) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
  }

  private liveTick(): void {
    this.liveTimer = null;
    if (!this.connected) return;
    const unixS = this.bandNow();
    const s = simulateSecond(this.seed, unixS);
    if ((this.subs.get(GATT.heartRateMeasurement)?.size ?? 0) > 0) {
      const flags = s.rrMs.length > 0 ? 0x10 : 0;
      const body = new Uint8Array(2 + 2 * s.rrMs.length);
      body[0] = flags;
      body[1] = s.heartRate;
      s.rrMs.forEach((ms, k) => {
        body[2 + 2 * k] = ms & 0xff;
        body[3 + 2 * k] = (ms >> 8) & 0xff;
      });
      this.enqueueStandard(GATT.heartRateMeasurement, body);
    }
    if (this.realtimeOn && !this.locked) {
      this.enqueueFrame(
        GATT.dataFromStrap,
        encodeRealtimeHr({ unixS, heartRate: s.heartRate, rrMs: s.rrMs }),
        this.histGen,
      );
    }
    this.refreshLive();
  }

  private reply(command: number, originSequence: number, result: number, body?: Uint8Array): void {
    const sequence = this.bandSeq;
    this.bandSeq = (this.bandSeq + 1) & 0xff;
    this.enqueueFrame(
      GATT.cmdFromStrap,
      encodeCommandResponse({ sequence, command, originSequence, result, body }),
      NO_GEN,
    );
  }

  private onCommandFrame(frame: Uint8Array): void {
    this.log('in', frame);
    if (frame[8] !== COMMAND_PACKET) return;
    const sequence = frame[9] ?? 0;
    const command = frame[10] ?? 0;
    const args = frame.subarray(11, frame.length - 4);
    this.handle(command, sequence, args);
  }

  private handle(command: number, seq: number, args: Uint8Array): void {
    if (this.handleBandWrite(command, seq, args)) return;
    const cls = commandClass(command);
    if (cls === 'forbidden') {
      this.forbiddenReceived += 1;
      this.reply(command, seq, UNSUPPORTED);
      return;
    }
    if (cls === 'dangerous') {
      this.dangerousReceived += 1;
      this.reply(command, seq, SUCCESS);
      return;
    }
    if (cls === 'write') {
      this.writesReceived += 1;
      this.reply(command, seq, SUCCESS);
      return;
    }
    switch (command) {
      case Command.GET_HELLO:
        this.reply(
          command,
          seq,
          SUCCESS,
          encodeHelloBody({
            batteryPercent: batteryPercentAt(this.bandNow()),
            unixS: this.bandNow(),
            firmware: this.firmware,
          }),
        );
        return;
      case Command.GET_DATA_RANGE:
        this.reply(command, seq, PENDING);
        this.reply(command, seq, SUCCESS, this.dataRangeBody());
        return;
      case Command.GET_BATTERY_LEVEL:
        this.reply(command, seq, SUCCESS, u32(batteryPercentAt(this.bandNow())));
        return;
      case Command.GET_CLOCK:
        this.reply(command, seq, SUCCESS, concat(Uint8Array.of(1), u32(this.bandNow()), new Uint8Array(2)));
        return;
      case Command.SEND_HISTORICAL_DATA:
        this.reply(command, seq, SUCCESS);
        this.startHistory();
        return;
      case Command.HISTORICAL_DATA_RESULT:
        this.onAck(seq, args);
        return;
      case Command.ABORT_HISTORICAL_TRANSMITS:
        this.serving = false;
        this.pending = null;
        this.abortHistory();
        this.reply(command, seq, SUCCESS);
        return;
      case Command.TOGGLE_REALTIME_HR:
        this.realtimeOn = args[0] === 1;
        this.reply(command, seq, SUCCESS);
        this.refreshLive();
        return;
      case Command.START_FF_KEY_EXCHANGE:
        this.startKeys(command, seq, this.flags);
        return;
      case Command.START_DEVICE_CONFIG_KEY_EXCHANGE:
        this.startKeys(command, seq, this.deviceConfig);
        return;
      case Command.SEND_NEXT_FF:
        this.nextKey(command, seq, this.flags, Command.START_FF_KEY_EXCHANGE);
        return;
      case Command.SEND_NEXT_DEVICE_CONFIG:
        this.nextKey(command, seq, this.deviceConfig, Command.START_DEVICE_CONFIG_KEY_EXCHANGE);
        return;
      case Command.GET_FF_VALUE:
        this.keyValue(command, seq, args, this.flags);
        return;
      case Command.GET_DEVICE_CONFIG_VALUE:
        this.keyValue(command, seq, args, this.deviceConfig);
        return;
      case Command.GET_ALARM_TIME:
        this.alarmReading(command, seq, args);
        return;
      default:
        this.reply(command, seq, cls === 'session' ? SUCCESS : UNSUPPORTED);
    }
  }

  private handleBandWrite(command: number, seq: number, args: Uint8Array): boolean {
    switch (command) {
      case Command.RUN_HAPTIC_PATTERN_MAVERICK:
        this.writesReceived += 1;
        if ((args[11] ?? 0) > MAX_HAPTIC_LOOPS) {
          this.reply(command, seq, FAILURE, Uint8Array.of(1, HAPTIC_INVALID_LOOPS, 0));
          return true;
        }
        this.hapticsPlayed += 1;
        this.reply(command, seq, PENDING, Uint8Array.of(1, 1, 0));
        this.reply(command, seq, SUCCESS, Uint8Array.of(1, HAPTIC_PLAYED, 0));
        return true;
      case Command.STOP_HAPTICS:
        this.writesReceived += 1;
        this.reply(command, seq, SUCCESS);
        return true;
      case Command.TOGGLE_GENERIC_HR_PROFILE:
        this.writesReceived += 1;
        this.hrProfileOn = args[0] === 1;
        this.reply(command, seq, SUCCESS);
        return true;
      case Command.SET_ALARM_TIME:
        this.writesReceived += 1;
        this.setAlarm(command, seq, args);
        return true;
      case Command.RUN_ALARM:
        this.writesReceived += 1;
        this.alarmsRun += 1;
        this.reply(command, seq, PENDING, Uint8Array.of(2, 0, 0));
        this.enqueueFrame(GATT.eventsFromStrap, encodeEvent({ event: 58, unixS: this.bandNow() }), NO_GEN);
        this.enqueueFrame(GATT.eventsFromStrap, encodeEvent({ event: 60, unixS: this.bandNow(), payload: new Uint8Array(4) }), NO_GEN);
        this.reply(command, seq, SUCCESS, Uint8Array.of(2, ALARM_PLAYED, 0));
        setTimeout(() => {
          if (this.connected) this.enqueueFrame(GATT.eventsFromStrap, encodeEvent({ event: 100, unixS: this.bandNow(), payload: Uint8Array.of(1, 0, 0, 0) }), NO_GEN);
        }, this.alarmRingMs);
        return true;
      case Command.DISABLE_ALARM:
        this.writesReceived += 1;
        if (args[1] === 0xff) this.alarms.clear();
        else this.alarms.delete(args[1] ?? 0);
        this.reply(command, seq, SUCCESS);
        return true;
      case Command.SELECT_WRIST:
        this.writesReceived += 1;
        this.ecgWrist = args[1] ?? null;
        this.reply(command, seq, SUCCESS);
        return true;
      case Command.TOGGLE_LABRADOR_FILTERED:
      case Command.TOGGLE_LABRADOR_RAW_SAVE: {
        this.writesReceived += 1;
        const on = args[1] === 1;
        if (on && this.ecgUnsupported) {
          this.reply(command, seq, FAILURE);
          return true;
        }
        if (command === Command.TOGGLE_LABRADOR_FILTERED) this.ecgFiltered = on;
        else this.ecgRawSave = on;
        this.reply(command, seq, SUCCESS);
        return true;
      }
      case Command.TOGGLE_IMU_MODE:
      case Command.TOGGLE_OPTICAL_MODE:
        this.writesReceived += 1;
        this.rawSwitch(command, seq, args);
        return true;
      case Command.START_RAW_DATA:
      case Command.STOP_RAW_DATA:
        this.writesReceived += 1;
        this.rawSessionBodies.push(args.slice());
        this.reply(command, seq, this.rawUnsupported ? FAILURE : SUCCESS, Uint8Array.of(1, 0, 0));
        return true;
      case Command.TOGGLE_LABRADOR_DATA_GENERATION:
        this.writesReceived += 1;
        this.ecgGeneration(command, seq, args[1] ?? 0);
        return true;
      case Command.SET_FF_VALUE:
        this.dangerousReceived += 1;
        this.setKey(command, seq, args, this.flags);
        return true;
      case Command.SET_DEVICE_CONFIG_VALUE:
        this.dangerousReceived += 1;
        this.setKey(command, seq, args, this.deviceConfig);
        return true;
      default:
        return false;
    }
  }

  private ecgGeneration(command: number, seq: number, operation: number): void {
    if (operation === 1) {
      this.stopEcgStream();
      this.reply(command, seq, SUCCESS);
      return;
    }
    if ((operation !== 2 && operation !== 3) || !this.ecgFiltered || !this.ecgRawSave) {
      this.reply(command, seq, FAILURE);
      return;
    }
    this.reply(command, seq, SUCCESS);
    if (this.ecgTimer === null) this.ecgTimer = setTimeout(() => this.ecgTick(), this.ecgIntervalMs);
  }

  private rawSwitch(command: number, seq: number, args: Uint8Array): void {
    if (this.rawUnsupported || args[0] !== 1 || args.length < 2) {
      this.reply(command, seq, FAILURE);
      return;
    }
    const on = args[1] === 1;
    if (command === Command.TOGGLE_IMU_MODE) {
      if (on && !this.imuOn) this.imuWarm = false;
      this.imuOn = on;
    } else {
      this.opticalOn = on;
    }
    this.reply(command, seq, SUCCESS, Uint8Array.of(1, 0, 0));
    if ((this.imuOn || this.opticalOn) && this.rawTimer === null) {
      this.rawStartS = Math.floor(this.bandNow());
      this.rawSeconds = 0;
      this.rawTimer = setTimeout(() => this.rawTick(), this.rawIntervalMs);
    }
    if (!this.imuOn && !this.opticalOn && this.rawTimer !== null) {
      clearTimeout(this.rawTimer);
      this.rawTimer = null;
    }
  }

  private rawTick(): void {
    this.rawTimer = null;
    if (!this.imuOn && !this.opticalOn) return;
    if (this.connected) {
      const unixS = this.rawStartS + this.rawSeconds;
      const recordIndex = this.rawIndex;
      if (this.imuOn) {
        const wave = (k: number, amp: number): number => Math.round(amp * Math.sin((2 * Math.PI * (k + recordIndex * IMU_PER_SECOND)) / 37));
        const axis = (base: number, amp: number): number[] => Array.from({ length: IMU_PER_SECOND }, (_, k) => base + wave(k, amp));
        const gyro: [number[], number[], number[]] = this.imuWarm ? [axis(0, 5), axis(0, 4), axis(0, 3)] : [[], [], []];
        this.imuWarm = true;
        this.enqueueFrame(GATT.dataFromStrap, encodeImu({ recordIndex, unixS, packetType: 43, accel: [axis(0, 20), axis(0, 20), axis(4096, 20)], gyro }), NO_GEN);
        this.rawFramesSent += 1;
      }
      if (this.opticalOn) {
        const slot = (base: number, amp: number, n: number): number[] =>
          Array.from({ length: n }, (_, k) => Math.round(base + amp * Math.sin((2 * Math.PI * 1.2 * (recordIndex + k / OPTICAL_PER_SECOND)))));
        const block = (sourceA: number, driveA: number, n: number, base: number, amp: number) => ({
          sourceA,
          driveA,
          sourceB: 4,
          driveB: driveA === 0 ? 0 : driveA * 2,
          detectorA: 3,
          rangeA: 32,
          offsetA: 0,
          detectorB: 4,
          rangeB: 32,
          offsetB: 0,
          slotA: slot(base, amp, n),
          slotB: slot(base / 2, amp / 2, n),
        });
        this.enqueueFrame(
          GATT.dataFromStrap,
          encodeOptical({
            recordIndex,
            unixS,
            packetType: 43,
            blocks: [
              block(1, 2750, OPTICAL_PER_SECOND, 200_000, 1000),
              block(3, 12_750, 0, 0, 0),
              block(2, 5300, 0, 0, 0),
              block(2, 0, OPTICAL_PER_SECOND, 190, 5),
              block(2, 200, OPTICAL_PER_SECOND, 100_000, 120),
            ],
          }),
          NO_GEN,
        );
        this.rawFramesSent += 1;
      }
      this.rawIndex += 1;
    }
    this.rawSeconds += 1;
    this.rawTimer = setTimeout(() => this.rawTick(), this.rawIntervalMs);
  }

  private stopEcgStream(): void {
    if (this.ecgTimer !== null) clearTimeout(this.ecgTimer);
    this.ecgTimer = null;
  }

  private ecgTick(): void {
    this.ecgTimer = null;
    if (!this.connected) return;
    const rateHz = (ECG_BLOCK * 1000) / this.ecgIntervalMs;
    const first = this.ecgIndex * ECG_BLOCK;
    const startS = this.bandNow() + (first % rateHz) / rateHz;
    const samples = Array.from({ length: ECG_BLOCK }, (_, k) => syntheticEcg((first + k) / rateHz));
    this.enqueueFrame(
      GATT.dataFromStrap,
      encodeEcgFiltered({ recordIndex: this.ecgIndex, unixS: Math.floor(startS), subsec: Math.floor((startS % 1) * SUBSEC_TICKS), samples }),
      NO_GEN,
    );
    this.ecgIndex += 1;
    this.ecgFramesSent += 1;
    this.ecgTimer = setTimeout(() => this.ecgTick(), this.ecgIntervalMs);
  }

  private setAlarm(command: number, seq: number, args: Uint8Array): void {
    const slot = args[1] ?? 0;
    if (args[0] !== 4 || args.length < 21 || slot < 1 || slot > 6) {
      this.reply(command, seq, FAILURE, Uint8Array.of(3, ALARM_INVALID_ID));
      return;
    }
    const at = new DataView(args.buffer, args.byteOffset, args.byteLength).getUint32(2, true);
    if (at <= this.bandNow()) {
      this.reply(command, seq, FAILURE, Uint8Array.of(3, ALARM_INVALID_TIME));
      return;
    }
    this.alarms.set(slot, at);
    this.reply(command, seq, SUCCESS, Uint8Array.of(3, ALARM_VALID));
  }

  private alarmReading(command: number, seq: number, args: Uint8Array): void {
    const slot = args[1] ?? 0;
    const at = this.alarms.get(slot);
    const armed = at !== undefined && at > this.bandNow();
    this.reply(command, seq, SUCCESS, concat(Uint8Array.of(4, armed ? 1 : 0), u32(at ?? 0), new Uint8Array(2)));
  }

  private setKey(command: number, seq: number, args: Uint8Array, table: MutableKeyTable): void {
    const key = readKey(args.subarray(1, 1 + KEY_LENGTH));
    const value = readKey(args.subarray(1 + KEY_LENGTH, 1 + 2 * KEY_LENGTH));
    const entry = table.find(([name]) => name === key);
    if (args[0] !== 1 || entry === undefined || value.length === 0) {
      this.reply(command, seq, FAILURE);
      return;
    }
    entry[1] = value;
    this.reply(command, seq, SUCCESS);
  }

  private dataRangeBody(): Uint8Array {
    const now = this.bandNow();
    const trim = this.ring.clampTrim(now);
    const write = this.ring.writeAbs(now);
    return encodeDataRangeBody({
      readPage: trim % RING_PAGES,
      writePage: write % RING_PAGES,
      trimPage: trim % RING_PAGES,
      writeWrap: Math.floor(write / RING_PAGES),
      totalPages: RING_PAGES,
      newestUnix: now,
    });
  }

  private cancelHistory(): void {
    this.histGen += 1;
    this.queue = this.queue.filter((item) => item.gen === NO_GEN);
  }

  private abortHistory(): void {
    if (this.strayTailFrames > 0 && !this.strayUsed) {
      this.strayTail = this.tailFrames(this.histGen, this.strayTailFrames);
      this.strayUsed = this.strayTail.length > 0;
    }
    this.cancelHistory();
  }

  private tailFrames(gen: number, frames: number): Outgoing[] {
    const kept: Outgoing[] = [];
    let complete = 0;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (item === undefined || item.gen !== gen) continue;
      if (item.frameEnd) {
        if (complete === frames) break;
        complete += 1;
      }
      kept.unshift({ ...item, gen: NO_GEN });
    }
    return kept;
  }

  private startHistory(): void {
    this.cancelHistory();
    this.pending = null;
    if (this.strayTail.length > 0) {
      this.queue.push(...this.strayTail);
      this.strayTail = [];
      this.schedule();
    }
    if (this.locked) return;
    this.serving = true;
    this.serveChunk();
  }

  private serveChunk(): void {
    const now = this.bandNow();
    const trim = this.ring.clampTrim(now);
    const write = this.ring.writeAbs(now);
    if (trim >= write) {
      this.serving = false;
      this.pending = null;
      this.enqueueFrame(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_COMPLETE', unixS: now }), this.histGen);
      return;
    }
    const endAbs = Math.min(trim + this.chunkPages, write);
    this.pending = { endAbs, token: this.ring.token(endAbs) };
    for (const frame of this.ring.chunkFrames(trim, endAbs)) {
      this.enqueueFrame(GATT.dataFromStrap, frame, this.histGen);
    }
  }

  private onAck(seq: number, args: Uint8Array): void {
    if (this.locked) {
      this.reply(Command.HISTORICAL_DATA_RESULT, seq, SUCCESS);
      return;
    }
    const pending = this.pending;
    if (pending === null || args[0] !== 1 || !sameBytes(args.subarray(1, 9), pending.token)) return;
    if (this.dropAckPending) {
      this.dropAckPending = false;
      return;
    }
    this.ring.trimAbs = pending.endAbs;
    this.pending = null;
    this.reply(Command.HISTORICAL_DATA_RESULT, seq, SUCCESS);
    if (this.serving) this.serveChunk();
  }

  private startKeys(command: number, seq: number, table: KeyTable): void {
    this.cursors.set(command, 0);
    this.reply(command, seq, SUCCESS, Uint8Array.of(1, table.length & 0xff, (table.length >> 8) & 0xff));
  }

  private nextKey(command: number, seq: number, table: KeyTable, startCommand: number): void {
    const index = this.cursors.get(startCommand) ?? 0;
    const entry = table[index];
    this.cursors.set(startCommand, index + 1);
    if (entry === undefined) {
      this.reply(command, seq, SUCCESS, concat(Uint8Array.of(1, index & 0xff, 0), new Uint8Array(KEY_LENGTH)));
      return;
    }
    this.reply(command, seq, SUCCESS, concat(Uint8Array.of(1, index & 0xff, 1), padded(entry[0])));
  }

  private keyValue(command: number, seq: number, args: Uint8Array, table: KeyTable): void {
    const key = readKey(args.subarray(1, 1 + KEY_LENGTH));
    const entry = table.find(([name]) => name === key);
    this.reply(command, seq, SUCCESS, concat(Uint8Array.of(1), padded(key), padded(entry?.[1] ?? '')));
  }
}
