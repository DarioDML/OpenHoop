import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Field } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { codeMatches, serialCode } from '@/ui/manage/safetyCode';
import { SheetScreen } from '@/ui/SheetScreen';
import { spacing, useTheme } from '@/ui/theme';
import { goBack } from '@/ui/TopBar';

export default function SafetyLockScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { device } = useAppData();
  const [typed, setTyped] = useState('');
  const fromSerial = serialCode(device.serial);
  const code = fromSerial ?? t('danger.command');
  const matches = codeMatches(typed, code);

  const confirm = (): void => {
    if (!matches) return;
    setTyped('');
    goBack();
  };

  return (
    <SheetScreen title={t('device.safety.title')} testID="safety-lock">
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.negativeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" color={colors.negative} size={28} />
        </View>
        <AppText variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {t('device.safety.question')}
        </AppText>
        <AppText variant="lead" muted style={{ textAlign: 'center' }}>
          {t('device.safety.sheetBody')}
        </AppText>
        {device.backlogPages !== null && device.backlogPages > 0 ? (
          <AppText variant="label" muted style={{ textAlign: 'center' }} testID="safety-backlog">
            {t('device.safety.backlog', { count: device.backlogPages })}
          </AppText>
        ) : null}
      </View>
      <Field
        label={t('device.safety.typeLabel', { code })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        returnKeyType="done"
        onSubmitEditing={confirm}
        hint={fromSerial === null ? t('device.safety.noSerialHint') : t('device.safety.serialHint')}
        testID="danger-input"
      />
      <View style={{ gap: spacing.sm }}>
        <Button label={t('device.safety.unpair')} variant="outlineDanger" disabled={!matches} onPress={confirm} testID="danger-confirm" />
        <Button label={t('common.cancel')} onPress={goBack} testID="safety-cancel" />
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" muted>
          {t('device.safety.howBody')}
        </AppText>
        <AppText variant="caption" muted>
          {t('danger.note')}
        </AppText>
      </View>
    </SheetScreen>
  );
}
