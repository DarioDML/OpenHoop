import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import { DICTATION_MIN_ANDROID_API, resolveSpeechLocale, type DictationAvailability } from '@/data/dictation';
import type { Language } from '@/data/types';

export type MicrophonePermission = 'granted' | 'denied' | 'blocked';
export type DownloadOutcome = 'finished' | 'started' | 'failed';
export type DictationErrorKind = 'permission' | 'language' | 'quiet' | 'failed';

export async function checkDictation(language: Language): Promise<DictationAvailability> {
  if (Platform.OS === 'ios') return { kind: 'unavailable', reason: 'ios' };
  if (Platform.OS !== 'android') return { kind: 'unavailable', reason: 'no-recogniser' };
  if (typeof Platform.Version !== 'number' || Platform.Version < DICTATION_MIN_ANDROID_API) {
    return { kind: 'unavailable', reason: 'android-version' };
  }
  try {
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return { kind: 'unavailable', reason: 'no-recogniser' };
    const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const resolution = resolveSpeechLocale(language, locales, installedLocales);
    if (resolution.kind === 'installed') return { kind: 'ready', locale: resolution.locale };
    if (resolution.kind === 'downloadable') return { kind: 'downloadable', locale: resolution.locale };
    return { kind: 'language-missing' };
  } catch {
    return { kind: 'unavailable', reason: 'no-recogniser' };
  }
}

export async function requestMicrophone(): Promise<MicrophonePermission> {
  const response = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'denied' : 'blocked';
}

export function startDictation(locale: string): void {
  ExpoSpeechRecognitionModule.start({
    lang: locale,
    requiresOnDeviceRecognition: true,
    continuous: true,
    interimResults: false,
    addsPunctuation: true,
    maxAlternatives: 1,
    recordingOptions: { persist: false },
  });
}

export function stopDictation(): void {
  ExpoSpeechRecognitionModule.stop();
}

export function abortDictation(): void {
  ExpoSpeechRecognitionModule.abort();
}

export async function downloadLanguagePack(locale: string): Promise<DownloadOutcome> {
  try {
    const { status } = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
    return status === 'download_success' ? 'finished' : 'started';
  } catch {
    return 'failed';
  }
}

export function dictationErrorKind(code: ExpoSpeechRecognitionErrorCode): DictationErrorKind {
  switch (code) {
    case 'not-allowed':
      return 'permission';
    case 'language-not-supported':
      return 'language';
    case 'aborted':
    case 'no-speech':
    case 'speech-timeout':
      return 'quiet';
    default:
      return 'failed';
  }
}
