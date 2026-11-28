import { FailSafe, STREAM_CAPS_MS, StreamOwners, onBackground, parseFlags, planReconcile, serializeFlags } from '@/data/rawStreamPolicy';

describe('stream owners', () => {
  it('claim and release share kinds between owners', () => {
    const owners = new StreamOwners();
    expect(owners.claim('developer', ['imu', 'optical'], 0)).toEqual(['imu', 'optical']);
    expect(owners.claim('workout', ['imu'], 10)).toEqual([]);
    expect(owners.active().sort()).toEqual(['imu', 'optical']);
    expect(owners.release('developer')).toEqual(['optical']);
    expect(owners.active()).toEqual(['imu']);
    expect(owners.release('workout')).toEqual(['imu']);
    expect(owners.active()).toEqual([]);
    expect(owners.release('workout')).toEqual([]);
  });

  it('reports the kinds each owner holds', () => {
    const owners = new StreamOwners();
    owners.claim('developer', ['optical', 'imu'], 0);
    owners.claim('workout', ['imu'], 0);
    expect(owners.kindsOf('developer')).toEqual(['imu', 'optical']);
    expect(owners.kindsOf('workout')).toEqual(['imu']);
    owners.release('developer');
    expect(owners.kindsOf('developer')).toEqual([]);
  });

  it('releases some kinds of one owner and keeps its others', () => {
    const owners = new StreamOwners();
    owners.claim('developer', ['imu', 'optical'], 0);
    owners.releaseKinds('developer', ['optical']);
    expect(owners.kindsOf('developer')).toEqual(['imu']);
    owners.releaseKinds('developer', ['imu']);
    expect(owners.has('developer')).toBe(false);
  });

  it('drops one kind from every owner and releases everything', () => {
    const owners = new StreamOwners();
    owners.claim('developer', ['imu', 'optical'], 0);
    owners.claim('workout', ['imu'], 0);
    owners.dropKind('imu');
    expect(owners.kindsOf('developer')).toEqual(['optical']);
    expect(owners.has('workout')).toBe(false);
    owners.releaseAll();
    expect(owners.active()).toEqual([]);
  });

  it('a second claim by the same owner adds only new kinds', () => {
    const owners = new StreamOwners();
    owners.claim('developer', ['imu'], 0);
    expect(owners.claim('developer', ['imu', 'optical'], 5)).toEqual(['optical']);
    expect(owners.has('developer')).toBe(true);
    expect(owners.has('workout')).toBe(false);
  });

  it('caps expire', () => {
    expect(STREAM_CAPS_MS).toEqual({ developer: 600_000, workout: 14_400_000 });
    const owners = new StreamOwners();
    owners.claim('developer', ['optical'], 1_000);
    owners.claim('workout', ['imu'], 1_000);
    expect(owners.expired(600_999)).toEqual([]);
    expect(owners.expired(601_000)).toEqual(['developer']);
    expect(owners.expired(14_401_000).sort()).toEqual(['developer', 'workout']);
  });

  it('developer owner is released on background, workout owner is kept', () => {
    const owners = new StreamOwners();
    owners.claim('developer', ['imu', 'optical'], 0);
    owners.claim('workout', ['imu'], 0);
    expect(onBackground(owners)).toEqual(['optical']);
    expect(owners.has('developer')).toBe(false);
    expect(owners.active()).toEqual(['imu']);
  });
});

describe('planReconcile', () => {
  const idle = { target: [], confirmed: [], mayBeOn: [], bandWanted: false, bandConfirmed: false, bandMayBeOn: false } as const;

  it('switches off what may be on but nobody wants', () => {
    expect(planReconcile({ ...idle, mayBeOn: ['imu'], bandMayBeOn: true })).toEqual({ off: ['imu'], on: [], stopBand: true, startBand: false });
  });

  it('switches on every wanted kind that is not confirmed, also after a reconnect', () => {
    expect(planReconcile({ ...idle, target: ['imu'], mayBeOn: ['imu'] })).toEqual({ off: [], on: ['imu'], stopBand: false, startBand: false });
    expect(planReconcile({ ...idle, target: ['imu'], confirmed: ['imu'], mayBeOn: ['imu'] })).toEqual({ off: [], on: [], stopBand: false, startBand: false });
  });

  it('switches off a flagged kind no owner needs while keeping the owned one', () => {
    expect(planReconcile({ ...idle, target: ['imu'], confirmed: ['imu'], mayBeOn: ['imu', 'optical'] })).toEqual({ off: ['optical'], on: [], stopBand: false, startBand: false });
  });

  it('starts the on-band recording once and leaves a wanted one alone', () => {
    expect(planReconcile({ ...idle, bandWanted: true })).toEqual({ off: [], on: [], stopBand: false, startBand: true });
    expect(planReconcile({ ...idle, bandWanted: true, bandConfirmed: true, bandMayBeOn: true })).toEqual({ off: [], on: [], stopBand: false, startBand: false });
  });

  it('does nothing when nothing may be on and nothing is wanted', () => {
    expect(planReconcile(idle)).toEqual({ off: [], on: [], stopBand: false, startBand: false });
  });
});

describe('fail-safe', () => {
  const free = { owned: false, ecg: false, syncing: false };

  it('fail-safe grace and rate limit', () => {
    const safe = new FailSafe();
    safe.noteStop(10_000);
    expect(safe.shouldStop(12_999, free)).toBe(false);
    expect(safe.shouldStop(13_000, free)).toBe(true);
    expect(safe.shouldStop(14_000, free)).toBe(false);
    expect(safe.shouldStop(42_999, free)).toBe(false);
    expect(safe.shouldStop(43_000, free)).toBe(true);
  });

  it('never fires for an owned stream, an ECG reading or a sync', () => {
    const safe = new FailSafe();
    expect(safe.shouldStop(100_000, { ...free, owned: true })).toBe(false);
    expect(safe.shouldStop(100_000, { ...free, ecg: true })).toBe(false);
    expect(safe.shouldStop(100_000, { ...free, syncing: true })).toBe(false);
    expect(safe.shouldStop(100_000, free)).toBe(true);
  });
});

describe('cleanup flags', () => {
  it('flags round-trip', () => {
    const flags = { imu: true, optical: false, band: true };
    expect(parseFlags(serializeFlags(flags))).toEqual(flags);
  });

  it('reads garbage and nothing as all off', () => {
    const off = { imu: false, optical: false, band: false };
    expect(parseFlags('garbage')).toEqual(off);
    expect(parseFlags(null)).toEqual(off);
    expect(parseFlags('{"imu":"yes"}')).toEqual(off);
  });
});
