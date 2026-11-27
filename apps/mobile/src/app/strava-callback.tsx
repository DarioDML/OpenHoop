import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/ui/theme';

export default function StravaCallbackScreen() {
  const { colors } = useTheme();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings/integrations');
  }, []);
  return <View style={{ flex: 1, backgroundColor: colors.background }} testID="strava-callback" />;
}
