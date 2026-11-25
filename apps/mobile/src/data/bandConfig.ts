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

export interface BandConfigSnapshot {
  version: 1;
  readAt: number;
  source: ConfigSource;
  flags: ConfigEntry[];
  config: ConfigEntry[];
}

export type BandConfigState =
  | { status: 'missing' }
  | { status: 'malformed' }
  | { status: 'empty'; snapshot: BandConfigSnapshot }
  | { status: 'ok'; snapshot: BandConfigSnapshot };

export const MAX_ENTRIES = 256;
const MAX_KEY_LENGTH = 32;
const MAX_VALUE_LENGTH = 256;

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

function isSnapshot(value: unknown): value is BandConfigSnapshot {
  if (!isRecord(value)) return false;
  const { version, readAt, source, flags, config } = value;
  return (
    version === 1 &&
    typeof readAt === 'number' &&
    Number.isFinite(readAt) &&
    readAt > 0 &&
    isSource(source) &&
    isEntryList(flags) &&
    isEntryList(config)
  );
}

function toEntry(entry: ConfigEntry): ConfigEntry {
  return { key: entry.key, valueText: entry.valueText, valueHex: entry.valueHex };
}

export function buildSnapshot(readAt: number, source: ConfigSource, flags: readonly ConfigEntry[], config: readonly ConfigEntry[]): BandConfigSnapshot {
  return { version: 1, readAt, source, flags: flags.map(toEntry), config: config.map(toEntry) };
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
  const snapshot = buildSnapshot(parsed.readAt, parsed.source, parsed.flags, parsed.config);
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
  enumeration: { id: 'enumeration', docRow: 'Feature flag and device config enumeration', verified: false },
  valueShape: { id: 'valueShape', docRow: 'The shape of the reply when reading the value of a feature flag or a device config key', verified: false },
};

export interface FieldRow {
  kind: ConfigKind;
  entry: ConfigEntry;
  known: boolean;
  value: ValueView;
  verified: boolean;
}

export function describeFields(kind: ConfigKind, entries: readonly ConfigEntry[]): { known: FieldRow[]; unknown: FieldRow[] } {
  const known: FieldRow[] = [];
  const unknown: FieldRow[] = [];
  for (const entry of entries) {
    const isKnown = kind === 'flag' ? isFlagKey(entry.key) : isConfigKey(entry.key);
    const verified = PROVENANCE_FACTS.enumeration.verified && PROVENANCE_FACTS.valueShape.verified;
    (isKnown ? known : unknown).push({ kind, entry, known: isKnown, value: valueView(kind, entry), verified });
  }
  return { known, unknown };
}
