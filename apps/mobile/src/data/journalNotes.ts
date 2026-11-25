import type { JournalNote, JournalNoteInput } from '@openhoop/core';

import { parseIsoDate } from '@/lib/dates';

import { findQuestion } from './journalQuestions';

export const NOTE_LIMITS = { maxChars: 2000, maxTags: 5, maxQuery: 100 } as const;

export type NoteField = 'day' | 'text' | 'tags';

export interface NoteDraft {
  day: string;
  text: string;
  tags: readonly string[];
}

export type NoteValidation = { ok: true; value: JournalNoteInput } | { ok: false; invalid: NoteField[] };

const MIN_YEAR = 2015;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function noteLength(text: string): number {
  return Array.from(text.replace(/\r\n?/g, '\n').trim()).length;
}

function validDay(day: string, today: string): boolean {
  const parts = parseIsoDate(day);
  return parts !== null && parts.y >= MIN_YEAR && day <= today;
}

export function validateNoteDraft(draft: NoteDraft, today: string): NoteValidation {
  const invalid: NoteField[] = [];
  const day = draft.day.trim();
  if (!validDay(day, today)) invalid.push('day');
  const body = draft.text.replace(/\r\n?/g, '\n').trim();
  const length = Array.from(body).length;
  if (length === 0 || length > NOTE_LIMITS.maxChars) invalid.push('text');
  const tags = [...new Set(draft.tags)];
  if (tags.length > NOTE_LIMITS.maxTags || !tags.every((tag) => findQuestion(tag) !== undefined)) invalid.push('tags');
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, value: { day, body, tags } };
}

function compareNewestFirst(a: JournalNote, b: JournalNote): number {
  if (a.day === b.day) return b.id - a.id;
  return a.day < b.day ? 1 : -1;
}

export function sortNotesNewestFirst(notes: readonly JournalNote[]): JournalNote[] {
  return [...notes].sort(compareNewestFirst);
}

export function notesForDay(notes: readonly JournalNote[], day: string): JournalNote[] {
  return notes.filter((note) => note.day === day).sort((a, b) => a.id - b.id);
}

function fold(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

export function searchNotes(notes: readonly JournalNote[], query: string): JournalNote[] {
  const terms = fold(query.slice(0, NOTE_LIMITS.maxQuery))
    .split(/\s+/)
    .filter((term) => term !== '');
  const sorted = sortNotesNewestFirst(notes);
  if (terms.length === 0) return sorted;
  return sorted.filter((note) => {
    const haystack = fold(`${note.body}\n${note.day}`);
    return terms.every((term) => haystack.includes(term));
  });
}
