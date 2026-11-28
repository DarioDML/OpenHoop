import type { VendorData } from '@openhoop/core';

export interface ImportPreview {
  cycles: number;
  sleeps: number;
  workouts: number;
  journalDays: number;
  days: number;
}

export function previewCounts(data: VendorData): ImportPreview {
  const days = new Set<string>();
  for (const item of [...data.cycles, ...data.sleeps, ...data.workouts, ...data.journal]) days.add(item.day);
  return {
    cycles: data.cycles.length,
    sleeps: data.sleeps.length,
    workouts: data.workouts.length,
    journalDays: new Set(data.journal.map((entry) => entry.day)).size,
    days: days.size,
  };
}

export function vendorFrom(data: VendorData, fromDay: string | null): VendorData {
  if (fromDay === null) return data;
  return {
    cycles: data.cycles.filter((item) => item.day >= fromDay),
    sleeps: data.sleeps.filter((item) => item.day >= fromDay),
    workouts: data.workouts.filter((item) => item.day >= fromDay),
    journal: data.journal.filter((item) => item.day >= fromDay),
  };
}

export function totalBytes(files: readonly { bytes: Uint8Array }[]): number {
  return files.reduce((sum, file) => sum + file.bytes.length, 0);
}
