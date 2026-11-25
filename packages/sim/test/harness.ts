import type { Packet } from '@openhoop/protocol';
import { Command, GATT, Reassembler, buildCommand, decodeFrame, historyAck } from '@openhoop/protocol';
import { SimBand } from '../src/index';
import type { SimOptions } from '../src/index';

export const NOW = 1_800_000_000;

export function options(overrides: Partial<SimOptions> = {}): SimOptions {
  return { seed: 7, now: () => NOW, historyDays: 2 / 24, liveIntervalMs: 5, ...overrides };
}

type Response = Extract<Packet, { kind: 'commandResponse' }>;
type MetaPacket = Extract<Packet, { kind: 'metadata' }>;
type RecordPacket = Extract<Packet, { kind: 'record' }>;

export function isResponse(p: Packet): p is Response {
  return p.kind === 'commandResponse';
}

export function isRecord(p: Packet): p is RecordPacket {
  return p.kind === 'record';
}

export function isMeta(p: Packet): p is MetaPacket {
  return p.kind === 'metadata';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class TestClient {
  readonly responses: Response[] = [];
  readonly data: Packet[] = [];
  readonly events: Packet[] = [];
  readonly fragmentSizes: number[] = [];
  readonly heartRate: Uint8Array[] = [];
  seq = 0;
  disconnects = 0;
  private readonly streams = new Map<string, Reassembler>();
  private unsubscribers: (() => Promise<void>)[] = [];

  constructor(readonly band: SimBand) {
    band.onDisconnect(() => {
      this.disconnects += 1;
    });
  }

  static async open(opts: SimOptions, bond = true): Promise<TestClient> {
    const client = new TestClient(new SimBand(opts));
    await client.connect(bond);
    return client;
  }

  async connect(bond = true): Promise<void> {
    await this.band.connect(`sim:${(await this.band.scan(1000))[0]?.id.slice(4)}`);
    if (bond) {
      await this.band.bond();
      await this.subscribeAll();
    }
  }

  async subscribeAll(): Promise<void> {
    const targets: [string, (p: Packet) => void][] = [
      [GATT.cmdFromStrap, (p) => isResponse(p) && this.responses.push(p)],
      [GATT.eventsFromStrap, (p) => this.events.push(p)],
      [GATT.dataFromStrap, (p) => this.data.push(p)],
    ];
    for (const [uuid, sink] of targets) {
      const stream = new Reassembler();
      this.streams.set(uuid, stream);
      this.unsubscribers.push(
        await this.band.subscribe(GATT.service, uuid, (fragment) => {
          this.fragmentSizes.push(fragment.length);
          for (const frame of stream.feed(fragment)) sink(decodeFrame(frame));
        }),
      );
    }
  }

  async command(command: number, args: Uint8Array = new Uint8Array(0)): Promise<number> {
    this.seq = (this.seq + 1) & 0xff;
    await this.band.write(GATT.service, GATT.cmdToStrap, buildCommand(command, args, this.seq, { confirmWrite: true }));
    return this.seq;
  }

  async ack(token: Uint8Array): Promise<void> {
    this.seq = (this.seq + 1) & 0xff;
    await this.band.write(GATT.service, GATT.cmdToStrap, historyAck(token, this.seq));
  }

  async waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > end) throw new Error('timed out waiting');
      await sleep(2);
    }
  }

  async responseTo(command: number, origin: number): Promise<Response> {
    const find = (): Response | undefined =>
      this.responses.find((r) => r.command === command && r.originSequence === origin && r.result !== 2);
    await this.waitFor(() => find() !== undefined, 5000);
    const found = find();
    if (found === undefined) throw new Error('no response');
    return found;
  }

  records(): RecordPacket[] {
    return this.data.filter(isRecord);
  }

  metas(name: string): MetaPacket[] {
    return this.data.filter(isMeta).filter((m) => m.metaName === name);
  }

  async drain(timeoutMs = 60_000): Promise<void> {
    await this.command(Command.SEND_HISTORICAL_DATA);
    let handled = 0;
    const end = Date.now() + timeoutMs;
    for (;;) {
      if (this.metas('HISTORY_COMPLETE').length > 0) return;
      const ends = this.metas('HISTORY_END');
      if (ends.length > handled) {
        const token = ends[handled]?.endToken;
        handled += 1;
        if (token === undefined) throw new Error('HISTORY_END without a token');
        await this.ack(token);
      } else {
        if (Date.now() > end) throw new Error('drain timed out');
        await sleep(1);
      }
    }
  }
}
