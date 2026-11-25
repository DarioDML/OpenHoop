import type { VendorCycle, VendorData, VendorJournalEntry, VendorKind, VendorSleep, VendorWorkout } from '@openhoop/core';

import { parseCsv } from './csv';
import { VENDOR_LIMITS, cleanText, normalizeHeader, parseBoolean, parseNumber, parseTime, type Parsed, type ParsedTime } from './fields';

export type FileProblem = 'unrecognised' | 'empty' | 'csv-limits' | 'too-large' | 'unsupported' | 'unreadable' | 'zip-limits';

export interface FileReport {
  name: string;
  kind: VendorKind | null;
  rows: number;
  invalid: number;
  problem: FileProblem | null;
}

export interface KindTotals {
  invalid: number;
  skipped: number;
}

export interface ParsedExport {
  data: VendorData;
  files: FileReport[];
  totals: Record<VendorKind, KindTotals>;
}

export interface TextFile {
  name: string;
  text: string;
}

type Aliases<K extends string> = Readonly<Record<K, readonly string[]>>;
type Index<K extends string> = (field: K) => number;

const CYCLE_ALIASES = {
  start: ['cyclestarttime', 'cyclestart'],
  end: ['cycleendtime', 'cycleend'],
  zone: ['cycletimezone', 'timezone'],
  recovery: ['recoveryscore', 'recovery'],
  restingHr: ['restingheartrate', 'restinghr', 'rhr'],
  hrv: ['heartratevariability', 'hrv'],
  skinTemp: ['skintemp', 'skintemperature'],
  spo2: ['bloodoxygen', 'spo2', 'bloodoxygensaturation'],
  respiratory: ['respiratoryrate', 'respirationrate'],
  strain: ['daystrain', 'strain'],
} satisfies Aliases<string>;

const SLEEP_ALIASES = {
  start: ['cyclestarttime', 'cyclestart'],
  zone: ['cycletimezone', 'timezone'],
  onset: ['sleeponset', 'onset'],
  wake: ['wakeonset', 'wake', 'wakeup'],
  nap: ['nap'],
  performance: ['sleepperformance'],
  asleep: ['asleepduration'],
  inBed: ['inbedduration'],
  light: ['lightsleepduration', 'lightduration'],
  deep: ['deepswsduration', 'deepsleepduration', 'deepduration', 'swsduration'],
  rem: ['remduration', 'remsleepduration'],
  awake: ['awakeduration'],
  efficiency: ['sleepefficiency'],
  consistency: ['sleepconsistency'],
  respiratory: ['respiratoryrate', 'respirationrate'],
} satisfies Aliases<string>;

const WORKOUT_ALIASES = {
  zone: ['cycletimezone', 'timezone'],
  start: ['workoutstarttime', 'workoutstart'],
  end: ['workoutendtime', 'workoutend'],
  duration: ['workoutduration', 'duration'],
  activity: ['activityname', 'activity', 'workoutname'],
  strain: ['activitystrain', 'workoutstrain', 'strain'],
  avgHr: ['averagehr', 'avghr', 'averageheartrate'],
  maxHr: ['maxhr', 'maxheartrate'],
} satisfies Aliases<string>;

const JOURNAL_ALIASES = {
  start: ['cyclestarttime', 'cyclestart'],
  zone: ['cycletimezone', 'timezone'],
  question: ['questiontext', 'question'],
  answered: ['answeredyes', 'answer'],
  notes: ['notes', 'note'],
} satisfies Aliases<string>;

function indexer<K extends string>(header: readonly string[], aliases: Aliases<K>): Index<K> {
  const normalised = header.map(normalizeHeader);
  return (field) => {
    for (const alias of aliases[field]) {
      const at = normalised.indexOf(alias);
      if (at >= 0) return at;
    }
    return -1;
  };
}

