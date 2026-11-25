import type { JournalNote, JournalNoteInput } from '@openhoop/core';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import JournalInsightsScreen from '@/app/journal/insights';
import JournalScreen from '@/app/journal/index';
import JournalLogScreen from '@/app/journal/log';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockParams: { day?: string } = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function entry(id: number, day: string, body: string, tags: string[] = []): JournalNote {
  return { id, day, body, tags, createdAt: id };
}

const userData = { ...defaultUserData(), onboardingDone: true };
type Save = (id: number | null, input: JournalNoteInput) => Promise<boolean>;

describe('journal notes screen', () => {
  beforeEach(() => {
    mockParams.day = undefined;
    mockPush.mockClear();
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an empty list and an honest not-built note for voice input', async () => {
    await render(withAppData(<JournalLogScreen />, 'en', { userData }));
    expect(screen.getByTestId('notes-empty')).toBeTruthy();
    expect(screen.getByTestId('note-voice-not-built')).toBeTruthy();
    expect(screen.getByText(/Dictating a note needs a speech recogniser/)).toBeTruthy();
    expect(screen.getByTestId('note-input-day').props.value).toBe('2026-11-25');
  });

  it('opens on the day it was linked from', async () => {
    mockParams.day = '2026-11-20';
    await render(withAppData(<JournalLogScreen />, 'en', { userData }));
    expect(screen.getByTestId('note-input-day').props.value).toBe('2026-11-20');
  });

  it('ignores a linked day in the future', async () => {
    mockParams.day = '2026-12-31';
    await render(withAppData(<JournalLogScreen />, 'en', { userData }));
    expect(screen.getByTestId('note-input-day').props.value).toBe('2026-11-25');
  });

  it('rejects empty, oversized and future-dated notes without saving', async () => {
    const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => true);
    await render(withAppData(<JournalLogScreen />, 'en', { userData, saveJournalNote: save }));
    await fireEvent.press(screen.getByTestId('note-save'));
    await fireEvent.changeText(screen.getByTestId('note-input-text'), 'x'.repeat(2001));
    await fireEvent.press(screen.getByTestId('note-save'));
    await fireEvent.changeText(screen.getByTestId('note-input-text'), 'ok');
    await fireEvent.changeText(screen.getByTestId('note-input-day'), '2026-11-26');
    await fireEvent.press(screen.getByTestId('note-save'));
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a trimmed note with its tags as a new row and clears the form', async () => {
    const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => true);
    await render(withAppData(<JournalLogScreen />, 'en', { userData, saveJournalNote: save }));
    await fireEvent.changeText(screen.getByTestId('note-input-text'), '  Late dinner, slept badly  ');
    await fireEvent.press(screen.getByTestId('note-tag-sauna'));
    await fireEvent.press(screen.getByTestId('note-tag-alcohol'));
    await fireEvent.press(screen.getByTestId('note-tag-sauna'));
    await fireEvent.press(screen.getByTestId('note-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, { day: '2026-11-25', body: 'Late dinner, slept badly', tags: ['alcohol'] }));
    await waitFor(() => expect(screen.getByTestId('note-input-text').props.value).toBe(''));
  });

  it('keeps the draft when saving fails', async () => {
    const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => false);
    await render(withAppData(<JournalLogScreen />, 'en', { userData, saveJournalNote: save }));
    await fireEvent.changeText(screen.getByTestId('note-input-text'), 'keep me');
    await fireEvent.press(screen.getByTestId('note-save'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(screen.getByTestId('note-input-text').props.value).toBe('keep me');
  });

  it('edits an existing note by id and prefills its text and tags', async () => {
    const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => true);
    await render(
      withAppData(<JournalLogScreen />, 'en', {
        userData,
        journalNotes: [entry(7, '2026-11-20', 'Original', ['melatonin'])],
        saveJournalNote: save,
      }),
    );
    await fireEvent.press(screen.getByTestId('note-edit-7'));
    expect(screen.getByTestId('note-input-text').props.value).toBe('Original');
    expect(screen.getByTestId('note-input-day').props.value).toBe('2026-11-20');
    await fireEvent.changeText(screen.getByTestId('note-input-text'), 'Changed');
    await fireEvent.press(screen.getByTestId('note-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(7, { day: '2026-11-20', body: 'Changed', tags: ['melatonin'] }));
  });

  it('asks for confirmation before it deletes a note', async () => {
    const remove = jest.fn<Promise<boolean>, [number]>(async () => true);
    await render(withAppData(<JournalLogScreen />, 'en', { userData, journalNotes: [entry(3, '2026-11-20', 'Gone soon')], removeJournalNote: remove }));
    await fireEvent.press(screen.getByTestId('note-delete-3'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('note-keep-3'));
    await fireEvent.press(screen.getByTestId('note-delete-3'));
    await fireEvent.press(screen.getByTestId('note-confirm-3'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(3));
  });

  it('lists notes newest first and filters them by search text', async () => {
    const journalNotes = [entry(1, '2026-11-10', 'Sauna evening'), entry(2, '2026-11-24', 'Late coffee'), entry(3, '2026-11-20', 'Sauna again')];
    await render(withAppData(<JournalLogScreen />, 'en', { userData, journalNotes }));
    expect(screen.getByTestId('journal-note-2-text')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('note-search'), 'sauna');
    expect(screen.queryByTestId('journal-note-2')).toBeNull();
    expect(screen.getByTestId('journal-note-1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-3')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('note-search'), 'zzz');
    expect(screen.getByTestId('notes-no-results')).toBeTruthy();
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<JournalLogScreen />, 'nl', { userData }));
    expect(screen.getByText('Schrijf het op')).toBeTruthy();
    expect(screen.getByText(/Typen werkt overal/)).toBeTruthy();
  });
});

describe('journal day view and insights', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows the notes of the selected day and opens the notes screen on that day', async () => {
    const today = new Date();
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    await render(withAppData(<JournalScreen />, 'en', { userData, journalNotes: [entry(1, day, 'Today note'), entry(2, '2000-01-01', 'Other day')] }));
    expect(screen.getByTestId('journal-note-1-text')).toBeTruthy();
    expect(screen.queryByTestId('journal-note-2')).toBeNull();
    await fireEvent.press(screen.getByTestId('journal-add-note'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/journal/log', params: { day } });
  });

  it('lists the most recent notes on the insights screen', async () => {
    const journalNotes = [1, 2, 3, 4].map((id) => entry(id, `2026-11-0${id}`, `Note ${id}`));
    await render(withAppData(<JournalInsightsScreen />, 'en', { userData, journalNotes }));
    expect(screen.getByTestId('journal-note-4')).toBeTruthy();
    expect(screen.getByTestId('journal-note-2')).toBeTruthy();
    expect(screen.queryByTestId('journal-note-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('insights-notes-all'));
    expect(mockPush).toHaveBeenCalledWith('/journal/log');
  });

  it('says there are no notes yet on the insights screen', async () => {
    await render(withAppData(<JournalInsightsScreen />, 'en', { userData }));
    expect(screen.getByTestId('insights-notes-empty')).toBeTruthy();
  });
});
