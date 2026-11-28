export const FLAG_KEYS = [
  'enable_r22_packets',
  'enable_r22_v2_packets',
  'enable_r22_v3_packets',
  'enable_r22_v4_packets',
  'enable_r22_v5_packets',
  'enable_r22_v6_packets',
  'enable_r22_v8_packets',
  'make_hrfm_visible',
  'disable_pip_r26_packets',
  'wear_detect_bias',
  'hr_ch_switching',
  'ir_hw_switching',
  'enable_passive_strap_fit_gen5',
  'enable_sig11_during_sleep',
  'dorset_inhibit_wpt',
  'enable_sig12',
] as const;

export const CONFIG_KEYS = [
  'sigproc_wear_detect',
  'enable_rfid',
  'max_collection_backlog',
  'cont_collection_mode',
  'whoop_live_hr_in_adv_ind_pkt',
  'whoop_live_2_hrm_devices',
  'enable_raw_data_w_ecg',
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type ConfigKind = 'flag' | 'config';
export type ConfigSource = 'demo' | 'band';

export interface ConfigEntry {
  key: string;
  valueText: string | null;
  valueHex: string | null;
}

export type WritableValue = '1' | '2';

export interface ConfigChange {
  kind: ConfigKind;
  key: string;
  original: WritableValue;
  at: number;
}

export interface BandConfigSnapshot {
  version: 1;
  readAt: number;
  firstReadAt: number;
  source: ConfigSource;
  flags: ConfigEntry[];
  config: ConfigEntry[];
  changes: ConfigChange[];
}

export type BandConfigState =
  | { status: 'missing' }
  | { status: 'malformed' }
  | { status: 'empty'; snapshot: BandConfigSnapshot }
  | { status: 'ok'; snapshot: BandConfigSnapshot };

export const MAX_ENTRIES = 256;
const MAX_KEY_LENGTH = 32;
const MAX_VALUE_LENGTH = 8192;

export function isFlagKey(key: string): key is FlagKey {
  return (FLAG_KEYS as readonly string[]).includes(key);
}

export function isConfigKey(key: string): key is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= MAX_VALUE_LENGTH);
}

function isEntry(value: unknown): value is ConfigEntry {
  if (!isRecord(value)) return false;
  const { key, valueText, valueHex } = value;
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && isNullableString(valueText) && isNullableString(valueHex);
}

function isEntryList(value: unknown): value is ConfigEntry[] {
  return Array.isArray(value) && value.length <= MAX_ENTRIES && value.every(isEntry);
}

function isSource(value: unknown): value is ConfigSource {
  return value === 'demo' || value === 'band';
}

export function isWritableValue(value: unknown): value is WritableValue {
  return value === '1' || value === '2';
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isChange(value: unknown): value is ConfigChange {
  if (!isRecord(value)) return false;
  const { kind, key, original, at } = value;
  return (kind === 'flag' || kind === 'config') && typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && isWritableValue(original) && isTime(at);
}

function isChangeList(value: unknown): value is ConfigChange[] {
  return value === undefined || (Array.isArray(value) && value.length <= MAX_ENTRIES && value.every(isChange));
}

interface StoredSnapshot extends Omit<BandConfigSnapshot, 'changes' | 'firstReadAt'> {
  changes?: ConfigChange[];
  firstReadAt?: number;
}

function isSnapshot(value: unknown): value is StoredSnapshot {
  if (!isRecord(value)) return false;
  const { version, readAt, firstReadAt, source, flags, config, changes } = value;
  return (
    version === 1 &&
    isTime(readAt) &&
    (firstReadAt === undefined || isTime(firstReadAt)) &&
    isSource(source) &&
    isEntryList(flags) &&
    isEntryList(config) &&
    isChangeList(changes)
  );
}

function toEntry(entry: ConfigEntry): ConfigEntry {
  return { key: entry.key, valueText: entry.valueText, valueHex: entry.valueHex };
}

function toChange(change: ConfigChange): ConfigChange {
  return { kind: change.kind, key: change.key, original: change.original, at: change.at };
}

export function buildSnapshot(
  readAt: number,
  source: ConfigSource,
  flags: readonly ConfigEntry[],
  config: readonly ConfigEntry[],
  changes: readonly ConfigChange[] = [],
  firstReadAt: number = readAt,
): BandConfigSnapshot {
  return {
    version: 1,
    readAt,
    firstReadAt: Math.min(firstReadAt, readAt),
    source,
    flags: flags.map(toEntry),
    config: config.map(toEntry),
    changes: changes.map(toChange),
  };
}

function entriesOf(snapshot: BandConfigSnapshot, kind: ConfigKind): ConfigEntry[] {
  return kind === 'flag' ? snapshot.flags : snapshot.config;
}

export function changeFor(snapshot: BandConfigSnapshot, kind: ConfigKind, key: string): ConfigChange | null {
  return snapshot.changes.find((change) => change.kind === kind && change.key === key) ?? null;
}

export function applyConfigWrite(snapshot: BandConfigSnapshot, kind: ConfigKind, key: string, before: WritableValue, after: WritableValue, at: number): BandConfigSnapshot {
  const update = (entries: ConfigEntry[]): ConfigEntry[] =>
    entries.map((entry) => (entry.key === key ? { key, valueText: after, valueHex: null } : entry));
  const existing = changeFor(snapshot, kind, key);
  const others = snapshot.changes.filter((change) => change !== existing);
  const original = existing?.original ?? before;
  const changes = original === after ? others : [...others, existing ?? { kind, key, original, at }];
  return buildSnapshot(
    snapshot.readAt,
    snapshot.source,
    kind === 'flag' ? update(snapshot.flags) : snapshot.flags,
    kind === 'config' ? update(snapshot.config) : snapshot.config,
    changes,
    snapshot.firstReadAt,
  );
}

export function recordOriginal(snapshot: BandConfigSnapshot, kind: ConfigKind, key: string, original: WritableValue, at: number): BandConfigSnapshot {
  if (changeFor(snapshot, kind, key) !== null) return snapshot;
  return buildSnapshot(snapshot.readAt, snapshot.source, snapshot.flags, snapshot.config, [...snapshot.changes, { kind, key, original, at }], snapshot.firstReadAt);
}

export function carryOver(previous: BandConfigSnapshot | null, next: BandConfigSnapshot): BandConfigSnapshot {
  if (previous === null || previous.source !== next.source) return next;
  const changes = previous.changes.filter((change) => {
    const entry = entriesOf(next, change.kind).find((item) => item.key === change.key);
    return entry !== undefined && entry.valueText !== change.original;
  });
  return buildSnapshot(next.readAt, next.source, next.flags, next.config, changes, previous.firstReadAt);
}

export function serializeSnapshot(snapshot: BandConfigSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseBandConfig(raw: string | null): BandConfigState {
  if (raw === null || raw.trim() === '') return { status: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'malformed' };
  }
  if (!isSnapshot(parsed)) return { status: 'malformed' };
  const snapshot = buildSnapshot(parsed.readAt, parsed.source, parsed.flags, parsed.config, parsed.changes ?? [], parsed.firstReadAt ?? parsed.readAt);
  return snapshot.flags.length + snapshot.config.length === 0 ? { status: 'empty', snapshot } : { status: 'ok', snapshot };
}

export type ValueView =
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'text'; text: string }
  | { kind: 'hex'; hex: string }
  | { kind: 'unreadable' };

