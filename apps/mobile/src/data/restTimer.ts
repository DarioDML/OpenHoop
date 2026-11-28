export const REST_STEP_S = 15;
export const REST_MAX_S = 15 * 60;

export type RestTimer =
  | { status: 'idle' }
  | { status: 'running'; endsAtMs: number; totalS: number }
  | { status: 'done'; totalS: number };

export type RestEvent =
  | { kind: 'start'; atMs: number; seconds: number }
  | { kind: 'adjust'; atMs: number; deltaS: number }
  | { kind: 'tick'; atMs: number }
  | { kind: 'skip' };

export const REST_IDLE: RestTimer = { status: 'idle' };

function clampSeconds(seconds: number): number {
  return Math.min(REST_MAX_S, Math.max(0, Math.round(seconds)));
}

export function restReducer(timer: RestTimer, event: RestEvent): RestTimer {
  switch (event.kind) {
    case 'start': {
      const seconds = clampSeconds(event.seconds);
      return seconds === 0 ? { status: 'done', totalS: 0 } : { status: 'running', endsAtMs: event.atMs + seconds * 1000, totalS: seconds };
    }
    case 'adjust': {
      if (timer.status !== 'running') return timer;
      const remainingMs = Math.max(0, timer.endsAtMs - event.atMs);
      const nextRemainingMs = Math.min(REST_MAX_S * 1000, Math.max(0, remainingMs + event.deltaS * 1000));
      const totalS = clampSeconds(Math.max(timer.totalS + event.deltaS, Math.ceil(nextRemainingMs / 1000)));
      if (nextRemainingMs === 0) return { status: 'done', totalS };
      return { status: 'running', endsAtMs: event.atMs + nextRemainingMs, totalS };
    }
    case 'tick':
      return timer.status === 'running' && event.atMs >= timer.endsAtMs ? { status: 'done', totalS: timer.totalS } : timer;
    case 'skip':
      return REST_IDLE;
  }
}

export interface RestView {
  status: RestTimer['status'];
  remainingS: number | null;
  fraction: number;
}

export function restView(timer: RestTimer, nowMs: number): RestView {
  if (timer.status === 'idle') return { status: 'idle', remainingS: null, fraction: 0 };
  if (timer.status === 'done' || nowMs >= timer.endsAtMs) return { status: 'done', remainingS: 0, fraction: 0 };
  const remainingS = Math.min(timer.totalS, Math.ceil((timer.endsAtMs - nowMs) / 1000));
  const fraction = timer.totalS > 0 ? Math.min(1, (timer.endsAtMs - nowMs) / (timer.totalS * 1000)) : 0;
  return { status: 'running', remainingS, fraction };
}

export function restJustEnded(before: RestTimer, after: RestTimer): boolean {
  return before.status === 'running' && after.status === 'done';
}
