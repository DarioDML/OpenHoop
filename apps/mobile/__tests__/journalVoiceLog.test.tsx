import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import JournalLogScreen from '@/app/journal/log';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';
import { emitSpeech, resetSpeech, speech, speechCalls } from './support/speech';

const mockParams: { day?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('expo-speech-recognition', () => jest.requireActual<{ speechRecognitionMock: object }>('./support/speech').speechRecognitionMock);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const SENTENCE = 'Had two glasses of wine with dinner around nine, an espresso at four, and I read for half an hour before bed.';
const base = { ...defaultUserData(), onboardingDone: true };

function result(transcript: string) {
  return { isFinal: true, results: [{ transcript, confidence: 1, segments: [] }] };
}

beforeEach(() => {
  resetSpeech();
  mockParams.day = undefined;
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('voice log', () => {
  it('finds behaviours in a typed transcript and saves only the confirmed ones', async () => {
    const updateUserData = jest.fn(async () => true);
    const userData = { ...base, journal: { '2026-11-25': { sauna: true } } };
    await render(withAppData(<JournalLogScreen />, 'en', { userData, updateUserData }));
    expect(screen.queryByTestId('voice-found')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), SENTENCE);
    expect(screen.getByText('Alcohol · 2')).toBeTruthy();
    expect(screen.getByText('Caffeine after 14:00 · 16:00')).toBeTruthy();
    expect(screen.getByTestId('voice-chip-late-meal').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('voice-chip-read-before-sleep').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('voice-confirm')).toHaveTextContent('Confirm 3 entries');
    await fireEvent.press(screen.getByTestId('voice-chip-late-meal'));
    await fireEvent.press(screen.getByTestId('voice-chip-alcohol'));
    expect(screen.getByTestId('voice-confirm')).toHaveTextContent('Confirm 3 entries');
    await fireEvent.press(screen.getByTestId('voice-confirm'));
    await waitFor(() =>
      expect(updateUserData).toHaveBeenCalledWith({ journal: { '2026-11-25': { sauna: true, 'caffeine-late': true, 'late-meal': true, 'read-before-sleep': true } } }),
    );
    expect(screen.getByTestId('voice-saved')).toHaveTextContent('Saved 3 entries to the journal for Today.');
  });

  it('saves to the day it was opened for', async () => {
    mockParams.day = '2026-11-24';
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<JournalLogScreen />, 'en', { userData: base, updateUserData }));
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'No alcohol');
    expect(screen.getByText(/journal for Yesterday/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voice-confirm'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ journal: { '2026-11-24': { alcohol: 0 } } }));
  });

  it('says when nothing was recognised and keeps confirm off', async () => {
    await render(withAppData(<JournalLogScreen />, 'en', { userData: base }));
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'A quiet day');
    expect(screen.getByTestId('voice-found-none')).toBeTruthy();
    expect(screen.getByTestId('voice-confirm')).toBeDisabled();
  });

  it('transcribes with the big mic on the phone and keeps the words as a note on request', async () => {
    await render(withAppData(<JournalLogScreen />, 'en', { userData: base }));
    await fireEvent.press(await screen.findByTestId('voice-mic'));
    await waitFor(() => expect(speechCalls.start).toHaveBeenCalledTimes(1));
    expect(speechCalls.start.mock.calls[0]?.[0]).toMatchObject({ requiresOnDeviceRecognition: true, recordingOptions: { persist: false } });
    await act(async () => emitSpeech('start', null));
    expect(await screen.findByTestId('voice-mic-listening')).toBeTruthy();
    expect(screen.getByTestId('note-dictate-start')).toBeTruthy();
    await act(async () => emitSpeech('result', result('Two beers.')));
    expect(screen.getByTestId('voice-transcript').props.value).toBe('Two beers.');
    expect(screen.getByTestId('note-input-text').props.value).toBe('');
    expect(screen.getByText('Alcohol · 2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voice-to-note'));
    expect(screen.getByTestId('note-input-text').props.value).toBe('Two beers.');
  });

  it('hands the microphone over when the note dictation starts', async () => {
    await render(withAppData(<JournalLogScreen />, 'en', { userData: base }));
    await fireEvent.press(await screen.findByTestId('voice-mic'));
    await waitFor(() => expect(speechCalls.start).toHaveBeenCalledTimes(1));
    await act(async () => emitSpeech('start', null));
    await fireEvent.press(screen.getByTestId('note-dictate-start'));
    await waitFor(() => expect(speechCalls.start).toHaveBeenCalledTimes(2));
    expect(speechCalls.abort).toHaveBeenCalledTimes(1);
    await act(async () => emitSpeech('start', null));
    await act(async () => emitSpeech('result', result('Slept badly.')));
    expect(screen.getByTestId('note-input-text').props.value).toBe('Slept badly.');
    expect(screen.getByTestId('voice-transcript').props.value).toBe('');
  });

  it('turns the mic off with a short reason where on-device speech is missing', async () => {
    speech.onDevice = false;
    await render(withAppData(<JournalLogScreen />, 'nl', { userData: base }));
    expect(await screen.findByText(/Spraakinvoer staat uit/)).toBeTruthy();
    expect(screen.getByTestId('voice-mic').props.accessibilityState.disabled).toBe(true);
  });
});
