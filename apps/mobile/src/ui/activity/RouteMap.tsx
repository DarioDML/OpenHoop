import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { Image, Linking, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Polyline, Text as SvgText } from 'react-native-svg';

import type { RouteMarker, RoutePoint } from '@/data/route';
import { fitView, project, TILE_SIZE, visibleTiles, type MapView } from '@/lib/mercator';
import type { NetworkPrefs } from '@/net/features';
import { TILE_ATTRIBUTION, TILE_COPYRIGHT_URL, tileSources, type TileImageSource } from '@/net/tiles';

import { AppText } from '../AppText';
import { radius, useTheme } from '../theme';

interface Props {
  points: readonly RoutePoint[];
  markers: readonly RouteMarker[];
  markerLabel: (marker: RouteMarker) => string;
  network: NetworkPrefs | null;
  label: string;
  height?: number;
  testID?: string;
}

const PAD = 24;

function segments(points: readonly RoutePoint[], view: MapView): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let segment: number | null = null;
  for (const p of points) {
    if (segment !== null && p.segment !== segment) {
      if (current.length > 1) out.push(current.join(' '));
      current = [];
    }
    segment = p.segment;
    const px = project(view, p);
    current.push(`${px.x.toFixed(1)},${px.y.toFixed(1)}`);
  }
  if (current.length > 1) out.push(current.join(' '));
  return out;
}

export function RouteMap({ points, markers, markerLabel, network, label, height = 220, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(Math.round(event.nativeEvent.layout.width));
  const view = useMemo(() => (width > 0 ? fitView(points, width, height, PAD) : null), [points, width, height]);
  const lines = useMemo(() => (view === null ? [] : segments(points, view)), [points, view]);
  const tiles = useMemo(() => {
    if (view === null || network === null) return [];
    const refs = visibleTiles(view);
    const decision = tileSources(network, refs, Constants.expoConfig?.version ?? '0');
    if (!decision.allowed) return [];
    return refs.map((ref, i): { key: string; left: number; top: number; source: TileImageSource | undefined } => ({
      key: `${ref.z}/${ref.x}/${ref.y}/${ref.left}`,
      left: ref.left,
      top: ref.top,
      source: decision.sources[i],
    }));
  }, [view, network]);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      {tiles.map((tile) =>
        tile.source === undefined ? null : (
          <Image
            key={tile.key}
            testID="route-tile"
            source={tile.source}
            style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          />
        ),
      )}
      {view !== null ? (
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
          {lines.map((line, i) => (
            <Polyline key={`l${i}`} points={line} fill="none" stroke={colors.metric.loadBright} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {markers.map((marker) => {
            const px = project(view, marker);
            return (
              <G key={`m${marker.distanceM}`}>
                <Circle cx={px.x} cy={px.y} r={9} fill={colors.surface} stroke={colors.metric.loadBright} strokeWidth={2} />
                <SvgText x={px.x} y={px.y + 3.5} fontSize={9} fontWeight="bold" fill={colors.text} textAnchor="middle">
                  {markerLabel(marker)}
                </SvgText>
              </G>
            );
          })}
          {first !== undefined ? <Circle cx={project(view, first).x} cy={project(view, first).y} r={6} fill={colors.positive} stroke={colors.surface} strokeWidth={2} /> : null}
          {last !== undefined && points.length > 1 ? <Circle cx={project(view, last).x} cy={project(view, last).y} r={6} fill={colors.text} stroke={colors.surface} strokeWidth={2} /> : null}
        </Svg>
      ) : null}
      {tiles.length > 0 ? (
        <Pressable
          onPress={() => void Linking.openURL(TILE_COPYRIGHT_URL)}
          accessibilityRole="link"
          testID="route-attribution"
          style={{ position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surface, opacity: 0.85 }}>
          <AppText variant="caption">{TILE_ATTRIBUTION}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
