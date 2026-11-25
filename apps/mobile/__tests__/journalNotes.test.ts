import type { JournalNote } from '@openhoop/core';

import { NOTE_LIMITS, noteLength, notesForDay, searchNotes, sortNotesNewestFirst, validateNoteDraft } from '@/data/journalNotes';

const TODAY = '2026-11-25';

function note(id: number, day: string, body: string, tags: string[] = []): JournalNote {
  return { id, day, body, tags, createdAt: id };
}

describe('validateNoteDraft', () => {
  it('trims the text and accepts today', () => {
    const result = validateNoteDraft({ day: ' 2026-11-25 ', text: '  Slept well \r\n', tags: [] }, TODAY);
    expect(result).toEqual({ ok: true, value: { day: '2026-11-25', body: 'Slept well', tags: [] } });
  });

  it('rejects empty and whitespace-only text', () => {
    expect(validateNoteDraft({ day: TODAY, text: '', tags: [] }, TODAY)).toEqual({ ok: false, invalid: ['text'] });
    expect(validateNoteDraft({ day: TODAY, text: ' \n\t ', tags: [] }, TODAY)).toEqual({ ok: false, invalid: ['text'] });
  });

  it('enforces the length limit on the trimmed text, counting characters not UTF-16 units', () => {
    const atLimit = 'a'.repeat(NOTE_LIMITS.maxChars);
    expect(validateNoteDraft({ day: TODAY, text: `  ${atLimit}  `, tags: [] }, TODAY).ok).toBe(true);
    expect(validateNoteDraft({ day: TODAY, text: `${atLimit}a`, tags: [] }, TODAY)).toEqual({ ok: false, invalid: ['text'] });
    const emoji = '😴'.repeat(NOTE_LIMITS.maxChars);
    expect(noteLength(emoji)).toBe(NOTE_LIMITS.maxChars);
    expect(validateNoteDraft({ day: TODAY, text: emoji, tags: [] }, TODAY).ok).toBe(true);
  });

  it('rejects future, malformed, impossible and ancient days', () => {
    for (const day of ['2026-11-26', 'yesterday', '2026-02-30', '2014-12-31', '']) {
      expect(validateNoteDraft({ day, text: 'x', tags: [] }, TODAY)).toEqual({ ok: false, invalid: ['day'] });
    }
    expect(validateNoteDraft({ day: '2026-11-24', text: 'x', tags: [] }, TODAY).ok).toBe(true);
  });

  it('reports every invalid field at once', () => {
    expect(validateNoteDraft({ day: '2027-01-01', text: '', tags: ['nope'] }, TODAY)).toEqual({ ok: false, invalid: ['day', 'text', 'tags'] });
  });

  it('accepts known journal question ids as tags, de-duplicated, and rejects unknown or too many', () => {
    const ok = validateNoteDraft({ day: TODAY, text: 'x', tags: ['sauna', 'sauna', 'alcohol'] }, TODAY);
    expect(ok).toEqual({ ok: true, value: { day: TODAY, body: 'x', tags: ['sauna', 'alcohol'] } });
    expect(validateNoteDraft({ day: TODAY, text: 'x', tags: ['a,b'] }, TODAY)).toEqual({ ok: false, invalid: ['tags'] });
    const six = ['alcohol', 'caffeine-late', 'screens-bed', 'sauna', 'melatonin', 'nap'];
    expect(validateNoteDraft({ day: TODAY, text: 'x', tags: six }, TODAY)).toEqual({ ok: false, invalid: ['tags'] });
  });
});

describe('note lists', () => {
  const notes = [
    note(1, '2026-11-20', 'Sauna after work, slept deep'),
    note(2, '2026-11-24', 'Café late, bad night'),
    note(3, '2026-11-24', 'Second note same day'),
    note(4, '2026-11-10', 'Alcohol at dinner'),
  ];

  it('sorts newest day first and newest id first within a day, without mutating the input', () => {
    expect(sortNotesNewestFirst(notes).map((n) => n.id)).toEqual([3, 2, 1, 4]);
    expect(notes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
  });

  it('lists a day oldest first', () => {
    expect(notesForDay(notes, '2026-11-24').map((n) => n.id)).toEqual([2, 3]);
    expect(notesForDay(notes, '2026-11-01')).toEqual([]);
  });

  it('returns everything newest first for a blank query', () => {
    expect(searchNotes(notes, '   ').map((n) => n.id)).toEqual([3, 2, 1, 4]);
  });

  it('matches case- and accent-insensitively and requires every word', () => {
    expect(searchNotes(notes, 'CAFE').map((n) => n.id)).toEqual([2]);
    expect(searchNotes(notes, 'sauna deep').map((n) => n.id)).toEqual([1]);
    expect(searchNotes(notes, 'sauna dinner')).toEqual([]);
  });

  it('matches the day text too', () => {
    expect(searchNotes(notes, '2026-11-10').map((n) => n.id)).toEqual([4]);
  });
});
