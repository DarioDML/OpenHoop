import type { ExpoSpeechRecognitionNativeEventMap, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import { useEffect } from 'react';

type EventName = keyof ExpoSpeechRecognitionNativeEventMap;
type Listener = (event: never) => void;
type DownloadStatus = 'download_success' | 'opened_dialog' | 'download_scheduled';

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
}

interface SpeechState {
  onDevice: boolean;
  supportedLocales: string[];
  installedLocales: string[];
  permission: Permission;
  downloadStatus: DownloadStatus | Error;
  failQuery: boolean;
}

const defaults = (): SpeechState => ({
  onDevice: true,
  supportedLocales: ['en-US', 'nl-NL'],
  installedLocales: ['en-US', 'nl-NL'],
  permission: { granted: true, canAskAgain: true },
  downloadStatus: 'download_success',
  failQuery: false,
});

export const speech: SpeechState = defaults();

const listeners = new Map<EventName, Set<Listener>>();

export const speechCalls = {
  start: jest.fn<void, [ExpoSpeechRecognitionOptions]>(),
  stop: jest.fn<void, []>(),
  abort: jest.fn<void, []>(),
  requestMicrophone: jest.fn<void, []>(),
  getSupportedLocales: jest.fn<void, []>(),
  download: jest.fn<void, [string]>(),
};

export function resetSpeech(): void {
  Object.assign(speech, defaults());
  listeners.clear();
  Object.values(speechCalls).forEach((fn) => fn.mockClear());
}

export function emitSpeech<K extends EventName>(name: K, event: ExpoSpeechRecognitionNativeEventMap[K]): void {
  listeners.get(name)?.forEach((listener) => listener(event as never));
}

function useSpeechRecognitionEvent<K extends EventName>(name: K, listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void): void {
  useEffect(() => {
    const set = listeners.get(name) ?? new Set<Listener>();
    set.add(listener as Listener);
    listeners.set(name, set);
    return () => {
      set.delete(listener as Listener);
    };
  }, [name, listener]);
}

export const speechRecognitionMock = {
  useSpeechRecognitionEvent,
  ExpoSpeechRecognitionModule: {
    supportsOnDeviceRecognition: (): boolean => speech.onDevice,
    getSupportedLocales: async (): Promise<{ locales: string[]; installedLocales: string[] }> => {
      speechCalls.getSupportedLocales();
      if (speech.failQuery) throw new Error('error_5');
      return { locales: speech.supportedLocales, installedLocales: speech.installedLocales };
    },
    requestMicrophonePermissionsAsync: async (): Promise<Permission> => {
      speechCalls.requestMicrophone();
      return speech.permission;
    },
    androidTriggerOfflineModelDownload: async ({ locale }: { locale: string }): Promise<{ status: DownloadStatus; message: string }> => {
      speechCalls.download(locale);
      if (speech.downloadStatus instanceof Error) throw speech.downloadStatus;
      return { status: speech.downloadStatus, message: '' };
    },
    start: (options: ExpoSpeechRecognitionOptions): void => speechCalls.start(options),
    stop: (): void => speechCalls.stop(),
    abort: (): void => speechCalls.abort(),
  },
};