function reader<K extends string>(index: Index<K>, row: readonly string[]): (field: K) => string {
  return (field) => {
    const at = index(field);
    return at < 0 ? '' : (row[at] ?? '').trim();
  };
}

function detectKind(header: readonly string[]): VendorKind | null {
  const has = (aliases: Aliases<string>, ...fields: string[]): boolean => {
    const index = indexer(header, aliases);
    return fields.every((f) => index(f) >= 0);
  };
  const any = (aliases: Aliases<string>, ...fields: string[]): boolean => {
    const index = indexer(header, aliases);
    return fields.some((f) => index(f) >= 0);
  };
  if (has(JOURNAL_ALIASES, 'question', 'answered')) return 'journal';
  if (has(WORKOUT_ALIASES, 'start') && any(WORKOUT_ALIASES, 'duration', 'end')) return 'workouts';
  if (has(CYCLE_ALIASES, 'start') && any(CYCLE_ALIASES, 'recovery', 'restingHr', 'hrv', 'strain', 'skinTemp', 'spo2')) return 'cycles';
  if (has(SLEEP_ALIASES, 'onset', 'wake')) return 'sleeps';
  return null;
}

type RowResult<T> = { status: 'ok'; item: T } | { status: 'invalid' } | { status: 'empty' };

const INVALID = { status: 'invalid' } as const;
const EMPTY = { status: 'empty' } as const;

function field<T>(parsed: Parsed<T>): T | undefined {
  return parsed.ok ? parsed.value : undefined;
}

function allOk(...values: ReadonlyArray<Parsed<unknown>>): boolean {
  return values.every((v) => v.ok);
}

function range(limits: { min: number; max: number }, text: string): Parsed<number | null> {
  return parseNumber(text, limits.min, limits.max);
}

function valueOf(parsed: Parsed<number | null>): number | null {
  return parsed.ok ? parsed.value : null;
}

function parseCycle(read: (f: keyof typeof CYCLE_ALIASES) => string): RowResult<VendorCycle> {
  const zone = read('zone');
  const start = parseTime(read('start'), zone);
  if (start === null) return INVALID;
  let endT: number | null = null;
  const endText = read('end');
  if (endText !== '') {
    const end = parseTime(endText, zone);
    if (end === null || end.unix <= start.unix || end.unix - start.unix > VENDOR_LIMITS.cycleMaxS) return INVALID;
    endT = end.unix;
  }
  const recovery = range(VENDOR_LIMITS.percent, read('recovery'));
  const restingHr = range(VENDOR_LIMITS.restingHr, read('restingHr'));
  const hrv = range(VENDOR_LIMITS.hrvMs, read('hrv'));
  const skin = range(VENDOR_LIMITS.skinTempC, read('skinTemp'));
  const spo2 = range(VENDOR_LIMITS.spo2Pct, read('spo2'));
  const respiratory = range(VENDOR_LIMITS.respiratoryRate, read('respiratory'));
  const strain = range(VENDOR_LIMITS.strain, read('strain'));
  if (!allOk(recovery, restingHr, hrv, skin, spo2, respiratory, strain)) return INVALID;
  const item: VendorCycle = {
    startT: start.unix,
    endT,
    tzOffsetS: start.offsetS,
    day: start.day,
    recoveryPct: valueOf(recovery),
    restingHr: valueOf(restingHr),
    hrvMs: valueOf(hrv),
    skinTempC: valueOf(skin),
    spo2Pct: valueOf(spo2),
    respiratoryRate: valueOf(respiratory),
    dayStrain: valueOf(strain),
  };
  const measured = [item.recoveryPct, item.restingHr, item.hrvMs, item.skinTempC, item.spo2Pct, item.respiratoryRate, item.dayStrain];
  return measured.every((v) => v === null) ? EMPTY : { status: 'ok', item };
}

