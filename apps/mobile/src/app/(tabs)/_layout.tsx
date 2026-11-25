import { router, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { useT } from '@/i18n/useT';
import { Icon, type IconName } from '@/ui/Icon';
import { useTheme } from '@/ui/theme';

const TABS: ReadonlyArray<{ name: string; title: 'tabs.today' | 'tabs.sleep' | 'tabs.load' | 'tabs.trends' | 'tabs.band'; icon: IconName }> = [
  { name: 'index', title: 'tabs.today', icon: 'today' },
  { name: 'sleep', title: 'tabs.sleep', icon: 'sleep' },
  { name: 'load', title: 'tabs.load', icon: 'load' },
  { name: 'trends', title: 'tabs.trends', icon: 'trends' },
  { name: 'band', title: 'tabs.band', icon: 'band' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useT();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('a11y.openSettings')}
            hitSlop={8}
            onPress={() => router.push('/settings')}
            style={{ paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
            <Icon name="settings" color={colors.text} />
          </Pressable>
        ),
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
