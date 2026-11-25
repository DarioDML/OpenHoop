import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CONFIG_KEYS,
  FLAG_KEYS,
  MAX_ENTRIES,
  PROVENANCE_FACTS,
  buildSnapshot,
  describeFields,
  parseBandConfig,
  serializeSnapshot,
  valueView,
  type ConfigEntry,
} from '@/data/bandConfig';
import { allTranslations } from '@/i18n';

const flag = (key: string, valueText: string | null, valueHex: string | null = null): ConfigEntry => ({ key, valueText, valueHex });

const SNAPSHOT = buildSnapshot(1_700_000_000, 'demo', [flag('enable_r22_v4_packets', '1'), flag('make_hrfm_visible', '2')], [flag('enable_rfid', '2')]);

describe('parseBandConfig', () => {
  it('reports a missing snapshot', () => {
    expect(parseBandConfig(null)).toEqual({ status: 'missing' });
    expect(parseBandConfig('')).toEqual({ status: 'missing' });
    expect(parseBandConfig('   ')).toEqual({ status: 'missing' });
  });

  it('round-trips a valid snapshot', () => {
    expect(parseBandConfig(serializeSnapshot(SNAPSHOT))).toEqual({ status: 'ok', snapshot: SNAPSHOT });
  });

  it('keeps unknown fields and drops extra properties', () => {
    const raw = JSON.stringify({
      ...SNAPSHOT,
      extra: 1,
      flags: [{ key: 'brand_new_flag', valueText: 'x', valueHex: null, junk: true }],
    });
    const state = parseBandConfig(raw);
    expect(state.status).toBe('ok');
    if (state.status !== 'ok') return;
    expect(state.snapshot.flags).toEqual([{ key: 'brand_new_flag', valueText: 'x', valueHex: null }]);
    expect(state).not.toHaveProperty('snapshot.extra');
  });

  it('reports a snapshot with no fields as empty', () => {
    const state = parseBandConfig(serializeSnapshot(buildSnapshot(1_700_000_000, 'band', [], [])));
    expect(state.status).toBe('empty');
  });

  it.each([
    ['not json', '{nope'],
    ['a json string', '"hello"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['an unknown version', JSON.stringify({ ...SNAPSHOT, version: 2 })],
    ['a missing version', JSON.stringify({ readAt: 1, source: 'demo', flags: [], config: [] })],
    ['a string timestamp', JSON.stringify({ ...SNAPSHOT, readAt: '1700000000' })],
    ['a zero timestamp', JSON.stringify({ ...SNAPSHOT, readAt: 0 })],
    ['an unknown source', JSON.stringify({ ...SNAPSHOT, source: 'cloud' })],
    ['flags that are not a list', JSON.stringify({ ...SNAPSHOT, flags: {} })],
    ['an entry without a key', JSON.stringify({ ...SNAPSHOT, flags: [{ valueText: '1', valueHex: null }] })],
    ['an empty key', JSON.stringify({ ...SNAPSHOT, flags: [flag('', '1')] })],
    ['an overlong key', JSON.stringify({ ...SNAPSHOT, flags: [flag('k'.repeat(33), '1')] })],
    ['a numeric value', JSON.stringify({ ...SNAPSHOT, config: [{ key: 'enable_rfid', valueText: 2, valueHex: null }] })],
    ['an overlong value', JSON.stringify({ ...SNAPSHOT, config: [flag('enable_rfid', 'v'.repeat(8193))] })],
    ['too many entries', JSON.stringify({ ...SNAPSHOT, flags: Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => flag(`k${i}`, '1')) })],
  ])('rejects %s as malformed', (_name, raw) => {
    expect(parseBandConfig(raw)).toEqual({ status: 'malformed' });
  });
});

describe('valueView', () => {
  it('decodes on and off only for feature flags', () => {
    expect(valueView('flag', flag('a', '1'))).toEqual({ kind: 'on' });
    expect(valueView('flag', flag('a', '2'))).toEqual({ kind: 'off' });
    expect(valueView('config', flag('a', '1'))).toEqual({ kind: 'text', text: '1' });
  });

  it('keeps other text raw', () => {
    expect(valueView('flag', flag('a', '7'))).toEqual({ kind: 'text', text: '7' });
  });

  it('falls back to the raw hex, then to unreadable', () => {
    expect(valueView('flag', flag('a', null, '01ff'))).toEqual({ kind: 'hex', hex: '01ff' });
    expect(valueView('flag', flag('a', null, ''))).toEqual({ kind: 'unreadable' });
    expect(valueView('flag', flag('a', null, null))).toEqual({ kind: 'unreadable' });
  });
});

describe('describeFields', () => {
  it('splits known and unknown keys per kind', () => {
    const { known, unknown } = describeFields('flag', [flag('enable_sig12', '2'), flag('mystery', '9'), flag('enable_rfid', '1')]);
    expect(known.map((row) => row.entry.key)).toEqual(['enable_sig12']);
    expect(unknown.map((row) => row.entry.key)).toEqual(['mystery', 'enable_rfid']);
  });

  it('marks every field unverified while no band has been tested', () => {
    const rows = [...describeFields('flag', SNAPSHOT.flags).known, ...describeFields('config', SNAPSHOT.config).known];
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.verified)).toBe(true);
  });
});

describe('provenance', () => {
  const lines = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'provenance.md'), 'utf8').split('\n').map((line) => line.trimEnd());
  const guessesAt = lines.findIndex((line) => line.startsWith('## Guesses awaiting a band'));
  const rowFor = (docRow: string): { line: string; index: number } | null => {
    const index = lines.findIndex((line) => line.startsWith('|') && line.includes(docRow));
    return index < 0 ? null : { line: lines[index] ?? '', index };
  };

  it('keeps the enumeration fact unverified, as docs/provenance.md does', () => {
    const row = rowFor(PROVENANCE_FACTS.enumeration.docRow);
    expect(row).not.toBeNull();
    expect(row?.index).toBeLessThan(guessesAt);
    const cells = (row?.line ?? '').split('|').map((cell) => cell.trim());
    expect(cells[cells.length - 2]).toBe('no');
    expect(PROVENANCE_FACTS.enumeration.verified).toBe(false);
  });

  it('keeps the value format listed as a guess awaiting a band', () => {
    const row = rowFor(PROVENANCE_FACTS.valueShape.docRow);
    expect(row).not.toBeNull();
    expect(guessesAt).toBeGreaterThan(0);
    expect(row?.index).toBeGreaterThan(guessesAt);
    expect(PROVENANCE_FACTS.valueShape.verified).toBe(false);
  });
});

describe('labels', () => {
  it('has an English and Dutch label for every known key', () => {
    for (const key of FLAG_KEYS) {
      expect(allTranslations.en[`bandConfig.flag.${key}`]).toBeTruthy();
      expect(allTranslations.nl[`bandConfig.flag.${key}`]).toBeTruthy();
    }
    for (const key of CONFIG_KEYS) {
      expect(allTranslations.en[`bandConfig.config.${key}`]).toBeTruthy();
      expect(allTranslations.nl[`bandConfig.config.${key}`]).toBeTruthy();
    }
  });
});
