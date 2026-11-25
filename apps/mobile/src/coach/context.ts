import type { DayRecord } from '@openhoop/core';

import type { Language } from '@/data/types';

import { COACH_METRICS, COACH_METRIC_SPECS, coachMetricValue } from './metrics';

export const CONTEXT_DAYS = 7;

const INSTRUCTIONS = [
  "You are the coach inside OpenHoop, a private app that reads the wearer's own wrist band. You answer questions about the wearer's own numbers listed below.",
  'Rules:',
  '- You are not a doctor. Make no medical claims, no diagnosis and no treatment advice. If something sounds like a health problem, suggest talking to a doctor.',
  '- Use only the numbers below. If a number is missing, say so. Never guess or invent values.',
  '- The numbers are estimates from a consumer band, not medical measurements. The level (A to D) says how close a metric is to the original app; A is closest.',
  '- Numbers before words: put the 1 to 3 most relevant metrics in "chips", each as a metric name and a day from the table that has a value. Use an empty list when no number fits.',
  '- Keep "text" short: at most 3 sentences and under 60 words, plain language, no lists, no markdown.',
  '- Set "remember" to a short note only when the wearer explicitly asks you to remember something. Otherwise set it to null.',
];

const REPLY_LANGUAGE: Record<Language, string> = {
  en: '- Reply in English.',
  nl: '- Reply in Dutch (Nederlands).',
};

function cell(value: number | null, decimals: number): string {
  return value === null ? '-' : value.toFixed(decimals);
}

export function buildDataSummary(days: readonly DayRecord[], today: string): string {
  const recent = days.filter((day) => day.day <= today).slice(-CONTEXT_DAYS);
  const legend = COACH_METRICS.map((metric) => `${metric} (${COACH_METRIC_SPECS[metric].range}, level ${COACH_METRIC_SPECS[metric].level})`).join(', ');
  const lines = [`Today is ${today}.`, `Metrics: ${legend}.`];
  if (recent.length === 0) {
    lines.push('No days are recorded yet.');
    return lines.join('\n');
  }
  lines.push(`day | ${COACH_METRICS.join(' | ')}`);
  for (const day of recent) {
    const values = COACH_METRICS.map((metric) => cell(coachMetricValue(day, metric), COACH_METRIC_SPECS[metric].decimals));
    lines.push(`${day.day} | ${values.join(' | ')}`);
  }
  return lines.join('\n');
}

export function buildMemorySummary(notes: readonly string[]): string | null {
  if (notes.length === 0) return null;
  return ['Notes the wearer asked you to remember:', ...notes.map((note) => `- ${note.replace(/\s+/g, ' ')}`)].join('\n');
}

export interface SystemPromptInput {
  days: readonly DayRecord[];
  today: string;
  language: Language;
  memory: readonly string[] | null;
}

export function buildSystemPrompt({ days, today, language, memory }: SystemPromptInput): string {
  const parts = [[...INSTRUCTIONS, REPLY_LANGUAGE[language]].join('\n'), buildDataSummary(days, today)];
  const notes = memory === null ? null : buildMemorySummary(memory);
  if (notes !== null) parts.push(notes);
  return parts.join('\n\n');
}