function parseSleep(read: (f: keyof typeof SLEEP_ALIASES) => string): RowResult<VendorSleep> {
  const zone = read('zone');
  const onset = parseTime(read('onset'), zone);
  const wake = parseTime(read('wake'), zone);
  if (onset === null || wake === null) return INVALID;
  if (wake.unix <= onset.unix || wake.unix - onset.unix > VENDOR_LIMITS.sleepMaxS) return INVALID;
  const nap = parseBoolean(read('nap'));
  const performance = range(VENDOR_LIMITS.percent, read('performance'));
  const asleep = range(VENDOR_LIMITS.minutes, read('asleep'));
  const inBed = range(VENDOR_LIMITS.minutes, read('inBed'));
  const light = range(VENDOR_LIMITS.minutes, read('light'));
  const deep = range(VENDOR_LIMITS.minutes, read('deep'));
  const rem = range(VENDOR_LIMITS.minutes, read('rem'));
  const awake = range(VENDOR_LIMITS.minutes, read('awake'));
  const efficiency = range(VENDOR_LIMITS.percent, read('efficiency'));
  const consistency = range(VENDOR_LIMITS.percent, read('consistency'));
  const respiratory = range(VENDOR_LIMITS.respiratoryRate, read('respiratory'));
  if (!allOk(nap, performance, asleep, inBed, light, deep, rem, awake, efficiency, consistency, respiratory)) return INVALID;
  const asleepMin = valueOf(asleep);
  const inBedMin = valueOf(inBed);
  if (asleepMin !== null && inBedMin !== null && asleepMin > inBedMin + 1) return INVALID;
  return {
    status: 'ok',
    item: {
      onset: onset.unix,
      wake: wake.unix,
      tzOffsetS: onset.offsetS,
      day: onset.day,
      nap: field(nap) === true,
      performancePct: valueOf(performance),
      asleepMin,
      inBedMin,
      lightMin: valueOf(light),
      deepMin: valueOf(deep),
      remMin: valueOf(rem),
      awakeMin: valueOf(awake),
      efficiencyPct: valueOf(efficiency),
      consistencyPct: valueOf(consistency),
      respiratoryRate: valueOf(respiratory),
    },
  };
}

function parseWorkout(read: (f: keyof typeof WORKOUT_ALIASES) => string): RowResult<VendorWorkout> {
  const zone = read('zone');
  const start = parseTime(read('start'), zone);
  if (start === null) return INVALID;
  let end: ParsedTime | null = null;
  const endText = read('end');
  const durationText = read('duration');
  if (endText !== '') end = parseTime(endText, zone);
  else {
    const minutes = parseNumber(durationText, 0, VENDOR_LIMITS.workoutMaxS / 60);
    if (!minutes.ok || minutes.value === null || minutes.value <= 0) return INVALID;
    const unix = start.unix + Math.round(minutes.value * 60);
    end = { unix, offsetS: start.offsetS, day: start.day };
  }
  if (end === null || end.unix <= start.unix || end.unix - start.unix > VENDOR_LIMITS.workoutMaxS) return INVALID;
  const activity = cleanText(read('activity'), VENDOR_LIMITS.activityChars);
  const strain = range(VENDOR_LIMITS.strain, read('strain'));
  const avg = range(VENDOR_LIMITS.workoutHr, read('avgHr'));
  const max = range(VENDOR_LIMITS.workoutHr, read('maxHr'));
  if (!allOk(activity, strain, avg, max)) return INVALID;
  const avgHr = valueOf(avg);
  const maxHr = valueOf(max);
  if (avgHr !== null && maxHr !== null && avgHr > maxHr) return INVALID;
  return {
    status: 'ok',
    item: { startT: start.unix, endT: end.unix, tzOffsetS: start.offsetS, day: start.day, activity: field(activity) ?? null, strain: valueOf(strain), avgHr, maxHr },
  };
}

