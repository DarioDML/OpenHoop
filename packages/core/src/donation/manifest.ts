import type { RemovalCounts } from './frames';

export const DONATION_FORMAT = 'openhoop-donation/1';
export const DONATION_LICENCE = 'CC0-1.0';
export const OFFICIAL_FILES = ['official/cycles.csv', 'official/sleeps.csv', 'official/workouts.csv'] as const;

export interface ManifestDay {
  day: string;
  start: number;
  end: number;
  tz_offset_s: number;
  official: boolean;
  piece?: { index: number; count: number };
}

export interface DonationManifest {
  format: typeof DONATION_FORMAT;
  tool: string;
  donation_code: string;
  part: number;
  parts: number;
  band_model: string;
  firmware: string;
  licence: typeof DONATION_LICENCE;
  frames: number;
  frame_types: Record<string, number>;
  record_time_span_utc: [string, string] | null;
  days: ManifestDay[];
  whoop_export_files: string[];
  files: string[];
  removed: RemovalCounts;
}

export function readmeText(manifest: DonationManifest): string {
  return [
    'OpenHoop data donation',
    '======================',
    '',
    `Donation code ${manifest.donation_code}, part ${manifest.part} of ${manifest.parts}.`,
    `Band ${manifest.band_model}, firmware ${manifest.firmware}. Made by ${manifest.tool}.`,
    '',
    'What this is',
    '------------',
    'Raw data from a WHOOP 5.0 or MG band, recorded by the OpenHoop app, together with the official',
    'values the owner imported for the same days. It was shared to make the scores of OpenHoop more accurate.',
    '',
    'Files',
    '-----',
    '- frames.jsonl: one raw band record per line, as {"hex": "..."}, in the format of wearable5.0 donations.',
    '- official/*.csv: the official values the owner imported, matched to each day by time.',
    '- openhoop/*.csv: the results OpenHoop computed for the same days.',
    '- MANIFEST.json: the days in this part, counts, and what was removed.',
    '',
    'What was removed',
    '----------------',
    'Records that carry the serial number, Bluetooth address or name of the band, records from before the',
    'owner started using the band, and damaged or repeated records. MANIFEST.json counts each of these.',
    'No profile, journal, notes, GPS, coach, cycle tracking or other days are included.',
    '',
    'Dates and times are real',
    '------------------------',
    'Every raw record carries the clock of the band, so dates and times were not changed.',
    '',
    'Parts',
    '-----',
    'All parts with the same donation code belong together. An official value that spans two days',
    'can appear in two parts.',
    '',
    'Licence',
    '-------',
    'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/',
    'The donor dedicated this data to the public domain. Anyone may use it for anything.',
    '',
  ].join('\n');
}
