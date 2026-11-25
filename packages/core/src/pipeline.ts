import {
  ALGO,
  DEFAULT_CALIBRATION,
  activeMinutes,
  dayLoad,
  debtMs,
  detectWorkouts,
  effectiveMaxHr,
  groupNights,
  minuteMeans,
  nightlyHrv,
  nightlySkinTemp,
  nightlySpo2,
  readiness,
  respiratoryRate,
  restingHr as nightlyRestingHr,
  sleepConsistency,
  sleepNeedMs,
  sleepPeriods,
  sleepScore,
  zoneSeconds,
} from '@openhoop/analytics';
import type { Calibration, Night, Outcome, Profile, ReadinessNight, Sample, SleepPeriod } from '@openhoop/analytics';
import { FrameError, decodeFrame } from '@openhoop/protocol';
import type { Packet } from '@openhoop/protocol';
import { sampleFromPacket } from './mapping';
import { applySleepEdits, editsTouching, measuredNight } from './sleepEdits';
import type { MergedSleepPeriod } from './sleepEdits';
import { bindStore } from './store/store';
import type {
  DayRecord,
  DeleteBeforeResult,
  Derived,
  SampleRow,
  SampleSource,
  SleepEdit,
  SleepPeriodRecord,
  Store,
  WorkoutRecord,
} from './store/types';

const DAY_S = 86_400;
const HOUR_S = 3_600;
const MAIN_NIGHT_LATEST_TOD_S = 15 * HOUR_S;
const BLOCK_S = HOUR_S;
const SCAN_BEFORE_S = 12 * HOUR_S;
const SCAN_AFTER_S = 18 * HOUR_S;
const CLOCK_OFFSET_LIMIT_S = 120;
const PARTIAL_DAY_SAMPLES = 20 * HOUR_S;
const BASELINE_DAYS = 14;
const SKIN_BASELINE_MIN_DAYS = 3;
const RESTING_HR_FALLBACK = 60;
const CALIBRATING_NIGHTS = 3;
const HR_MIN = 25;
const HR_MAX = 230;
const STEP_MODULUS = 65_536;
const STEP_WRAP_MAX = 4_096;
const EARLIEST_DAY = '0000-01-01';

export const SOURCE_RANK: Readonly<Record<SampleSource, number>> = { history: 0, live: 1, hrm: 2 };

export interface RecomputeOptions {
  deviceId: number;
  from: number;
  to: number;
  profile: Profile;
  tzOffsetS: number;
  calibration?: Calibration;
}

interface Context {
  store: Store;
  deviceId: number;
  profile: Profile;
  tz: number;
  calibration: Calibration;
  first: number;
  last: number;
  edits: SleepEdit[];
  mains: Map<number, Night<MergedSleepPeriod> | null>;
  clockFlags: Map<number, boolean>;
  blocks: Map<number, Block>;
}

interface Block {
  samples: Sample[];
  chunks: (number | null)[];
}

interface Loaded {
  samples: Sample[];
  chunkIds: number[];
}