function parseJournal(read: (f: keyof typeof JOURNAL_ALIASES) => string): RowResult<VendorJournalEntry> {
  const start = parseTime(read('start'), read('zone'));
  if (start === null) return INVALID;
  const question = cleanText(read('question'), VENDOR_LIMITS.questionChars);
  const answered = parseBoolean(read('answered'));
  const notes = cleanText(read('notes'), VENDOR_LIMITS.notesChars);
  if (!question.ok || question.value === null || !answered.ok || answered.value === null || !notes.ok) return INVALID;
  return {
    status: 'ok',
    item: { cycleStart: start.unix, tzOffsetS: start.offsetS, day: start.day, question: question.value, answeredYes: answered.value, notes: notes.value },
  };
}

function emptyTotals(): Record<VendorKind, KindTotals> {
  return {
    cycles: { invalid: 0, skipped: 0 },
    sleeps: { invalid: 0, skipped: 0 },
    workouts: { invalid: 0, skipped: 0 },
    journal: { invalid: 0, skipped: 0 },
  };
}

interface Collector<T> {
  items: T[];
  seen: Set<string>;
}

function collect<T>(
  kind: VendorKind,
  rows: readonly (readonly string[])[],
  parseRow: (row: readonly string[]) => RowResult<T>,
  keyOf: (item: T) => string,
  into: Collector<T>,
  totals: Record<VendorKind, KindTotals>,
  report: FileReport,
): void {
  for (const row of rows) {
    report.rows += 1;
    const result = parseRow(row);
    if (result.status === 'invalid') {
      totals[kind].invalid += 1;
      report.invalid += 1;
    } else if (result.status === 'empty') {
      totals[kind].skipped += 1;
    } else {
      const key = keyOf(result.item);
      if (into.seen.has(key)) totals[kind].skipped += 1;
      else {
        into.seen.add(key);
        into.items.push(result.item);
      }
    }
  }
}

export function parseVendorTexts(files: readonly TextFile[]): ParsedExport {
  const totals = emptyTotals();
  const reports: FileReport[] = [];
  const cycles: Collector<VendorCycle> = { items: [], seen: new Set() };
  const sleeps: Collector<VendorSleep> = { items: [], seen: new Set() };
  const workouts: Collector<VendorWorkout> = { items: [], seen: new Set() };
  const journal: Collector<VendorJournalEntry> = { items: [], seen: new Set() };

  for (const file of files) {
    const report: FileReport = { name: file.name, kind: null, rows: 0, invalid: 0, problem: null };
    reports.push(report);
    const csv = parseCsv(file.text);
    if (!csv.ok) {
      report.problem = 'csv-limits';
      continue;
    }
    const [header, ...body] = csv.rows;
    if (header === undefined) {
      report.problem = 'empty';
      continue;
    }
    const kind = detectKind(header);
    if (kind === null) {
      report.problem = 'unrecognised';
      continue;
    }
    report.kind = kind;
    if (kind === 'cycles') {
      const index = indexer(header, CYCLE_ALIASES);
      collect(kind, body, (row) => parseCycle(reader(index, row)), (c) => String(c.startT), cycles, totals, report);
    } else if (kind === 'sleeps') {
      const index = indexer(header, SLEEP_ALIASES);
      collect(kind, body, (row) => parseSleep(reader(index, row)), (s) => String(s.onset), sleeps, totals, report);
    } else if (kind === 'workouts') {
      const index = indexer(header, WORKOUT_ALIASES);
      collect(kind, body, (row) => parseWorkout(reader(index, row)), (w) => String(w.startT), workouts, totals, report);
    } else {
      const index = indexer(header, JOURNAL_ALIASES);
      collect(kind, body, (row) => parseJournal(reader(index, row)), (j) => `${j.cycleStart}\u0000${j.question}`, journal, totals, report);
    }
  }

  return {
    data: { cycles: cycles.items, sleeps: sleeps.items, workouts: workouts.items, journal: journal.items },
    files: reports,
    totals,
  };
}
