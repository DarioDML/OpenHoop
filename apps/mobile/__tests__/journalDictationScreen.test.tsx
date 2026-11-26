import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';

import JournalLogScreen from '@/app/journal/log';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';
import { emitSpeech, resetSpeech, speech, speechCalls } from './support/speech';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('expo-speech-recognition', () => jest.requireActual<{ speechRecognitionMock: object }>('./support/speech').speechRecognitionMock);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const userData = { ...defaultUserData(), onboardingDone: true };
type Save = (id: number | null, input: { day: string; body: string; tags: string[] }) => Promise<boolean>;

function result(transcript: string, isFinal = true) {
  return { isFinal, results: [{ transcript, confidence: 1, segments: [] }] };
}

function useAndroid(version: number): void {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
}

async function renderLog(language: 'en' | 'nl' = 'en', save: Save = async () => true): Promise<void> {
  await render(withAppData(<JournalLogScreen />, language, { userData, saveJournalNote: save }));
}

async function tapDictate(): Promise<void> {
  await fireEvent.press(await screen.findByTestId('note-dictate-start'));
  await waitFor(() => expect(speechCalls.start).toHaveBeenCalled());
}

describe('note dictation', () => {
  beforeEach(() => {
    resetSpeech();
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
    useAndroid(34);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('availability', () => {
    it('offers the dictate button without asking for the microphone yet', async () => {
      await renderLog();
      expect(await screen.findByTestId('note-dictate-start')).toBeTruthy();
      expect(screen.getByTestId('note-dictate-on-device')).toBeTruthy();
      expect(speechCalls.requestMicrophone).not.toHaveBeenCalled();
      expect(speechCalls.start).not.toHaveBeenCalled();
    });

    it('says so when the phone has no on-device recogniser, instead of showing a button', async () => {
      speech.onDevice = false;
      await renderLog();
      expect(await screen.findByTestId('note-dictate-unavailable')).toBeTruthy();
      expect(screen.getByText(/no on-device speech recogniser/)).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
      expect(speechCalls.getSupportedLocales).not.toHaveBeenCalled();
    });

    it('is off on Android 12 and below, where the recogniser cannot be forced offline', async () => {
      useAndroid(32);
      await renderLog();
      expect(await screen.findByText(/needs Android 13 or later/)).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
      expect(speechCalls.getSupportedLocales).not.toHaveBeenCalled();
    });

    it('is off on iOS, where a missing model silently falls back to Apple servers', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await renderLog();
      expect(await screen.findByText(/not available on iPhone yet/)).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
    });

    it('says so when the recogniser has no language pack for the app language', async () => {
      speech.supportedLocales = ['de-DE'];
      speech.installedLocales = ['de-DE'];
      await renderLog();
      expect(await screen.findByTestId('note-dictate-language-missing')).toBeTruthy();
      expect(screen.getByText(/no offline language pack for en-US/)).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
    });

    it('treats a failing recogniser query as unavailable', async () => {
      speech.failQuery = true;
      await renderLog();
      expect(await screen.findByTestId('note-dictate-unavailable')).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
    });
  });

  describe('language pack download', () => {
    beforeEach(() => {
      speech.installedLocales = ['en-US'];
    });

    it('offers the offline download for the app language and dictation once it has finished', async () => {
      await renderLog('nl');
      expect(await screen.findByText(/nl-NL/)).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
      speech.installedLocales = ['en-US', 'nl-NL'];
      await fireEvent.press(screen.getByTestId('note-dictate-download'));
      expect(speechCalls.download).toHaveBeenCalledWith('nl-NL');
      expect(await screen.findByTestId('note-dictate-start')).toBeTruthy();
    });

    it('lets the user check again after a download that continues in the background', async () => {
      speech.downloadStatus = 'download_scheduled';
      await renderLog('nl');
      await fireEvent.press(await screen.findByTestId('note-dictate-download'));
      expect(await screen.findByTestId('note-dictate-notice')).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
      speech.installedLocales = ['en-US', 'nl-NL'];
      await fireEvent.press(screen.getByTestId('note-dictate-recheck'));
      expect(await screen.findByTestId('note-dictate-start')).toBeTruthy();
    });

    it('reports a failed download', async () => {
      speech.downloadStatus = new Error('offline');
      await renderLog('nl');
      await fireEvent.press(await screen.findByTestId('note-dictate-download'));
      expect(await screen.findByText(/kon niet worden gedownload/)).toBeTruthy();
    });
  });

  describe('permission', () => {
    it('keeps the note editable and shows a message when the microphone is denied', async () => {
      speech.permission = { granted: false, canAskAgain: true };
      await renderLog();
      await fireEvent.press(await screen.findByTestId('note-dictate-start'));
      expect(await screen.findByText(/needs the microphone/)).toBeTruthy();
      expect(speechCalls.requestMicrophone).toHaveBeenCalledTimes(1);
      expect(speechCalls.start).not.toHaveBeenCalled();
      expect(screen.getByTestId('note-dictate-start')).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-settings')).toBeNull();
    });

    it('points to the settings when the microphone is blocked for good', async () => {
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
      speech.permission = { granted: false, canAskAgain: false };
      await renderLog();
      await fireEvent.press(await screen.findByTestId('note-dictate-start'));
      await fireEvent.press(await screen.findByTestId('note-dictate-settings'));
      expect(openSettings).toHaveBeenCalled();
      expect(speechCalls.start).not.toHaveBeenCalled();
    });

    it('shows the denied message when the recogniser reports a missing permission', async () => {
      await renderLog();
      await tapDictate();
      await act(async () => emitSpeech('error', { error: 'not-allowed', message: 'denied' }));
      expect(await screen.findByText(/needs the microphone/)).toBeTruthy();
      expect(screen.getByTestId('note-dictate-start')).toBeTruthy();
    });
  });

  describe('dictating', () => {
    it('starts an on-device recognition in the app language that never stores audio', async () => {
      await renderLog();
      await tapDictate();
      expect(speechCalls.start).toHaveBeenCalledTimes(1);
      const options = speechCalls.start.mock.calls[0]?.[0];
      expect(options).toMatchObject({ lang: 'en-US', requiresOnDeviceRecognition: true, recordingOptions: { persist: false } });
      expect(options?.androidRecognitionServicePackage).toBeUndefined();
      expect(options?.audioSource).toBeUndefined();
    });

    it('follows the app language', async () => {
      await renderLog('nl');
      await tapDictate();
      expect(speechCalls.start.mock.calls[0]?.[0]).toMatchObject({ lang: 'nl-NL', requiresOnDeviceRecognition: true });
      expect(screen.getByText('Schrijf het op')).toBeTruthy();
    });

    it('appends recognised text to what is already typed and never saves by itself', async () => {
      const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => true);
      await renderLog('en', save);
      await fireEvent.changeText(await screen.findByTestId('note-input-text'), 'Slept badly.');
      await tapDictate();
      await act(async () => emitSpeech('start', null));
      expect(await screen.findByTestId('note-dictate-listening')).toBeTruthy();

      await act(async () => emitSpeech('result', result('late dinner', false)));
      expect(screen.getByTestId('note-input-text').props.value).toBe('Slept badly.');

      await act(async () => emitSpeech('result', result('Late dinner.')));
      await act(async () => emitSpeech('result', result(' and a long walk. ')));
      expect(screen.getByTestId('note-input-text').props.value).toBe('Slept badly. Late dinner. and a long walk.');
      expect(save).not.toHaveBeenCalled();
    });

    it('lets the user correct the dictated text and save it as an ordinary note', async () => {
      const save = jest.fn<ReturnType<Save>, Parameters<Save>>(async () => true);
      await renderLog('en', save);
      await tapDictate();
      await act(async () => emitSpeech('result', result('Late diner')));
      await fireEvent.changeText(screen.getByTestId('note-input-text'), 'Late dinner');
      await fireEvent.press(screen.getByTestId('note-save'));
      await waitFor(() => expect(save).toHaveBeenCalledWith(null, { day: '2026-11-25', body: 'Late dinner', tags: [] }));
    });

    it('stops on request and returns to the dictate button when the recogniser ends', async () => {
      await renderLog();
      await tapDictate();
      await act(async () => emitSpeech('start', null));
      await fireEvent.press(await screen.findByTestId('note-dictate-stop'));
      expect(speechCalls.stop).toHaveBeenCalledTimes(1);
      await act(async () => emitSpeech('result', result('Final words.')));
      await act(async () => emitSpeech('end', null));
      expect(await screen.findByTestId('note-dictate-start')).toBeTruthy();
      expect(screen.getByTestId('note-input-text').props.value).toBe('Final words.');
    });

    it('stays quiet when nothing was said and reports a real recogniser error', async () => {
      await renderLog();
      await tapDictate();
      await act(async () => emitSpeech('error', { error: 'no-speech', message: 'none' }));
      expect(screen.queryByTestId('note-dictate-notice')).toBeNull();
      expect(screen.getByTestId('note-dictate-start')).toBeTruthy();

      await tapDictate();
      await act(async () => emitSpeech('error', { error: 'audio-capture', message: 'mic busy' }));
      expect(await screen.findByText(/reported an error/)).toBeTruthy();
      expect(screen.getByTestId('note-input-text').props.value).toBe('');
    });

    it('checks again when the recogniser loses the language pack mid-use', async () => {
      await renderLog();
      await tapDictate();
      speech.installedLocales = [];
      await act(async () => emitSpeech('error', { error: 'language-not-supported', message: 'gone' }));
      expect(await screen.findByTestId('note-dictate-language-pack')).toBeTruthy();
      expect(screen.queryByTestId('note-dictate-start')).toBeNull();
    });

    it('cancels a running recognition when the screen is left', async () => {
      await renderLog();
      await tapDictate();
      await act(async () => emitSpeech('start', null));
      await screen.unmount();
      expect(speechCalls.abort).toHaveBeenCalledTimes(1);
    });

    it('does not touch the recogniser on leaving when nothing is running', async () => {
      await renderLog();
      await screen.findByTestId('note-dictate-start');
      await screen.unmount();
      expect(speechCalls.abort).not.toHaveBeenCalled();
    });
  });
});
