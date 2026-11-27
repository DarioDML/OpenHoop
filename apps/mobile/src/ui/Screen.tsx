import { useState, type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useLayout } from './layout';
import { radius, spacing, useTheme, type Tint } from './theme';

export const TAB_BAR_SPACE = 120;
const BUTTON_NAV_INSET = 32;

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
  scrollEnabled?: boolean;
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
  scrollEnabled = true,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const [scrolled, setScrolled] = useState(false);
  const bottom = insets.bottom + (withTabBar ? TAB_BAR_SPACE : spacing.xxl);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = event.nativeEvent.contentOffset.y > 4;
    setScrolled((current) => (current === next ? current : next));
  };

  const headerBlock = header ? (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: gutter, paddingBottom: 40, gap: spacing.lg }}>
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
          paddingHorizontal: gutter,
          paddingBottom: bottom,
          gap,
          flexGrow: 1,
        },
        contentStyle,
      ]}>
      {children}
    </View>
  ) : (
    <View style={[{ paddingTop: insets.top + spacing.lg, paddingHorizontal: gutter, paddingBottom: bottom, gap, flexGrow: 1 }, contentStyle]}>
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
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          testID="screen-scroll"
          scrollEnabled={scrollEnabled}
          onScroll={onScroll}
          scrollEventThrottle={32}
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
        <View style={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>{footer}</View>
      ) : null}
      {scroll && scrolled && insets.top > 0 ? (
        <View pointerEvents="none" testID="status-bar-scrim" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.background, opacity: 0.94 }} />
      ) : null}
      {Platform.OS === 'android' && !footer && insets.bottom >= BUTTON_NAV_INSET ? (
        <View pointerEvents="none" testID="nav-bar-scrim" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom, backgroundColor: header ? colors.sheet : colors.background, opacity: 0.97 }} />
      ) : null}
    </View>
  );
}
