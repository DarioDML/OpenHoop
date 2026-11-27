export type ZoneSeconds = [number, number, number, number, number, number];

export const ZONE_EDGES_PERCENT = [40, 60, 70, 80, 90] as const;

/** Lowest heart rate (bpm) of zones 1 to 5. */
export type ZoneFloors = readonly [number, number, number, number, number];

export const ZONE_FLOOR_MIN_BPM = 40;
export const ZONE_FLOOR_MAX_BPM = 230;

export function hrrZoneFloors(rest: number, max: number): ZoneFloors {
  const reserve = max - rest;
  const at = (percent: number): number => rest + (percent / 100) * reserve;
  const [z1, z2, z3, z4, z5] = ZONE_EDGES_PERCENT;
  return [at(z1), at(z2), at(z3), at(z4), at(z5)];
}

export function isZoneFloors(value: readonly number[] | null | undefined): value is ZoneFloors {
  if (value === null || value === undefined || value.length !== 5) return false;
  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    if (v === undefined || !Number.isFinite(v) || v < ZONE_FLOOR_MIN_BPM || v > ZONE_FLOOR_MAX_BPM) return false;
    const previous = value[i - 1];
    if (previous !== undefined && v <= previous) return false;
  }
  return true;
}

export function zoneIndex(h: number, rest: number, max: number, floors: ZoneFloors | null = null): number {
  if (floors !== null) {
    let z = 0;
    for (const f of floors) if (h >= f) z++;
    return z;
  }
  const pct = ((h - rest) / (max - rest)) * 100;
  let z = 0;
  for (const e of ZONE_EDGES_PERCENT) if (pct >= e) z++;
  return z;
}

export function zoneSeconds(hr: (number | null)[], rest: number, max: number, floors: ZoneFloors | null = null): ZoneSeconds {
  const z: ZoneSeconds = [0, 0, 0, 0, 0, 0];
  for (const h of hr) {
    if (h === null || !Number.isFinite(h)) continue;
    const i = zoneIndex(h, rest, max, floors);
    z[i] = (z[i] ?? 0) + 1;
  }
  return z;
}
