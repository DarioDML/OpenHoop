import { fitView, project, TILE_SIZE, visibleTiles, worldPx, type TileRef } from '@/lib/mercator';
import { defaultNetworkPrefs, type NetworkPrefs } from '@/net/features';
import { checkRequest } from '@/net/gate';
import { MAX_TILES_PER_MAP, TILE_HOST, tileSources, tileUrl, tileUserAgent } from '@/net/tiles';

const MAPS_ON: NetworkPrefs = { enabled: true, features: { coach: false, maps: true, labs: false, strava: false } };
const TILE: TileRef = { z: 15, x: 16723, y: 10946, left: 0, top: 0 };

describe('web mercator', () => {
  it('projects to world pixels', () => {
    expect(worldPx({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const corner = worldPx({ lat: 85.05112878, lon: -180 }, 1);
    expect(corner.x).toBe(0);
    expect(corner.y).toBeCloseTo(0, 3);
    expect(worldPx({ lat: 89.9, lon: 0 }, 1).y).toBeCloseTo(0, 3);
  });

  it('fits a route into the box at the highest zoom and centres it', () => {
    const points = [
      { lat: 51.05, lon: 3.72 },
      { lat: 51.06, lon: 3.74 },
    ];
    const view = fitView(points, 320, 220, 24);
    expect(view).not.toBeNull();
    if (view === null) return;
    const a = project(view, points[0] ?? { lat: 0, lon: 0 });
    const b = project(view, points[1] ?? { lat: 0, lon: 0 });
    expect(Math.min(a.x, b.x)).toBeGreaterThanOrEqual(24);
    expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(296);
    expect((a.x + b.x) / 2).toBeCloseTo(160, 6);
    expect((a.y + b.y) / 2).toBeCloseTo(110, 6);
    const tighter = fitView(points, 320 * 2, 220 * 2, 24);
    expect(tighter?.z ?? 0).toBeGreaterThan(view.z);
    expect(fitView([], 320, 220, 24)).toBeNull();
    expect(fitView(points, 40, 220, 24)).toBeNull();
  });

  it('lists only the tiles in view, wrapping at the date line', () => {
    const view = { z: 2, left: -100, top: 0, width: 300, height: 256 };
    const tiles = visibleTiles(view);
    expect(tiles.map((t) => [t.x, t.y])).toEqual([
      [3, 0],
      [0, 0],
    ]);
    expect(tiles[0]?.left).toBe(-TILE_SIZE + 100);
    expect(tiles[1]?.left).toBe(100);
    expect(visibleTiles({ z: 1, left: 0, top: -300, width: 256, height: 256 })).toEqual([]);
  });
});

describe('map tiles', () => {
  it('builds the standard tile URL and refuses impossible tiles', () => {
    expect(tileUrl(15, 16723, 10946)).toBe('https://tile.openstreetmap.org/15/16723/10946.png');
    expect(tileUrl(0, 0, 0)).toBeNull();
    expect(tileUrl(18, 0, 0)).toBeNull();
    expect(tileUrl(2, 4, 0)).toBeNull();
    expect(tileUrl(2, -1, 0)).toBeNull();
    expect(tileUrl(2, 1.5, 0)).toBeNull();
  });

  it('identifies the app without leaking anything else', () => {
    expect(tileUserAgent('0.1.0')).toBe('OpenHoop/0.1.0 (+https://github.com/DarioDML/OpenHoop)');
    expect(tileUserAgent('1.0 evil\r\nX-Header: 1')).toBe('OpenHoop/0 (+https://github.com/DarioDML/OpenHoop)');
  });

  it('refuses every tile while the network or the maps feature is off', () => {
    expect(tileSources(defaultNetworkPrefs(), [TILE], '0.1.0')).toEqual({ allowed: false, reason: 'network-off' });
    expect(tileSources({ enabled: true, features: { coach: true, maps: false, labs: false, strava: false } }, [TILE], '0.1.0')).toEqual({ allowed: false, reason: 'feature-off' });
    expect(tileSources({ enabled: false, features: { coach: false, maps: true, labs: false, strava: false } }, [TILE], '0.1.0')).toEqual({ allowed: false, reason: 'network-off' });
  });

  it('gives image sources with the app User-Agent and default caching when maps is on', () => {
    const decision = tileSources(MAPS_ON, [TILE, { ...TILE, x: 16724 }], '0.1.0');
    expect(decision).toEqual({
      allowed: true,
      sources: [
        { uri: 'https://tile.openstreetmap.org/15/16723/10946.png', headers: { 'User-Agent': 'OpenHoop/0.1.0 (+https://github.com/DarioDML/OpenHoop)' }, cache: 'default' },
        { uri: 'https://tile.openstreetmap.org/15/16724/10946.png', headers: { 'User-Agent': 'OpenHoop/0.1.0 (+https://github.com/DarioDML/OpenHoop)' }, cache: 'default' },
      ],
    });
  });

  it('refuses an invalid tile and more tiles than one map shows', () => {
    expect(tileSources(MAPS_ON, [{ ...TILE, z: 30 }], '0.1.0')).toEqual({ allowed: false, reason: 'invalid-url' });
    expect(tileSources(MAPS_ON, Array.from({ length: MAX_TILES_PER_MAP + 1 }, () => TILE), '0.1.0')).toEqual({ allowed: false, reason: 'too-many-tiles' });
  });

  it('allows only the tile host for maps and keeps it out of the coach feature', () => {
    const all: NetworkPrefs = { enabled: true, features: { coach: true, maps: true, labs: true, strava: true } };
    expect(checkRequest(all, 'maps', `https://${TILE_HOST}/1/0/0.png`)).toEqual({ allowed: true });
    expect(checkRequest(all, 'maps', 'https://a.tile.openstreetmap.org/1/0/0.png')).toEqual({ allowed: false, reason: 'host-not-allowed' });
    expect(checkRequest(all, 'maps', 'https://api.anthropic.com/v1/messages')).toEqual({ allowed: false, reason: 'host-not-allowed' });
    expect(checkRequest(all, 'coach', `https://${TILE_HOST}/1/0/0.png`)).toEqual({ allowed: false, reason: 'host-not-allowed' });
    expect(checkRequest(all, 'maps', `http://${TILE_HOST}/1/0/0.png`)).toEqual({ allowed: false, reason: 'not-https' });
  });
});
