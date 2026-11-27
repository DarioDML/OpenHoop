import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { WidgetLine, WidgetTone, WidgetView } from '@/lib/widgetSnapshot';

import { AppText } from '../AppText';
import { Num } from '../Num';
import { Ring } from '../Ring';
import { radius, spacing, useTheme, type ColorTokens } from '../theme';

function toneColor(colors: ColorTokens, tone: WidgetTone): string {
  if (tone === 'text') return colors.text;
  if (tone === 'muted') return colors.textMuted;
  if (tone === 'warning') return colors.warning;
  if (tone === 'sleep') return colors.metric.sleep;
  if (tone === 'load') return colors.metric.load;
  if (tone === 'readinessHigh') return colors.metric.readinessHigh;
  if (tone === 'readinessMid') return colors.metric.readinessMid;
  return colors.metric.readinessLow;
}

function Score({ line, compact, testID }: { line: WidgetLine; compact: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flex: compact ? undefined : 1, flexDirection: compact ? 'row' : 'column', justifyContent: 'space-between', alignItems: compact ? 'center' : 'flex-start', gap: 2 }}>
      <AppText variant="caption" muted numberOfLines={1}>
        {line.label}
      </AppText>
      <View style={{ alignItems: compact ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
        <Num size={compact ? 20 : 28} color={toneColor(colors, line.tone)} testID={testID}>
          {line.value}
        </Num>
        {line.note === null ? null : (
          <AppText variant="caption" muted numberOfLines={compact ? 1 : 2}>
            {line.note}
          </AppText>
        )}
      </View>
    </View>
  );
}

interface Props {
  view: WidgetView;
  size: 'small' | 'wide';
  testID: string;
}

export function WidgetPreview({ view, size, testID }: Props) {
  const { colors } = useTheme();
  const compact = size === 'small';
  return (
    <View
      testID={testID}
      accessible
      style={{
        width: compact ? 170 : '100%',
        minHeight: 160,
        padding: spacing.md,
        gap: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'space-between',
      }}>
      {view.kind === 'message' ? (
        <View style={{ gap: 4 }}>
          <AppText variant="bodyStrong">{view.title}</AppText>
          <AppText variant="label" muted>
            {view.body}
          </AppText>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: compact ? 'column' : 'row', gap: spacing.sm }}>
            {view.scores.map((line) => (
              <Score key={line.key} line={line} compact={compact} testID={`${testID}-${line.key}`} />
            ))}
          </View>
          {compact ? null : (
            <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
              {view.vitals.map((line) => (
                <AppText key={line.key} variant="label" muted={line.note !== null} testID={`${testID}-${line.key}`}>
                  {line.label} {line.note ?? line.value}
                </AppText>
              ))}
            </View>
          )}
          <AppText variant="caption" color={view.stale ? colors.warning : colors.textMuted} numberOfLines={1}>
            {view.age}
          </AppText>
        </>
      )}
    </View>
  );
}

function PreviewFrame({ testID, width, children }: { testID: string; width: number | '100%'; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      style={{
        width,
        minHeight: 160,
        padding: spacing.lg,
        gap: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: 'space-between',
      }}>
      {children}
    </View>
  );
}

function Message({ view }: { view: Extract<WidgetView, { kind: 'message' }> }) {
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="bodyStrong">{view.title}</AppText>
      <AppText variant="label" muted>
        {view.body}
      </AppText>
    </View>
  );
}

export function ReadinessPreview({ view, testID }: { view: WidgetView; testID: string }) {
  const { colors } = useTheme();
  return (
    <PreviewFrame testID={testID} width={170}>
      {view.kind === 'message' ? (
        <Message view={view} />
      ) : (
        <>
          <AppText variant="capSmall" muted>
            {view.scores[0].label}
          </AppText>
          <View>
            <Num size={56} color={toneColor(colors, view.scores[0].tone)} testID={`${testID}-readiness`}>
              {view.scores[0].value}
            </Num>
            {view.scores[0].note === null ? null : (
              <AppText variant="caption" muted numberOfLines={2}>
                {view.scores[0].note}
              </AppText>
            )}
          </View>
          <AppText variant="caption" color={view.stale ? colors.warning : colors.textMuted} numberOfLines={1}>
            {view.age}
          </AppText>
        </>
      )}
    </PreviewFrame>
  );
}

