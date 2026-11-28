import type { ReactElement, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useLayout } from './layout';
import { radius, spacing, useTheme } from './theme';
import { goBack } from './TopBar';

interface Props {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  surface?: 'surface' | 'sheet';
  maxHeight?: `${number}%`;
  footer?: ReactNode;
  testID?: string;
}

export const SHEET_MAX_HEIGHT = '85%';

export function SheetScreen({ title, children, onClose = goBack, surface = 'surface', maxHeight = SHEET_MAX_HEIGHT, footer, testID }: Props): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        testID={testID === undefined ? undefined : `${testID}-backdrop`}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, opacity: 0.6 }}
      />
      <View
        accessibilityViewIsModal
        testID={testID === undefined ? undefined : `${testID}-sheet`}
        style={{
          maxHeight,
          backgroundColor: surface === 'surface' ? colors.surface : colors.sheet,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          paddingTop: 10,
          paddingHorizontal: gutter,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.md,
        }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="screenTitle" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {title}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            testID={testID === undefined ? undefined : `${testID}-close`}
            style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.lg, paddingBottom: footer === undefined ? 0 : spacing.xs }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer === undefined ? null : <View testID={testID === undefined ? undefined : `${testID}-footer`}>{footer}</View>}
      </View>
    </KeyboardAvoidingView>
  );
}
