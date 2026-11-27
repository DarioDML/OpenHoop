import { isRecord, parseJson, type Json } from '@/lib/json';

export const STRAVA_UPLOADS_KEY = 'strava.uploads';
export const MAX_LEDGER_ENTRIES = 10_000;

const KEY = /^(activity|detected):\d{1,12}$/;
const ID = /^\d{1,20}$/;

export type LedgerEntry =
  | { status: 'processing'; uploadId: string; at: number }
  | { status: 'done'; uploadId: string | null; activityId: string; at: number }
  | { status: 'duplicate'; uploadId: string | null; activityId: string | null; at: number };

export type Ledger = Readonly<Record<string, LedgerEntry>>;

export function isLedgerKey(key: string): boolean {
  return KEY.test(key);
}

function idOrNull(value: Json | undefined): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && ID.test(value) ? value : undefined;
}

function parseEntry(value: Json | undefined): LedgerEntry | null {
  if (!isRecord(value)) return null;
  const { status, at } = value;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at <= 0) return null;
  const uploadId = idOrNull(value.uploadId);
  if (uploadId === undefined) return null;
  if (status === 'processing') return uploadId === null ? null : { status, uploadId, at };
  const activityId = idOrNull(value.activityId);
  if (activityId === undefined) return null;
  if (status === 'done') return activityId === null ? null : { status, uploadId, activityId, at };
  if (status === 'duplicate') return { status, uploadId, activityId, at };
  return null;
}

export function parseLedger(raw: string | null): Ledger {
  if (raw === null) return {};
  const value = parseJson(raw);
  if (!isRecord(value)) return {};
  const out: Record<string, LedgerEntry> = {};
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= MAX_LEDGER_ENTRIES) break;
    if (!isLedgerKey(key)) continue;
    const entry = parseEntry(item);
    if (entry === null) continue;
    out[key] = entry;
    count++;
  }
  return out;
}

export function serializeLedger(ledger: Ledger): string {
  return JSON.stringify(ledger);
}

export interface LedgerStore {
  load(): Promise<Ledger>;
  save(ledger: Ledger): Promise<void>;
}
