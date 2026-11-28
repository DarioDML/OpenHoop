import type { DayRecord } from '@openhoop/core';

import { addDays, metricValue, type MetricKey } from '@/data/derived';
import type { Language } from '@/data/types';
import type { JournalAnswer } from '@/data/userData';

import { COACH_METRICS, COACH_METRIC_SPECS, coachMetricValue } from './metrics';
import { defaultCoachAccess, type CoachAccess, type CoachProactivity, type CoachTone } from './prefs';

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

const TONE: Record<CoachTone, string> = {
  neutral: '- Tone: neutral. Facts and numbers first, no cheering.',
  encouraging: '- Tone: warm and encouraging. Point out progress, while staying factual.',
  direct: '- Tone: direct and blunt, focused on training. No filler and no softening.',
};

const PROACTIVITY: Record<CoachProactivity, string> = {
  off: '- Answer only what is asked. Do not offer follow-up check-ins.',
  weekly: '- The wearer asked for a weekly review. When it fits, compare this week with the week before.',
  patterns: '- The wearer asked to hear about patterns. When the numbers show a clear change that lasts several days, mention it.',
};

interface SensorColumn {
  name: string;
  decimals: number;
  pick: (day: DayRecord) => number | null;
}

function metric(key: MetricKey): (day: DayRecord) => number | null {
  return (day) => {
    const value = metricValue(day, key);
    return value !== null && Number.isFinite(value) ? value : null;
  };
}

const SENSOR_COLUMNS: readonly SensorColumn[] = [
  { name: 'respiratoryRate', decimals: 1, pick: metric('respiratoryRate') },
  { name: 'spo2', decimals: 0, pick: metric('spo2') },
  { name: 'skinTempDeviationC', decimals: 1, pick: metric('skinTempDeviation') },
  { name: 'hrMin', decimals: 0, pick: (day) => day.heartRate.min },
  { name: 'hrAvg', decimals: 0, pick: (day) => day.heartRate.avg },
  { name: 'hrMax', decimals: 0, pick: (day) => day.heartRate.max },
  { name: 'steps', decimals: 0, pick: metric('steps') },
  { name: 'asleepH', decimals: 1, pick: metric('asleepH') },
];

function cell(value: number | null, decimals: number): string {
  return value === null || !Number.isFinite(value) ? '-' : value.toFixed(decimals);
}

function recentDays(days: readonly DayRecord[], today: string): DayRecord[] {
  return days.filter((day) => day.day <= today).slice(-CONTEXT_DAYS);
}

export function buildDataSummary(days: readonly DayRecord[], today: string): string {
  const recent = recentDays(days, today);
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

export function buildSensorSummary(days: readonly DayRecord[], today: string): string {
  const recent = recentDays(days, today);
  const lines = [
    'Sensor details per day (respiratoryRate in breaths/min, spo2 in %, skinTempDeviationC against the personal baseline, heart rate in bpm, asleepH in hours). These are daily summaries, not raw samples.',
  ];
  if (recent.length === 0) {
    lines.push('No days are recorded yet.');
    return lines.join('\n');
  }
  lines.push(`day | ${SENSOR_COLUMNS.map((column) => column.name).join(' | ')}`);
  for (const day of recent) lines.push(`${day.day} | ${SENSOR_COLUMNS.map((column) => cell(column.pick(day), column.decimals)).join(' | ')}`);
  return lines.join('\n');
}

function answerText(answer: JournalAnswer): string {
  if (typeof answer === 'number') return answer === 0 ? 'no' : String(answer);
  return answer ? 'yes' : 'no';
}

export function buildJournalSummary(journal: Readonly<Record<string, Readonly<Record<string, JournalAnswer>>>>, today: string): string {
  const first = addDays(today, -(CONTEXT_DAYS - 1));
  const days = Object.keys(journal)
    .filter((day) => day >= first && day <= today)
    .sort();
  const lines = ['Journal answers the wearer logged (behaviour id: yes, no or a count):'];
  const filled = days.filter((day) => Object.keys(journal[day] ?? {}).length > 0);
  if (filled.length === 0) {
    lines.push(`No journal answers in the last ${CONTEXT_DAYS} days.`);
    return lines.join('\n');
  }
  for (const day of filled) {
    const entries = Object.entries(journal[day] ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, answer]) => `${id} ${answerText(answer)}`);
    lines.push(`${day}: ${entries.join(', ')}`);
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
  access?: CoachAccess;
  journal?: Readonly<Record<string, Readonly<Record<string, JournalAnswer>>>>;
  tone?: CoachTone;
  proactivity?: CoachProactivity;
}

export function buildSystemPrompt({ days, today, language, memory, access = defaultCoachAccess(), journal, tone = 'neutral', proactivity = 'off' }: SystemPromptInput): string {
  const rules = [...INSTRUCTIONS, TONE[tone], PROACTIVITY[proactivity], REPLY_LANGUAGE[language]];
  const parts = [rules.join('\n')];
  if (access.scores) parts.push(buildDataSummary(days, today));
  else parts.push(`Today is ${today}.\nThe wearer chose not to share scores and vitals. Say so when asked about them, and use an empty "chips" list.`);
  if (access.sensors) parts.push(buildSensorSummary(days, today));
  if (access.journal && journal !== undefined) parts.push(buildJournalSummary(journal, today));
  const notes = memory === null ? null : buildMemorySummary(memory);
  if (notes !== null) parts.push(notes);
  return parts.join('\n\n');
}
