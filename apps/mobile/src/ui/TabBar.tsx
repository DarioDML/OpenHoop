import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
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
        style={{ alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 52, height: 56 }}>
        <Icon name={TAB_ICONS[route.name] ?? 'home'} color={color} fill={focused && route.name === 'index' ? color : 'none'} />
        <AppText variant="caption" color={color} style={{ fontSize: 10, lineHeight: 13, fontWeight: focused ? '600' : '500' }}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flex: 1,
          height: 64,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 6,
          ...SHADOW,
        }}>
        {tab(0)}
        {tab(1)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('a11y.actionCenter')}
          testID="tab-action-center"
          onPress={() => router.push('/action-center')}
          style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
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
        style={{ width: 64, height: 64, borderRadius: radius.pill, padding: 3, overflow: 'hidden', ...SHADOW }}>
        <GradientFill id="coach-ring" from={colors.coach.from} to={colors.coach.to} angle="diagonal" />
        <View style={{ flex: 1, borderRadius: radius.pill, backgroundColor: colors.coach.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="coach" color={colors.text} size={26} />
        </View>
      </Pressable>
    </View>
  );
}
