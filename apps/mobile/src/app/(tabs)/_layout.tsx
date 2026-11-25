import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { TabBar } from '@/ui/TabBar';
import { useTheme } from '@/ui/theme';

const TABS = [
  { name: 'index', title: 'tabs.home' },
  { name: 'health', title: 'tabs.health' },
  { name: 'community', title: 'tabs.community' },
  { name: 'more', title: 'tabs.more' },
] as const;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useT();
  const { userData } = useAppData();

  if (!userData.onboardingDone) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.title) }} />
      ))}
    </Tabs>
  );
}
