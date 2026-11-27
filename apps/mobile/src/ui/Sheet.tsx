import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { radius, spacing, useTheme } from './theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

export function Sheet({ visible, onClose, title, subtitle, children, footer, testID }: SheetProps): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View accessibilityViewIsModal style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          testID={testID === undefined ? undefined : `${testID}-backdrop`}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, opacity: 0.72 }}
        />
        <View
          testID={testID}
          style={{
            backgroundColor: colors.sheet,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
            gap: spacing.lg,
            maxHeight: '88%',
          }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.surface3 }} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="h2" accessibilityRole="header">
                {title}
              </AppText>
              {subtitle === undefined ? null : (
                <AppText variant="lead" muted>
                  {subtitle}
                </AppText>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.lg }}>
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
