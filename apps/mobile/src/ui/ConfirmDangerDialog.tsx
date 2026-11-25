import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, View } from 'react-native';

import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Button, Field } from './controls';
import { radius, spacing, useTheme } from './theme';

interface Props {
  visible: boolean;
  commandName: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  inputLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDangerDialog({ visible, commandName, title, body, confirmLabel, cancelLabel, inputLabel, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === commandName;

  const close = (): void => {
    setTyped('');
    onCancel();
  };
  const confirm = (): void => {
    if (!matches) return;
    setTyped('');
    onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: colors.negative }}>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="body">{body}</AppText>
          <Field
            label={inputLabel}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={commandName}
            testID="danger-input"
          />
          <View style={{ gap: spacing.sm }}>
            <Button label={confirmLabel} variant="danger" disabled={!matches} onPress={confirm} testID="danger-confirm" />
            <Button label={cancelLabel || t('common.cancel')} variant="secondary" onPress={close} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
