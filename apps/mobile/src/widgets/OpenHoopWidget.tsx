import type { ReactNode } from "react";
import { FlexWidget, TextWidget, type HexColor, type WidgetRepresentation } from 'react-native-android-widget';

import type { WidgetLine, WidgetName, WidgetTone, WidgetView } from '@/lib/widgetSnapshot';
import { darkColors, lightColors, type ColorTokens } from '@/ui/theme';

type Mode = 'light' | 'dark';

const NUMBER_FONT = 'BarlowCondensed_700Bold';
const FALLBACK: HexColor = '#808080';

function isHexColor(value: string): value is HexColor {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function hex(value: string): HexColor {
  return isHexColor(value) ? value : FALLBACK;
}

interface Palette {
  background: HexColor;
  text: HexColor;
  muted: HexColor;
  tone: (tone: WidgetTone) => HexColor;
}

function palette(mode: Mode): Palette {
  const colors: ColorTokens = mode === 'dark' ? darkColors : lightColors;
  const tones: Record<WidgetTone, string> = {
    text: colors.text,
    muted: colors.textMuted,
    warning: colors.warning,
    sleep: colors.metric.sleep,
    load: colors.metric.load,
    readinessHigh: colors.metric.readinessHigh,
    readinessMid: colors.metric.readinessMid,
    readinessLow: colors.metric.readinessLow,
  };
  return { background: hex(colors.surface), text: hex(colors.text), muted: hex(colors.textMuted), tone: (tone) => hex(tones[tone]) };
}

function Score({ line, colors, compact }: { line: WidgetLine; colors: Palette; compact: boolean }) {
  return (
    <FlexWidget style={{ flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'flex-start', justifyContent: 'space-between', width: 'match_parent', flex: compact ? 0 : 1 }}>
      <TextWidget text={line.label} style={{ fontSize: 12, color: colors.muted }} maxLines={1} truncate="END" />
      <FlexWidget style={{ flexDirection: 'column', alignItems: compact ? 'flex-end' : 'flex-start' }}>
        <TextWidget text={line.value} style={{ fontSize: compact ? 20 : 30, fontFamily: NUMBER_FONT, color: colors.tone(line.tone) }} maxLines={1} />
        {line.note === null ? null : <TextWidget text={line.note} style={{ fontSize: 10, color: colors.muted }} maxLines={compact ? 1 : 2} truncate="END" />}
      </FlexWidget>
    </FlexWidget>
  );
}

function Footer({ text, stale, colors }: { text: string; stale: boolean; colors: Palette }) {
  return <TextWidget text={text} style={{ fontSize: 11, color: stale ? colors.tone('warning') : colors.muted }} maxLines={1} truncate="END" />;
}

function Message({ view, colors }: { view: Extract<WidgetView, { kind: 'message' }>; colors: Palette }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
      <TextWidget text={view.title} style={{ fontSize: 14, fontWeight: '600', color: colors.text }} maxLines={2} truncate="END" />
      <TextWidget text={view.body} style={{ fontSize: 12, color: colors.muted }} maxLines={3} truncate="END" />
    </FlexWidget>
  );
}

function Shell({ view, colors, children }: { view: WidgetView; colors: Palette; children: ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={view.label}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', padding: 12, borderRadius: 20, backgroundColor: colors.background }}>
      {children}
    </FlexWidget>
  );
}

export function ScoresWidget({ view, mode }: { view: WidgetView; mode: Mode }) {
  const colors = palette(mode);
  if (view.kind === 'message') {
    return (
      <Shell view={view} colors={colors}>
        <Message view={view} colors={colors} />
      </Shell>
    );
  }
  return (
    <Shell view={view} colors={colors}>
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'match_parent', justifyContent: 'space-between' }}>
        {view.scores.map((line) => (
          <Score key={line.key} line={line} colors={colors} compact />
        ))}
        <Footer text={view.age} stale={view.stale} colors={colors} />
      </FlexWidget>
    </Shell>
  );
}

export function OverviewWidget({ view, mode }: { view: WidgetView; mode: Mode }) {
  const colors = palette(mode);
  if (view.kind === 'message') {
    return (
      <Shell view={view} colors={colors}>
        <Message view={view} colors={colors} />
      </Shell>
    );
  }
  return (
    <Shell view={view} colors={colors}>
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'match_parent', justifyContent: 'space-between' }}>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 8 }}>
          {view.scores.map((line) => (
            <Score key={line.key} line={line} colors={colors} compact={false} />
          ))}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 12 }}>
          {view.vitals.map((line) => (
            <TextWidget key={line.key} text={`${line.label} ${line.note ?? line.value}`} style={{ fontSize: 12, color: line.note === null ? colors.text : colors.muted }} maxLines={1} truncate="END" />
          ))}
        </FlexWidget>
        <Footer text={view.age} stale={view.stale} colors={colors} />
      </FlexWidget>
    </Shell>
  );
}

export function renderWidget(name: WidgetName, view: WidgetView): WidgetRepresentation {
  if (name === 'OpenHoopOverview') return { light: <OverviewWidget view={view} mode="light" />, dark: <OverviewWidget view={view} mode="dark" /> };
  return { light: <ScoresWidget view={view} mode="light" />, dark: <ScoresWidget view={view} mode="dark" /> };
}
