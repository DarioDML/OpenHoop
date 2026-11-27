import type { DayRecord } from '@openhoop/core';

import { parseIsoDate } from '@/lib/dates';
import { addDaysIso, isValidTimeZone, wallClockToEpoch, zoneOffsetS, zonedClock, type ZonedClock } from '@/lib/timeZones';

import { localDate, type WakeOverride } from './alarm';
import { planBedtime } from './dailyDerived';
import { parseClock } from './sleepEditForm';
import { MAX_PRE_ADJUST_DAYS, type JetLagAnchorSource, type SavedJetLagPlan } from './userData';

export const EAST_RATE_H = 1;
export const WEST_RATE_H = 1.5;
export const DEFAULT_PRE_DAYS_CAP = 3;
export const LIGHT_WINDOW_H = 3;
export const MIN_ANCHOR_NIGHTS = 3;

const HOUR_S = 3_600;
const MINUTES_PER_DAY = 1_440;
const EPSILON = 1e-9;

export type JetLagDirection = 'east' | 'west' | 'none';
export type JetLagPhase = 'before' | 'travel' | 'after';

export interface JetLagTrip {
  departureDate: string;
  departureMinutes: number;
  homeZone: string;
  destZone: string;
  preDays: number | null;
}

export interface SleepAnchor {
  bedMinutes: number;
  wakeMinutes: number;
  source: JetLagAnchorSource;
}

export interface PointInTime {
  epochS: number;
  home: ZonedClock;
  dest: ZonedClock;
}

export interface LightWindow {
  start: PointInTime;
  end: PointInTime;
}

export interface PlanDay {
  offset: number;
  date: string;
  phase: JetLagPhase;
  shiftH: number;
  bed: PointInTime;
  wake: PointInTime;
  seek: LightWindow | null;
  avoid: LightWindow | null;
  adapted: boolean;
  clockChange: { home: boolean; dest: boolean };
}

export interface JetLagPlan {
  direction: JetLagDirection;
  zoneShiftH: number;
  ratePerDay: number;
  preDays: number;
  departure: PointInTime;
  days: PlanDay[];
}

export type PlanProblem = 'invalid-zone' | 'invalid-date' | 'invalid-time' | 'invalid-anchor' | 'invalid-days';

export type PlanResult = { ok: true; plan: JetLagPlan } | { ok: false; problem: PlanProblem };

export function normalizeShiftH(hours: number): number {
  const wrapped = ((((hours + 12) % 24) + 24) % 24) - 12;
  return Math.abs(wrapped) < EPSILON ? 0 : wrapped;
}

function nearestTo(hours: number, reference: number): number {
  return hours - 24 * Math.round((hours - reference) / 24);
}

export function zoneShiftH(homeZone: string, destZone: string, epochS: number): number | null {
  const home = zoneOffsetS(homeZone, epochS);
  const dest = zoneOffsetS(destZone, epochS);
  if (home === null || dest === null) return null;
  return normalizeShiftH((dest - home) / HOUR_S);
}

export function ratePerDay(shiftH: number): number {
  return shiftH > 0 ? EAST_RATE_H : WEST_RATE_H;
}

export function stepsNeeded(shiftH: number): number {
  if (shiftH === 0) return 0;
  return Math.ceil(Math.abs(shiftH) / ratePerDay(shiftH) - EPSILON);
}

export function defaultPreDays(shiftH: number): number {
  return Math.min(stepsNeeded(shiftH), DEFAULT_PRE_DAYS_CAP);
}

function pointAt(epochS: number, homeZone: string, destZone: string): PointInTime | null {
  const home = zonedClock(homeZone, epochS);
  const dest = zonedClock(destZone, epochS);
  return home === null || dest === null ? null : { epochS, home, dest };
}

function windowOf(startS: number, endS: number, homeZone: string, destZone: string): LightWindow | null {
  const start = pointAt(startS, homeZone, destZone);
  const end = pointAt(endS, homeZone, destZone);
  return start === null || end === null ? null : { start, end };
}

function noonOffset(zone: string, date: string): number | null {
  const noon = wallClockToEpoch(zone, date, 720);
  return noon === null ? null : zoneOffsetS(zone, noon);
}

