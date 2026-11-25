import { View } from 'react-native';

import { isConfigKey, isFlagKey, type FieldRow } from '@/data/bandConfig';
import { useT, type TFunction } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { spacing } from '@/ui/theme';

function labelFor(t: TFunction, row: FieldRow): string | null {
  const { key } = row.entry;
  if (row.kind === 'flag' && isFlagKey(key)) return t(`bandConfig.flag.${key}`);
  if (row.kind === 'config' && isConfigKey(key)) return t(`bandConfig.config.${key}`);
  return null;
}

function valueText(t: TFunction, row: FieldRow): string {
  const { value } = row;
  switch (value.kind) {
    case 'on':
      return t('bandConfig.on');
    case 'off':
      return t('bandConfig.off');
    case 'text':
      return value.text;
    case 'hex':
      return t('bandConfig.hex', { hex: value.hex });
    case 'unreadable':
      return t('bandConfig.unreadable');
  }
}

export function ConfigFieldRow({ row }: { row: FieldRow }) {
  const { t } = useT();
  const label = labelFor(t, row);
  const { key } = row.entry;
  return (
    <View testID={`config-field-${key}`} style={{ gap: 4, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body">{label ?? key}</AppText>
          {label !== null ? (
            <AppText variant="label" muted>
              {key}
            </AppText>
          ) : null}
        </View>
        <AppText variant="bodyStrong" numeric style={{ flexShrink: 1, textAlign: 'right' }}>
          {valueText(t, row)}
        </AppText>
      </View>
      {row.verified ? null : <Chip label={t('bandConfig.unverified')} small testID={`config-unverified-${key}`} />}
    </View>
  );
}
