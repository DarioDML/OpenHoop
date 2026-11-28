import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CONFIG_KEYS,
  FLAG_KEYS,
  MAX_ENTRIES,
  PROVENANCE_FACTS,
  applyConfigWrite,
  buildSnapshot,
  carryOver,
  changeFor,
  configSnapshots,
  changeSummary,
  flagCoverage,
  originalValue,
  recordOriginal,
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

  it('marks the read verified now that it was checked on a band', () => {
    const rows = [...describeFields('flag', SNAPSHOT.flags).known, ...describeFields('config', SNAPSHOT.config).known];
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.verified)).toBe(true);
  });
});

describe('provenance', () => {
  const lines = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'provenance.md'), 'utf8').split('\n').map((line) => line.trimEnd());
  const guessesAt = lines.findIndex((line) => line.startsWith('## Guesses awaiting a band'));
  const rowFor = (docRow: string): { line: string; index: number } | null => {
    const index = lines.findIndex((line) => line.startsWith('|') && line.includes(docRow));
    return index < 0 ? null : { line: lines[index] ?? '', index };
  };

  it.each(Object.values(PROVENANCE_FACTS))('marks $id verified only when docs/provenance.md does', (fact) => {
    const row = rowFor(fact.docRow);
    expect(row).not.toBeNull();
    expect(guessesAt).toBeGreaterThan(0);
    expect(row?.index).toBeLessThan(guessesAt);
    const cells = (row?.line ?? '').split('|').map((cell) => cell.trim());
    expect(cells[cells.length - 2]).toBe(fact.verified ? 'yes' : 'no');
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

describe('changes made from OpenHoop', () => {
  it('records the original value once and drops it when the value is put back', () => {
    const once = applyConfigWrite(SNAPSHOT, 'flag', 'make_hrfm_visible', '2', '1', 1_700_000_100);
    expect(once.flags.find((entry) => entry.key === 'make_hrfm_visible')?.valueText).toBe('1');
    expect(changeFor(once, 'flag', 'make_hrfm_visible')).toEqual({ kind: 'flag', key: 'make_hrfm_visible', original: '2', at: 1_700_000_100 });
    expect(changeFor(once, 'config', 'make_hrfm_visible')).toBeNull();
    const back = applyConfigWrite(once, 'flag', 'make_hrfm_visible', '1', '2', 1_700_000_200);
    expect(back.changes).toEqual([]);
  });

  it('keeps the first original value when a write is about to be sent', () => {
    const pending = recordOriginal(SNAPSHOT, 'flag', 'make_hrfm_visible', '2', 7);
    expect(pending.flags.find((entry) => entry.key === 'make_hrfm_visible')?.valueText).toBe('2');
    expect(changeFor(pending, 'flag', 'make_hrfm_visible')?.original).toBe('2');
    expect(recordOriginal(pending, 'flag', 'make_hrfm_visible', '1', 8)).toBe(pending);
    const done = applyConfigWrite(pending, 'flag', 'make_hrfm_visible', '2', '1', 9);
    expect(done.changes).toEqual([{ kind: 'flag', key: 'make_hrfm_visible', original: '2', at: 7 }]);
    const reread = buildSnapshot(10, 'demo', [flag('make_hrfm_visible', '2')], []);
    expect(carryOver(pending, reread).changes).toEqual([]);
  });

  it('round-trips changes and still parses snapshots stored without them', () => {
    const changed = applyConfigWrite(SNAPSHOT, 'config', 'enable_rfid', '2', '1', 1_700_000_100);
    expect(parseBandConfig(serializeSnapshot(changed))).toEqual({ status: 'ok', snapshot: changed });
    const { changes: _changes, ...legacy } = SNAPSHOT;
    expect(parseBandConfig(JSON.stringify(legacy))).toEqual({ status: 'ok', snapshot: SNAPSHOT });
  });

  it.each([
    ['a change with an unknown kind', { kind: 'other', key: 'enable_rfid', original: '1', at: 1 }],
    ['a change with a value that cannot be put back', { kind: 'config', key: 'enable_rfid', original: '0', at: 1 }],
    ['a change without a time', { kind: 'config', key: 'enable_rfid', original: '1' }],
  ])('rejects %s as malformed', (_name, change) => {
    expect(parseBandConfig(JSON.stringify({ ...SNAPSHOT, changes: [change] }))).toEqual({ status: 'malformed' });
  });

  it('keeps changes over a new read unless the band shows the original again', () => {
    const changed = applyConfigWrite(applyConfigWrite(SNAPSHOT, 'config', 'enable_rfid', '2', '1', 5), 'flag', 'make_hrfm_visible', '2', '1', 6);
    const reread = buildSnapshot(1_700_000_900, 'demo', [flag('enable_r22_v4_packets', '1'), flag('make_hrfm_visible', '2')], [flag('enable_rfid', '1')]);
    expect(carryOver(changed, reread).changes).toEqual([{ kind: 'config', key: 'enable_rfid', original: '2', at: 5 }]);
    expect(carryOver(changed, buildSnapshot(1_700_000_900, 'band', [], [flag('enable_rfid', '1')])).changes).toEqual([]);
    expect(carryOver(null, reread)).toBe(reread);
  });

  it('marks only known on/off values as writable', () => {
    const rows = describeFields('flag', [flag('enable_sig12', '2'), flag('make_hrfm_visible', '0'), flag('mystery', '1')]);
    expect(rows.known.map((row) => [row.entry.key, row.writable])).toEqual([
      ['enable_sig12', true],
      ['make_hrfm_visible', false],
    ]);
    expect(rows.unknown.every((row) => !row.writable)).toBe(true);
  });
});

describe('changes by OpenHoop', () => {
  it('counts known flags read from the band apart from the values OpenHoop can change', () => {
    const withUnwritable = buildSnapshot(1_700_000_000, 'band', [flag('enable_r22_v4_packets', '1'), flag('enable_sig12', null, '0102'), flag('mystery', '1')], [flag('enable_rfid', '2')]);
    expect(flagCoverage(withUnwritable)).toEqual({ read: 2, known: FLAG_KEYS.length });
    expect(changeSummary(withUnwritable).total).toBe(2);
  });

  it('counts writable known values that still have the value the band had before OpenHoop wrote', () => {
    expect(changeSummary(SNAPSHOT)).toEqual({ total: 3, unchanged: 3, changed: [] });
    const changed = applyConfigWrite(SNAPSHOT, 'flag', 'make_hrfm_visible', '2', '1', 50);
    const summary = changeSummary(changed);
    expect(summary.unchanged).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.changed.map((change) => change.key)).toEqual(['make_hrfm_visible']);
    const entry = changed.flags.find((item) => item.key === 'make_hrfm_visible');
    expect(entry === undefined ? null : originalValue(changed, 'flag', entry)).toBe('2');
  });

  it('lists the first read and one snapshot before each write, oldest first', () => {
    const changed = applyConfigWrite(applyConfigWrite(SNAPSHOT, 'config', 'enable_rfid', '2', '1', 1_700_000_200), 'flag', 'make_hrfm_visible', '2', '1', 1_700_000_100);
    expect(configSnapshots(changed).map((entry) => [entry.kind, entry.key, entry.at])).toEqual([
      ['read', null, 1_700_000_000],
      ['before-write', 'make_hrfm_visible', 1_700_000_100],
      ['before-write', 'enable_rfid', 1_700_000_200],
    ]);
  });

  it('keeps the time of the first read over later reads of the same band, and reads old snapshots without it', () => {
    const reread = carryOver(SNAPSHOT, buildSnapshot(1_700_009_000, 'demo', SNAPSHOT.flags, SNAPSHOT.config));
    expect(reread.readAt).toBe(1_700_009_000);
    expect(reread.firstReadAt).toBe(1_700_000_000);
    expect(configSnapshots(reread)[0]).toMatchObject({ kind: 'read', at: 1_700_000_000 });
    expect(carryOver(SNAPSHOT, buildSnapshot(1_700_009_000, 'band', [], [])).firstReadAt).toBe(1_700_009_000);
    const { firstReadAt: _first, ...legacy } = reread;
    const parsed = parseBandConfig(JSON.stringify(legacy));
    expect(parsed.status === 'ok' ? parsed.snapshot.firstReadAt : null).toBe(1_700_009_000);
  });
});