function civilFromDays(days: number): { y: number; m: number; d: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

function formatDayIndex(index: number): string {
  const { y, m, d } = civilFromDays(index);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function localDayIndex(unixS: number, tz: number): number {
  return Math.floor((unixS + tz) / DAY_S);
}

function localMidnight(index: number, tz: number): number {
  return index * DAY_S - tz;
}

function timeOfDay(unixS: number, tz: number): number {
  return (((unixS + tz) % DAY_S) + DAY_S) % DAY_S;
}

export function dayKey(unixS: number, tzOffsetS: number): string {
  return formatDayIndex(localDayIndex(unixS, tzOffsetS));
}

export function validHr(hr: number | null): number | null {
  return hr !== null && hr >= HR_MIN && hr <= HR_MAX ? hr : null;
}

function toBlock(rows: SampleRow[]): Block {
  const samples: Sample[] = [];
  const chunks: (number | null)[] = [];
  let best: SampleRow | null = null;
  const flush = (row: SampleRow): void => {
    samples.push({
      t: row.t,
      hr: validHr(row.hr),
      rr: row.rr,
      steps: row.steps,
      skinTempC: row.skinTempC,
      spo2Raw: row.spo2Raw,
      state: row.state,
      motionG: row.motionG,
    });
    chunks.push(row.chunkId);
  };
  for (const row of rows) {
    if (best !== null && best.t === row.t) {
      if (SOURCE_RANK[row.source] < SOURCE_RANK[best.source]) best = row;
      continue;
    }
    if (best !== null) flush(best);
    best = row;
  }
  if (best !== null) flush(best);
  return { samples, chunks };
}

async function fetchBlocks(ctx: Context, firstBlock: number, lastBlock: number): Promise<void> {
  let runStart = -1;
  const flushRun = async (runEnd: number): Promise<void> => {
    if (runStart < 0) return;
    const rows = await ctx.store.samplesBetween(ctx.deviceId, runStart * BLOCK_S, (runEnd + 1) * BLOCK_S);
    const byBlock = new Map<number, SampleRow[]>();
    for (const row of rows) {
      const index = Math.floor(row.t / BLOCK_S);
      const bucket = byBlock.get(index);
      if (bucket === undefined) byBlock.set(index, [row]);
      else bucket.push(row);
    }
    for (let index = runStart; index <= runEnd; index++) ctx.blocks.set(index, toBlock(byBlock.get(index) ?? []));
    runStart = -1;
  };
  for (let index = firstBlock; index <= lastBlock; index++) {
    if (ctx.blocks.has(index)) {
      await flushRun(index - 1);
    } else if (runStart < 0) {
      runStart = index;
    }
  }
  await flushRun(lastBlock);
}

async function readWindow(ctx: Context, from: number, to: number): Promise<Loaded> {
  const start = Math.max(from, ctx.first);
  const end = Math.min(to, ctx.last + 1);
  const samples: Sample[] = [];
  const chunkIds = new Set<number>();
  if (start >= end) return { samples, chunkIds: [] };
  const firstBlock = Math.floor(start / BLOCK_S);
  const lastBlock = Math.floor((end - 1) / BLOCK_S);
  await fetchBlocks(ctx, firstBlock, lastBlock);
  for (let index = firstBlock; index <= lastBlock; index++) {
    const block = ctx.blocks.get(index);
    if (block === undefined) continue;
    for (let i = 0; i < block.samples.length; i++) {
      const sample = block.samples[i];
      if (sample === undefined || sample.t < start || sample.t >= end) continue;
      samples.push(sample);
      const chunk = block.chunks[i];
      if (chunk !== null && chunk !== undefined) chunkIds.add(chunk);
    }
  }
  return { samples, chunkIds: [...chunkIds] };
}

function evictBefore(ctx: Context, unixS: number): void {
  const limit = Math.floor(unixS / BLOCK_S);
  for (const index of ctx.blocks.keys()) if (index < limit) ctx.blocks.delete(index);
}

function pickMainNight<P extends SleepPeriod>(nights: Night<P>[], index: number, tz: number): Night<P> | null {
  let best: Night<P> | null = null;
  for (const night of nights) {
    if (localDayIndex(night.offset, tz) !== index) continue;
    if (timeOfDay(night.offset, tz) >= MAIN_NIGHT_LATEST_TOD_S) continue;
    if (best === null || night.asleepS > best.asleepS) best = night;
  }
  return best;
}

function mergedPeriods(ctx: Context, samples: Sample[], from: number, to: number): MergedSleepPeriod[] {
  return applySleepEdits(sleepPeriods(samples), editsTouching(ctx.edits, from, to), samples);
}

function nightsOf(periods: MergedSleepPeriod[]): Night<MergedSleepPeriod>[] {
  return groupNights(periods.filter((p) => p.source !== 'manual'));
}

async function mainNightOf(ctx: Context, index: number): Promise<Night<MergedSleepPeriod> | null> {
  const cached = ctx.mains.get(index);
  if (cached !== undefined) return cached;
  const midnight = localMidnight(index, ctx.tz);
  const from = Math.max(midnight - SCAN_BEFORE_S, ctx.first);
  const to = Math.min(midnight + SCAN_AFTER_S, ctx.last + 1);
  let found: Night<MergedSleepPeriod> | null = null;
  if (from < to) {
    const { samples } = await readWindow(ctx, from, to);
    found = pickMainNight(nightsOf(mergedPeriods(ctx, samples, from, to)), index, ctx.tz);
  }
  ctx.mains.set(index, found);
  return found;
}

async function boundary(ctx: Context, index: number): Promise<number> {
  const main = await mainNightOf(ctx, index);
  return main === null ? localMidnight(index, ctx.tz) : main.onset;
}

async function dayWindow(ctx: Context, index: number): Promise<{ start: number; end: number }> {
  const start = await boundary(ctx, index);
  const end = Math.min(await boundary(ctx, index + 1), ctx.last + 1);
  return { start, end };
}

function unmeasuredAsMissing<T>(outcome: Outcome<T>, night: Night): Outcome<T> {
  return !outcome.ok && night.periods.length === 0 ? { ok: false, reason: 'missing-signal', algo: outcome.algo } : outcome;
}

function derive(outcome: Outcome<number>): Derived {
  return outcome.ok
    ? { value: outcome.value, reason: null, coverage: outcome.coverage, algo: outcome.algo }
    : { value: null, reason: outcome.reason, coverage: null, algo: outcome.algo };
}

function missing(reason: string, algo: string): Derived {
  return { value: null, reason, coverage: null, algo };
}

function lastValues(values: (number | null)[], count: number): number[] {
  const out: number[] = [];
  for (let i = values.length - 1; i >= 0 && out.length < count; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) out.push(v);
  }
  return out.reverse();
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countSteps(samples: Sample[]): number | null {
  let previous: number | null = null;
  let total = 0;
  let seen = false;
  for (const s of samples) {
    if (s.steps === null) continue;
    seen = true;
    if (previous !== null) {
      const delta = s.steps - previous;
      if (delta >= 0) total += delta;
      else {
        const wrapped = delta + STEP_MODULUS;
        total += wrapped <= STEP_WRAP_MAX ? wrapped : s.steps;
      }
    }
    previous = s.steps;
  }
  return seen ? total : null;
}

async function clockOffsetFlagged(ctx: Context, chunkId: number): Promise<boolean> {
  const cached = ctx.clockFlags.get(chunkId);
  if (cached !== undefined) return cached;
  const meta = await ctx.store.getChunkMeta(chunkId);
  const flagged = meta !== null && meta.clockOffsetS !== null && Math.abs(meta.clockOffsetS) > CLOCK_OFFSET_LIMIT_S;
  ctx.clockFlags.set(chunkId, flagged);
  return flagged;
}

function mainNightSpan(day: DayRecord): { onset: number; offset: number } | null {
  const own = day.sleep.periods.filter((p) => !p.nap);
  const first = own[0];
  const last = own[own.length - 1];
  return first === undefined || last === undefined ? null : { onset: first.onset, offset: last.offset };
}

async function computeDay(
  ctx: Context,
  index: number,
  start: number,
  end: number,
  history: DayRecord[],
): Promise<DayRecord | null> {
  const { store, deviceId, tz, calibration } = ctx;
  const { samples, chunkIds } = await readWindow(ctx, start, end);
  if (samples.length === 0) return null;

  const key = formatDayIndex(index);
  const scanned = await mainNightOf(ctx, index);
  const periods = mergedPeriods(ctx, samples, start, end).filter((p) => p.onset >= start && p.onset < end);
  const main = scanned === null ? null : pickMainNight(nightsOf(periods), index, tz);
  const periodRecords: SleepPeriodRecord[] = periods.map((p) => ({
    onset: p.onset,
    offset: p.offset,
    asleepS: p.asleepS,
    inBedS: p.inBedS,
    nap: main === null || !main.periods.includes(p),
    source: p.source,
    editId: p.editId,
  }));

  const previous = history[history.length - 1] ?? null;
  const skinHistory = lastValues(
    history.map((d) => d.skinTempC.value),
    BASELINE_DAYS,
  );
  const skinBaseline = skinHistory.length >= SKIN_BASELINE_MIN_DAYS ? mean(skinHistory) : null;
  const readinessHistory: ReadinessNight[] = [];
  for (const d of history) {
    const hrv = d.hrv.value;
    const score = d.sleep.score.value;
    const rhr = d.restingHr.value;
    if (hrv !== null && score !== null && rhr !== null) readinessHistory.push({ hrv, sleepScore: score, rhr });
  }

  const year = Number(key.slice(0, 4));
  const maxHr = effectiveMaxHr(ctx.profile, year);

  let hrv: Derived;
  let restingHrDerived: Derived;
  let respiratory: Derived;
  let spo2: Derived;
  let skinTemp: Derived;
  let skinDeviation: Derived;
  let need: Derived;
  let debt: Derived;
  let consistency: Derived;
  let score: Derived;
  let readinessDerived: Derived;
  let contributions: DayRecord['readinessContributions'] = null;
  let calibrating = readinessHistory.length < CALIBRATING_NIGHTS;
  let nightRestingHr: number | null = null;

  if (main === null) {
    hrv = missing('no-sleep', ALGO.hrv);
    restingHrDerived = missing('no-sleep', ALGO.restingHr);
    respiratory = missing('no-sleep', ALGO.respiratory);
    spo2 = missing('no-sleep', ALGO.spo2);
    skinTemp = missing('no-sleep', ALGO.skinTemp);
    skinDeviation = missing('no-sleep', ALGO.skinTemp);
    need = missing('no-sleep', ALGO.sleepNeed);
    debt = missing('no-sleep', ALGO.sleepNeed);
    consistency = missing('no-sleep', ALGO.sleepConsistency);
    score = missing('no-sleep', ALGO.sleepScore);
    readinessDerived = missing('no-sleep', ALGO.readiness);
  } else {
    const measured = measuredNight(main);
    const hrvOutcome = unmeasuredAsMissing(nightlyHrv(samples, measured), measured);
    const rhrOutcome = unmeasuredAsMissing(nightlyRestingHr(samples, measured), measured);
    hrv = derive(hrvOutcome);
    restingHrDerived = derive(rhrOutcome);
    respiratory = derive(unmeasuredAsMissing(respiratoryRate(samples, measured), measured));
    spo2 = derive(unmeasuredAsMissing(nightlySpo2(samples, measured), measured));
    if (rhrOutcome.ok) nightRestingHr = rhrOutcome.value;

    const skin = unmeasuredAsMissing(nightlySkinTemp(samples, measured, skinBaseline), measured);
    if (skin.ok) {
      skinTemp = { value: skin.value.meanC, reason: null, coverage: skin.coverage, algo: skin.algo };
      skinDeviation =
        skin.value.deviationC === null
          ? missing('needs-history', skin.algo)
          : { value: skin.value.deviationC, reason: null, coverage: skin.coverage, algo: skin.algo };
    } else {
      skinTemp = missing(skin.reason, skin.algo);
      skinDeviation = missing(skin.reason, skin.algo);
    }

    const carriedDebtMs = previous !== null && previous.sleep.debt.value !== null ? Math.round(previous.sleep.debt.value * 1000) : 0;
    const previousLoad = previous?.load.value ?? 0;
    const napMs =
      previous === null
        ? 0
        : previous.sleep.periods.reduce((sum, p) => (p.nap ? sum + p.asleepS * 1000 : sum), 0);
    const needMs = sleepNeedMs({ debtMs: carriedDebtMs, load: previousLoad, napMs }, calibration);
    const asleepMs = main.asleepS * 1000;
    need = { value: needMs / 1000, reason: null, coverage: 1, algo: ALGO.sleepNeed };
    debt = {
      value: debtMs(needMs, asleepMs, null, calibration) / 1000,
      reason: null,
      coverage: 1,
      algo: ALGO.sleepNeed,
    };

    const earlierNights = history.flatMap((d) => {
      const span = mainNightSpan(d);
      return span === null ? [] : [span];
    });
    const consistencyOutcome = sleepConsistency([...earlierNights.slice(-3), { onset: main.onset, offset: main.offset }], tz);
    consistency = derive(consistencyOutcome);
    const scoreOutcome = sleepScore(
      { asleepMs, needMs, consistency: consistencyOutcome.ok ? consistencyOutcome.value : null },
      calibration,
    );
    score = derive(scoreOutcome);

    if (hrvOutcome.ok && scoreOutcome.ok && rhrOutcome.ok) {
      const result = readiness(
        { history: readinessHistory, hrv: hrvOutcome.value, sleepScore: scoreOutcome.value, rhr: rhrOutcome.value },
        calibration,
      );
      if (result.ok) {
        readinessDerived = { value: result.value.score, reason: null, coverage: result.coverage, algo: result.algo };
        const c = result.value.contributions;
        contributions = { hrv: c.hrv + 0, sleep: c.sleep + 0, rhr: c.rhr + 0 };
        calibrating = result.value.calibrating;
      } else {
        readinessDerived = missing(result.reason, result.algo);
      }
    } else {
      const reason = !hrvOutcome.ok ? hrvOutcome.reason : !scoreOutcome.ok ? scoreOutcome.reason : !rhrOutcome.ok ? rhrOutcome.reason : 'missing-signal';
      readinessDerived = missing(reason, ALGO.readiness);
    }
  }

  const restingValues = lastValues([...history.map((d) => d.restingHr.value), nightRestingHr], BASELINE_DAYS);
  const profileRest = ctx.profile.restingHr;
  const rest =
    profileRest !== null && Number.isFinite(profileRest) && profileRest > 0
      ? profileRest
      : restingValues.length > 0
        ? mean(restingValues)
        : RESTING_HR_FALLBACK;

  const minuteHr = minuteMeans(samples, start, end);
  const load = derive(dayLoad(minuteHr, rest, maxHr, calibration));

  const hrSeries = samples.map((s) => s.hr);
  const zones: number[] = maxHr > rest ? [...zoneSeconds(hrSeries, rest, maxHr)] : [0, 0, 0, 0, 0, 0];
  const auto: WorkoutRecord[] = detectWorkouts(samples, rest, maxHr).map((w) => ({
    start: w.start,
    end: w.end,
    zoneSeconds: [...w.zoneSeconds],
    avgHr: w.avgHr,
    maxHr: w.maxHr,
    source: 'auto',
    label: null,
  }));
  const existing = await store.getDay(deviceId, key);
  const manual = (existing?.workouts ?? []).filter((w) => w.source === 'manual' && w.start >= start && w.start < end);
  const workouts = [...auto, ...manual].sort((a, b) => a.start - b.start);

  let hrMin: number | null = null;
  let hrMax: number | null = null;
  let hrSum = 0;
  let hrCount = 0;
  for (const s of samples) {
    if (s.hr === null) continue;
    hrMin = hrMin === null ? s.hr : Math.min(hrMin, s.hr);
    hrMax = hrMax === null ? s.hr : Math.max(hrMax, s.hr);
    hrSum += s.hr;
    hrCount++;
  }

  const flags: string[] = [];
  for (const id of chunkIds) {
    if (await clockOffsetFlagged(ctx, id)) {
      flags.push('clock-offset');
      break;
    }
  }
  if (samples.length < PARTIAL_DAY_SAMPLES) flags.push('partial-day');

  return {
    deviceId,
    day: key,
    start,
    end,
    tzOffsetS: tz,
    flags,
    sleep: {
      periods: periodRecords,
      asleepS: main === null ? null : main.asleepS,
      inBedS: main === null ? null : main.inBedS,
      need,
      debt,
      consistency,
      score,
    },
    hrv,
    restingHr: restingHrDerived,
    respiratoryRate: respiratory,
    spo2,
    skinTempC: skinTemp,
    skinTempDeviationC: skinDeviation,
    readiness: readinessDerived,
    readinessCalibrating: calibrating,
    readinessContributions: contributions,
    load,
    zoneSeconds: zones,
    steps: countSteps(samples),
    heartRate: { min: hrMin, avg: hrCount > 0 ? hrSum / hrCount : null, max: hrMax },
    workouts,
    activeMinutes: activeMinutes(minuteHr, rest, maxHr),
  };
}

async function firstAffectedDay(ctx: Context, from: number): Promise<number | null> {
  const lastIndex = localDayIndex(ctx.last, ctx.tz) + 1;
  for (let index = localDayIndex(from, ctx.tz) - 1; index <= lastIndex; index++) {
    const { start, end } = await dayWindow(ctx, index);
    if (start > ctx.last) return null;
    if (end > start && end > from) return index;
  }
  return null;
}

export async function recomputeDays(store: Store, opts: RecomputeOptions): Promise<DayRecord[]> {
  const { deviceId } = opts;
  const range = await store.sampleRange(deviceId);
  if (range === null) return [];
  const edits = await store.listSleepEdits(deviceId);
  const last = edits.reduce((latest, e) => Math.max(latest, e.offset - 1), range.last);
  const ctx: Context = {
    store,
    deviceId,
    profile: opts.profile,
    tz: opts.tzOffsetS,
    calibration: opts.calibration ?? DEFAULT_CALIBRATION,
    first: range.first,
    last,
    edits,
    mains: new Map(),
    clockFlags: new Map(),
    blocks: new Map(),
  };
  const to = Math.min(opts.to, last + 1);
  let from = Math.max(opts.from, range.first);
  if (from >= to) return [];

  for (;;) {
    const firstIndex = await firstAffectedDay(ctx, from);
    if (firstIndex === null) return [];
    const history = await store.listDays(deviceId, EARLIEST_DAY, formatDayIndex(firstIndex - 1));
    if (history.length === 0 && from > range.first) {
      from = range.first;
      continue;
    }

    const out: DayRecord[] = [];
    for (let index = firstIndex; ; index++) {
      const { start, end } = await dayWindow(ctx, index);
      if (start >= to || start > last) break;
      if (end <= start) continue;
      const record = await computeDay(ctx, index, start, end, history);
      if (record === null) continue;
      await store.replaceDay(record);
      history.push(record);
      evictBefore(ctx, Math.min(end, localMidnight(index + 2, ctx.tz) - SCAN_BEFORE_S));
      out.push(record);
    }
    return out;
  }
}

export async function rebuildFromRaw(store: Store, deviceId: number): Promise<{ chunks: number; samples: number }> {
  return store.driver.transaction(async (tx) => {
    const inner = bindStore(tx);
    const device = await inner.getDevice(deviceId);
    const ownerSince = device?.ownerSince ?? null;
    await inner.deleteSamples(deviceId, 'history');
    await inner.clearDerived(deviceId);
    const chunkIds = await inner.listChunkIds(deviceId);
    let samples = 0;
    for (const chunkId of chunkIds) {
      const rows: SampleRow[] = [];
      for (const frame of await inner.readChunkFrames(chunkId)) {
        const packet = tryDecode(frame);
        if (packet === null) continue;
        const row = sampleFromPacket(deviceId, packet, chunkId);
        if (row === null || (ownerSince !== null && row.t < ownerSince)) continue;
        rows.push({ ...row, source: 'history' });
      }
      samples += await inner.insertSamples(rows);
    }
    return { chunks: chunkIds.length, samples };
  });
}

function tryDecode(frame: Uint8Array): Packet | null {
  try {
    return decodeFrame(frame);
  } catch (error) {
    if (error instanceof FrameError) return null;
    throw error;
  }
}

export function newestFrameTime(frames: Uint8Array[]): number | null {
  let newest: number | null = null;
  for (const frame of frames) {
    const packet = tryDecode(frame);
    if (packet === null || !('unixS' in packet)) continue;
    if (newest === null || packet.unixS > newest) newest = packet.unixS;
  }
  return newest;
}

export function deleteDataBefore(store: Store, deviceId: number, t: number): Promise<DeleteBeforeResult> {
  return store.deleteBefore(deviceId, t, newestFrameTime);
}
