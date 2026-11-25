export type ZoneSeconds = [number, number, number, number, number, number];

export const ZONE_EDGES_PERCENT = [40, 60, 70, 80, 90] as const;

export function zoneIndex(h: number, rest: number, max: number): number {
  const pct = ((h - rest) / (max - rest)) * 100;
  let z = 0;
  for (const e of ZONE_EDGES_PERCENT) if (pct >= e) z++;
  return z;
}

export function zoneSeconds(hr: (number | null)[], rest: number, max: number): ZoneSeconds {
  const z: ZoneSeconds = [0, 0, 0, 0, 0, 0];
  for (const h of hr) {
    if (h === null || !Number.isFinite(h)) continue;
    const i = zoneIndex(h, rest, max);
    z[i] = (z[i] ?? 0) + 1;
  }
  return z;
}
