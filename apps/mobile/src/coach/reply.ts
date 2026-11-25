import type { DayRecord } from '@openhoop/core';

import { isRecord, parseJson, type Json } from '@/lib/json';

import { coachMetricValue, isCoachMetric, type CoachMetric } from './metrics';

export const MAX_CHIPS = 3;
export const MAX_REPLY_LENGTH = 2000;
export const MAX_REMEMBER_LENGTH = 200;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ChipRef {
  metric: CoachMetric;
  day: string;
}

export interface CoachReply {
  chips: ChipRef[];
  text: string;
  remember: string | null;
  structured: boolean;
}

export interface ResolvedChip extends ChipRef {
  value: number;
}

interface ReplyShape {
  chips: Json[];
  text: string;
  remember: Json | undefined;
}

function isReplyShape(value: Json | undefined): value is { [key: string]: Json } & ReplyShape {
  return isRecord(value) && Array.isArray(value.chips) && typeof value.text === 'string';
}

function toChipRef(value: Json): ChipRef | null {
  if (!isRecord(value)) return null;
  const { metric, day } = value;
  if (typeof metric !== 'string' || !isCoachMetric(metric)) return null;
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return null;
  return { metric, day };
}

export function chipRefs(values: readonly Json[]): ChipRef[] {
  const out: ChipRef[] = [];
  for (const value of values) {
    const chip = toChipRef(value);
    if (chip === null || out.some((c) => c.metric === chip.metric && c.day === chip.day)) continue;
    out.push(chip);
    if (out.length === MAX_CHIPS) break;
  }
  return out;
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function parseCoachReply(raw: string): CoachReply | null {
  const parsed = parseJson(raw.trim());
  if (isReplyShape(parsed)) {
    const text = clip(parsed.text, MAX_REPLY_LENGTH);
    const remember = typeof parsed.remember === 'string' ? clip(parsed.remember, MAX_REMEMBER_LENGTH) : '';
    if (text !== '') return { chips: chipRefs(parsed.chips), text, remember: remember === '' ? null : remember, structured: true };
  }
  const plain = clip(raw, MAX_REPLY_LENGTH);
  if (plain === '') return null;
  return { chips: [], text: plain, remember: null, structured: false };
}

export function serializeChips(chips: readonly ChipRef[]): string {
  return JSON.stringify(chips.map(({ metric, day }) => ({ metric, day })));
}

export function parseStoredChips(raw: string): ChipRef[] {
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? chipRefs(parsed) : [];
}

export function resolveChips(chips: readonly ChipRef[], days: readonly DayRecord[]): ResolvedChip[] {
  const out: ResolvedChip[] = [];
  for (const chip of chips) {
    const day = days.find((d) => d.day === chip.day);
    const value = day ? coachMetricValue(day, chip.metric) : null;
    if (value !== null) out.push({ ...chip, value });
  }
  return out;
}
