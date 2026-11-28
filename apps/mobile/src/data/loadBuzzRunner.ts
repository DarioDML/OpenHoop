import type { DayRecord } from '@openhoop/core';

import { shownLoad } from './derived';
import { loadBuzzDecision, type LoadBuzzDecision, type LoadBuzzPrefs, type LoadBuzzThreshold } from './loadBuzz';
import { aimAt } from './loadDerived';

export const LOAD_BUZZ_RETRY_MS = 60_000;

export type LoadBuzzDays = Pick<LoadBuzzPrefs, 'lastTarget' | 'lastTop'>;

export interface LoadBuzzHost {
  connected(): boolean;
  syncing(): boolean;
  days(): readonly DayRecord[];
  prefs(): LoadBuzzPrefs;
  buzz(kind: LoadBuzzThreshold): Promise<boolean>;
  save(days: LoadBuzzDays): Promise<boolean>;
  nowMs(): number;
  tzOffsetS(atS: number): number;
}

export class LoadBuzzRunner {
  private running: Promise<void> | null = null;
  private retryAt = 0;

  constructor(private readonly host: LoadBuzzHost) {}

  todayLoad(): number | null {
    const days = this.host.days();
    return shownLoad(days, days.length - 1).value;
  }

  live(dayLoad: number | null): number | null {
    const value = dayLoad !== null && Number.isFinite(dayLoad) ? dayLoad : null;
    if (value !== null) void this.check(value);
    return value;
  }

  check(load: number | null): Promise<void> {
    if (this.running !== null) return this.running;
    const host = this.host;
    if (host.syncing() || !host.connected() || host.nowMs() < this.retryAt) return Promise.resolve();
    const days = host.days();
    const index = days.length - 1;
    const day = days[index];
    if (day === undefined) return Promise.resolve();
    const nowS = Math.floor(host.nowMs() / 1000);
    const decision = loadBuzzDecision({ prefs: host.prefs(), load, aim: aimAt(days, index), day: day.day, nowS, tzOffsetS: host.tzOffsetS(nowS) });
    if (decision === null) return Promise.resolve();
    const run = this.attempt(decision).finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  private async attempt(decision: LoadBuzzDecision): Promise<void> {
    if (!(await this.buzzAndSave(decision))) this.retryAt = this.host.nowMs() + LOAD_BUZZ_RETRY_MS;
  }

  private async buzzAndSave(decision: LoadBuzzDecision): Promise<boolean> {
    try {
      return (await this.host.buzz(decision.kind)) && (await this.host.save({ lastTarget: decision.next.lastTarget, lastTop: decision.next.lastTop }));
    } catch {
      return false;
    }
  }
}
