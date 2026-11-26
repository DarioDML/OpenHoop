import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useLayout } from './layout';
import { GradientFill } from './Screen';
import { radius, useTheme } from './theme';

const TAB_ICONS: Readonly<Record<string, IconName>> = {
  index: 'home',
  health: 'health',
  community: 'community',
  more: 'more',
};

const SHADOW = { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 12 } as const;

export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  const side = compact ? 12 : 20;
  const coachSize = compact ? 56 : 64;
  const plusSize = compact ? 46 : 52;
  const barHeight = compact ? 60 : 64;

  const tab = (index: number) => {
    const route = state.routes[index];
    if (!route) return null;
    const descriptor = descriptors[route.key];
    const focused = state.index === index;
    const label = typeof descriptor?.options.title === 'string' ? descriptor.options.title : route.name;
    const color = focused ? colors.text : colors.textMuted;
    const onPress = (): void => {
      if (!focused) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        testID={`tab-${route.name}`}
        onPress={onPress}
        style={{ flex: 1, minWidth: 44, alignItems: 'center', justifyContent: 'center', gap: 2, height: 56, paddingHorizontal: 2 }}>
        <Icon name={TAB_ICONS[route.name] ?? 'home'} color={color} fill={focused && route.name === 'index' ? color : 'none'} />
        <AppText
          variant="caption"
          color={color}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={1.15}
          style={{ fontSize: 10, lineHeight: 13, fontWeight: focused ? '600' : '500', textAlign: 'center' }}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: side, right: side, bottom: insets.bottom + (compact ? 12 : 16), flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 12 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flex: 1,
          height: barHeight,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 4,
          ...SHADOW,
        }}>
        {tab(0)}
        {tab(1)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.actionCenter')}
          testID="tab-action-center"
          onPress={() => router.push('/action-center')}
          style={{ width: plusSize, height: plusSize, marginHorizontal: 2, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" color={colors.primaryOn} strokeWidth={2.5} />
        </Pressable>
        {tab(2)}
        {tab(3)}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('a11y.coach')}
        testID="tab-coach"
        onPress={() => router.push('/coach')}
        style={{ width: coachSize, height: coachSize, borderRadius: radius.pill, padding: 3, overflow: 'hidden', ...SHADOW }}>
        <GradientFill id="coach-ring" from={colors.coach.from} to={colors.coach.to} angle="diagonal" />
        <View style={{ flex: 1, borderRadius: radius.pill, backgroundColor: colors.coach.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="coach" color={colors.text} size={compact ? 22 : 26} />
        </View>
      </Pressable>
    </View>
  );
}
