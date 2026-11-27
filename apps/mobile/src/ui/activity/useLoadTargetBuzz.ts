import { useEffect, useRef, useState } from 'react';

import { useAppData } from '@/data/context';
import { loadTargetBuzzDue } from '@/data/liveSession';

export type BuzzStatus = 'off' | 'noTarget' | 'waitingDay' | 'armed' | 'passed' | 'buzzed' | 'failed';

export function useLoadTargetBuzz(enabled: boolean, target: number | null, projected: number | null, running: boolean): BuzzStatus {
  const { bandActions } = useAppData();
  const previous = useRef<number | null>(null);
  const [fired, setFired] = useState<'buzzed' | 'failed' | null>(null);
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    if (!enabled || !running || target === null || projected === null || fired !== null) return;
    const before = previous.current;
    previous.current = projected;
    if (before === null) {
      if (projected >= target) setPassed(true);
      return;
    }
    if (loadTargetBuzzDue(before, projected, target)) {
      void bandActions.buzz('test').then(
        (ok) => setFired(ok ? 'buzzed' : 'failed'),
        () => setFired('failed'),
      );
    }
  }, [enabled, running, target, projected, fired, bandActions]);

  if (!enabled) return 'off';
  if (target === null) return 'noTarget';
  if (fired !== null) return fired;
  if (passed) return 'passed';
  if (projected === null) return 'waitingDay';
  return 'armed';
}
