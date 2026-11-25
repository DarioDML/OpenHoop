import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from './theme';

interface Props {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  close?: boolean;
  right?: ReactNode;
  center?: ReactNode;
}

export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function TopBar({ title, back = true, onBack, close = false, right, center }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const leading = back || close;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
      {leading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={close ? t('common.close') : t('common.back')}
          hitSlop={8}
          onPress={onBack ?? goBack}
          style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Icon name={close ? 'close' : 'back'} color={colors.text} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <View style={{ flex: 1, alignItems: 'center' }}>
        {center ?? (title ? (
          <AppText variant="screenTitle" accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
        ) : null)}
      </View>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  testID?: string;
}

export function IconButton({ icon, label, onPress, color, size = 22, testID }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      testID={testID}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={color ?? colors.textMuted} size={size} />
    </Pressable>
  );
}
