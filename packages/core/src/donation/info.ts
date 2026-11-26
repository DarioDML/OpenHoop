import type { BandModel } from '../store/types';
import type { DonationDay } from './days';

export const PART_LIMIT_BYTES = 25_165_824;
export const PART_MARGIN_BYTES = 1_048_576;
export const ESTIMATED_ZIPPED_BYTES_PER_FRAME = 20;

export function modelSlug(model: BandModel | null): '5.0' | 'mg' | 'unknown' {
  return model === '5.0' ? '5.0' : model === 'MG' ? 'mg' : 'unknown';
}

export function modelLabel(model: BandModel | null): '5.0' | 'MG' | 'unknown' {
  return model ?? 'unknown';
}

export function partMargin(limit: number): number {
  return Math.min(PART_MARGIN_BYTES, Math.floor(limit / 8));
}

export function estimateDonation(days: readonly DonationDay[], limitBytes: number = PART_LIMIT_BYTES): { bytes: number; files: number } {
  const perBand = new Map<number, number>();
  for (const day of days) {
    for (const band of day.bands) {
      perBand.set(band.deviceId, (perBand.get(band.deviceId) ?? 0) + band.frameEstimate * ESTIMATED_ZIPPED_BYTES_PER_FRAME);
    }
  }
  const budget = limitBytes - partMargin(limitBytes);
  let bytes = 0;
  let files = 0;
  for (const bandBytes of perBand.values()) {
    bytes += bandBytes;
    if (bandBytes > 0) files += Math.ceil(bandBytes / budget);
  }
  return { bytes, files };
}
