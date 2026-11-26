import type { EcgSummary } from '@openhoop/core';

export const ECG_STRIP_S = 5;

export interface TraceColumn {
  min: number;
  max: number;
}

export function traceColumns(samples: readonly number[], columns: number): TraceColumn[] {
  if (samples.length === 0 || columns < 1) return [];
  const count = Math.min(columns, samples.length);
  const out: TraceColumn[] = [];
  for (let c = 0; c < count; c++) {
    const from = Math.floor((c * samples.length) / count);
    const to = Math.max(from + 1, Math.floor(((c + 1) * samples.length) / count));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = from; i < to; i++) {
      const v = samples[i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out.push({ min, max });
  }
  return out;
}

export function ecgStrips(samples: readonly number[], rateHz: number | null, durationMs: number): number[][] {
  if (samples.length === 0) return [];
  const perStrip =
    rateHz !== null && rateHz > 0
      ? Math.max(1, Math.round(rateHz * ECG_STRIP_S))
      : Math.max(1, Math.ceil(samples.length / Math.max(1, Math.ceil(durationMs / 1000 / ECG_STRIP_S))));
  const strips: number[][] = [];
  for (let at = 0; at < samples.length; at += perStrip) strips.push(samples.slice(at, at + perStrip));
  return strips;
}

function isoUtc(unixS: number): string {
  return new Date(unixS * 1000).toISOString();
}

export function ecgCsv(recording: EcgSummary, samples: readonly number[]): string {
  const rate = recording.rateHz;
  const lines = ['index,t_ms,value'];
  samples.forEach((value, i) => {
    const t = rate === null || rate <= 0 ? '' : String(Math.round((i * 1000) / rate));
    lines.push(`${i},${t},${Math.round(value)}`);
  });
  return `${lines.join('\r\n')}\r\n`;
}

export function ecgFileName(recording: EcgSummary): string {
  return `openhoop-ecg-${isoUtc(recording.t).slice(0, 19).replace(/[:T]/g, '-')}.csv`;
}
