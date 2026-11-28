import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { phaseOn, type CycleWheel as Wheel } from '@/data/cycle';
import { AppText } from '@/ui/AppText';
import { Num } from '@/ui/Num';
import { useTheme } from '@/ui/theme';

interface Props {
  wheel: Wheel | null;
  size: number;
  dayLabel: string;
  phaseLabel: string | null;
  emptyLabel: string;
  accessibilityLabel: string;
  testID?: string;
}

const EMPTY_DOTS = 28;

function point(center: number, radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

function arc(center: number, radius: number, from: number, to: number): string {
  const start = point(center, radius, from);
  const end = point(center, radius, to);
  const large = to - from > 0.5 ? 1 : 0;
  return `M${start.x.toFixed(1)} ${start.y.toFixed(1)} A${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export function CycleWheel({ wheel, size, dayLabel, phaseLabel, emptyLabel, accessibilityLabel, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const center = size / 2;
  const outer = center - 4;
  const ring = outer - 14;
  const dot = Math.max(3.5, size / 40);
  const count = wheel?.length ?? EMPTY_DOTS;
  const today = wheel === null ? null : Math.min(wheel.day, wheel.length);
  const gap = 1.2 / count;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {wheel?.spans.map((span) => (
          <Path
            key={span.phase}
            d={arc(center, outer, (span.from - 1) / count + gap / 2, span.to / count - gap / 2)}
            stroke={colors.cyclePhase[span.phase]}
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1;
          const at = point(center, ring, i / count);
          const phase = wheel === null ? null : phaseOn(wheel.spans, day)?.phase ?? null;
          const fill = phase === null ? colors.surface3 : colors.cyclePhase[phase];
          if (day === today) {
            return <Circle key={day} cx={at.x} cy={at.y} r={dot * 1.7} fill={fill} stroke={colors.text} strokeWidth={3} />;
          }
          return <Circle key={day} cx={at.x} cy={at.y} r={dot} fill={fill} opacity={today !== null && day > today ? 0.75 : 1} />;
        })}
      </Svg>
      {wheel === null ? (
        <AppText variant="label" muted style={{ textAlign: 'center', maxWidth: size * 0.55 }}>
          {emptyLabel}
        </AppText>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <AppText variant="capSmall" color={colors.textSoft}>
            {dayLabel}
          </AppText>
          <Num size={Math.round(size * 0.3)} testID={testID ? `${testID}-day` : undefined}>
            {String(wheel.day)}
          </Num>
          {phaseLabel === null ? null : (
            <AppText variant="cap" color={wheel.overdue ? colors.textSoft : colors.cyclePhase[wheel.phase]} testID={testID ? `${testID}-phase` : undefined}>
              {phaseLabel}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}
