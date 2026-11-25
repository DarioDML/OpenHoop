import { MAX_ZOOM, MIN_ZOOM, type TileRef } from '@/lib/mercator';

import type { NetworkPrefs } from './features';
import { checkRequest, type GateRefusal } from './gate';

export const TILE_HOST = 'tile.openstreetmap.org';
export const TILE_ATTRIBUTION = '© OpenStreetMap contributors';
export const TILE_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const MAX_TILES_PER_MAP = 12;
const PROJECT_URL = 'https://github.com/DarioDML/OpenHoop';
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

export interface TileImageSource {
  uri: string;
  headers: Record<string, string>;
  cache: 'default';
}

export type TileDecision = { allowed: true; sources: TileImageSource[] } | { allowed: false; reason: GateRefusal | 'too-many-tiles' };

export function tileUrl(z: number, x: number, y: number): string | null {
  if (!Number.isInteger(z) || z < MIN_ZOOM || z > MAX_ZOOM) return null;
  const count = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= count || y >= count) return null;
  return `https://${TILE_HOST}/${z}/${x}/${y}.png`;
}

export function tileUserAgent(appVersion: string): string {
  const version = VERSION.test(appVersion) ? appVersion : '0';
  return `OpenHoop/${version} (+${PROJECT_URL})`;
}

export function tileSources(prefs: NetworkPrefs, tiles: readonly TileRef[], appVersion: string): TileDecision {
  if (tiles.length > MAX_TILES_PER_MAP) return { allowed: false, reason: 'too-many-tiles' };
  const headers = { 'User-Agent': tileUserAgent(appVersion) };
  const sources: TileImageSource[] = [];
  for (const tile of tiles) {
    const url = tileUrl(tile.z, tile.x, tile.y);
    if (url === null) return { allowed: false, reason: 'invalid-url' };
    const decision = checkRequest(prefs, 'maps', url);
    if (!decision.allowed) return { allowed: false, reason: decision.reason };
    sources.push({ uri: url, headers, cache: 'default' });
  }
  return { allowed: true, sources };
}