export function RingsPreview({ view, testID }: { view: WidgetView; testID: string }) {
  const { colors } = useTheme();
  if (view.kind === 'message') {
    return (
      <PreviewFrame testID={testID} width="100%">
        <Message view={view} />
      </PreviewFrame>
    );
  }
  const [readiness, sleep, load] = view.scores;
  return (
    <PreviewFrame testID={testID} width="100%">
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[sleep, readiness, load].map((line) => (
          <View key={line.key} style={{ alignItems: 'center', gap: 6 }}>
            <Ring size={72} strokeWidth={6} fraction={line.fraction} color={toneColor(colors, line.tone)}>
              <Num size={20} color={line.value === '–' ? colors.textMuted : colors.text} testID={`${testID}-${line.key}`} maxFontSizeMultiplier={1}>
                {line.value}
              </Num>
            </Ring>
            <AppText variant="capSmall" muted numberOfLines={1} style={{ fontSize: 10 }}>
              {line.label}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption" color={view.stale ? colors.warning : colors.textMuted} numberOfLines={1}>
        {view.age}
      </AppText>
    </PreviewFrame>
  );
}

export function DayPreview({ view, testID }: { view: WidgetView; testID: string }) {
  const { colors } = useTheme();
  if (view.kind === 'message') {
    return (
      <PreviewFrame testID={testID} width="100%">
        <Message view={view} />
      </PreviewFrame>
    );
  }
  const readiness = view.scores[0];
  const hrv = view.vitals[1];
  return (
    <PreviewFrame testID={testID} width="100%">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View style={{ width: 96, height: 96, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Num size={44} color={toneColor(colors, readiness.tone)} testID={`${testID}-readiness`}>
            {readiness.value.replace('%', '')}
          </Num>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="cardTitle" testID={`${testID}-headline`}>
            {view.headline}
          </AppText>
          <AppText variant="label" muted numberOfLines={1} testID={`${testID}-load`}>
            {view.loadLine}
          </AppText>
          <AppText variant="label" muted numberOfLines={1}>
            {`${hrv.label} ${hrv.note ?? hrv.value}`}
          </AppText>
          <AppText variant="caption" color={view.stale ? colors.warning : colors.textMuted} numberOfLines={1}>
            {view.age}
          </AppText>
        </View>
      </View>
    </PreviewFrame>
  );
}

export function LockCircularPreview({ view, testID }: { view: WidgetView; testID: string }) {
  const { colors } = useTheme();
  const readiness = view.kind === 'values' ? view.scores[0] : null;
  return (
    <View
      testID={testID}
      style={{ width: 76, height: 76, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
      <Ring size={60} strokeWidth={5} fraction={readiness?.fraction ?? null} color={colors.textSoft} trackColor={colors.surface3}>
        <Num size={18} maxFontSizeMultiplier={1}>
          {readiness === null ? '–' : readiness.value.replace('%', '')}
        </Num>
      </Ring>
    </View>
  );
}

export function LockRectPreview({ view, testID }: { view: WidgetView; testID: string }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{ flex: 1, minHeight: 76, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, gap: 2, justifyContent: 'center', opacity: 0.6 }}>
      {view.kind === 'message' ? (
        <AppText variant="label" muted numberOfLines={2}>
          {view.title}
        </AppText>
      ) : (
        <>
          <AppText variant="capSmall" numberOfLines={1}>
            {`${view.scores[0].label} ${view.scores[0].value}`}
          </AppText>
          <AppText variant="label" soft numberOfLines={1}>
            {`${view.scores[1].label} ${view.scores[1].value} · ${view.scores[2].label} ${view.scores[2].value}`}
          </AppText>
        </>
      )}
    </View>
  );
}
