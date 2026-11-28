import { Directory, File, Paths } from 'expo-file-system';

import type { PacketEntry } from '@/ble/packetLog';

const FOLDER = 'raw-sessions';
const NAME = /^raw-(session|imu|ppg)-\d{8}-\d{6}\.csv$/;

export type RawStreamFile = 'imu' | 'ppg';

export interface RawSessionFile {
  name: string;
  bytes: number;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function stamp(at: Date): string {
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}

export function rawSessionName(startedAt: Date): string {
  return `raw-session-${stamp(startedAt)}.csv`;
}

export function rawStreamName(kind: RawStreamFile, startedAt: Date): string {
  return `raw-${kind}-${stamp(startedAt)}.csv`;
}

function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rawSessionCsv(entries: readonly PacketEntry[]): string {
  const lines = ['at_ms,direction,length,summary,hex'];
  for (const entry of entries) lines.push([String(entry.at), entry.direction, String(entry.length), csvCell(entry.summary), entry.hex].join(','));
  return `${lines.join('\r\n')}\r\n`;
}

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

export async function saveRawSession(startedAt: Date, entries: readonly PacketEntry[]): Promise<RawSessionFile> {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, rawSessionName(startedAt));
  const text = rawSessionCsv(entries);
  await file.write(text);
  return { name: file.name, bytes: file.size ?? text.length };
}

export async function saveRawStream(kind: RawStreamFile, startedAt: Date, text: string): Promise<RawSessionFile> {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, rawStreamName(kind, startedAt));
  await file.write(text);
  return { name: file.name, bytes: file.size ?? text.length };
}

export function listRawSessions(): RawSessionFile[] {
  const dir = folder();
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File && NAME.test(entry.name))
    .map((file) => ({ name: file.name, bytes: file.size ?? 0 }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function deleteRawSession(name: string): void {
  if (!NAME.test(name)) return;
  const file = new File(folder(), name);
  if (file.exists) file.delete();
}

export function deleteAllRawSessions(): void {
  const dir = folder();
  if (dir.exists) dir.delete();
}

export async function rawSessionExports(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const session of listRawSessions()) out[`${FOLDER}/${session.name}`] = await new File(folder(), session.name).text();
  return out;
}
