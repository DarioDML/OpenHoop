import { View } from 'react-native';

import type { WidgetLine, WidgetTone, WidgetView } from '@/lib/widgetSnapshot';

import { AppText } from '../AppText';
import { Num } from '../Num';
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
    <View style={{ flex: compact ? undefined : 1, flexDirection: compact ? 'row' : 'column', justifyContent: 'space-between', alignItems: compact ? 'center' : 'flex-start', gap: 2 }}>
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
