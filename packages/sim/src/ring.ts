import { encodeBatteryEvent, encodeBiometric, encodeConsole, encodeMetadata } from '@openhoop/protocol';
import { simulateSecond } from './physiology';

export const PAGE_RECORDS = 14;
export const DEFAULT_PAGES_PER_CHUNK = 40;
export const RING_PAGES = 131072;
const EVENT_PERIOD_S = 1800;

export function batteryPercentAt(bandS: number): number {
  const phase = (bandS / 3600) % 72;
  return Math.round(25 + 70 * (1 - phase / 72));
}

export class HistoryRing {
  trimAbs = 0;

  constructor(
    readonly seed: number,
    readonly startS: number,
  ) {}

  writeAbs(bandNowS: number): number {
    const records = Math.max(0, Math.floor(bandNowS) - this.startS + 1);
    return Math.floor(records / PAGE_RECORDS);
  }

  oldestAbs(bandNowS: number): number {
    return Math.max(0, this.writeAbs(bandNowS) - RING_PAGES);
  }

  clampTrim(bandNowS: number): number {
    this.trimAbs = Math.min(Math.max(this.trimAbs, this.oldestAbs(bandNowS)), this.writeAbs(bandNowS));
    return this.trimAbs;
  }

  timeOfPage(abs: number): number {
    return this.startS + abs * PAGE_RECORDS;
  }

  token(abs: number): Uint8Array {
    const out = new Uint8Array(8);
    const view = new DataView(out.buffer);
    view.setUint32(0, abs % RING_PAGES, true);
    view.setUint32(4, Math.floor(abs / RING_PAGES), true);
    return out;
  }

  chunkFrames(fromAbs: number, toAbs: number): Uint8Array[] {
    const first = fromAbs * PAGE_RECORDS;
    const last = toAbs * PAGE_RECORDS - 1;
    const frames: Uint8Array[] = [];
    frames.push(encodeMetadata({ meta: 'HISTORY_START', unixS: this.startS + first }));
    for (let rec = first; rec <= last; rec++) {
      const unixS = this.startS + rec;
      const s = simulateSecond(this.seed, unixS);
      frames.push(
        encodeBiometric({
          recordIndex: rec,
          unixS,
          heartRate: s.heartRate,
          rrMs: s.rrMs,
          stepCounter: s.stepCounter,
          dynamicAccelG: s.dynamicAccelG,
          skinTempC: s.skinTempC,
          spo2Byte82: s.spo2Byte82,
          bandState: s.bandState,
        }),
      );
      if (unixS % EVENT_PERIOD_S === 0) {
        const soc = batteryPercentAt(unixS);
        frames.push(encodeBatteryEvent({ unixS, socPercent: soc, millivolts: Math.round(3300 + soc * 9) }));
        frames.push(
          encodeConsole({ consoleSequence: (unixS / EVENT_PERIOD_S) & 0xff, unixS, text: `sync ok batt=${soc}` }),
        );
      }
    }
    frames.push(
      encodeMetadata({ meta: 'HISTORY_END', unixS: this.startS + last, endToken: this.token(toAbs) }),
    );
    return frames;
  }
}