export function valueView(kind: ConfigKind, entry: ConfigEntry): ValueView {
  if (entry.valueText !== null) {
    if (kind === 'flag' && entry.valueText === '1') return { kind: 'on' };
    if (kind === 'flag' && entry.valueText === '2') return { kind: 'off' };
    return { kind: 'text', text: entry.valueText };
  }
  if (entry.valueHex !== null && entry.valueHex !== '') return { kind: 'hex', hex: entry.valueHex };
  return { kind: 'unreadable' };
}

export interface ProvenanceFact {
  id: 'enumeration' | 'valueShape';
  docRow: string;
  verified: boolean;
}

export const PROVENANCE_FACTS: Readonly<Record<ProvenanceFact['id'], ProvenanceFact>> = {
  enumeration: { id: 'enumeration', docRow: 'Feature flag and device config enumeration', verified: true },
  valueShape: { id: 'valueShape', docRow: 'The reply when reading a feature flag or device config value', verified: true },
};

export interface FieldRow {
  kind: ConfigKind;
  entry: ConfigEntry;
  known: boolean;
  value: ValueView;
  verified: boolean;
  writable: boolean;
}

export function describeFields(kind: ConfigKind, entries: readonly ConfigEntry[]): { known: FieldRow[]; unknown: FieldRow[] } {
  const known: FieldRow[] = [];
  const unknown: FieldRow[] = [];
  for (const entry of entries) {
    const isKnown = kind === 'flag' ? isFlagKey(entry.key) : isConfigKey(entry.key);
    const verified = PROVENANCE_FACTS.enumeration.verified && PROVENANCE_FACTS.valueShape.verified;
    const writable = isKnown && isWritableValue(entry.valueText);
    (isKnown ? known : unknown).push({ kind, entry, known: isKnown, value: valueView(kind, entry), verified, writable });
  }
  return { known, unknown };
}

export interface ChangeSummary {
  total: number;
  unchanged: number;
  changed: ConfigChange[];
}

export function originalValue(snapshot: BandConfigSnapshot, kind: ConfigKind, entry: ConfigEntry): string | null {
  return changeFor(snapshot, kind, entry.key)?.original ?? entry.valueText;
}

export function changeSummary(snapshot: BandConfigSnapshot): ChangeSummary {
  const known = [...describeFields('flag', snapshot.flags).known, ...describeFields('config', snapshot.config).known].filter((row) => row.writable);
  const changed = snapshot.changes.filter((change) => known.some((row) => row.kind === change.kind && row.entry.key === change.key && row.entry.valueText !== change.original));
  return { total: known.length, unchanged: known.length - changed.length, changed };
}

export interface FlagCoverage {
  read: number;
  known: number;
}

export function flagCoverage(snapshot: BandConfigSnapshot): FlagCoverage {
  return { read: describeFields('flag', snapshot.flags).known.length, known: FLAG_KEYS.length };
}

export interface ConfigSnapshotEntry {
  id: string;
  at: number;
  kind: 'read' | 'before-write';
  key: string | null;
  change: ConfigChange | null;
}

export function configSnapshots(snapshot: BandConfigSnapshot): ConfigSnapshotEntry[] {
  const before: ConfigSnapshotEntry[] = snapshot.changes.map((change) => ({ id: `${change.kind}-${change.key}`, at: change.at, kind: 'before-write', key: change.key, change }));
  return [{ id: 'read', at: snapshot.firstReadAt, kind: 'read' as const, key: null, change: null }, ...before].sort((a, b) => a.at - b.at);
}
