import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DictationAvailability } from '@/data/dictation';
import type { Language } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { abortDictation, checkDictation, dictationErrorKind, downloadLanguagePack, requestMicrophone, startDictation, stopDictation } from '@/lib/speech';

export type DictationPhase = 'idle' | 'starting' | 'listening';
export type DictationNotice = 'denied' | 'blocked' | 'failed' | 'download-started' | 'download-failed';

export const DICTATION_UNAVAILABLE_TEXT = {
  ios: 'journal.voice.unavailableIos',
  'android-version': 'journal.voice.unavailableAndroid',
  'no-recogniser': 'journal.voice.unavailableRecogniser',
} as const satisfies Record<string, TranslationKey>;

export const DICTATION_NOTICE_TEXT = {
  denied: 'journal.voice.denied',
  blocked: 'journal.voice.blocked',
  failed: 'journal.voice.failed',
  'download-started': 'journal.voice.downloadStarted',
  'download-failed': 'journal.voice.downloadFailed',
} as const satisfies Record<DictationNotice, TranslationKey>;

const STOP_TIMEOUT_MS = 4000;

let owner: { id: number; halt: () => void } | null = null;
let nextOwner = 1;

export interface Dictation {
  availability: DictationAvailability;
  phase: DictationPhase;
  notice: DictationNotice | null;
  begin: () => Promise<void>;
  stop: () => void;
  download: (locale: string) => Promise<void>;
  recheck: () => void;
}

export function useDictation(language: Language, onText: (text: string) => void, sessionKey: number): Dictation {
  const [availability, setAvailability] = useState<DictationAvailability>({ kind: 'checking' });
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [notice, setNotice] = useState<DictationNotice | null>(null);
  const [checks, setChecks] = useState(0);
  const idRef = useRef(0);
  const phaseRef = useRef<DictationPhase>('idle');
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recheckAfterErrorRef = useRef(false);

  if (idRef.current === 0) {
    idRef.current = nextOwner;
    nextOwner += 1;
  }

  const clearStopTimer = useCallback((): void => {
    if (stopTimerRef.current !== null) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  }, []);

  const updatePhase = useCallback(
    (next: DictationPhase): void => {
      phaseRef.current = next;
      if (next === 'idle') {
        clearStopTimer();
        if (owner?.id === idRef.current) owner = null;
      }
      if (mountedRef.current) setPhase(next);
    },
    [clearStopTimer],
  );

  const halt = useCallback((): void => {
    attemptRef.current += 1;
    if (phaseRef.current !== 'idle') abortDictation();
    updatePhase('idle');
  }, [updatePhase]);

  useEffect(() => {
    let current = true;
    void checkDictation(language).then((result) => {
      if (!current) return;
      setAvailability(result);
      if (recheckAfterErrorRef.current && result.kind === 'ready') setNotice('failed');
      recheckAfterErrorRef.current = false;
    });
    return () => {
      current = false;
    };
  }, [language, checks]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      halt();
    };
  }, [halt]);

  useEffect(() => {
    halt();
  }, [sessionKey, halt]);

  useSpeechRecognitionEvent('start', () => {
    if (phaseRef.current === 'starting') updatePhase('listening');
  });
  useSpeechRecognitionEvent('end', () => {
    if (phaseRef.current !== 'idle') updatePhase('idle');
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (phaseRef.current === 'idle') return;
    const transcript = event.isFinal ? event.results[0]?.transcript : undefined;
    if (transcript !== undefined) onText(transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (phaseRef.current === 'idle') return;
    updatePhase('idle');
    const kind = dictationErrorKind(event.error);
    if (kind === 'permission') setNotice('denied');
    else if (kind === 'language') {
      recheckAfterErrorRef.current = true;
      setChecks((count) => count + 1);
    } else if (kind === 'failed') setNotice('failed');
  });

  const begin = async (): Promise<void> => {
    if (availability.kind !== 'ready' || phaseRef.current !== 'idle') return;
    if (owner !== null && owner.id !== idRef.current) owner.halt();
    owner = { id: idRef.current, halt };
    setNotice(null);
    updatePhase('starting');
    const attempt = attemptRef.current;
    const permission = await requestMicrophone();
    if (attempt !== attemptRef.current) return;
    if (permission !== 'granted') {
      updatePhase('idle');
      setNotice(permission === 'blocked' ? 'blocked' : 'denied');
      return;
    }
    if (!startDictation(availability.locale)) {
      updatePhase('idle');
      setNotice('failed');
    }
  };

  const stop = (): void => {
    stopDictation();
    clearStopTimer();
    stopTimerRef.current = setTimeout(halt, STOP_TIMEOUT_MS);
  };

  const download = async (locale: string): Promise<void> => {
    setNotice(null);
    const outcome = await downloadLanguagePack(locale);
    if (outcome === 'finished') setChecks((count) => count + 1);
    else setNotice(outcome === 'started' ? 'download-started' : 'download-failed');
  };

  const recheck = (): void => {
    setNotice(null);
    setChecks((count) => count + 1);
  };

  return { availability, phase, notice, begin, stop, download, recheck };
}
