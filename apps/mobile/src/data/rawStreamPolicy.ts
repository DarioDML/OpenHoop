import type { StreamKind } from '@openhoop/core';

export type StreamOwner = 'developer' | 'workout';

export const STREAM_CAPS_MS: Readonly<Record<StreamOwner, number>> = { developer: 600_000, workout: 14_400_000 };
export const FAIL_SAFE_GRACE_MS = 3_000;
export const FAIL_SAFE_INTERVAL_MS = 30_000;

const KINDS: readonly StreamKind[] = ['imu', 'optical'];

export interface StreamFlags {
  imu: boolean;
  optical: boolean;
  band: boolean;
}

const NO_FLAGS: StreamFlags = { imu: false, optical: false, band: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFlags(text: string | null): StreamFlags {
  if (text === null) return NO_FLAGS;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return NO_FLAGS;
    return { imu: value.imu === true, optical: value.optical === true, band: value.band === true };
  } catch {
    return NO_FLAGS;
  }
}

export function serializeFlags(flags: StreamFlags): string {
  return JSON.stringify({ imu: flags.imu, optical: flags.optical, band: flags.band });
}

interface Claim {
  kinds: Set<StreamKind>;
  sinceMs: number;
}

export class StreamOwners {
  private readonly claims = new Map<StreamOwner, Claim>();

  claim(owner: StreamOwner, kinds: readonly StreamKind[], nowMs: number): StreamKind[] {
    const before = new Set(this.active());
    const claim = this.claims.get(owner) ?? { kinds: new Set<StreamKind>(), sinceMs: nowMs };
    for (const kind of kinds) claim.kinds.add(kind);
    this.claims.set(owner, claim);
    return KINDS.filter((kind) => claim.kinds.has(kind) && !before.has(kind));
  }

  release(owner: StreamOwner): StreamKind[] {
    const claim = this.claims.get(owner);
    if (claim === undefined) return [];
    this.claims.delete(owner);
    const still = new Set(this.active());
    return KINDS.filter((kind) => claim.kinds.has(kind) && !still.has(kind));
  }

  has(owner: StreamOwner): boolean {
    return this.claims.has(owner);
  }

  releaseKinds(owner: StreamOwner, kinds: readonly StreamKind[]): void {
    const claim = this.claims.get(owner);
    if (claim === undefined) return;
    for (const kind of kinds) claim.kinds.delete(kind);
    if (claim.kinds.size === 0) this.claims.delete(owner);
  }

  dropKind(kind: StreamKind): void {
    for (const [owner, claim] of [...this.claims.entries()]) {
      claim.kinds.delete(kind);
      if (claim.kinds.size === 0) this.claims.delete(owner);
    }
  }

  releaseAll(): void {
    this.claims.clear();
  }

  kindsOf(owner: StreamOwner): StreamKind[] {
    const claim = this.claims.get(owner);
    return claim === undefined ? [] : KINDS.filter((kind) => claim.kinds.has(kind));
  }

  active(): StreamKind[] {
    return KINDS.filter((kind) => [...this.claims.values()].some((claim) => claim.kinds.has(kind)));
  }

  expired(nowMs: number): StreamOwner[] {
    return [...this.claims.entries()].filter(([owner, claim]) => nowMs - claim.sinceMs >= STREAM_CAPS_MS[owner]).map(([owner]) => owner);
  }
}

export function onBackground(owners: StreamOwners): StreamKind[] {
  return owners.release('developer');
}

export interface ReconcileState {
  target: readonly StreamKind[];
  confirmed: readonly StreamKind[];
  mayBeOn: readonly StreamKind[];
  bandWanted: boolean;
  bandConfirmed: boolean;
  bandMayBeOn: boolean;
}

export interface ReconcilePlan {
  off: StreamKind[];
  on: StreamKind[];
  stopBand: boolean;
  startBand: boolean;
}

export function planReconcile(state: ReconcileState): ReconcilePlan {
  return {
    off: KINDS.filter((kind) => state.mayBeOn.includes(kind) && !state.target.includes(kind)),
    on: KINDS.filter((kind) => state.target.includes(kind) && !state.confirmed.includes(kind)),
    stopBand: state.bandMayBeOn && !state.bandWanted,
    startBand: state.bandWanted && !state.bandConfirmed,
  };
}

export class FailSafe {
  private stoppedAtMs = Number.NEGATIVE_INFINITY;
  private firedAtMs = Number.NEGATIVE_INFINITY;

  noteStop(nowMs: number): void {
    this.stoppedAtMs = nowMs;
  }

  shouldStop(nowMs: number, ctx: { owned: boolean; ecg: boolean; syncing: boolean }): boolean {
    if (ctx.owned || ctx.ecg || ctx.syncing) return false;
    if (nowMs - this.stoppedAtMs < FAIL_SAFE_GRACE_MS) return false;
    if (nowMs - this.firedAtMs < FAIL_SAFE_INTERVAL_MS) return false;
    this.firedAtMs = nowMs;
    return true;
  }
}
