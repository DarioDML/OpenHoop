import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { useAppData } from '@/data/context';
import { missingProfileFields } from '@/data/energyDerived';
import { explainMissing, type MissingExplanation } from '@/data/explainMissing';
import type { TermId } from '@/data/terms';

import { AboutSheet } from './AboutSheet';
import { WhySheet } from './WhySheet';

export interface ExplainShown {
  value: string | null;
  unit: string | null;
  reason: string | null;
}

export interface ExplainTarget {
  term: TermId;
  index: number;
  shown: ExplainShown | null;
}

export interface ExplainApi {
  about(target: ExplainTarget): void;
  why(target: ExplainTarget): void;
  close(): void;
  nowS(): number;
}

interface Open {
  mode: 'about' | 'why';
  target: ExplainTarget;
}

const ExplainContext = createContext<ExplainApi | null>(null);

const wallClockS = (): number => Math.floor(Date.now() / 1000);

export function useExplain(): ExplainApi {
  const value = useContext(ExplainContext);
  if (value === null) throw new Error('useExplain must be used inside an ExplainProvider');
  return value;
}

function useMissingFor(target: ExplainTarget | null, nowS: number): MissingExplanation | null {
  const { days, device, userData, profile } = useAppData();
  return useMemo(() => {
    if (target === null || target.shown === null || target.shown.value !== null) return null;
    return explainMissing({
      term: target.term,
      reason: target.shown.reason,
      days,
      index: target.index,
      nowS,
      lastSyncAt: device.lastSyncAt,
      profileGaps: missingProfileFields(userData, profile),
    });
  }, [target, days, device.lastSyncAt, userData, profile, nowS]);
}

export function useMissing(target: ExplainTarget): MissingExplanation | null {
  return useMissingFor(target, useExplain().nowS());
}

interface Props {
  children: ReactNode;
  now?: () => number;
}

export function ExplainProvider({ children, now }: Props): ReactElement {
  const [open, setOpen] = useState<Open | null>(null);
  const nowS = now === undefined ? wallClockS() : now();
  const about = useCallback((target: ExplainTarget) => setOpen({ mode: 'about', target }), []);
  const why = useCallback((target: ExplainTarget) => setOpen({ mode: 'why', target }), []);
  const close = useCallback(() => setOpen(null), []);
  const api = useMemo<ExplainApi>(() => ({ about, why, close, nowS: () => nowS }), [about, why, close, nowS]);
  const missing = useMissingFor(open?.target ?? null, nowS);
  return (
    <ExplainContext.Provider value={api}>
      {children}
      {open?.mode === 'about' ? <AboutSheet target={open.target} missing={missing} onClose={close} /> : null}
      {open?.mode === 'why' && missing !== null ? <WhySheet target={open.target} missing={missing} onClose={close} onAbout={about} /> : null}
    </ExplainContext.Provider>
  );
}