export function generatePlan(trip: JetLagTrip, anchor: SleepAnchor): PlanResult {
  if (!isValidTimeZone(trip.homeZone) || !isValidTimeZone(trip.destZone)) return { ok: false, problem: 'invalid-zone' };
  if (parseIsoDate(trip.departureDate) === null) return { ok: false, problem: 'invalid-date' };
  if (!Number.isInteger(trip.departureMinutes) || trip.departureMinutes < 0 || trip.departureMinutes >= MINUTES_PER_DAY) return { ok: false, problem: 'invalid-time' };
  const validMinutes = (m: number): boolean => Number.isInteger(m) && m >= 0 && m < MINUTES_PER_DAY;
  if (!validMinutes(anchor.bedMinutes) || !validMinutes(anchor.wakeMinutes) || anchor.bedMinutes === anchor.wakeMinutes) return { ok: false, problem: 'invalid-anchor' };
  if (trip.preDays !== null && (!Number.isInteger(trip.preDays) || trip.preDays < 0 || trip.preDays > MAX_PRE_ADJUST_DAYS)) return { ok: false, problem: 'invalid-days' };

  const departureS = wallClockToEpoch(trip.homeZone, trip.departureDate, trip.departureMinutes);
  if (departureS === null) return { ok: false, problem: 'invalid-date' };
  const departure = pointAt(departureS, trip.homeZone, trip.destZone);
  const shift = zoneShiftH(trip.homeZone, trip.destZone, departureS);
  if (departure === null || shift === null) return { ok: false, problem: 'invalid-zone' };

  if (shift === 0) return { ok: true, plan: { direction: 'none', zoneShiftH: 0, ratePerDay: 0, preDays: 0, departure, days: [] } };

  const direction: JetLagDirection = shift > 0 ? 'east' : 'west';
  const sign = shift > 0 ? 1 : -1;
  const rate = ratePerDay(shift);
  const steps = stepsNeeded(shift);
  const preDays = Math.min(trip.preDays ?? defaultPreDays(shift), steps);
  const lastOffset = Math.max(1, steps - preDays - 1);
  const bedFromNoon = anchor.bedMinutes < 720 ? anchor.bedMinutes + MINUTES_PER_DAY : anchor.bedMinutes;
  const sleepMinutes = (((anchor.wakeMinutes - anchor.bedMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  const days: PlanDay[] = [];
  for (let offset = -preDays; offset <= lastOffset; offset++) {
    const date = addDaysIso(trip.departureDate, offset);
    const homeOffsetNow = noonOffset(trip.homeZone, date);
    const destOffsetNow = noonOffset(trip.destZone, date);
    const homeOffsetBefore = noonOffset(trip.homeZone, addDaysIso(date, -1));
    const destOffsetBefore = noonOffset(trip.destZone, addDaysIso(date, -1));
    if (homeOffsetNow === null || destOffsetNow === null || homeOffsetBefore === null || destOffsetBefore === null) return { ok: false, problem: 'invalid-zone' };

    const dayShift = nearestTo((destOffsetNow - homeOffsetNow) / HOUR_S, shift);
    const reachable = Math.sign(dayShift) === sign ? Math.abs(dayShift) : 0;
    const step = offset + preDays + 1;
    const magnitude = Math.min(rate * step, reachable);
    const shiftH = sign * magnitude;

    const bedWall = bedFromNoon - Math.round(shiftH * 60);
    const bedS = wallClockToEpoch(trip.homeZone, date, bedWall);
    const wakeS = wallClockToEpoch(trip.homeZone, date, bedWall + sleepMinutes);
    if (bedS === null || wakeS === null) return { ok: false, problem: 'invalid-date' };
    const bed = pointAt(bedS, trip.homeZone, trip.destZone);
    const wake = pointAt(wakeS, trip.homeZone, trip.destZone);
    if (bed === null || wake === null) return { ok: false, problem: 'invalid-zone' };

    const adapted = magnitude >= reachable - EPSILON;
    const evening = adapted ? null : windowOf(bedS - LIGHT_WINDOW_H * HOUR_S, bedS, trip.homeZone, trip.destZone);
    const morning = adapted ? null : windowOf(wakeS, wakeS + LIGHT_WINDOW_H * HOUR_S, trip.homeZone, trip.destZone);

    days.push({
      offset,
      date,
      phase: offset < 0 ? 'before' : offset === 0 ? 'travel' : 'after',
      shiftH,
      bed,
      wake,
      seek: direction === 'east' ? morning : evening,
      avoid: direction === 'east' ? evening : morning,
      adapted,
      clockChange: { home: homeOffsetNow !== homeOffsetBefore, dest: destOffsetNow !== destOffsetBefore },
    });
  }

  return { ok: true, plan: { direction, zoneShiftH: shift, ratePerDay: rate, preDays, departure, days } };
}

export interface HistoryAnchor {
  bedMinutes: number;
  wakeMinutes: number;
  nights: number;
}

export function anchorFromHistory(days: readonly DayRecord[]): HistoryAnchor | null {
  const index = days.length - 1;
  const latest = days[index];
  if (!latest) return null;
  const need = latest.sleep.need.value;
  if (need === null) return null;
  const plan = planBedtime(days, index, need);
  if (plan === null || plan.nights < MIN_ANCHOR_NIGHTS) return null;
  return { bedMinutes: plan.bedMinutes, wakeMinutes: ((Math.round(plan.wakeMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY, nights: plan.nights };
}

export interface TripForm {
  departureDate: string;
  departureTime: string;
  homeZone: string | null;
  destZone: string | null;
  preDays: number | null;
  bedTime: string;
  wakeTime: string;
  anchorSource: JetLagAnchorSource;
}

export type FormProblem = 'invalid-date' | 'invalid-time' | 'missing-zone' |'invalid-bed' | 'invalid-wake' | 'same-bed-wake';

export type FormResult = { ok: true; saved: SavedJetLagPlan } | { ok: false; problem: FormProblem };

export function parseTripForm(form: TripForm): FormResult {
  if (parseIsoDate(form.departureDate.trim()) === null) return { ok: false, problem: 'invalid-date' };
  const departureMinutes = parseClock(form.departureTime);
  if (departureMinutes === null) return { ok: false, problem: 'invalid-time' };
  if (form.homeZone === null || form.destZone === null || !isValidTimeZone(form.homeZone) || !isValidTimeZone(form.destZone)) return { ok: false, problem: 'missing-zone' };
  const bedMinutes = parseClock(form.bedTime);
  if (bedMinutes === null) return { ok: false, problem: 'invalid-bed' };
  const wakeMinutes = parseClock(form.wakeTime);
  if (wakeMinutes === null) return { ok: false, problem: 'invalid-wake' };
  if (bedMinutes === wakeMinutes) return { ok: false, problem: 'same-bed-wake' };
  return {
    ok: true,
    saved: {
      departureDate: form.departureDate.trim(),
      departureMinutes,
      homeZone: form.homeZone,
      destZone: form.destZone,
      preDays: form.preDays,
      bedMinutes,
      wakeMinutes,
      anchorSource: form.anchorSource,
    },
  };
}

export function generateFromSaved(saved: SavedJetLagPlan): PlanResult {
  return generatePlan(
    { departureDate: saved.departureDate, departureMinutes: saved.departureMinutes, homeZone: saved.homeZone, destZone: saved.destZone, preDays: saved.preDays },
    { bedMinutes: saved.bedMinutes, wakeMinutes: saved.wakeMinutes, source: saved.anchorSource },
  );
}

export function sameSavedPlan(a: SavedJetLagPlan | null, b: SavedJetLagPlan | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.departureDate === b.departureDate &&
    a.departureMinutes === b.departureMinutes &&
    a.homeZone === b.homeZone &&
    a.destZone === b.destZone &&
    a.preDays === b.preDays &&
    a.bedMinutes === b.bedMinutes &&
    a.wakeMinutes === b.wakeMinutes &&
    a.anchorSource === b.anchorSource
  );
}

export function deviceClock(epochS: number): WakeOverride {
  const date = new Date(epochS * 1000);
  return { date: localDate(date), minutes: date.getHours() * 60 + date.getMinutes() };
}

/** The plan's wake times as phone-local alarm times. The alarm rings once a day, so a date keeps its earliest wake. */
export function jetLagWakeOverrides(saved: SavedJetLagPlan, clock: (epochS: number) => WakeOverride = deviceClock): WakeOverride[] {
  const result = generateFromSaved(saved);
  if (!result.ok) return [];
  const out: WakeOverride[] = [];
  for (const day of result.plan.days) {
    const wake = clock(day.wake.epochS);
    if (!out.some((o) => o.date === wake.date)) out.push(wake);
  }
  return out;
}

export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

export type ClockSpan = readonly [number, number];

/** Splits a clock range on a noon-to-noon track into the pieces that fit inside it. */
export function trackSpans(fromMinutes: number, toMinutes: number): ClockSpan[] {
  const rel = (m: number): number => (((m - 720) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const a = rel(fromMinutes);
  const b = rel(toMinutes);
  if (a === b) return [];
  if (b > a) return [[a, b]];
  const pieces: ClockSpan[] = [[a, MINUTES_PER_DAY], [0, b]];
  return pieces.filter(([x, y]) => y > x);
}
