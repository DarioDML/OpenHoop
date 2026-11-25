import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { radius, spacing, useTheme, type Tint } from './theme';

export const TAB_BAR_SPACE = 120;

interface GradientProps {
  from: string;
  to: string;
  stop?: number;
  angle?: 'vertical' | 'diagonal';
  id: string;
}

export function GradientFill({ from, to, stop = 1, angle = 'vertical', id }: GradientProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (current && current.width === width && current.height === height ? current : { width, height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={angle === 'diagonal' ? '1' : '0'} y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset={stop} stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

interface Props {
  children?: ReactNode;
  header?: ReactNode;
  tint?: Tint;
  withTabBar?: boolean;
  scroll?: boolean;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  testID?: string;
}

export function Screen({
  children,
  header,
  tint,
  withTabBar = false,
  scroll = true,
  gap = spacing.md,
  contentStyle,
  refreshing,
  onRefresh,
  footer,
  testID,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + (withTabBar ? TAB_BAR_SPACE : spacing.xxl);

  const headerBlock = header ? (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: 20, paddingBottom: 40, gap: spacing.lg }}>
      <GradientFill id="screen-header" from={tint ? colors.tint[tint] : colors.backgroundTop} to={colors.background} angle="diagonal" />
      {header}
    </View>
  ) : null;

  const body = header ? (
    <View
      style={[
        {
          marginTop: -20,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          backgroundColor: colors.sheet,
          paddingTop: spacing.xl,
          paddingHorizontal: 20,
          paddingBottom: bottom,
          gap,
          flexGrow: 1,
        },
        contentStyle,
      ]}>
      {children}
    </View>
  ) : (
    <View style={[{ paddingTop: insets.top + spacing.lg, paddingHorizontal: 20, paddingBottom: bottom, gap, flexGrow: 1 }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID={testID}>
      {header ? null : (
        <GradientFill id="screen-bg" from={tint ? colors.tint[tint] : colors.backgroundTop} to={colors.background} stop={tint ? 0.7 : 1} angle={tint ? 'diagonal' : 'vertical'} />
      )}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.text} colors={[colors.accent]} /> : undefined
          }>
          {headerBlock}
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {headerBlock}
          {body}
        </View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>{footer}</View>
      ) : null}
    </View>
  );
}
