import type { BandModel, DonationResult, RemovalCounts } from '@openhoop/core';

import { donationIssueSummary, donationIssueTitle, donationIssueUrl } from '@/data/donation/issue';

function dayList(count: number, last: string): string[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

function result(opts: { models: (BandModel | null)[]; days: number; official?: number }): DonationResult {
  const days = dayList(opts.days, '2026-11-24');
  return {
    code: 'k3f9x2ab',
    parts: [
      { fileName: 'a.zip', bytes: 1, model: opts.models[0] ?? null, part: 1, parts: 2, days },
      { fileName: 'b.zip', bytes: 1, model: opts.models[0] ?? null, part: 2, parts: 2, days },
    ],
    days,
    skippedDays: [],
    officialDays: days.slice(0, opts.official ?? 0),
    models: opts.models,
    firmware: ['50.43.2.0'],
    removed: {} as RemovalCounts,
    firstDay: days[0] as string,
    lastDay: days[days.length - 1] as string,
  };
}

describe('donation issue', () => {
  it('starts the title with the band model', () => {
    expect(donationIssueTitle(result({ models: ['5.0'], days: 53 }))).toBe('Data donation: 5.0 · 53 days · 2026-10-03 to 2026-11-24');
    expect(donationIssueTitle(result({ models: ['5.0', 'MG'], days: 53 }))).toBe('Data donation: 5.0 + MG · 53 days · 2026-10-03 to 2026-11-24');
    expect(donationIssueTitle(result({ models: ['5.0', '5.0'], days: 2 }))).toBe('Data donation: 5.0 · 2 days · 2026-11-23 to 2026-11-24');
    expect(donationIssueTitle(result({ models: [null], days: 1 }))).toBe('Data donation: unknown · 1 day · 2026-11-24');
  });

  it('starts the summary with the band model and counts the official days', () => {
    expect(donationIssueSummary(result({ models: ['MG'], days: 14, official: 12 }), '1.4.0').split('\n')).toEqual([
      'Band: MG',
      'Donation code: k3f9x2ab',
      'Files: 2',
      'Firmware: 50.43.2.0',
      'App: OpenHoop 1.4.0',
      'Official values: 12 of 14 days',
    ]);
  });

  it('builds the prefilled form link and stays short for a year of days', () => {
    const url = donationIssueUrl(result({ models: ['MG'], days: 365 }), '1.4.0');
    expect(url.startsWith('https://github.com/DarioDML/OpenHoop/issues/new?template=data-donation.yml&title=')).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('title')).toBe('Data donation: MG · 365 days · 2025-11-25 to 2026-11-24');
    expect(params.get('summary')?.split('\n')[0]).toBe('Band: MG');
    expect(url.length).toBeLessThan(8_000);
  });
});
